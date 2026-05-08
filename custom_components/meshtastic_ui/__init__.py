"""Meshtastic UI — companion dashboard integration (direct radio connection)."""

from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval

from .connection import ConnectionState, ConnectionType, MeshtasticConnection
from .const import (
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
    NODEINFO_REQUEST_COOLDOWN,
    SIGNAL_CONNECTION_STATE,
    SIGNAL_DELIVERY_STATUS,
    SIGNAL_NEW_MESSAGE,
    SIGNAL_NODE_UPDATE,
    SIGNAL_TRACEROUTE_RESULT,
    SIGNAL_WAYPOINT_UPDATE,
    TS_FLUSH_SECONDS,
    TS_MAX_POINTS,
    TS_PERSIST_SECONDS,
)
from .frontend import async_register_panel, async_unregister_panel
from .store import MeshtasticUiStore, TimeSeriesStore, normalize_node_id
from .websocket_api import async_register_websocket_api

_TS_SERIES_KEYS = ("airtimeTx", "battery", "channelUtil", "packetRx", "packetTx")
_PACKET_TYPE_KEYS = ("nodeinfo", "other", "position", "routing", "telemetry", "text")
_PORTNUM_MAP = {
    "NODEINFO_APP": "nodeinfo",
    "POSITION_APP": "position",
    "ROUTING_APP": "routing",
    "TELEMETRY_APP": "telemetry",
    "TEXT_MESSAGE_APP": "text",
}

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Meshtastic UI component."""
    hass.data.setdefault(DOMAIN, {"entries": {}})
    # Backwards-compat: older code paths read hass.data[DOMAIN]["entries"].
    if "entries" not in hass.data[DOMAIN]:
        hass.data[DOMAIN]["entries"] = {}
    return True


def _get_entry_data(
    hass: HomeAssistant, entry_id: str | None = None
) -> dict[str, Any] | None:
    """Return the per-entry data dict, defaulting to the first entry if entry_id is None."""
    domain_data = hass.data.get(DOMAIN, {})
    entries = domain_data.get("entries")
    # Backwards-compat for tests that still build the old singleton dict
    # (no "entries" key, just store/connection/ts at the top level).
    if entries is None and ("store" in domain_data or "connection" in domain_data):
        return domain_data
    entries = entries or {}
    if entry_id is not None:
        # Treat "_legacy" as a synonym for the old singleton shape.
        if entry_id == "_legacy" and (
            "store" in domain_data or "connection" in domain_data
        ):
            return domain_data
        return entries.get(entry_id)
    if not entries:
        return None
    # Default to first entry — preserves single-radio behavior when callers
    # don't specify which one.
    return next(iter(entries.values()))


def _all_entry_data(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Return all per-entry data dicts keyed by entry_id."""
    return hass.data.get(DOMAIN, {}).get("entries", {})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Meshtastic UI from a config entry."""
    hass.data.setdefault(DOMAIN, {"entries": {}})
    if "entries" not in hass.data[DOMAIN]:
        hass.data[DOMAIN]["entries"] = {}

    is_first_entry = not hass.data[DOMAIN]["entries"]

    store = MeshtasticUiStore(hass, entry.entry_id, migrate_legacy=is_first_entry)
    await store.async_load()

    ts_store = TimeSeriesStore(hass, entry.entry_id, migrate_legacy=is_first_entry)

    # Create the radio connection.
    connection = _create_connection(hass, entry.data)

    entry_data: dict[str, Any] = {
        "entry_id": entry.entry_id,
        "title": entry.title,
        "config": dict(entry.data),
        "store": store,
        "ts_store": ts_store,
        "connection": connection,
        "unsub_callbacks": [],
        "pending_acks": {},  # packet_id -> message info for delivery tracking.
        "nodeinfo_cooldowns": {},  # node_id -> last request timestamp
        "local_stats": {},
        "ts": {
            "data": {k: deque(maxlen=TS_MAX_POINTS) for k in _TS_SERIES_KEYS},
            "packetTypes": {k: deque(maxlen=TS_MAX_POINTS) for k in _PACKET_TYPE_KEYS},
            "snapshots": {"channelUtil": 0.0, "airtimeTx": 0.0, "battery": 0.0},
            "accumulators": {"packetTx": 0, "packetRx": 0},
            "packetTypeAccum": {k: 0 for k in _PACKET_TYPE_KEYS},
            "local_node_num": None,
        },
    }
    hass.data[DOMAIN]["entries"][entry.entry_id] = entry_data

    # Restore persisted time-series data.
    saved_ts = await ts_store.async_load()
    if saved_ts:
        ts = entry_data["ts"]
        for key in _TS_SERIES_KEYS:
            if key in saved_ts.get("data", {}):
                vals = saved_ts["data"][key]
                ts["data"][key] = deque(vals, maxlen=TS_MAX_POINTS)
        for key in _PACKET_TYPE_KEYS:
            if key in saved_ts.get("packetTypes", {}):
                vals = saved_ts["packetTypes"][key]
                ts["packetTypes"][key] = deque(vals, maxlen=TS_MAX_POINTS)

    # Register radio callbacks (closes over entry_id so signals stay scoped).
    _register_radio_callbacks(hass, entry.entry_id, store, connection)

    # Connect to the radio (retries automatically on failure).
    await connection.async_connect()

    # Sync nodes from radio's mesh database and seed time-series snapshots.
    _sync_nodes_from_radio(hass, entry.entry_id, store, connection)

    entry_id = entry.entry_id

    # Start time-series flush timer (runs regardless of frontend connections).
    @callback
    def _flush_timeseries(_now: Any) -> None:
        ed = _get_entry_data(hass, entry_id)
        if ed is None:
            return
        ts = ed["ts"]
        data = ts["data"]
        snap = ts["snapshots"]
        acc = ts["accumulators"]
        data["channelUtil"].append(snap["channelUtil"])
        data["airtimeTx"].append(snap["airtimeTx"])
        data["battery"].append(snap["battery"])
        data["packetTx"].append(acc["packetTx"])
        data["packetRx"].append(acc["packetRx"])
        ts["accumulators"] = {"packetTx": 0, "packetRx": 0}
        # Per-type packet breakdown.
        pt = ts["packetTypes"]
        pta = ts["packetTypeAccum"]
        for k in _PACKET_TYPE_KEYS:
            pt[k].append(pta[k])
        ts["packetTypeAccum"] = {k: 0 for k in _PACKET_TYPE_KEYS}
        # Prune stale pending_acks (older than 5 minutes).
        now = time.time()
        pending = ed.get("pending_acks", {})
        stale = [k for k, v in pending.items() if now - v.get("_ts", 0) > 300]
        for k in stale:
            del pending[k]

    unsub_ts = async_track_time_interval(
        hass, _flush_timeseries, timedelta(seconds=TS_FLUSH_SECONDS)
    )
    entry_data["unsub_callbacks"].append(unsub_ts)

    # Persist time-series to disk every 5 minutes.
    async def _persist_timeseries(_now: Any) -> None:
        ed = _get_entry_data(hass, entry_id)
        if ed is None:
            return
        await ed["ts_store"].async_save(ed["ts"])

    unsub_ts_persist = async_track_time_interval(
        hass, _persist_timeseries, timedelta(seconds=TS_PERSIST_SECONDS)
    )
    entry_data["unsub_callbacks"].append(unsub_ts_persist)

    # Register WebSocket API (idempotent — only the first entry actually
    # registers the commands; later entries reuse the same handlers).
    if is_first_entry:
        async_register_websocket_api(hass)
        await async_register_panel(hass)

    # One-time migration: pre-multi-radio releases used a global unique_id
    # (meshtastic_ui_messages_today / meshtastic_ui_active_nodes) for the
    # sensors. Rename them to the new per-entry format so the existing
    # entities (and any automations referencing them) keep working.
    if is_first_entry:
        await _migrate_legacy_entity_ids(hass, entry.entry_id)

    # Set up sensor platform.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def _migrate_legacy_entity_ids(hass: HomeAssistant, entry_id: str) -> None:
    """Rename pre-multi-radio sensor unique_ids to include the entry_id.

    Idempotent and race-safe: only the entry that finds an entity owning the
    legacy unique_id will rename it; the second entry's lookup returns None
    and we skip. Also skips if the per-entry id is already in use (e.g. user
    already migrated and re-added the integration).
    """
    from homeassistant.helpers import entity_registry as er

    registry = er.async_get(hass)
    legacy_to_new = {
        f"{DOMAIN}_messages_today": f"{DOMAIN}_{entry_id}_messages_today",
        f"{DOMAIN}_active_nodes": f"{DOMAIN}_{entry_id}_active_nodes",
    }
    for legacy, new in legacy_to_new.items():
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, legacy)
        if not entity_id:
            continue
        # If something else already owns the new unique_id, our rename would
        # raise — skip silently. This happens when two entries load
        # concurrently and both find the legacy id; only one wins.
        if registry.async_get_entity_id("sensor", DOMAIN, new):
            _LOGGER.debug(
                "Skipping legacy sensor migration %s -> %s (target already in use)",
                legacy, new,
            )
            continue
        try:
            registry.async_update_entity(entity_id, new_unique_id=new)
            _LOGGER.info(
                "Migrated sensor unique_id %s -> %s", legacy, new
            )
        except ValueError as err:
            # Race: another setup raced us and claimed the new id between
            # our check and the rename. Not actionable — log at debug.
            _LOGGER.debug(
                "Sensor migration %s -> %s lost the race: %s", legacy, new, err
            )
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Failed to migrate sensor %s", legacy)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    # Always clean up entry-scoped data, even if platform unload failed —
    # leaving orphans here causes stale rows in the radio picker dropdown
    # after failed/cancelled setups.
    domain_data = hass.data.get(DOMAIN, {})
    entries = domain_data.get("entries", {})
    data = entries.pop(entry.entry_id, {})
    for unsub in data.get("unsub_callbacks", []):
        try:
            unsub()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("unsub_callback raised during unload", exc_info=True)
    ts_s: TimeSeriesStore | None = data.get("ts_store")
    ts = data.get("ts")
    if ts_s and ts:
        try:
            await ts_s.async_save(ts)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("ts_store save failed during unload", exc_info=True)
    connection: MeshtasticConnection | None = data.get("connection")
    if connection is not None:
        try:
            await connection.async_disconnect()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("connection disconnect failed during unload", exc_info=True)
    # Only unregister the panel when the last entry is gone.
    if not entries:
        async_unregister_panel(hass)

    return unload_ok


def _create_connection(
    hass: HomeAssistant, config_data: dict[str, Any]
) -> MeshtasticConnection:
    """Create a MeshtasticConnection from config entry data."""
    conn_type = ConnectionType(config_data[CONF_CONNECTION_TYPE])

    if conn_type == ConnectionType.TCP:
        return MeshtasticConnection(
            hass,
            conn_type,
            hostname=config_data[CONF_TCP_HOSTNAME],
            port=config_data.get(CONF_TCP_PORT, DEFAULT_TCP_PORT),
        )
    if conn_type == ConnectionType.SERIAL:
        return MeshtasticConnection(
            hass,
            conn_type,
            serial_path=config_data[CONF_SERIAL_DEV_PATH],
        )

    raise ValueError(f"Unknown connection type: {conn_type}")


@callback
def _register_radio_callbacks(
    hass: HomeAssistant,
    entry_id: str,
    store: MeshtasticUiStore,
    connection: MeshtasticConnection,
) -> None:
    """Wire radio callbacks to the store and dispatcher.

    All signals dispatched from these callbacks include `entry_id` in the
    payload so multi-radio subscribers can filter to the right radio.
    """
    entry_data = _get_entry_data(hass, entry_id)
    if entry_data is None:
        return
    unsub_callbacks = entry_data["unsub_callbacks"]

    @callback
    def _on_packet(packet: dict) -> None:
        """Handle a received packet from the radio."""
        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum")

        _LOGGER.debug(
            "Packet received [%s]: portnum=%s from=%s to=%s",
            entry_id[:8], portnum, packet.get("fromId"), packet.get("toId"),
        )

        ed = _get_entry_data(hass, entry_id)
        if ed is None:
            return
        ts = ed["ts"]

        # Count all received packets from other nodes for time-series.
        if portnum:
            sender_id = packet.get("fromId")
            local_num = ts.get("local_node_num")
            local_id = _num_to_id(local_num) if local_num else None
            if sender_id and sender_id != local_id:
                ts["accumulators"]["packetRx"] += 1
                ptype = _PORTNUM_MAP.get(portnum, "other")
                ts["packetTypeAccum"][ptype] += 1

        if portnum == "TEXT_MESSAGE_APP":
            _LOGGER.debug("Text message: %r", decoded.get("text", "")[:50])
            _handle_text_message(hass, entry_id, store, packet)

        # Handle delivery acknowledgements.
        if portnum == "ROUTING_APP":
            _handle_delivery_ack(hass, entry_id, packet)

        # Handle traceroute responses.
        if portnum == "TRACEROUTE_APP":
            _handle_traceroute(hass, entry_id, store, packet)

        # Handle waypoints.
        if portnum == "WAYPOINT_APP":
            _handle_waypoint(hass, entry_id, store, packet)

        # Handle node info responses (name, hardware, etc).
        if portnum == "NODEINFO_APP":
            _handle_nodeinfo(hass, entry_id, store, packet)

        # Capture LocalStats from our own telemetry.
        if portnum == "TELEMETRY_APP":
            telemetry = decoded.get("telemetry", {})
            local_stats = telemetry.get("localStats")
            if local_stats:
                local_num = ts.get("local_node_num")
                sender_num = packet.get("from")
                if local_num and sender_num == local_num:
                    ed["local_stats"] = local_stats

        # Track sender as a node.
        sender_id = packet.get("fromId")
        if sender_id:
            sender_id = normalize_node_id(sender_id)
        if sender_id:
            node_update: dict[str, Any] = {
                "_last_seen": datetime.now(timezone.utc).isoformat(),
            }
            if "snr" in packet:
                node_update["snr"] = packet["snr"]
            if "hopStart" in packet and "hopLimit" in packet:
                node_update["hops"] = packet["hopStart"] - packet["hopLimit"]
            elif "hopsAway" in packet:
                node_update["hops"] = packet["hopsAway"]
            if "rssi" in packet:
                node_update["rssi"] = packet["rssi"]
            store.update_node(sender_id, node_update)

            # Auto-request node info for nameless nodes (with cooldown).
            existing = store.get_nodes().get(sender_id, {})
            if not existing.get("name"):
                now = time.time()
                cooldowns = ed.get("nodeinfo_cooldowns", {})
                last_req = cooldowns.get(sender_id, 0)
                if now - last_req > NODEINFO_REQUEST_COOLDOWN:
                    cooldowns[sender_id] = now
                    _LOGGER.debug(
                        "Auto-requesting node info for nameless node %s",
                        sender_id,
                    )

                    async def _request_info(node_id: str) -> None:
                        try:
                            await connection.async_request_nodeinfo(node_id)
                        except Exception:  # noqa: BLE001
                            _LOGGER.debug(
                                "Auto node-info request failed for %s",
                                node_id,
                            )

                    hass.async_create_task(_request_info(sender_id))

    @callback
    def _on_node_update(node: dict) -> None:
        """Handle a node update from the radio's node database."""
        node_num = node.get("num")
        if node_num is None:
            return

        node_id = _num_to_id(node_num)
        data = _extract_node_data(node)
        store.update_node(node_id, data)
        async_dispatcher_send(
            hass, SIGNAL_NODE_UPDATE, {"entry_id": entry_id, "node_id": node_id}
        )

        # Capture telemetry snapshots from the local (gateway) node.
        ed = _get_entry_data(hass, entry_id)
        if ed is None:
            return
        ts = ed["ts"]
        if node_num == ts.get("local_node_num"):
            metrics = node.get("deviceMetrics", {})
            if metrics.get("channelUtilization") is not None:
                ts["snapshots"]["channelUtil"] = metrics["channelUtilization"]
            if metrics.get("airUtilTx") is not None:
                ts["snapshots"]["airtimeTx"] = metrics["airUtilTx"]
            if metrics.get("batteryLevel") is not None:
                ts["snapshots"]["battery"] = min(metrics["batteryLevel"], 100)

    @callback
    def _on_connection_state_change(
        new_state: ConnectionState, old_state: ConnectionState
    ) -> None:
        """Handle connection state changes."""
        _LOGGER.debug(
            "Meshtastic connection [%s]: %s -> %s", entry_id[:8], old_state, new_state
        )
        async_dispatcher_send(
            hass,
            SIGNAL_CONNECTION_STATE,
            {"entry_id": entry_id, "state": new_state},
        )

        if new_state == ConnectionState.CONNECTED and old_state in (
            ConnectionState.RECONNECTING,
            ConnectionState.CONNECTING,
        ):
            # Re-sync nodes on reconnect.
            _sync_nodes_from_radio(hass, entry_id, store, connection)

    unsub_callbacks.append(connection.register_message_callback(_on_packet))
    unsub_callbacks.append(connection.register_node_update_callback(_on_node_update))
    unsub_callbacks.append(
        connection.register_connection_change_callback(_on_connection_state_change)
    )


@callback
def _handle_text_message(
    hass: HomeAssistant, entry_id: str, store: MeshtasticUiStore, packet: dict
) -> None:
    """Parse a text message packet and route to channel or DM store."""
    decoded = packet.get("decoded", {})
    text = decoded.get("text", "")
    if not text:
        return

    sender_id = normalize_node_id(packet.get("fromId", "unknown"))

    # Skip our own outgoing messages — already handled by ws_send_message.
    ed = _get_entry_data(hass, entry_id)
    if ed:
        ts = ed["ts"]
        local_num = ts.get("local_node_num")
        if local_num and sender_id == _num_to_id(local_num):
            return

    to_id = packet.get("toId", "")
    channel_key = str(packet.get("channel", 0))
    timestamp = datetime.now(timezone.utc).isoformat()

    # Extract reply fields.
    packet_id = packet.get("id")
    reply_id = decoded.get("replyId") or decoded.get("reply_id")

    # Hop count: hops_away = hop_start - hop_limit, or hopsAway if provided directly.
    hop_start = packet.get("hopStart")
    hop_limit = packet.get("hopLimit")
    if hop_start is not None and hop_limit is not None:
        hops_away = hop_start - hop_limit
    elif packet.get("hopsAway") is not None:
        hops_away = packet["hopsAway"]
    else:
        hops_away = None

    # Broadcast destinations: ^all or !ffffffff.
    is_broadcast = to_id in ("^all", "!ffffffff", "")

    message: dict[str, Any] = {
        "text": text,
        "from": sender_id,
        "to": to_id,
        "timestamp": timestamp,
        "channel": channel_key,
    }
    if packet_id is not None:
        message["message_id"] = packet_id
    if reply_id:
        message["reply_id"] = reply_id
    if hops_away is not None:
        message["hops_away"] = hops_away

    if is_broadcast:
        store.add_channel_message(channel_key, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"entry_id": entry_id, "type": "channel", "channel": channel_key, **message},
        )
    else:
        # DM — key by the other party's ID.
        store.add_dm_message(sender_id, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"entry_id": entry_id, "type": "dm", "partner": sender_id, **message},
        )

    # Send push notification if enabled.
    prefs = store.get_notification_prefs()
    if prefs.get("enabled"):
        msg_filter = prefs.get("filter", "all")
        should_notify = (
            msg_filter == "all"
            or (msg_filter == "channel" and is_broadcast)
            or (msg_filter == "dm" and not is_broadcast)
        )
        if should_notify:
            service_target = prefs.get(
                "service", "persistent_notification.create"
            )
            parts = service_target.split(".", 1)
            svc_domain = parts[0] if len(parts) > 1 else "notify"
            svc_name = parts[1] if len(parts) > 1 else parts[0]
            sender_name = store.get_nodes().get(sender_id, {}).get("name", sender_id)

            async def _send_notification() -> None:
                try:
                    service_data: dict[str, Any] = {
                        "title": sender_name,
                        "message": text,
                    }
                    # Only notify.* services accept 'data'; other domains
                    # (e.g. persistent_notification) would reject unknown keys.
                    if svc_domain == "notify":
                        service_data["data"] = {
                            "channel": channel_key,
                            "from": sender_id,
                            "timestamp": timestamp,
                        }
                    await hass.services.async_call(
                        svc_domain, svc_name, service_data
                    )
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning(
                        "Failed to send notification via %s: %s",
                        service_target,
                        err,
                    )

            hass.async_create_task(_send_notification())


@callback
def _handle_delivery_ack(hass: HomeAssistant, entry_id: str, packet: dict) -> None:
    """Handle a routing/ack packet to update message delivery status."""
    decoded = packet.get("decoded", {})
    routing = decoded.get("routing", {})
    request_id = packet.get("requestId") or decoded.get("requestId")

    if not request_id:
        return

    ed = _get_entry_data(hass, entry_id)
    if ed is None:
        return
    pending = ed.get("pending_acks", {})
    if request_id not in pending:
        return

    msg_info = pending.pop(request_id)
    error_reason = routing.get("errorReason")

    if error_reason and error_reason != "NONE":
        status = "failed"
    else:
        status = "delivered"

    # Count outgoing packets for time-series.
    ed["ts"]["accumulators"]["packetTx"] += 1

    async_dispatcher_send(
        hass,
        SIGNAL_DELIVERY_STATUS,
        {
            "entry_id": entry_id,
            "packet_id": request_id,
            "status": status,
            "error": error_reason,
            **msg_info,
        },
    )


@callback
def _handle_traceroute(
    hass: HomeAssistant, entry_id: str, store: MeshtasticUiStore, packet: dict
) -> None:
    """Handle a traceroute response packet."""
    decoded = packet.get("decoded", {})
    traceroute = decoded.get("traceroute", {})

    from_id = normalize_node_id(packet.get("fromId", ""))
    to_id = normalize_node_id(packet.get("toId", ""))

    if not from_id or not to_id:
        _LOGGER.debug("Traceroute packet missing fromId or toId: %s", packet.keys())
        return

    if not traceroute:
        # Some library versions may not nest under "traceroute"; still record the route.
        _LOGGER.debug(
            "Traceroute packet has no decoded route data (keys: %s), recording direct route %s -> %s",
            list(decoded.keys()), to_id, from_id,
        )

    # Extract route hops (list of node IDs).
    route = traceroute.get("route", [])
    route_back = traceroute.get("routeBack", [])
    snr_towards = traceroute.get("snrTowards", [])
    snr_back = traceroute.get("snrBack", [])

    # Convert numeric node IDs to hex format.
    route_ids = [_num_to_id(n) if isinstance(n, int) else normalize_node_id(str(n)) for n in route]
    route_back_ids = [
        _num_to_id(n) if isinstance(n, int) else normalize_node_id(str(n)) for n in route_back
    ]

    result = {
        "from": from_id,
        "to": to_id,
        "route": route_ids,
        "route_back": route_back_ids,
        "snr_towards": list(snr_towards),
        "snr_back": list(snr_back),
    }

    # Store keyed by the responding node (destination of the traceroute).
    store.set_traceroute(from_id, result)

    _LOGGER.debug("Traceroute stored: %s -> %s via %d hops", to_id, from_id, len(route_ids))
    async_dispatcher_send(
        hass, SIGNAL_TRACEROUTE_RESULT, {"entry_id": entry_id, **result}
    )


@callback
def _handle_waypoint(
    hass: HomeAssistant, entry_id: str, store: MeshtasticUiStore, packet: dict
) -> None:
    """Handle a waypoint packet from the mesh."""
    decoded = packet.get("decoded", {})
    waypoint = decoded.get("waypoint", {})
    if not waypoint:
        return

    wp_id = waypoint.get("id")
    if not wp_id:
        return

    expire = waypoint.get("expire", 0)
    lat = waypoint.get("latitudeI", 0) / 1e7
    lon = waypoint.get("longitudeI", 0) / 1e7
    name = waypoint.get("name", "")
    description = waypoint.get("description", "")

    # Check if this is a deletion (expire=1 means already expired).
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if expire > 0 and expire <= now_ts:
        store.remove_waypoint(wp_id)
        async_dispatcher_send(
            hass,
            SIGNAL_WAYPOINT_UPDATE,
            {"entry_id": entry_id, "action": "delete", "waypoint_id": wp_id},
        )
        return

    wp_data: dict[str, Any] = {
        "latitude": lat,
        "longitude": lon,
        "name": name,
        "description": description,
        "expire": expire,
        "from": packet.get("fromId", "unknown"),
    }
    store.add_waypoint(wp_id, wp_data)
    async_dispatcher_send(
        hass,
        SIGNAL_WAYPOINT_UPDATE,
        {"entry_id": entry_id, "action": "add", "waypoint_id": wp_id, **wp_data},
    )


@callback
def _handle_nodeinfo(
    hass: HomeAssistant, entry_id: str, store: MeshtasticUiStore, packet: dict
) -> None:
    """Handle a NODEINFO_APP packet — extract user identity and update the store."""
    decoded = packet.get("decoded", {})
    user = decoded.get("user", {})
    if not user:
        return

    # The node ID comes from the user payload or the packet sender.
    node_id = user.get("id") or packet.get("fromId")
    if not node_id:
        return
    node_id = normalize_node_id(node_id)

    data: dict[str, Any] = {}
    if user.get("longName"):
        data["name"] = user["longName"]
    if user.get("shortName"):
        data["short_name"] = user["shortName"]
    if user.get("hwModel"):
        data["hardware_model"] = user["hwModel"]

    if data:
        _LOGGER.debug("NodeInfo received for %s: %s", node_id, data)
        store.update_node(node_id, data)
        async_dispatcher_send(
            hass, SIGNAL_NODE_UPDATE, {"entry_id": entry_id, "node_id": node_id}
        )


def _sync_nodes_from_radio(
    hass: HomeAssistant,
    entry_id: str,
    store: MeshtasticUiStore,
    connection: MeshtasticConnection,
) -> None:
    """Bulk import nodes from the radio's mesh database into the store."""
    nodes = connection.nodes
    if not nodes:
        return

    updates: dict[str, dict[str, Any]] = {}
    for _key, node in nodes.items():
        node_num = node.get("num")
        if node_num is None:
            continue
        node_id = _num_to_id(node_num)
        updates[node_id] = _extract_node_data(node)

    if updates:
        store.bulk_update_nodes(updates)
        _LOGGER.debug("Synced %d nodes from radio mesh database", len(updates))

    # Seed time-series state from the local (gateway) node.
    my_info = connection.my_info
    ed = _get_entry_data(hass, entry_id)
    if my_info and ed:
        ts = ed["ts"]
        node_num = my_info.get("num")
        if node_num is not None:
            ts["local_node_num"] = node_num
        metrics = my_info.get("deviceMetrics", {})
        if metrics.get("channelUtilization") is not None:
            ts["snapshots"]["channelUtil"] = metrics["channelUtilization"]
        if metrics.get("airUtilTx") is not None:
            ts["snapshots"]["airtimeTx"] = metrics["airUtilTx"]
        if metrics.get("batteryLevel") is not None:
            ts["snapshots"]["battery"] = min(metrics["batteryLevel"], 100)


def _extract_node_data(node: dict) -> dict[str, Any]:
    """Extract normalized node data from a meshtastic node dict."""
    data: dict[str, Any] = {
        "_last_seen": datetime.now(timezone.utc).isoformat(),
    }

    # User info.
    user = node.get("user", {})
    if user.get("longName"):
        data["name"] = user["longName"]
    if user.get("shortName"):
        data["short_name"] = user["shortName"]
    if user.get("hwModel"):
        data["hardware_model"] = user["hwModel"]

    # Position.
    position = node.get("position", {})
    if position.get("latitude") is not None:
        data["latitude"] = position["latitude"]
    if position.get("longitude") is not None:
        data["longitude"] = position["longitude"]
    if position.get("altitude") is not None:
        data["altitude"] = position["altitude"]

    # Device metrics.
    metrics = node.get("deviceMetrics", {})
    if metrics.get("batteryLevel") is not None:
        data["battery"] = metrics["batteryLevel"]
    if metrics.get("voltage") is not None:
        data["voltage"] = metrics["voltage"]
    if metrics.get("channelUtilization") is not None:
        data["channel_utilization"] = metrics["channelUtilization"]
    if metrics.get("airUtilTx") is not None:
        data["air_util_tx"] = metrics["airUtilTx"]
    if metrics.get("uptimeSeconds") is not None:
        data["uptime"] = metrics["uptimeSeconds"]

    # SNR / hops.
    if node.get("snr") is not None:
        data["snr"] = node["snr"]
    if node.get("hopsAway") is not None:
        data["hops"] = node["hopsAway"]
    if node.get("lastHeard") is not None:
        try:
            data["_last_seen"] = datetime.fromtimestamp(
                node["lastHeard"], tz=timezone.utc
            ).isoformat()
        except (OSError, ValueError):
            pass

    return data


def _num_to_id(node_num: int) -> str:
    """Convert a numeric node ID to the !hex format."""
    return f"!{node_num:08x}"

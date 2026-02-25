"""Meshtastic UI — companion dashboard integration (direct radio connection)."""

from __future__ import annotations

import logging
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
    CONF_BLE_ADDRESS,
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
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

_TS_SERIES_KEYS = ("channelUtil", "airtimeTx", "battery", "packetTx", "packetRx")
_PACKET_TYPE_KEYS = ("text", "position", "telemetry", "nodeinfo", "routing", "other")
_PORTNUM_MAP = {
    "TEXT_MESSAGE_APP": "text",
    "POSITION_APP": "position",
    "TELEMETRY_APP": "telemetry",
    "NODEINFO_APP": "nodeinfo",
    "ROUTING_APP": "routing",
}

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Meshtastic UI component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Meshtastic UI from a config entry."""
    store = MeshtasticUiStore(hass)
    await store.async_load()

    ts_store = TimeSeriesStore(hass)

    # Create the radio connection
    connection = _create_connection(hass, entry.data)

    hass.data[DOMAIN] = {
        "store": store,
        "ts_store": ts_store,
        "connection": connection,
        "unsub_callbacks": [],
        "pending_acks": {},  # packet_id -> message info for delivery tracking
        "ts": {
            "data": {k: deque([0.0] * TS_MAX_POINTS, maxlen=TS_MAX_POINTS) for k in _TS_SERIES_KEYS},
            "packetTypes": {k: deque([0.0] * TS_MAX_POINTS, maxlen=TS_MAX_POINTS) for k in _PACKET_TYPE_KEYS},
            "snapshots": {"channelUtil": 0.0, "airtimeTx": 0.0, "battery": 0.0},
            "accumulators": {"packetTx": 0, "packetRx": 0},
            "packetTypeAccum": {k: 0 for k in _PACKET_TYPE_KEYS},
            "local_node_num": None,
        },
    }

    # Restore persisted time-series data
    saved_ts = await ts_store.async_load()
    if saved_ts:
        ts = hass.data[DOMAIN]["ts"]
        for key in _TS_SERIES_KEYS:
            if key in saved_ts.get("data", {}):
                vals = saved_ts["data"][key]
                ts["data"][key] = deque(vals, maxlen=TS_MAX_POINTS)
        for key in _PACKET_TYPE_KEYS:
            if key in saved_ts.get("packetTypes", {}):
                vals = saved_ts["packetTypes"][key]
                ts["packetTypes"][key] = deque(vals, maxlen=TS_MAX_POINTS)

    # Register radio callbacks
    _register_radio_callbacks(hass, store, connection)

    # Connect to the radio
    try:
        await connection.async_connect()
    except Exception:  # noqa: BLE001
        _LOGGER.error("Initial connection to Meshtastic radio failed; will retry")

    # Sync nodes from radio's mesh database and seed time-series snapshots
    _sync_nodes_from_radio(hass, store, connection)

    # Start time-series flush timer (runs regardless of frontend connections)
    @callback
    def _flush_timeseries(_now: Any) -> None:
        ts = hass.data.get(DOMAIN, {}).get("ts")
        if ts is None:
            return
        data = ts["data"]
        snap = ts["snapshots"]
        acc = ts["accumulators"]
        data["channelUtil"].append(snap["channelUtil"])
        data["airtimeTx"].append(snap["airtimeTx"])
        data["battery"].append(snap["battery"])
        data["packetTx"].append(acc["packetTx"])
        data["packetRx"].append(acc["packetRx"])
        ts["accumulators"] = {"packetTx": 0, "packetRx": 0}
        # Per-type packet breakdown
        pt = ts["packetTypes"]
        pta = ts["packetTypeAccum"]
        for k in _PACKET_TYPE_KEYS:
            pt[k].append(pta[k])
        ts["packetTypeAccum"] = {k: 0 for k in _PACKET_TYPE_KEYS}

    unsub_ts = async_track_time_interval(
        hass, _flush_timeseries, timedelta(seconds=TS_FLUSH_SECONDS)
    )
    hass.data[DOMAIN]["unsub_callbacks"].append(unsub_ts)

    # Persist time-series to disk every 5 minutes
    async def _persist_timeseries(_now: Any) -> None:
        ts = hass.data.get(DOMAIN, {}).get("ts")
        ts_s = hass.data.get(DOMAIN, {}).get("ts_store")
        if ts and ts_s:
            await ts_s.async_save(ts)

    unsub_ts_persist = async_track_time_interval(
        hass, _persist_timeseries, timedelta(seconds=TS_PERSIST_SECONDS)
    )
    hass.data[DOMAIN]["unsub_callbacks"].append(unsub_ts_persist)

    # Register WebSocket API
    async_register_websocket_api(hass)

    # Register frontend panel
    await async_register_panel(hass)

    # Set up sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        data = hass.data.pop(DOMAIN, {})
        for unsub in data.get("unsub_callbacks", []):
            unsub()
        # Persist time-series before shutdown
        ts_s: TimeSeriesStore | None = data.get("ts_store")
        ts = data.get("ts")
        if ts_s and ts:
            await ts_s.async_save(ts)
        connection: MeshtasticConnection | None = data.get("connection")
        if connection is not None:
            await connection.async_disconnect()
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
    if conn_type == ConnectionType.BLE:
        return MeshtasticConnection(
            hass,
            conn_type,
            ble_address=config_data[CONF_BLE_ADDRESS],
        )

    raise ValueError(f"Unknown connection type: {conn_type}")


@callback
def _register_radio_callbacks(
    hass: HomeAssistant,
    store: MeshtasticUiStore,
    connection: MeshtasticConnection,
) -> None:
    """Wire radio callbacks to the store and dispatcher."""
    unsub_callbacks = hass.data[DOMAIN]["unsub_callbacks"]

    @callback
    def _on_packet(packet: dict) -> None:
        """Handle a received packet from the radio."""
        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum")

        _LOGGER.debug(
            "Packet received: portnum=%s from=%s to=%s",
            portnum, packet.get("fromId"), packet.get("toId"),
        )

        # Count all received packets from other nodes for time-series
        ts = hass.data.get(DOMAIN, {}).get("ts")
        if ts and portnum:
            sender_id = packet.get("fromId")
            local_num = ts.get("local_node_num")
            local_id = _num_to_id(local_num) if local_num else None
            if sender_id and sender_id != local_id:
                ts["accumulators"]["packetRx"] += 1
                ptype = _PORTNUM_MAP.get(portnum, "other")
                ts["packetTypeAccum"][ptype] += 1

        if portnum == "TEXT_MESSAGE_APP":
            _LOGGER.debug("Text message: %r", decoded.get("text", "")[:50])
            _handle_text_message(hass, store, packet)

        # Handle delivery acknowledgements
        if portnum == "ROUTING_APP":
            _handle_delivery_ack(hass, packet)

        # Handle traceroute responses
        if portnum == "TRACEROUTE_APP":
            _handle_traceroute(hass, store, packet)

        # Handle waypoints
        if portnum == "WAYPOINT_APP":
            _handle_waypoint(hass, store, packet)

        # Track sender as a node
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

    @callback
    def _on_node_update(node: dict) -> None:
        """Handle a node update from the radio's node database."""
        node_num = node.get("num")
        if node_num is None:
            return

        node_id = _num_to_id(node_num)
        data = _extract_node_data(node)
        store.update_node(node_id, data)
        async_dispatcher_send(hass, SIGNAL_NODE_UPDATE, node_id)

        # Capture telemetry snapshots from the local (gateway) node
        ts = hass.data.get(DOMAIN, {}).get("ts")
        if ts and node_num == ts.get("local_node_num"):
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
        _LOGGER.info(
            "Meshtastic connection: %s -> %s", old_state, new_state
        )
        async_dispatcher_send(hass, SIGNAL_CONNECTION_STATE, new_state)

        if new_state == ConnectionState.CONNECTED and old_state in (
            ConnectionState.RECONNECTING,
            ConnectionState.CONNECTING,
        ):
            # Re-sync nodes on reconnect
            _sync_nodes_from_radio(hass, store, connection)

    unsub_callbacks.append(connection.register_message_callback(_on_packet))
    unsub_callbacks.append(connection.register_node_update_callback(_on_node_update))
    unsub_callbacks.append(
        connection.register_connection_change_callback(_on_connection_state_change)
    )


@callback
def _handle_text_message(
    hass: HomeAssistant, store: MeshtasticUiStore, packet: dict
) -> None:
    """Parse a text message packet and route to channel or DM store."""
    decoded = packet.get("decoded", {})
    text = decoded.get("text", "")
    if not text:
        return

    sender_id = normalize_node_id(packet.get("fromId", "unknown"))
    to_id = packet.get("toId", "")
    channel_index = packet.get("channel", 0)
    timestamp = datetime.now(timezone.utc).isoformat()

    message: dict[str, Any] = {
        "text": text,
        "from": sender_id,
        "to": to_id,
        "timestamp": timestamp,
        "channel": channel_index,
    }

    # Broadcast destinations: ^all or !ffffffff
    is_broadcast = to_id in ("^all", "!ffffffff", "")

    if is_broadcast:
        channel_key = str(channel_index)
        store.add_channel_message(channel_key, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"type": "channel", "channel": channel_key, **message},
        )
    else:
        # DM — key by the other party's ID
        store.add_dm_message(sender_id, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"type": "dm", "partner": sender_id, **message},
        )

    # Send push notification if enabled
    prefs = store.get_notification_prefs()
    if prefs.get("enabled"):
        msg_filter = prefs.get("filter", "all")
        should_notify = (
            msg_filter == "all"
            or (msg_filter == "channel" and is_broadcast)
            or (msg_filter == "dm" and not is_broadcast)
        )
        if should_notify:
            service_target = prefs.get("service", "notify.notify")
            parts = service_target.split(".", 1)
            notify_domain = parts[0] if len(parts) > 1 else "notify"
            notify_service = parts[1] if len(parts) > 1 else parts[0]
            sender_name = store.get_nodes().get(sender_id, {}).get("name", sender_id)

            async def _send_notification() -> None:
                try:
                    await hass.services.async_call(
                        notify_domain,
                        notify_service,
                        {
                            "title": sender_name,
                            "message": text,
                            "data": {
                                "channel": channel_index,
                                "from": sender_id,
                                "timestamp": timestamp,
                            },
                        },
                    )
                except Exception:  # noqa: BLE001
                    _LOGGER.warning(
                        "Failed to send notification via %s", service_target
                    )

            hass.async_create_task(_send_notification())


@callback
def _handle_delivery_ack(hass: HomeAssistant, packet: dict) -> None:
    """Handle a routing/ack packet to update message delivery status."""
    decoded = packet.get("decoded", {})
    routing = decoded.get("routing", {})
    request_id = packet.get("requestId") or decoded.get("requestId")

    if not request_id:
        return

    pending = hass.data.get(DOMAIN, {}).get("pending_acks", {})
    if request_id not in pending:
        return

    msg_info = pending.pop(request_id)
    error_reason = routing.get("errorReason")

    if error_reason and error_reason != "NONE":
        status = "failed"
    else:
        status = "delivered"

    # Count outgoing packets for time-series
    ts = hass.data.get(DOMAIN, {}).get("ts")
    if ts:
        ts["accumulators"]["packetTx"] += 1

    async_dispatcher_send(
        hass,
        SIGNAL_DELIVERY_STATUS,
        {
            "packet_id": request_id,
            "status": status,
            "error": error_reason,
            **msg_info,
        },
    )


@callback
def _handle_traceroute(
    hass: HomeAssistant, store: MeshtasticUiStore, packet: dict
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
        # Some library versions may not nest under "traceroute"; still record the route
        _LOGGER.debug(
            "Traceroute packet has no decoded route data (keys: %s), recording direct route %s -> %s",
            list(decoded.keys()), to_id, from_id,
        )

    # Extract route hops (list of node IDs)
    route = traceroute.get("route", [])
    route_back = traceroute.get("routeBack", [])
    snr_towards = traceroute.get("snrTowards", [])
    snr_back = traceroute.get("snrBack", [])

    # Convert numeric node IDs to hex format
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

    # Store keyed by the responding node (destination of the traceroute)
    store.set_traceroute(from_id, result)

    _LOGGER.debug("Traceroute stored: %s -> %s via %d hops", to_id, from_id, len(route_ids))
    async_dispatcher_send(hass, SIGNAL_TRACEROUTE_RESULT, result)


@callback
def _handle_waypoint(
    hass: HomeAssistant, store: MeshtasticUiStore, packet: dict
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

    # Check if this is a deletion (expire=1 means already expired)
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if expire > 0 and expire <= now_ts:
        store.remove_waypoint(wp_id)
        async_dispatcher_send(
            hass,
            SIGNAL_WAYPOINT_UPDATE,
            {"action": "delete", "waypoint_id": wp_id},
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
        {"action": "add", "waypoint_id": wp_id, **wp_data},
    )


def _sync_nodes_from_radio(
    hass: HomeAssistant,
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
        _LOGGER.info("Synced %d nodes from radio mesh database", len(updates))

    # Seed time-series state from the local (gateway) node
    my_info = connection.my_info
    ts = hass.data.get(DOMAIN, {}).get("ts")
    if my_info and ts:
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

    # User info
    user = node.get("user", {})
    if user.get("longName"):
        data["name"] = user["longName"]
    if user.get("shortName"):
        data["short_name"] = user["shortName"]
    if user.get("hwModel"):
        data["hardware_model"] = user["hwModel"]

    # Position
    position = node.get("position", {})
    if position.get("latitude") is not None:
        data["latitude"] = position["latitude"]
    if position.get("longitude") is not None:
        data["longitude"] = position["longitude"]
    if position.get("altitude") is not None:
        data["altitude"] = position["altitude"]

    # Device metrics
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

    # SNR / hops
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

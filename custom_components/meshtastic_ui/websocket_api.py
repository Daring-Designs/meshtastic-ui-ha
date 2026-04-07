"""WebSocket API for Meshtastic UI."""

from __future__ import annotations

import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant.components.websocket_api import (
    ActiveConnection,
    async_register_command,
    async_response,
    websocket_command,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)

from .connection import MeshtasticConnection
from .const import (
    DOMAIN,
    SIGNAL_DELIVERY_STATUS,
    SIGNAL_NEW_MESSAGE,
    SIGNAL_NODE_UPDATE,
    SIGNAL_TRACEROUTE_RESULT,
    SIGNAL_WAYPOINT_UPDATE,
    TS_FLUSH_SECONDS,
    TS_POINTS,
    WS_PREFIX,
)
from .store import MeshtasticUiStore

_LOGGER = logging.getLogger(__name__)


def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register all WebSocket commands."""
    async_register_command(hass, ws_gateways)
    async_register_command(hass, ws_messages)
    async_register_command(hass, ws_nodes)
    async_register_command(hass, ws_stats)
    async_register_command(hass, ws_subscribe)
    async_register_command(hass, ws_send_message)
    async_register_command(hass, ws_call_service)
    async_register_command(hass, ws_connection_status)
    async_register_command(hass, ws_subscribe_nodes)
    async_register_command(hass, ws_subscribe_delivery)
    async_register_command(hass, ws_get_config)
    async_register_command(hass, ws_set_config)
    async_register_command(hass, ws_get_channels)
    async_register_command(hass, ws_set_channel)
    async_register_command(hass, ws_set_owner)
    async_register_command(hass, ws_device_action)
    async_register_command(hass, ws_node_admin)
    async_register_command(hass, ws_get_waypoints)
    async_register_command(hass, ws_send_waypoint)
    async_register_command(hass, ws_delete_waypoint)
    async_register_command(hass, ws_subscribe_waypoints)
    async_register_command(hass, ws_get_traceroutes)
    async_register_command(hass, ws_subscribe_traceroutes)
    async_register_command(hass, ws_get_notification_prefs)
    async_register_command(hass, ws_set_notification_prefs)
    async_register_command(hass, ws_get_timeseries)


def _get_store(hass: HomeAssistant) -> MeshtasticUiStore:
    """Get the store instance."""
    return hass.data[DOMAIN]["store"]


def _get_connection(hass: HomeAssistant) -> MeshtasticConnection:
    """Get the connection instance."""
    return hass.data[DOMAIN]["connection"]


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/gateways",
    }
)
@async_response
async def ws_gateways(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return our radio's info as the gateway."""
    conn = _get_connection(hass)
    gateways: list[dict[str, Any]] = []

    my_info = conn.my_info
    meta = conn.metadata
    iface = conn.interface

    # Build gateway info from the radio's own node and metadata.
    name = "Meshtastic Radio"
    model = None
    firmware = None
    serial = None
    sensors: dict[str, Any] = {}
    channels: list[dict[str, Any]] = []

    # Extract from our node in the mesh database.
    user = my_info.get("user", {})
    if user.get("longName"):
        name = user["longName"]
    if user.get("hwModel"):
        model = user["hwModel"]

    # Metadata from the device.
    if meta.get("firmwareVersion"):
        firmware = meta["firmwareVersion"]
    if meta.get("hwModel"):
        model = model or meta["hwModel"]

    # Device metrics from our node.
    device_metrics = my_info.get("deviceMetrics", {})
    if device_metrics.get("batteryLevel") is not None:
        sensors["battery"] = device_metrics["batteryLevel"]
    if device_metrics.get("voltage") is not None:
        sensors["voltage"] = round(device_metrics["voltage"], 2)
    if device_metrics.get("channelUtilization") is not None:
        sensors["channel_utilization"] = round(
            device_metrics["channelUtilization"], 1
        )
    if device_metrics.get("airUtilTx") is not None:
        sensors["air_util_tx"] = round(device_metrics["airUtilTx"], 1)
    if device_metrics.get("uptimeSeconds") is not None:
        sensors["uptime"] = device_metrics["uptimeSeconds"]

    # Packet counters from LocalStats telemetry.
    local_stats = hass.data.get(DOMAIN, {}).get("local_stats", {})
    if local_stats.get("numPacketsTx") is not None:
        sensors["packets_tx"] = local_stats["numPacketsTx"]
    if local_stats.get("numPacketsRx") is not None:
        sensors["packets_rx"] = local_stats["numPacketsRx"]
    if local_stats.get("numPacketsRxBad") is not None:
        sensors["packets_bad"] = local_stats["numPacketsRxBad"]
    if local_stats.get("numTxRelay") is not None:
        sensors["packets_relayed"] = local_stats["numTxRelay"]

    # Channel list from the interface.
    if iface is not None:
        try:
            node_info = iface.getMyNodeInfo()
            if node_info:
                # Try to get serial number.
                hw = node_info.get("user", {})
                if hw.get("macaddr"):
                    serial = hw["macaddr"]
        except Exception:  # noqa: BLE001
            pass

        try:
            for ch in (iface.localNode.channels or [])[:8]:
                if ch.role == 0:  # DISABLED
                    continue
                ch_settings = ch.settings
                channels.append(
                    {
                        "name": ch_settings.name or (
                            "Primary" if ch.role == 1 else f"Channel {ch.index}"
                        ),
                        "index": ch.index,
                        "primary": ch.role == 1,
                        "psk": len(ch_settings.psk) > 0 if ch_settings.psk else False,
                        "uplink": ch_settings.uplink_enabled,
                        "downlink": ch_settings.downlink_enabled,
                    }
                )
        except Exception:  # noqa: BLE001
            pass

    state = "connected" if conn.state == "connected" else str(conn.state)

    # Get local node ID in !hex format.
    local_node_id = None
    node_num = my_info.get("num")
    if node_num is not None:
        local_node_id = f"!{node_num:08x}"

    gateways.append(
        {
            "entity_id": None,
            "name": name,
            "state": state,
            "model": model,
            "firmware": firmware,
            "serial": serial,
            "sensors": sensors,
            "channels": channels,
            "node_id": local_node_id,
        }
    )

    connection.send_result(msg["id"], {"gateways": gateways})


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/messages",
        vol.Optional("entity_id"): str,
    }
)
@async_response
async def ws_messages(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return stored messages, optionally filtered."""
    store = _get_store(hass)
    entity_id = msg.get("entity_id")

    if entity_id:
        # Check channels first, then DMs.
        messages = store.get_channel_messages(entity_id)
        if not messages:
            messages = store.get_dm_messages(entity_id)
        connection.send_result(msg["id"], {"messages": messages})
    else:
        connection.send_result(
            msg["id"],
            {
                "messages": store.get_all_messages(),
                "channels": store.get_all_channel_ids(),
                "dms": store.get_all_dm_ids(),
            },
        )


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/nodes",
    }
)
@async_response
async def ws_nodes(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return all tracked nodes."""
    store = _get_store(hass)
    connection.send_result(
        msg["id"],
        {
            "nodes": store.get_nodes(),
            "favorite_nodes": list(store.favorite_nodes),
            "ignored_nodes": list(store.ignored_nodes),
        },
    )


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/stats",
    }
)
@async_response
async def ws_stats(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return summary statistics."""
    store = _get_store(hass)
    connection.send_result(
        msg["id"],
        {
            "messages_today": store.messages_today,
            "active_nodes": store.active_nodes_count,
            "total_nodes": store.total_nodes,
            "channel_count": store.channel_count,
        },
    )


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/subscribe",
    }
)
@callback
def ws_subscribe(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Subscribe to real-time message updates."""

    @callback
    def _forward_message(message_data: dict[str, Any]) -> None:
        """Forward new message to the subscriber."""
        connection.send_event(msg["id"], message_data)

    unsub = async_dispatcher_connect(hass, SIGNAL_NEW_MESSAGE, _forward_message)
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/subscribe_nodes",
    }
)
@callback
def ws_subscribe_nodes(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Subscribe to real-time node updates."""

    @callback
    def _forward_node_update(node_id: str) -> None:
        """Forward node update to the subscriber."""
        store = _get_store(hass)
        node_data = store.get_nodes().get(node_id, {})
        connection.send_event(
            msg["id"], {"node_id": node_id, "data": node_data}
        )

    unsub = async_dispatcher_connect(hass, SIGNAL_NODE_UPDATE, _forward_node_update)
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/subscribe_delivery",
    }
)
@callback
def ws_subscribe_delivery(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Subscribe to message delivery status updates (ack/fail)."""

    @callback
    def _forward_delivery(data: dict[str, Any]) -> None:
        """Forward delivery status to the subscriber."""
        connection.send_event(msg["id"], data)

    unsub = async_dispatcher_connect(
        hass, SIGNAL_DELIVERY_STATUS, _forward_delivery
    )
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/send_message",
        vol.Required("text"): str,
        vol.Optional("channel"): int,
        vol.Optional("to"): str,
        vol.Optional("reply_id"): int,
    }
)
@async_response
async def ws_send_message(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send a message via the radio."""
    from datetime import datetime, timezone

    conn = _get_connection(hass)
    store = _get_store(hass)
    text = msg["text"]
    channel = msg.get("channel", 0)
    to = msg.get("to")
    reply_id = msg.get("reply_id")

    # Determine local node ID for the outgoing message.
    local_node_id = None
    my_info = conn.my_info
    node_num = my_info.get("num")
    if node_num is not None:
        local_node_id = f"!{node_num:08x}"

    try:
        packet_id = await conn.async_send_text(
            text, destination_id=to, channel_index=channel,
            reply_id=reply_id,
        )
        # Register for delivery tracking.
        if packet_id is not None:
            pending = hass.data.get(DOMAIN, {}).get("pending_acks", {})
            pending[packet_id] = {
                "text": text,
                "to": to,
                "channel": channel,
                "_ts": time.time(),
            }

        # Store and dispatch the outgoing message so the UI shows it.
        timestamp = datetime.now(timezone.utc).isoformat()
        out_msg: dict[str, Any] = {
            "text": text,
            "from": local_node_id or "local",
            "timestamp": timestamp,
            "_outgoing": True,
        }
        if packet_id is not None:
            out_msg["packet_id"] = packet_id
            out_msg["message_id"] = packet_id
        if reply_id:
            out_msg["reply_id"] = reply_id

        if to:
            # DM
            out_msg["to"] = to
            store.add_dm_message(to, out_msg)
            async_dispatcher_send(
                hass,
                SIGNAL_NEW_MESSAGE,
                {"type": "dm", "partner": to, **out_msg},
            )
        else:
            # Channel broadcast.
            channel_key = str(channel)
            out_msg["to"] = "^all"
            out_msg["channel"] = channel_key
            store.add_channel_message(channel_key, out_msg)
            async_dispatcher_send(
                hass,
                SIGNAL_NEW_MESSAGE,
                {"type": "channel", "channel": channel_key, **out_msg},
            )

        connection.send_result(
            msg["id"], {"success": True, "packet_id": packet_id}
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Send message failed")
        connection.send_error(msg["id"], "send_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/call_service",
        vol.Required("service"): vol.In({"trace_route", "request_position", "request_nodeinfo"}),
        vol.Optional("service_data"): dict,
    }
)
@async_response
async def ws_call_service(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Execute a radio command (trace_route, request_position, request_nodeinfo)."""
    conn = _get_connection(hass)
    service = msg["service"]
    service_data = msg.get("service_data", {})

    try:
        if service == "trace_route":
            dest = service_data.get("destination") or service_data.get("to", "")
            if not dest:
                connection.send_error(
                    msg["id"], "missing_param", "destination is required"
                )
                return
            await conn.async_send_traceroute(dest)
            connection.send_result(msg["id"], {"success": True})

        elif service == "request_position":
            dest = service_data.get("destination") or service_data.get("to", "")
            if not dest:
                connection.send_error(
                    msg["id"], "missing_param", "destination is required"
                )
                return
            await conn.async_request_position(dest)
            connection.send_result(msg["id"], {"success": True})

        elif service == "request_nodeinfo":
            dest = service_data.get("destination") or service_data.get("to", "")
            if not dest:
                connection.send_error(
                    msg["id"], "missing_param", "destination is required"
                )
                return
            await conn.async_request_nodeinfo(dest)
            connection.send_result(msg["id"], {"success": True})

        else:
            connection.send_error(
                msg["id"],
                "unknown_service",
                f"Unknown service: {service}",
            )
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Call service '%s' failed", msg["service"])
        connection.send_error(msg["id"], "call_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/connection_status",
    }
)
@async_response
async def ws_connection_status(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the current radio connection state."""
    conn = _get_connection(hass)
    connection.send_result(
        msg["id"],
        {
            "state": str(conn.state),
            "connection_type": str(conn.connection_type),
        },
    )


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_config",
    }
)
@async_response
async def ws_get_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return full radio config (local_config, module_config, channels, owner, metadata)."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    try:
        config = await conn.async_get_config()
        connection.send_result(msg["id"], config)
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Get config failed")
        connection.send_error(msg["id"], "get_config_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_config",
        vol.Required("section"): str,
        vol.Required("values"): dict,
    }
)
@async_response
async def ws_set_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Write a config section to the radio."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    try:
        await conn.async_set_config(msg["section"], msg["values"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Set config '%s' failed", msg["section"])
        connection.send_error(msg["id"], "set_config_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_channels",
    }
)
@async_response
async def ws_get_channels(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return channel config from the radio."""
    conn = _get_connection(hass)
    try:
        config = await conn.async_get_config()
        connection.send_result(msg["id"], {"channels": config.get("channels", [])})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Get channels failed")
        connection.send_error(msg["id"], "get_channels_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_channel",
        vol.Required("index"): vol.All(int, vol.Range(min=0, max=7)),
        vol.Required("settings"): dict,
    }
)
@async_response
async def ws_set_channel(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Write channel settings to the radio."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    try:
        await conn.async_set_channel(msg["index"], msg["settings"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Set channel %d failed", msg["index"])
        connection.send_error(msg["id"], "set_channel_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_owner",
        vol.Optional("long_name"): str,
        vol.Optional("short_name"): str,
        vol.Optional("is_licensed"): bool,
    }
)
@async_response
async def ws_set_owner(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Set the owner info on the radio."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    try:
        await conn.async_set_owner(
            long_name=msg.get("long_name"),
            short_name=msg.get("short_name"),
            is_licensed=msg.get("is_licensed", False),
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Set owner failed")
        connection.send_error(msg["id"], "set_owner_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/device_action",
        vol.Required("action"): vol.In({"factory_reset_config", "factory_reset_device", "reboot", "reboot_ota", "reset_nodedb", "shutdown"}),
        vol.Optional("params"): dict,
    }
)
@async_response
async def ws_device_action(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Execute a device action (reboot, shutdown, factory reset, etc)."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    try:
        params = msg.get("params") or {}
        seconds = min(max(int(params.get("seconds", 5)), 1), 300)
        await conn.async_device_action(msg["action"], seconds=seconds)
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Device action '%s' failed", msg["action"])
        connection.send_error(msg["id"], "device_action_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/node_admin",
        vol.Required("node_id"): str,
        vol.Required("action"): vol.In({"favorite", "ignore", "remove", "unfavorite", "unignore"}),
    }
)
@async_response
async def ws_node_admin(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Perform admin action on a remote node (favorite, ignore, remove)."""
    action = msg["action"]
    if action == "remove" and not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    conn = _get_connection(hass)
    store = _get_store(hass)
    node_id = msg["node_id"]
    try:
        await conn.async_node_admin(node_id, action)
        # Sync favorites/ignored to the local store.
        if action == "favorite":
            store.set_favorite(node_id, True)
        elif action == "unfavorite":
            store.set_favorite(node_id, False)
        elif action == "ignore":
            store.set_ignored(node_id, True)
        elif action == "unignore":
            store.set_ignored(node_id, False)
        elif action == "remove":
            store.remove_node(node_id)
            store.set_favorite(node_id, False)
            store.set_ignored(node_id, False)
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Node admin '%s' on %s failed", action, node_id)
        connection.send_error(msg["id"], "node_admin_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_waypoints",
    }
)
@async_response
async def ws_get_waypoints(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return all stored waypoints."""
    store = _get_store(hass)
    connection.send_result(msg["id"], {"waypoints": store.get_waypoints()})


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/send_waypoint",
        vol.Required("latitude"): vol.Coerce(float),
        vol.Required("longitude"): vol.Coerce(float),
        vol.Optional("name"): str,
        vol.Optional("description"): str,
        vol.Optional("expire"): int,
    }
)
@async_response
async def ws_send_waypoint(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send a waypoint to the mesh and store it."""
    conn = _get_connection(hass)
    store = _get_store(hass)
    try:
        wp_id = await conn.async_send_waypoint(
            latitude=msg["latitude"],
            longitude=msg["longitude"],
            name=msg.get("name", ""),
            description=msg.get("description", ""),
            expire=msg.get("expire", 0),
        )
        wp_data = {
            "latitude": msg["latitude"],
            "longitude": msg["longitude"],
            "name": msg.get("name", ""),
            "description": msg.get("description", ""),
            "expire": msg.get("expire", 0),
        }
        if wp_id is not None:
            store.add_waypoint(wp_id, wp_data)
            from homeassistant.helpers.dispatcher import async_dispatcher_send

            async_dispatcher_send(
                hass,
                SIGNAL_WAYPOINT_UPDATE,
                {"action": "add", "waypoint_id": wp_id, **wp_data},
            )
        connection.send_result(
            msg["id"], {"success": True, "waypoint_id": wp_id}
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Send waypoint failed")
        connection.send_error(msg["id"], "send_waypoint_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/delete_waypoint",
        vol.Required("waypoint_id"): int,
    }
)
@async_response
async def ws_delete_waypoint(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete a waypoint from the mesh and store."""
    conn = _get_connection(hass)
    store = _get_store(hass)
    wp_id = msg["waypoint_id"]
    try:
        await conn.async_delete_waypoint(wp_id)
        store.remove_waypoint(wp_id)
        from homeassistant.helpers.dispatcher import async_dispatcher_send

        async_dispatcher_send(
            hass,
            SIGNAL_WAYPOINT_UPDATE,
            {"action": "delete", "waypoint_id": wp_id},
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Delete waypoint failed")
        connection.send_error(msg["id"], "delete_waypoint_failed", "Operation failed")


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/subscribe_waypoints",
    }
)
@callback
def ws_subscribe_waypoints(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Subscribe to waypoint updates."""

    @callback
    def _forward_waypoint(data: dict[str, Any]) -> None:
        connection.send_event(msg["id"], data)

    unsub = async_dispatcher_connect(hass, SIGNAL_WAYPOINT_UPDATE, _forward_waypoint)
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_traceroutes",
    }
)
@async_response
async def ws_get_traceroutes(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return all stored traceroute results."""
    store = _get_store(hass)
    connection.send_result(msg["id"], {"traceroutes": store.get_all_traceroutes()})


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/subscribe_traceroutes",
    }
)
@callback
def ws_subscribe_traceroutes(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Subscribe to traceroute result updates."""

    @callback
    def _forward_traceroute(data: dict[str, Any]) -> None:
        connection.send_event(msg["id"], data)

    unsub = async_dispatcher_connect(
        hass, SIGNAL_TRACEROUTE_RESULT, _forward_traceroute
    )
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_notification_prefs",
    }
)
@async_response
async def ws_get_notification_prefs(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return notification preferences."""
    store = _get_store(hass)
    connection.send_result(msg["id"], store.get_notification_prefs())


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_notification_prefs",
        vol.Optional("enabled"): bool,
        vol.Optional("service"): vol.Match(r"^\w+\.\w+$"),
        vol.Optional("filter"): vol.In({"all", "channel", "dm"}),
    }
)
@async_response
async def ws_set_notification_prefs(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Update notification preferences."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Admin access required")
        return
    store = _get_store(hass)
    prefs: dict[str, Any] = {}
    if "enabled" in msg:
        prefs["enabled"] = msg["enabled"]
    if "service" in msg:
        prefs["service"] = msg["service"]
    if "filter" in msg:
        prefs["filter"] = msg["filter"]
    store.set_notification_prefs(prefs)
    connection.send_result(msg["id"], {"success": True})


# Snapshot metrics are averaged; counter metrics are summed when downsampling.
_COUNTER_SERIES = {"packetTx", "packetRx"}
_COUNTER_PACKET_TYPES = {"nodeinfo", "other", "position", "routing", "telemetry", "text"}


def _downsample(values: list[float], factor: int, is_counter: bool) -> list[float]:
    """Downsample a list of floats by *factor* buckets.

    Counters are summed per bucket; snapshot metrics are averaged.
    """
    if factor <= 1:
        return values
    out: list[float] = []
    for i in range(0, len(values), factor):
        chunk = values[i : i + factor]
        if is_counter:
            out.append(sum(chunk))
        else:
            out.append(sum(chunk) / len(chunk))
    return out


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/get_timeseries",
        vol.Optional("window", default=3600): vol.All(
            vol.Coerce(int), vol.Range(min=60, max=604800)
        ),
    }
)
@callback
def ws_get_timeseries(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return time-series chart data collected by the backend.

    Accepts an optional *window* parameter (seconds, default 3600).
    Slices the most recent data for that window and downsamples to
    TS_POINTS (360) buckets.
    """
    ts = hass.data.get(DOMAIN, {}).get("ts")
    if ts is None:
        connection.send_result(msg["id"], {"timeseries": None})
        return

    window = msg["window"]
    raw_points = window // TS_FLUSH_SECONDS  # how many 10s points cover the window
    factor = max(1, raw_points // TS_POINTS)
    bucket_interval = factor * TS_FLUSH_SECONDS

    # Slice and downsample main series.
    result_data: dict[str, list[float]] = {}
    for k, dq in ts["data"].items():
        sliced = list(dq)[-raw_points:]
        result_data[k] = _downsample(sliced, factor, k in _COUNTER_SERIES)

    # Slice and downsample packet-type series.
    packet_types = ts.get("packetTypes")
    result_pt: dict[str, list[float]] | None = None
    if packet_types:
        result_pt = {}
        for k, dq in packet_types.items():
            sliced = list(dq)[-raw_points:]
            result_pt[k] = _downsample(sliced, factor, True)

    connection.send_result(
        msg["id"],
        {
            "timeseries": result_data,
            "packetTypes": result_pt,
            "bucketInterval": bucket_interval,
        },
    )

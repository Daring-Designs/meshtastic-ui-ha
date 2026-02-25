"""WebSocket API for Meshtastic UI."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.websocket_api import (
    ActiveConnection,
    async_register_command,
    async_response,
    websocket_command,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .connection import MeshtasticConnection
from .const import DOMAIN, SIGNAL_NEW_MESSAGE, WS_PREFIX
from .store import MeshtasticUiStore


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

    # Build gateway info from the radio's own node and metadata
    name = "Meshtastic Radio"
    model = None
    firmware = None
    serial = None
    sensors: dict[str, Any] = {}
    channels: list[dict[str, Any]] = []

    # Extract from our node in the mesh database
    user = my_info.get("user", {})
    if user.get("longName"):
        name = user["longName"]
    if user.get("hwModel"):
        model = user["hwModel"]

    # Metadata from the device
    if meta.get("firmwareVersion"):
        firmware = meta["firmwareVersion"]
    if meta.get("hwModel"):
        model = model or meta["hwModel"]

    # Device metrics from our node
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

    # Channel list from the interface
    if iface is not None:
        try:
            node_info = iface.getMyNodeInfo()
            if node_info:
                # Try to get serial number
                hw = node_info.get("user", {})
                if hw.get("macaddr"):
                    serial = hw["macaddr"]
        except Exception:  # noqa: BLE001
            pass

        try:
            for ch in iface.localNode.channels or []:
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
        # Check channels first, then DMs
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
    connection.send_result(msg["id"], {"nodes": store.get_nodes()})


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
        vol.Required("type"): f"{WS_PREFIX}/send_message",
        vol.Required("text"): str,
        vol.Optional("channel"): int,
        vol.Optional("to"): str,
    }
)
@async_response
async def ws_send_message(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send a message via the radio."""
    conn = _get_connection(hass)
    text = msg["text"]
    channel = msg.get("channel", 0)
    to = msg.get("to")

    try:
        await conn.async_send_text(
            text, destination_id=to, channel_index=channel
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "send_failed", str(err))


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/call_service",
        vol.Required("service"): str,
        vol.Optional("service_data"): dict,
    }
)
@async_response
async def ws_call_service(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Execute a radio command (trace_route, request_position)."""
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

        else:
            connection.send_error(
                msg["id"],
                "unknown_service",
                f"Unknown service: {service}",
            )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "call_failed", str(err))


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

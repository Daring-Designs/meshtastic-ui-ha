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
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_NEW_MESSAGE, WS_PREFIX


def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register all WebSocket commands."""
    async_register_command(hass, ws_gateways)
    async_register_command(hass, ws_messages)
    async_register_command(hass, ws_nodes)
    async_register_command(hass, ws_stats)
    async_register_command(hass, ws_subscribe)
    async_register_command(hass, ws_send_message)
    async_register_command(hass, ws_call_service)


def _get_store(hass: HomeAssistant) -> MeshtasticUiStore:
    """Get the store instance."""
    return hass.data[DOMAIN]["store"]


@websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/gateways",
    }
)
@async_response
async def ws_gateways(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return discovered meshtastic gateways with rich status data."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    gateways: list[dict[str, Any]] = []

    # Collect gateway entities
    gateway_entries: list[er.RegistryEntry] = []
    for entry in ent_reg.entities.values():
        if entry.platform != "meshtastic":
            continue
        if entry.original_device_class == "gateway" or (
            entry.entity_id.startswith("sensor.meshtastic_")
            and "gateway" in entry.entity_id
        ):
            gateway_entries.append(entry)

    for gw_entry in gateway_entries:
        gateway_id = gw_entry.entity_id.split(".")[-1]
        name = gw_entry.name or gw_entry.original_name or gateway_id

        # Read gateway entity state
        state_obj = hass.states.get(gw_entry.entity_id)
        state = state_obj.state if state_obj else "unknown"

        # Device registry info
        model = None
        firmware = None
        serial = None
        device_id = gw_entry.device_id
        if device_id:
            device = dev_reg.async_get(device_id)
            if device:
                model = device.model
                firmware = device.sw_version
                serial = device.serial_number

        # Find sibling entities on the same device
        sensors: dict[str, str | None] = {}
        channels: list[dict[str, Any]] = []

        if device_id:
            sibling_entries = er.async_entries_for_device(ent_reg, device_id)
            sensor_keys = {
                "battery", "voltage", "uptime", "channel_utilization",
                "air_util_tx", "airtime", "packets_tx", "packets_rx",
                "packets_bad", "packets_relayed",
            }

            for sibling in sibling_entries:
                if sibling.platform != "meshtastic":
                    continue
                eid = sibling.entity_id
                eid_lower = eid.lower()

                # Match sensor entities by key substring
                for key in sensor_keys:
                    if key in eid_lower:
                        s = hass.states.get(eid)
                        sensors[key] = s.state if s else None
                        break

                # Match channel entities
                if "channel" in eid_lower and sibling.entity_id.startswith(
                    ("sensor.meshtastic_", "binary_sensor.meshtastic_")
                ):
                    s = hass.states.get(eid)
                    attrs = s.attributes if s else {}
                    # Only include if it looks like a channel config entity
                    if "index" in attrs or "psk" in attrs or "primary" in attrs:
                        channels.append(
                            {
                                "name": (
                                    attrs.get("name")
                                    or sibling.name
                                    or sibling.original_name
                                    or eid.split(".")[-1]
                                ),
                                "index": attrs.get("index", 0),
                                "primary": attrs.get("primary", False),
                                "psk": attrs.get("psk") is not None
                                and attrs.get("psk") != "",
                                "uplink": attrs.get("uplink", False),
                                "downlink": attrs.get("downlink", False),
                            }
                        )

            channels.sort(key=lambda c: c.get("index", 0))

        gateways.append(
            {
                "entity_id": gw_entry.entity_id,
                "name": name,
                "state": state,
                "model": model,
                "firmware": firmware,
                "serial": serial,
                "sensors": sensors,
                "channels": channels,
            }
        )

    # Fallback: if no gateway entities found, look for meshtastic config entries
    if not gateways:
        for config_entry in hass.config_entries.async_entries("meshtastic"):
            gateways.append(
                {
                    "entity_id": None,
                    "name": config_entry.title or "Meshtastic Gateway",
                    "state": "unknown",
                    "model": None,
                    "firmware": None,
                    "serial": None,
                    "sensors": {},
                    "channels": [],
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
        vol.Optional("channel"): str,
        vol.Optional("to"): str,
    }
)
@async_response
async def ws_send_message(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send a message via meshtastic services."""
    text = msg["text"]
    channel = msg.get("channel")
    to = msg.get("to")

    try:
        if to:
            # Direct message
            await hass.services.async_call(
                "meshtastic",
                "send_direct_message",
                {"text": text, "to": to},
                blocking=True,
            )
        else:
            # Channel broadcast
            service_data: dict[str, Any] = {"text": text}
            if channel:
                service_data["channel"] = channel
            await hass.services.async_call(
                "meshtastic",
                "broadcast_channel_message",
                service_data,
                blocking=True,
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
    """Proxy a meshtastic domain service call."""
    service = msg["service"]
    service_data = msg.get("service_data", {})

    if not hass.services.has_service("meshtastic", service):
        connection.send_error(msg["id"], "service_not_found", f"Service meshtastic.{service} not found")
        return

    try:
        await hass.services.async_call(
            "meshtastic",
            service,
            service_data,
            blocking=True,
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "call_failed", str(err))

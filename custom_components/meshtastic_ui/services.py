"""Home Assistant actions (services) for Meshtastic UI."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol

from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.service import async_register_admin_service

from .connection import ConnectionType
from .const import DOMAIN, MAX_TEXT_BYTES, SIGNAL_WAYPOINT_UPDATE
from .messaging import async_send_text_message, looks_like_link_down
from .store import normalize_node_id
from .telemetry import TELEMETRY_REQUEST_TYPES

_LOGGER = logging.getLogger(__name__)

ATTR_CONFIG_ENTRY_ID = "config_entry_id"
ATTR_MESSAGE = "message"
ATTR_CHANNEL = "channel"
ATTR_TO = "to"
ATTR_NODE = "node"
ATTR_TYPE = "type"

SERVICE_SEND_MESSAGE = "send_message"
SERVICE_SEND_WAYPOINT = "send_waypoint"
SERVICE_TRACE_ROUTE = "trace_route"
SERVICE_REQUEST_POSITION = "request_position"
SERVICE_REQUEST_TELEMETRY = "request_telemetry"
SERVICE_REQUEST_NODEINFO = "request_nodeinfo"

_RADIO_FIELD = {vol.Optional(ATTR_CONFIG_ENTRY_ID): cv.string}

SEND_MESSAGE_SCHEMA = vol.Schema(
    {
        **_RADIO_FIELD,
        vol.Required(ATTR_MESSAGE): vol.All(cv.string, vol.Length(min=1)),
        vol.Optional(ATTR_CHANNEL, default=0): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=7)
        ),
        vol.Optional(ATTR_TO): cv.string,
    }
)

SEND_WAYPOINT_SCHEMA = vol.Schema(
    {
        **_RADIO_FIELD,
        vol.Required("latitude"): cv.latitude,
        vol.Required("longitude"): cv.longitude,
        vol.Optional("name", default=""): vol.All(cv.string, vol.Length(max=30)),
        vol.Optional("description", default=""): vol.All(cv.string, vol.Length(max=100)),
        vol.Optional("expire_hours", default=0): vol.All(
            vol.Coerce(float), vol.Range(min=0)
        ),
    }
)

NODE_SCHEMA = vol.Schema({**_RADIO_FIELD, vol.Required(ATTR_NODE): cv.string})

REQUEST_TELEMETRY_SCHEMA = NODE_SCHEMA.extend(
    {vol.Optional(ATTR_TYPE, default="device"): vol.In(list(TELEMETRY_REQUEST_TYPES))}
)


def _resolve_entry(hass: HomeAssistant, call: ServiceCall) -> dict[str, Any]:
    """Return the entry data for the radio the call targets."""
    entries: dict[str, dict[str, Any]] = hass.data.get(DOMAIN, {}).get("entries", {})
    entry_id = call.data.get(ATTR_CONFIG_ENTRY_ID)
    if entry_id:
        entry_data = entries.get(entry_id)
        if entry_data is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="radio_not_found",
                translation_placeholders={"config_entry_id": entry_id},
            )
        return entry_data
    if not entries:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="no_radio"
        )
    if len(entries) > 1:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="radio_required"
        )
    return next(iter(entries.values()))


def resolve_node(entry_data: dict[str, Any], node: str) -> str:
    """Turn a node ID, number, or exact long/short name into a !hex node ID."""
    node = node.strip()
    if node.startswith("!") or node.isdigit():
        return normalize_node_id(node)
    nodes = entry_data["store"].get_nodes()
    if len(node) == 8 and all(char in "0123456789abcdefABCDEF" for char in node):
        candidate = f"!{node.lower()}"
        if candidate in nodes:
            return candidate
    lowered = node.casefold()
    matches = [
        node_id
        for node_id, data in nodes.items()
        if lowered in (
            str(data.get("name", "")).casefold(),
            str(data.get("short_name", "")).casefold(),
        )
    ]
    if len(matches) == 1:
        return matches[0]
    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="node_ambiguous" if matches else "node_not_found",
        translation_placeholders={"node": node},
    )


async def _run_radio_call(
    hass: HomeAssistant,
    entry_data: dict[str, Any],
    action: str,
    radio_call: Callable[[], Awaitable[Any]],
) -> Any:
    """Await a radio call, turning failures into Home Assistant errors."""
    try:
        return await radio_call()
    except HomeAssistantError:
        raise
    except Exception as err:
        if looks_like_link_down(err):
            # Same recovery as the panel: a fresh interface for the next try.
            # BLE drops are handled by the BlueZ disconnect callback instead.
            conn = entry_data["connection"]
            if getattr(conn, "_connection_type", None) != ConnectionType.BLE:
                hass.async_create_task(conn.async_force_reconnect())
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="radio_disconnected",
            ) from err
        _LOGGER.exception("Meshtastic UI action %s failed", action)
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="action_failed",
            translation_placeholders={"action": action, "error": str(err)},
        ) from err


def async_setup_services(hass: HomeAssistant) -> None:
    """Register the integration's actions (once, for all radios)."""

    async def _send_message(call: ServiceCall) -> ServiceResponse:
        entry_data = _resolve_entry(hass, call)
        text: str = call.data[ATTR_MESSAGE]
        if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="message_too_long",
                translation_placeholders={"max": str(MAX_TEXT_BYTES)},
            )
        to = call.data.get(ATTR_TO)
        destination = resolve_node(entry_data, to) if to else None
        packet_id = await _run_radio_call(
            hass,
            entry_data,
            SERVICE_SEND_MESSAGE,
            lambda: async_send_text_message(
                hass,
                entry_data,
                text,
                channel=call.data[ATTR_CHANNEL],
                to=destination,
            ),
        )
        return {"packet_id": packet_id, "to": destination, "channel": call.data[ATTR_CHANNEL]}

    async def _send_waypoint(call: ServiceCall) -> ServiceResponse:
        entry_data = _resolve_entry(hass, call)
        conn = entry_data["connection"]
        expire = 0
        if call.data["expire_hours"]:
            expire = int(time.time() + call.data["expire_hours"] * 3600)
        waypoint_id = await _run_radio_call(
            hass,
            entry_data,
            SERVICE_SEND_WAYPOINT,
            lambda: conn.async_send_waypoint(
                latitude=call.data["latitude"],
                longitude=call.data["longitude"],
                name=call.data["name"],
                description=call.data["description"],
                expire=expire,
            ),
        )
        if waypoint_id is not None:
            # Show it on the panel map like a waypoint dropped there.
            waypoint = {
                "latitude": call.data["latitude"],
                "longitude": call.data["longitude"],
                "name": call.data["name"],
                "description": call.data["description"],
                "expire": expire,
            }
            entry_data["store"].add_waypoint(waypoint_id, waypoint)
            async_dispatcher_send(
                hass,
                SIGNAL_WAYPOINT_UPDATE,
                {
                    "entry_id": entry_data.get("entry_id"),
                    "action": "add",
                    "waypoint_id": waypoint_id,
                    **waypoint,
                },
            )
        return {"waypoint_id": waypoint_id}

    def _node_action(
        service: str, method: str
    ) -> Callable[[ServiceCall], Awaitable[None]]:
        async def _handler(call: ServiceCall) -> None:
            entry_data = _resolve_entry(hass, call)
            node_id = resolve_node(entry_data, call.data[ATTR_NODE])
            radio_call = getattr(entry_data["connection"], method)
            args = [node_id]
            if service == SERVICE_REQUEST_TELEMETRY:
                args.append(TELEMETRY_REQUEST_TYPES[call.data[ATTR_TYPE]])
            await _run_radio_call(hass, entry_data, service, lambda: radio_call(*args))

        return _handler

    # Admin-only: a non-admin dashboard user can't transmit on the mesh.
    # Automations and scripts run without a user and are unaffected.
    async_register_admin_service(
        hass, DOMAIN, SERVICE_SEND_MESSAGE, _send_message,
        schema=SEND_MESSAGE_SCHEMA, supports_response=SupportsResponse.OPTIONAL,
    )
    async_register_admin_service(
        hass, DOMAIN, SERVICE_SEND_WAYPOINT, _send_waypoint,
        schema=SEND_WAYPOINT_SCHEMA, supports_response=SupportsResponse.OPTIONAL,
    )
    for service, method, schema in (
        (SERVICE_TRACE_ROUTE, "async_send_traceroute", NODE_SCHEMA),
        (SERVICE_REQUEST_POSITION, "async_request_position", NODE_SCHEMA),
        (SERVICE_REQUEST_NODEINFO, "async_request_nodeinfo", NODE_SCHEMA),
        (SERVICE_REQUEST_TELEMETRY, "async_request_telemetry", REQUEST_TELEMETRY_SCHEMA),
    ):
        async_register_admin_service(
            hass, DOMAIN, service, _node_action(service, method), schema=schema
        )

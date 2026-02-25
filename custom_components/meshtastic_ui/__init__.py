"""Meshtastic UI — companion dashboard integration."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    DOMAIN,
    EVENT_MESHTASTIC_EVENT,
    EVENT_MESHTASTIC_MESSAGE_LOG,
    SIGNAL_NEW_MESSAGE,
)
from .frontend import async_register_panel, async_unregister_panel
from .store import MeshtasticUiStore
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Meshtastic UI component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Meshtastic UI from a config entry."""
    store = MeshtasticUiStore(hass)
    await store.async_load()

    hass.data[DOMAIN] = {
        "store": store,
        "unsub_listeners": [],
    }

    # Register WebSocket API
    async_register_websocket_api(hass)

    # Register frontend panel
    await async_register_panel(hass)

    # Set up event listeners
    _setup_event_listeners(hass, store)

    # Initial node scan from device registry
    await _async_scan_nodes(hass, store)

    # Set up sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        data = hass.data.pop(DOMAIN, {})
        for unsub in data.get("unsub_listeners", []):
            unsub()
        async_unregister_panel(hass)

    return unload_ok


@callback
def _setup_event_listeners(hass: HomeAssistant, store: MeshtasticUiStore) -> None:
    """Subscribe to meshtastic events."""
    unsub_listeners = hass.data[DOMAIN]["unsub_listeners"]
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)

    @callback
    def _handle_message_log(event: Event) -> None:
        """Handle meshtastic_message_log events."""
        data = event.data
        timestamp = datetime.now(timezone.utc).isoformat()

        message: dict[str, Any] = {
            "text": data.get("text", ""),
            "from": data.get("from", ""),
            "to": data.get("to", ""),
            "timestamp": timestamp,
            "channel": data.get("channel"),
            "gateway": data.get("gateway"),
        }

        # Track the sender as a node
        sender = data.get("from")
        if sender:
            node_update: dict[str, Any] = {
                "_last_seen": timestamp,
            }
            if data.get("snr") is not None:
                node_update["snr"] = data["snr"]
            if data.get("hops") is not None:
                node_update["hops"] = data["hops"]
            if data.get("rssi") is not None:
                node_update["rssi"] = data["rssi"]
            store.update_node(str(sender), node_update)

        pki = data.get("pki", False)
        if pki:
            # DM — key by partner entity_id or node id
            partner = data.get("from", "unknown")
            store.add_dm_message(partner, message)
            async_dispatcher_send(
                hass, SIGNAL_NEW_MESSAGE, {"type": "dm", "partner": partner, **message}
            )
        else:
            # Channel message — key by channel entity_id or channel name
            channel_id = data.get("channel", "default")
            store.add_channel_message(channel_id, message)
            async_dispatcher_send(
                hass,
                SIGNAL_NEW_MESSAGE,
                {"type": "channel", "channel": channel_id, **message},
            )

    @callback
    def _handle_meshtastic_event(event: Event) -> None:
        """Handle meshtastic_event for node activity tracking."""
        data = event.data
        node_id = data.get("node_id") or data.get("from")
        if not node_id:
            return

        update: dict[str, Any] = {"_last_seen": datetime.now(timezone.utc).isoformat()}
        event_type = data.get("type", "")
        if event_type:
            update["last_event_type"] = event_type

        # Capture all available node fields from the event
        field_map = {
            "name": "name",
            "long_name": "name",
            "short_name": "short_name",
            "hardware": "hardware_model",
            "hardware_model": "hardware_model",
            "snr": "snr",
            "rssi": "rssi",
            "hops": "hops",
            "battery": "battery",
            "voltage": "voltage",
            "latitude": "latitude",
            "longitude": "longitude",
            "altitude": "altitude",
            "temperature": "temperature",
            "humidity": "humidity",
            "pressure": "pressure",
            "air_util_tx": "air_util_tx",
            "channel_utilization": "channel_utilization",
            "uptime": "uptime",
        }
        for event_key, store_key in field_map.items():
            if event_key in data and data[event_key] is not None:
                update[store_key] = data[event_key]

        store.update_node(str(node_id), update)

    @callback
    def _handle_state_changed(event: Event) -> None:
        """Capture telemetry updates from meshtastic sensors."""
        entity_id = event.data.get("entity_id", "")
        if not entity_id.startswith("sensor.meshtastic_"):
            return

        new_state = event.data.get("new_state")
        if new_state is None:
            return

        # Use entity/device registry to reliably find the node ID
        ent_entry = ent_reg.async_get(entity_id)
        if not ent_entry or not ent_entry.device_id:
            return
        device = dev_reg.async_get(ent_entry.device_id)
        if not device:
            return

        node_id = None
        for ident in device.identifiers:
            if ident[0] == "meshtastic":
                node_id = ident[1] if len(ident) > 1 else None
                break
        if not node_id:
            return

        sensor_type = _extract_sensor_type(entity_id)
        if sensor_type:
            store.update_node(node_id, {sensor_type: new_state.state})

    unsub_listeners.append(
        hass.bus.async_listen(EVENT_MESHTASTIC_MESSAGE_LOG, _handle_message_log)
    )
    unsub_listeners.append(
        hass.bus.async_listen(EVENT_MESHTASTIC_EVENT, _handle_meshtastic_event)
    )
    unsub_listeners.append(
        hass.bus.async_listen("state_changed", _handle_state_changed)
    )


async def _async_scan_nodes(hass: HomeAssistant, store: MeshtasticUiStore) -> None:
    """Scan device registry for meshtastic nodes and read their sensor states."""
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)

    scanned_ids: set[str] = set()

    for device in dev_reg.devices.values():
        node_id = None
        for ident in device.identifiers:
            if ident[0] == "meshtastic":
                node_id = ident[1] if len(ident) > 1 else None
                break

        if node_id is None:
            continue

        scanned_ids.add(node_id)

        node_data: dict[str, Any] = {
            "name": device.name or node_id,
            "model": device.model or "",
        }

        # Read current sensor states for this device
        entity_entries = er.async_entries_for_device(ent_reg, device.id)
        for entity_entry in entity_entries:
            if not entity_entry.entity_id.startswith("sensor."):
                continue
            state = hass.states.get(entity_entry.entity_id)
            if state is None or state.state in ("unknown", "unavailable"):
                continue
            sensor_type = _extract_sensor_type(entity_entry.entity_id)
            if sensor_type:
                node_data[sensor_type] = state.state

        store.update_node(node_id, node_data)

    # Remove stale nodes that were created by buggy entity name parsing
    # and don't correspond to any meshtastic device
    stale_ids = [nid for nid in store.get_nodes() if nid not in scanned_ids
                 and not nid.startswith("!")]
    for stale_id in stale_ids:
        store.remove_node(stale_id)

    _LOGGER.debug("Initial node scan found %d meshtastic devices", store.total_nodes)


def _extract_node_id_from_entity(entity_id: str) -> str | None:
    """Extract node ID from a meshtastic sensor entity_id.

    Entity IDs follow the pattern: sensor.meshtastic_{node_id}_{sensor_type}
    """
    prefix = "sensor.meshtastic_"
    if not entity_id.startswith(prefix):
        return None

    remainder = entity_id[len(prefix):]
    # Node ID is everything up to the last underscore-separated sensor type
    # Common sensor types: battery, snr, hops, voltage, air_util_tx, channel_util
    known_suffixes = [
        "battery",
        "snr",
        "hops",
        "voltage",
        "air_util_tx",
        "channel_utilization",
        "channel_util",
        "uptime",
        "temperature",
        "humidity",
        "pressure",
        "latitude",
        "longitude",
        "altitude",
        "rssi",
    ]
    for suffix in known_suffixes:
        if remainder.endswith(f"_{suffix}"):
            return remainder[: -(len(suffix) + 1)]

    return None


def _extract_sensor_type(entity_id: str) -> str | None:
    """Extract the sensor type suffix from a meshtastic sensor entity_id."""
    prefix = "sensor.meshtastic_"
    if not entity_id.startswith(prefix):
        return None

    remainder = entity_id[len(prefix):]
    known_suffixes = [
        "battery",
        "snr",
        "hops",
        "voltage",
        "air_util_tx",
        "channel_utilization",
        "channel_util",
        "uptime",
        "temperature",
        "humidity",
        "pressure",
        "latitude",
        "longitude",
        "altitude",
        "rssi",
    ]
    for suffix in known_suffixes:
        if remainder.endswith(f"_{suffix}"):
            return suffix

    return None

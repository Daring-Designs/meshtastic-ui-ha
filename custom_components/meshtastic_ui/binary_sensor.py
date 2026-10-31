"""Binary sensor platform for Meshtastic UI."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .connection import ConnectionState, MeshtasticConnection
from .const import DOMAIN, SIGNAL_CONNECTION_STATE
from .entity import gateway_device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Meshtastic UI binary sensors."""
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        return
    async_add_entities([MeshConnectedSensor(entry_data["connection"], entry.entry_id)])


class MeshConnectedSensor(BinarySensorEntity):
    """On while Home Assistant has a live link to the radio."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_translation_key = "connected"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, connection: MeshtasticConnection, entry_id: str) -> None:
        self._connection = connection
        self._entry_id = entry_id
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_connected"
        self._attr_device_info = gateway_device_info(entry_id)

    @property
    def is_on(self) -> bool:
        """Return whether the radio link is up."""
        return self._connection.state == ConnectionState.CONNECTED

    async def async_added_to_hass(self) -> None:
        """Follow connection state changes."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_CONNECTION_STATE, self._handle_state
            )
        )

    @callback
    def _handle_state(self, data: Any) -> None:
        if isinstance(data, dict) and data.get("entry_id") != self._entry_id:
            return
        self.async_write_ha_state()

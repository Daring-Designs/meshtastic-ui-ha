"""Switch platform for Meshtastic UI."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_NOTIFICATION_PREFS
from .store import MeshtasticUiStore


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Meshtastic UI switches."""
    domain_data = hass.data.get(DOMAIN, {})
    entries = domain_data.get("entries", {})
    entry_data = entries.get(entry.entry_id)
    # Backwards-compat for tests that still build the old singleton dict.
    if entry_data is None and "store" in domain_data:
        entry_data = domain_data
    if entry_data is None:
        return
    store: MeshtasticUiStore = entry_data["store"]
    async_add_entities([MeshNotificationsSwitch(store, entry.entry_id)])


class MeshNotificationsSwitch(SwitchEntity):
    """Switch to enable/disable push notifications for new messages.

    Exposes the same `enabled` flag the frontend's Settings panel already
    reads/writes via `get_notification_prefs`/`set_notification_prefs`, so it
    can be driven from HA automations without touching the panel UI.
    """

    _attr_has_entity_name = True
    _attr_name = "Notifications"
    _attr_icon = "mdi:bell"

    def __init__(self, store: MeshtasticUiStore, entry_id: str) -> None:
        self._store = store
        self._entry_id = entry_id
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_notifications_enabled"

    @property
    def is_on(self) -> bool:
        """Return whether notifications are currently enabled."""
        return bool(self._store.get_notification_prefs().get("enabled", False))

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Enable notifications."""
        self._store.set_notification_prefs({"enabled": True})
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Disable notifications."""
        self._store.set_notification_prefs({"enabled": False})
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        """Subscribe to prefs changes made elsewhere (e.g. the frontend panel)."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_NOTIFICATION_PREFS, self._handle_prefs_update
            )
        )

    @callback
    def _handle_prefs_update(self, data: Any) -> None:
        """Refresh state when prefs change for this entry's radio."""
        if isinstance(data, dict):
            event_entry_id = data.get("entry_id")
            if event_entry_id is not None and event_entry_id != self._entry_id:
                return
        self.async_write_ha_state()

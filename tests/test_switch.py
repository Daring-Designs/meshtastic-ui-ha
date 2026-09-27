"""Tests for Meshtastic UI switch entities."""

from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshtastic_ui.switch import MeshNotificationsSwitch
from custom_components.meshtastic_ui.store import MeshtasticUiStore


class TestMeshNotificationsSwitch:
    """Tests for the notifications switch."""

    def test_is_on_reflects_stored_prefs(self, store: MeshtasticUiStore):
        switch = MeshNotificationsSwitch(store, "test_entry")
        assert switch.is_on is False

        store.set_notification_prefs({"enabled": True})
        assert switch.is_on is True

    async def test_turn_on_sets_enabled(self, hass: HomeAssistant, store: MeshtasticUiStore):
        switch = MeshNotificationsSwitch(store, "test_entry")
        switch.hass = hass
        switch.entity_id = "switch.test_notifications"
        await switch.async_turn_on()
        assert store.get_notification_prefs()["enabled"] is True

    async def test_turn_off_sets_disabled(self, hass: HomeAssistant, store: MeshtasticUiStore):
        store.set_notification_prefs({"enabled": True})
        switch = MeshNotificationsSwitch(store, "test_entry")
        switch.hass = hass
        switch.entity_id = "switch.test_notifications"
        await switch.async_turn_off()
        assert store.get_notification_prefs()["enabled"] is False

    def test_attributes(self, store: MeshtasticUiStore):
        switch = MeshNotificationsSwitch(store, "test_entry")
        assert switch.name == "Notifications"
        assert switch.icon == "mdi:bell"
        assert switch.unique_id == "meshtastic_ui_test_entry_notifications_enabled"

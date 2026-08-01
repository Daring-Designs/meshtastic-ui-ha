"""Tests for Meshtastic UI sensor entities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshtastic_ui.sensor import (
    MeshActiveNodesSensor,
    MeshMessagesTodaySensor,
)
from custom_components.meshtastic_ui.store import MeshtasticUiStore


class TestMeshMessagesTodaySensor:
    """Tests for the messages today sensor."""

    def test_native_value(self, store: MeshtasticUiStore):
        sensor = MeshMessagesTodaySensor(store, "test_entry")
        assert sensor.native_value == 0

        store.add_channel_message("0", {"text": "hi"})
        assert sensor.native_value == 1

    def test_attributes(self, store: MeshtasticUiStore):
        sensor = MeshMessagesTodaySensor(store, "test_entry")
        assert sensor.name == "Messages Today"
        assert sensor.icon == "mdi:message-text"
        assert sensor.native_unit_of_measurement == "messages"


class TestMeshActiveNodesSensor:
    """Tests for the active nodes sensor."""

    def test_native_value(self, store: MeshtasticUiStore):
        sensor = MeshActiveNodesSensor(store, "test_entry")
        assert sensor.native_value == 0

        store.update_node("!aabbccdd", {"name": "Alice"})
        assert sensor.native_value == 1

    def test_excludes_old_nodes(self, store: MeshtasticUiStore):
        sensor = MeshActiveNodesSensor(store, "test_entry")
        old_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        store.update_node("!aabbccdd", {"name": "Old"})
        store._nodes["!aabbccdd"]["_last_seen"] = old_time
        assert sensor.native_value == 0

    def test_attributes(self, store: MeshtasticUiStore):
        sensor = MeshActiveNodesSensor(store, "test_entry")
        assert sensor.name == "Active Nodes"
        assert sensor.icon == "mdi:access-point-network"
        assert sensor.native_unit_of_measurement == "nodes"

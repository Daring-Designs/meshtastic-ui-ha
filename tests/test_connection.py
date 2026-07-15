"""Tests for connection.py config read/write, focused on fixed-position handling."""
from unittest.mock import MagicMock

import pytest

from custom_components.meshtastic_ui import connection as connection_mod
from custom_components.meshtastic_ui.connection import (
    ConnectionType,
    MeshtasticConnection,
)


@pytest.fixture
def conn():
    """A connection with a mocked hass executor and radio interface."""
    hass = MagicMock()

    async def _run_in_executor(func, *args):
        return func(*args)

    hass.async_add_executor_job = _run_in_executor

    conn = MeshtasticConnection(hass, ConnectionType.TCP, hostname="test-host")
    conn._interface = MagicMock()
    return conn


class TestGetConfigFixedPosition:
    """async_get_config must merge the node's coordinates into the position section."""

    def _prepare(self, conn, monkeypatch, node_position):
        iface = conn._interface
        iface.localNode.channels = []
        iface.metadata = {}
        iface.getMyNodeInfo.return_value = {
            "user": {"longName": "Test Node"},
            "position": node_position,
        }
        monkeypatch.setattr(
            connection_mod,
            "_message_to_dict",
            lambda proto, **kwargs: {"position": {"fixed_position": True}},
        )
        monkeypatch.setattr(
            connection_mod, "_fill_enum_defaults", lambda proto, d: None
        )

    async def test_merges_coordinates_from_node_position(self, conn, monkeypatch):
        self._prepare(
            conn,
            monkeypatch,
            {"latitude": 40.123456, "longitude": -86.654321, "altitude": 250},
        )

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == 40.123456
        assert position["fixed_lng"] == -86.654321
        assert position["fixed_altitude"] == 250

    async def test_falls_back_to_integer_coordinates(self, conn, monkeypatch):
        self._prepare(
            conn,
            monkeypatch,
            {"latitudeI": 401234560, "longitudeI": -866543210},
        )

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == pytest.approx(40.123456)
        assert position["fixed_lng"] == pytest.approx(-86.654321)
        assert position["fixed_altitude"] == 0

    async def test_handles_missing_node_position(self, conn, monkeypatch):
        self._prepare(conn, monkeypatch, {})

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == 0
        assert position["fixed_lng"] == 0
        assert position["fixed_altitude"] == 0


class TestSetConfigFixedPosition:
    """async_set_config must never overwrite the radio's position with zeros."""

    async def test_skips_set_fixed_position_without_coordinates(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {"fixed_position": True, "fixed_lat": 0, "fixed_lng": 0, "fixed_altitude": 0},
        )

        node.setFixedPosition.assert_not_called()
        node.removeFixedPosition.assert_not_called()

    async def test_pushes_fixed_position_with_coordinates(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {
                "fixed_position": True,
                "fixed_lat": 40.123456,
                "fixed_lng": -86.654321,
                "fixed_altitude": 250,
            },
        )

        node.setFixedPosition.assert_called_once_with(40.123456, -86.654321, 250)

    async def test_removes_fixed_position_when_disabled(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {"fixed_position": False, "fixed_lat": 0, "fixed_lng": 0, "fixed_altitude": 0},
        )

        node.removeFixedPosition.assert_called_once()
        node.setFixedPosition.assert_not_called()

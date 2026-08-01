"""Tests for Meshtastic UI WebSocket API commands."""

from __future__ import annotations

from collections import deque
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshtastic_ui.const import DOMAIN, TS_MAX_POINTS
from custom_components.meshtastic_ui.store import MeshtasticUiStore
from custom_components.meshtastic_ui.websocket_api import (
    _downsample,
    ws_messages,
    ws_node_admin,
    ws_nodes,
    ws_send_message,
    ws_stats,
)

# Unwrap @async_response / @websocket_command to get the original async funcs
_ws_messages = ws_messages.__wrapped__
_ws_nodes = ws_nodes.__wrapped__
_ws_stats = ws_stats.__wrapped__
_ws_send_message = ws_send_message.__wrapped__
_ws_node_admin = ws_node_admin.__wrapped__


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ws_connection(*, is_admin: bool = True) -> MagicMock:
    """Create a mock ActiveConnection."""
    conn = MagicMock()
    conn.send_result = MagicMock()
    conn.send_error = MagicMock()
    conn.send_event = MagicMock()
    conn.subscriptions = {}
    conn.user = MagicMock()
    conn.user.is_admin = is_admin
    return conn


# ---------------------------------------------------------------------------
# _downsample
# ---------------------------------------------------------------------------

class TestDownsample:
    """Tests for the _downsample utility."""

    def test_no_downsample(self):
        values = [1.0, 2.0, 3.0]
        assert _downsample(values, 1, False) == [1.0, 2.0, 3.0]

    def test_counter_summing(self):
        values = [1.0, 2.0, 3.0, 4.0]
        result = _downsample(values, 2, True)
        assert result == [3.0, 7.0]

    def test_snapshot_averaging(self):
        values = [2.0, 4.0, 6.0, 8.0]
        result = _downsample(values, 2, False)
        assert result == [3.0, 7.0]

    def test_partial_last_bucket_counter(self):
        values = [1.0, 2.0, 3.0]
        result = _downsample(values, 2, True)
        assert result == [3.0, 3.0]

    def test_partial_last_bucket_snapshot(self):
        values = [2.0, 4.0, 6.0]
        result = _downsample(values, 2, False)
        assert result == [3.0, 6.0]

    def test_empty(self):
        assert _downsample([], 2, True) == []


# ---------------------------------------------------------------------------
# ws_messages
# ---------------------------------------------------------------------------

class TestWsMessages:
    """Tests for ws_messages command."""

    async def test_returns_all_messages(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "ch0"})
        store.add_dm_message("!aa", {"text": "dm1"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/messages"}
        await _ws_messages(hass, conn, msg)

        conn.send_result.assert_called_once()
        result = conn.send_result.call_args[0][1]
        assert "0" in result["messages"]
        assert "!aa" in result["messages"]
        assert "0" in result["channels"]
        assert "!aa" in result["dms"]

    async def test_filter_by_entity_id(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "ch0"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/messages", "entity_id": "0"}
        await _ws_messages(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert len(result["messages"]) == 1
        assert result["messages"][0]["text"] == "ch0"


# ---------------------------------------------------------------------------
# ws_nodes
# ---------------------------------------------------------------------------

class TestWsNodes:
    """Tests for ws_nodes command."""

    async def test_returns_nodes_with_favorites(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.set_favorite("!aabbccdd", True)
        store.set_ignored("!eeff0011", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/nodes"}
        await _ws_nodes(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert "!aabbccdd" in result["nodes"]
        assert "!aabbccdd" in result["favorite_nodes"]
        assert "!eeff0011" in result["ignored_nodes"]


# ---------------------------------------------------------------------------
# ws_stats
# ---------------------------------------------------------------------------

class TestWsStats:
    """Tests for ws_stats command."""

    async def test_returns_summary(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "hi"})
        store.update_node("!aa", {"name": "A"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/stats"}
        await _ws_stats(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert result["messages_today"] == 1
        assert result["total_nodes"] == 1
        assert result["channel_count"] == 1


# ---------------------------------------------------------------------------
# ws_send_message
# ---------------------------------------------------------------------------

class TestWsSendMessage:
    """Tests for ws_send_message command."""

    async def test_channel_broadcast(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/send_message", "text": "hello", "channel": 0}
        await _ws_send_message(hass, conn, msg)

        mock_connection.async_send_text.assert_called_once_with(
            "hello", destination_id=None, channel_index=0, reply_id=None
        )
        conn.send_result.assert_called_once()
        result = conn.send_result.call_args[0][1]
        assert result["success"] is True

        # Should store the outgoing message
        msgs = store.get_channel_messages("0")
        assert len(msgs) == 1
        assert msgs[0]["_outgoing"] is True

    async def test_dm_message(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/send_message", "text": "hey", "to": "!aabbccdd"}
        await _ws_send_message(hass, conn, msg)

        mock_connection.async_send_text.assert_called_once_with(
            "hey", destination_id="!aabbccdd", channel_index=0, reply_id=None
        )
        msgs = store.get_dm_messages("!aabbccdd")
        assert len(msgs) == 1


# ---------------------------------------------------------------------------
# ws_node_admin
# ---------------------------------------------------------------------------

class TestWsNodeAdmin:
    """Tests for ws_node_admin command."""

    async def test_favorite(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "favorite"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" in store.favorite_nodes
        conn.send_result.assert_called_once()

    async def test_unfavorite(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.set_favorite("!aabbccdd", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "unfavorite"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" not in store.favorite_nodes

    async def test_ignore(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "ignore"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" in store.ignored_nodes

    async def test_remove(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.set_favorite("!aabbccdd", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "remove"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" not in store.get_nodes()
        assert "!aabbccdd" not in store.favorite_nodes

    async def test_remove_requires_admin(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection(is_admin=False)
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "remove"}
        await _ws_node_admin(hass, conn, msg)

        conn.send_error.assert_called_once()
        assert "unauthorized" in conn.send_error.call_args[0][1]

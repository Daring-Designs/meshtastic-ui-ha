"""Tests for MeshtasticUiStore and helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from custom_components.meshtastic_ui.const import MAX_CHANNEL_MESSAGES, MAX_DM_MESSAGES
from custom_components.meshtastic_ui.store import MeshtasticUiStore, normalize_node_id


# ---------------------------------------------------------------------------
# normalize_node_id
# ---------------------------------------------------------------------------

class TestNormalizeNodeId:
    """Tests for normalize_node_id."""

    def test_decimal_to_hex(self):
        assert normalize_node_id("1771758172") == "!699ae25c"

    def test_already_hex_passthrough(self):
        assert normalize_node_id("!699ae25c") == "!699ae25c"

    def test_invalid_input_passthrough(self):
        assert normalize_node_id("not_a_number") == "not_a_number"

    def test_zero(self):
        assert normalize_node_id("0") == "!00000000"


# ---------------------------------------------------------------------------
# Channel messages
# ---------------------------------------------------------------------------

class TestChannelMessages:
    """Tests for channel message storage."""

    def test_add_and_retrieve(self, store: MeshtasticUiStore):
        msg = {"text": "hello", "from": "!aabbccdd", "timestamp": "2025-01-01T00:00:00"}
        store.add_channel_message("0", msg)
        messages = store.get_channel_messages("0")
        assert len(messages) == 1
        assert messages[0]["text"] == "hello"

    def test_empty_channel_returns_empty_list(self, store: MeshtasticUiStore):
        assert store.get_channel_messages("nonexistent") == []

    def test_maxlen_enforcement(self, store: MeshtasticUiStore):
        for i in range(MAX_CHANNEL_MESSAGES + 10):
            store.add_channel_message("0", {"text": f"msg{i}", "from": "!aabb", "timestamp": ""})
        messages = store.get_channel_messages("0")
        assert len(messages) == MAX_CHANNEL_MESSAGES
        # Oldest messages should be dropped
        assert messages[0]["text"] == "msg10"

    def test_messages_today_increments(self, store: MeshtasticUiStore):
        assert store.messages_today == 0
        store.add_channel_message("0", {"text": "hi"})
        assert store.messages_today == 1

    def test_get_all_channel_ids(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "a"})
        store.add_channel_message("1", {"text": "b"})
        assert set(store.get_all_channel_ids()) == {"0", "1"}


# ---------------------------------------------------------------------------
# DM messages
# ---------------------------------------------------------------------------

class TestDmMessages:
    """Tests for DM message storage."""

    def test_add_and_retrieve(self, store: MeshtasticUiStore):
        msg = {"text": "hey", "from": "!aabbccdd", "timestamp": "2025-01-01T00:00:00"}
        store.add_dm_message("!aabbccdd", msg)
        messages = store.get_dm_messages("!aabbccdd")
        assert len(messages) == 1
        assert messages[0]["text"] == "hey"

    def test_maxlen_enforcement(self, store: MeshtasticUiStore):
        for i in range(MAX_DM_MESSAGES + 10):
            store.add_dm_message("!aabb", {"text": f"dm{i}"})
        messages = store.get_dm_messages("!aabb")
        assert len(messages) == MAX_DM_MESSAGES

    def test_messages_today_increments(self, store: MeshtasticUiStore):
        store.add_dm_message("!aabb", {"text": "dm"})
        assert store.messages_today == 1

    def test_get_all_dm_ids(self, store: MeshtasticUiStore):
        store.add_dm_message("!aa", {"text": "a"})
        store.add_dm_message("!bb", {"text": "b"})
        assert set(store.get_all_dm_ids()) == {"!aa", "!bb"}


# ---------------------------------------------------------------------------
# Node CRUD
# ---------------------------------------------------------------------------

class TestNodeCrud:
    """Tests for node create, update, remove, bulk."""

    def test_update_node_creates_new(self, store: MeshtasticUiStore):
        store.update_node("!aabbccdd", {"name": "Alice"})
        nodes = store.get_nodes()
        assert "!aabbccdd" in nodes
        assert nodes["!aabbccdd"]["name"] == "Alice"
        assert "_last_seen" in nodes["!aabbccdd"]

    def test_update_node_merges(self, store: MeshtasticUiStore):
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.update_node("!aabbccdd", {"battery": 95})
        nodes = store.get_nodes()
        assert nodes["!aabbccdd"]["name"] == "Alice"
        assert nodes["!aabbccdd"]["battery"] == 95

    def test_update_node_normalizes_id(self, store: MeshtasticUiStore):
        store.update_node("2864434397", {"name": "Bob"})
        nodes = store.get_nodes()
        assert "!aabbccdd" in nodes

    def test_remove_node(self, store: MeshtasticUiStore):
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.remove_node("!aabbccdd")
        assert "!aabbccdd" not in store.get_nodes()

    def test_remove_nonexistent_no_error(self, store: MeshtasticUiStore):
        store.remove_node("!00000000")  # Should not raise

    def test_bulk_update_nodes(self, store: MeshtasticUiStore):
        updates = {
            "!aabbccdd": {"name": "Alice"},
            "1234": {"name": "Bob"},
        }
        store.bulk_update_nodes(updates)
        nodes = store.get_nodes()
        assert "!aabbccdd" in nodes
        assert "!000004d2" in nodes  # 1234 in hex

    def test_total_nodes(self, store: MeshtasticUiStore):
        store.update_node("!aa", {"name": "A"})
        store.update_node("!bb", {"name": "B"})
        assert store.total_nodes == 2

    def test_active_nodes_count(self, store: MeshtasticUiStore):
        store.update_node("!aa", {"name": "A"})  # Sets _last_seen to now
        assert store.active_nodes_count == 1

    def test_active_nodes_excludes_old(self, store: MeshtasticUiStore):
        old_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        store.update_node("!aa", {"name": "Old"})
        store._nodes["!aa"]["_last_seen"] = old_time
        assert store.active_nodes_count == 0


# ---------------------------------------------------------------------------
# Favorites / ignored
# ---------------------------------------------------------------------------

class TestFavoritesIgnored:
    """Tests for favorite and ignored node lists."""

    def test_set_favorite_on(self, store: MeshtasticUiStore):
        store.set_favorite("!aabbccdd", True)
        assert "!aabbccdd" in store.favorite_nodes

    def test_set_favorite_off(self, store: MeshtasticUiStore):
        store.set_favorite("!aabbccdd", True)
        store.set_favorite("!aabbccdd", False)
        assert "!aabbccdd" not in store.favorite_nodes

    def test_set_ignored_on(self, store: MeshtasticUiStore):
        store.set_ignored("!aabbccdd", True)
        assert "!aabbccdd" in store.ignored_nodes

    def test_set_ignored_off(self, store: MeshtasticUiStore):
        store.set_ignored("!aabbccdd", True)
        store.set_ignored("!aabbccdd", False)
        assert "!aabbccdd" not in store.ignored_nodes

    def test_normalizes_ids(self, store: MeshtasticUiStore):
        store.set_favorite("2864434397", True)
        assert "!aabbccdd" in store.favorite_nodes


# ---------------------------------------------------------------------------
# Waypoints
# ---------------------------------------------------------------------------

class TestWaypoints:
    """Tests for waypoint storage."""

    def test_add_and_get(self, store: MeshtasticUiStore):
        store.add_waypoint(1, {"name": "WP1", "latitude": 1.0, "longitude": 2.0, "expire": 0})
        wps = store.get_waypoints()
        assert 1 in wps
        assert wps[1]["name"] == "WP1"

    def test_remove(self, store: MeshtasticUiStore):
        store.add_waypoint(1, {"name": "WP1", "expire": 0})
        store.remove_waypoint(1)
        assert 1 not in store.get_waypoints()

    def test_expired_pruned_on_get(self, store: MeshtasticUiStore):
        past_ts = int(datetime.now(timezone.utc).timestamp()) - 100
        store.add_waypoint(1, {"name": "Old", "expire": past_ts})
        store.add_waypoint(2, {"name": "Current", "expire": 0})
        wps = store.get_waypoints()
        assert 1 not in wps
        assert 2 in wps


# ---------------------------------------------------------------------------
# Traceroutes
# ---------------------------------------------------------------------------

class TestTraceroutes:
    """Tests for traceroute storage."""

    def test_set_and_get(self, store: MeshtasticUiStore):
        data = {"from": "!aa", "to": "!bb", "route": []}
        store.set_traceroute("!aa", data)
        result = store.get_traceroute("!aa")
        assert result is not None
        assert result["from"] == "!aa"
        assert "_timestamp" in result

    def test_get_nonexistent_returns_none(self, store: MeshtasticUiStore):
        assert store.get_traceroute("!00") is None

    def test_normalizes_id(self, store: MeshtasticUiStore):
        store.set_traceroute("2864434397", {"from": "!aabbccdd", "route": []})
        assert store.get_traceroute("!aabbccdd") is not None

    def test_get_all_traceroutes(self, store: MeshtasticUiStore):
        store.set_traceroute("!aa", {"route": []})
        store.set_traceroute("!bb", {"route": []})
        all_tr = store.get_all_traceroutes()
        assert len(all_tr) == 2


# ---------------------------------------------------------------------------
# Notification prefs
# ---------------------------------------------------------------------------

class TestNotificationPrefs:
    """Tests for notification preference storage."""

    def test_defaults(self, store: MeshtasticUiStore):
        prefs = store.get_notification_prefs()
        assert prefs["enabled"] is False
        assert prefs["service"] == "persistent_notification.create"
        assert prefs["filter"] == "all"

    def test_set_prefs(self, store: MeshtasticUiStore):
        store.set_notification_prefs({"enabled": True, "filter": "dm"})
        prefs = store.get_notification_prefs()
        assert prefs["enabled"] is True
        assert prefs["filter"] == "dm"
        assert prefs["service"] == "persistent_notification.create"  # unchanged


# ---------------------------------------------------------------------------
# Date rollover
# ---------------------------------------------------------------------------

class TestDateRollover:
    """Tests for daily counter reset."""

    def test_counter_resets_on_new_day(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "hi"})
        assert store.messages_today == 1

        # Simulate date change
        store._counter_date = "1999-01-01"
        assert store.messages_today == 0


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

class TestSerialization:
    """Tests for _data_to_save round-trip."""

    def test_round_trip(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "ch"})
        store.add_dm_message("!aa", {"text": "dm"})
        store.update_node("!bb", {"name": "B"})
        store.set_favorite("!bb", True)
        store.set_ignored("!cc", True)
        store.add_waypoint(10, {"name": "WP", "expire": 0})
        store.set_traceroute("!dd", {"route": ["!ee"]})
        store.set_notification_prefs({"enabled": True})

        data = store._data_to_save()
        assert "ch" in [m["text"] for m in data["channel_messages"]["0"]]
        assert "dm" in [m["text"] for m in data["dm_messages"]["!aa"]]
        assert "!bb" in data["nodes"]
        assert "!bb" in data["favorite_nodes"]
        assert "!cc" in data["ignored_nodes"]
        assert "10" in data["waypoints"]
        assert "!dd" in data["traceroutes"]
        assert data["notification_prefs"]["enabled"] is True


# ---------------------------------------------------------------------------
# Storage clearing (#37)
# ---------------------------------------------------------------------------

class TestStorageClearing:
    """Tests for the bulk-clear methods used by Settings -> Storage."""

    def test_clear_messages_specific_conversation(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "a"})
        store.add_channel_message("0", {"text": "b"})
        store.add_dm_message("!aa", {"text": "x"})

        removed = store.clear_messages("0")
        assert removed == 2
        assert store.get_channel_messages("0") == []
        # DM untouched.
        assert len(store.get_dm_messages("!aa")) == 1

    def test_clear_messages_specific_dm(self, store: MeshtasticUiStore):
        store.add_dm_message("!aa", {"text": "x"})
        store.add_channel_message("0", {"text": "y"})

        removed = store.clear_messages("!aa")
        assert removed == 1
        assert store.get_dm_messages("!aa") == []
        assert len(store.get_channel_messages("0")) == 1

    def test_clear_messages_all(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "a"})
        store.add_channel_message("1", {"text": "b"})
        store.add_dm_message("!aa", {"text": "x"})

        removed = store.clear_messages(None)
        assert removed == 3
        assert store.get_all_channel_ids() == []
        assert store.get_all_dm_ids() == []

    def test_clear_messages_unknown_conversation(self, store: MeshtasticUiStore):
        assert store.clear_messages("does-not-exist") == 0

    def test_clear_nodes_clears_traceroutes_too(self, store: MeshtasticUiStore):
        store.update_node("!aa", {"name": "A"})
        store.update_node("!bb", {"name": "B"})
        store.set_traceroute("!aa", {"route": []})

        removed = store.clear_nodes()
        assert removed == 3  # 2 nodes + 1 traceroute
        assert store.get_nodes() == {}
        assert store.get_all_traceroutes() == {}

    def test_clear_all_wipes_everything_except_prefs(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "a"})
        store.add_dm_message("!aa", {"text": "b"})
        store.update_node("!bb", {"name": "B"})
        store.set_favorite("!bb", True)
        store.set_ignored("!cc", True)
        store.add_waypoint(10, {"name": "WP"})
        store.set_traceroute("!dd", {"route": []})
        store.set_notification_prefs({"enabled": True})

        counts = store.clear_all()

        assert counts["messages"] == 2
        assert counts["nodes"] == 1
        assert counts["traceroutes"] == 1
        assert counts["waypoints"] == 1
        assert counts["favorites"] == 1
        assert counts["ignored"] == 1

        assert store.get_all_channel_ids() == []
        assert store.get_all_dm_ids() == []
        assert store.get_nodes() == {}
        assert store.favorite_nodes == set()
        assert store.ignored_nodes == set()
        assert store.get_waypoints() == {}
        assert store.get_all_traceroutes() == {}
        assert store.messages_today == 0
        # Notification prefs preserved.
        assert store.get_notification_prefs()["enabled"] is True

    def test_stats_returns_current_counts(self, store: MeshtasticUiStore):
        store.add_channel_message("0", {"text": "a"})
        store.add_channel_message("0", {"text": "b"})
        store.add_dm_message("!aa", {"text": "c"})
        store.update_node("!bb", {"name": "B"})
        store.set_traceroute("!bb", {"route": []})
        store.add_waypoint(1, {"name": "WP"})
        store.set_favorite("!bb", True)
        store.set_ignored("!cc", True)

        s = store.stats()
        assert s["messages"] == 3
        assert s["conversations"] == 2
        assert s["nodes"] == 1
        assert s["traceroutes"] == 1
        assert s["waypoints"] == 1
        assert s["favorites"] == 1
        assert s["ignored"] == 1

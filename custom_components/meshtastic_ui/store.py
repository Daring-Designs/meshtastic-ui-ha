"""Persistent storage for Meshtastic UI."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    ACTIVE_NODE_WINDOW_SECONDS,
    MAX_CHANNEL_MESSAGES,
    MAX_DM_MESSAGES,
    NODE_RETENTION_DAYS,
    SAVE_DELAY,
    STORAGE_KEY,
    STORAGE_VERSION,
    TS_MAX_POINTS,
    TS_PERSIST_SECONDS,
    TS_STORAGE_KEY,
    TS_STORAGE_VERSION,
)


def normalize_node_id(node_id: str) -> str:
    """Normalize a node ID to the !hex format.

    Handles decimal strings (e.g. '1771758172') and returns '!699ae25c'.
    IDs already in !hex format are returned as-is.
    """
    if node_id.startswith("!"):
        return node_id
    try:
        num = int(node_id)
        return f"!{num:08x}"
    except (ValueError, OverflowError):
        return node_id


class MeshtasticUiStore:
    """Persistent store for messages and node data."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str | None = None,
        migrate_legacy: bool = False,
    ) -> None:
        """Initialize the store.

        Each config entry gets its own storage file (`<key>.<entry_id>`)
        so multiple radios don't clobber each other. When `migrate_legacy`
        is True (set on the first entry to load), we'll fall back to the
        legacy global key on initial load and persist forward to the new
        per-entry key on the next save.
        """
        self._hass = hass
        self._entry_id = entry_id
        self._migrate_legacy = migrate_legacy
        key = f"{STORAGE_KEY}.{entry_id}" if entry_id else STORAGE_KEY
        self._store = Store(hass, STORAGE_VERSION, key)
        # Legacy fallback: read-only access for migration purposes.
        self._legacy_store: Store | None = (
            Store(hass, STORAGE_VERSION, STORAGE_KEY)
            if migrate_legacy and entry_id
            else None
        )
        self._channel_messages: dict[str, deque[dict[str, Any]]] = {}
        self._dm_messages: dict[str, deque[dict[str, Any]]] = {}
        self._nodes: dict[str, dict[str, Any]] = {}
        self._messages_today: int = 0
        self._counter_date: str = ""
        self._favorite_nodes: set[str] = set()
        self._ignored_nodes: set[str] = set()
        self._waypoints: dict[int, dict[str, Any]] = {}  # wp_id -> waypoint data
        self._traceroutes: dict[str, dict[str, Any]] = {}  # node_id -> last traceroute
        self._notification_prefs: dict[str, Any] = {
            "enabled": False,
            "service": "persistent_notification.create",
            "filter": "all",
        }

    async def async_load(self) -> None:
        """Load stored data from disk."""
        data = await self._store.async_load()
        # First-entry migration: if our per-entry file is empty but the
        # pre-multi-radio global file exists, claim that data for this entry
        # and schedule a save under the new key.
        if data is None and self._legacy_store is not None:
            data = await self._legacy_store.async_load()
            if data is not None:
                self._schedule_save()
        if data is None:
            return

        # Restore channel messages.
        for entity_id, messages in data.get("channel_messages", {}).items():
            self._channel_messages[entity_id] = deque(
                messages, maxlen=MAX_CHANNEL_MESSAGES
            )

        # Restore DM messages.
        for entity_id, messages in data.get("dm_messages", {}).items():
            self._dm_messages[entity_id] = deque(messages, maxlen=MAX_DM_MESSAGES)

        # Restore nodes, prune stale entries, normalize IDs to !hex.
        now = datetime.now(timezone.utc)
        for node_id, node_data in data.get("nodes", {}).items():
            last_seen = node_data.get("_last_seen")
            if last_seen:
                seen_dt = datetime.fromisoformat(last_seen)
                if (now - seen_dt).days > NODE_RETENTION_DAYS:
                    continue
            norm_id = normalize_node_id(node_id)
            if norm_id in self._nodes:
                # Merge: prefer the entry with more data.
                existing = self._nodes[norm_id]
                existing.update(
                    {k: v for k, v in node_data.items() if v is not None}
                )
            else:
                self._nodes[norm_id] = node_data

        # Restore daily counter.
        today = now.strftime("%Y-%m-%d")
        stored_date = data.get("counter_date", "")
        if stored_date == today:
            self._messages_today = data.get("messages_today", 0)
        else:
            self._messages_today = 0
        self._counter_date = today

        # Restore favorites and ignored (normalize IDs).
        self._favorite_nodes = {
            normalize_node_id(n) for n in data.get("favorite_nodes", [])
        }
        self._ignored_nodes = {
            normalize_node_id(n) for n in data.get("ignored_nodes", [])
        }

        # Restore waypoints, prune expired.
        now_ts = int(now.timestamp())
        for wp_id_str, wp_data in data.get("waypoints", {}).items():
            expire = wp_data.get("expire", 0)
            if expire > 0 and expire < now_ts:
                continue
            self._waypoints[int(wp_id_str)] = wp_data

        # Restore traceroutes.
        self._traceroutes = data.get("traceroutes", {})

        # Restore notification preferences.
        saved_prefs = data.get("notification_prefs")
        if saved_prefs:
            self._notification_prefs.update(saved_prefs)

    def _schedule_save(self) -> None:
        """Schedule a debounced save to disk."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    def _data_to_save(self) -> dict[str, Any]:
        """Serialize current state for storage."""
        return {
            "channel_messages": {
                eid: list(msgs) for eid, msgs in self._channel_messages.items()
            },
            "dm_messages": {
                eid: list(msgs) for eid, msgs in self._dm_messages.items()
            },
            "nodes": self._nodes,
            "messages_today": self._messages_today,
            "counter_date": self._counter_date,
            "favorite_nodes": list(self._favorite_nodes),
            "ignored_nodes": list(self._ignored_nodes),
            "waypoints": {str(k): v for k, v in self._waypoints.items()},
            "traceroutes": self._traceroutes,
            "notification_prefs": self._notification_prefs,
        }

    def add_channel_message(self, entity_id: str, message: dict[str, Any]) -> None:
        """Add a message to a channel."""
        self._check_date_rollover()
        if entity_id not in self._channel_messages:
            self._channel_messages[entity_id] = deque(maxlen=MAX_CHANNEL_MESSAGES)
        self._channel_messages[entity_id].append(message)
        self._messages_today += 1
        self._schedule_save()

    def add_dm_message(self, partner_id: str, message: dict[str, Any]) -> None:
        """Add a direct message."""
        self._check_date_rollover()
        if partner_id not in self._dm_messages:
            self._dm_messages[partner_id] = deque(maxlen=MAX_DM_MESSAGES)
        self._dm_messages[partner_id].append(message)
        self._messages_today += 1
        self._schedule_save()

    def update_message_status(
        self, packet_id: int, status: str, error: str | None = None
    ) -> bool:
        """Persist a delivery status onto the stored outgoing message.

        Searches recent messages first since acks arrive shortly after send.
        """
        for msgs in (*self._channel_messages.values(), *self._dm_messages.values()):
            for message in reversed(msgs):
                if message.get("packet_id") == packet_id:
                    message["status"] = status
                    if error and error != "NONE":
                        message["error"] = error
                    self._schedule_save()
                    return True
        return False

    def update_node(self, node_id: str, data: dict[str, Any]) -> None:
        """Update or create a node entry."""
        node_id = normalize_node_id(node_id)
        existing = self._nodes.get(node_id, {})
        existing.update(data)
        existing["_last_seen"] = datetime.now(timezone.utc).isoformat()
        self._nodes[node_id] = existing
        self._schedule_save()

    def bulk_update_nodes(self, updates: dict[str, dict[str, Any]]) -> None:
        """Bulk update or create multiple node entries efficiently."""
        for node_id, data in updates.items():
            node_id = normalize_node_id(node_id)
            existing = self._nodes.get(node_id, {})
            existing.update(data)
            if "_last_seen" not in existing:
                existing["_last_seen"] = datetime.now(timezone.utc).isoformat()
            self._nodes[node_id] = existing
        self._schedule_save()

    def remove_node(self, node_id: str) -> None:
        """Remove a node entry."""
        node_id = normalize_node_id(node_id)
        if node_id in self._nodes:
            del self._nodes[node_id]
            self._schedule_save()

    def clear_messages(self, conversation_id: str | None = None) -> int:
        """Clear stored messages.

        If conversation_id is None, all channel and DM history is wiped.
        Returns the number of messages removed.
        """
        removed = 0
        if conversation_id is None:
            for msgs in self._channel_messages.values():
                removed += len(msgs)
            for msgs in self._dm_messages.values():
                removed += len(msgs)
            self._channel_messages.clear()
            self._dm_messages.clear()
        else:
            if conversation_id in self._channel_messages:
                removed = len(self._channel_messages[conversation_id])
                del self._channel_messages[conversation_id]
            elif conversation_id in self._dm_messages:
                removed = len(self._dm_messages[conversation_id])
                del self._dm_messages[conversation_id]
        if removed:
            self._schedule_save()
        return removed

    def clear_nodes(self) -> int:
        """Clear all node history (nodes + traceroutes). Returns count removed."""
        removed = len(self._nodes) + len(self._traceroutes)
        self._nodes.clear()
        self._traceroutes.clear()
        if removed:
            self._schedule_save()
        return removed

    def clear_all(self) -> dict[str, int]:
        """Wipe everything except notification prefs. Returns counts removed."""
        counts = {
            "messages": sum(len(m) for m in self._channel_messages.values())
            + sum(len(m) for m in self._dm_messages.values()),
            "nodes": len(self._nodes),
            "traceroutes": len(self._traceroutes),
            "waypoints": len(self._waypoints),
            "favorites": len(self._favorite_nodes),
            "ignored": len(self._ignored_nodes),
        }
        self._channel_messages.clear()
        self._dm_messages.clear()
        self._nodes.clear()
        self._traceroutes.clear()
        self._waypoints.clear()
        self._favorite_nodes.clear()
        self._ignored_nodes.clear()
        self._messages_today = 0
        self._schedule_save()
        return counts

    def stats(self) -> dict[str, Any]:
        """Return counts for the Storage settings panel."""
        message_count = (
            sum(len(m) for m in self._channel_messages.values())
            + sum(len(m) for m in self._dm_messages.values())
        )
        return {
            "messages": message_count,
            "conversations": (
                len(self._channel_messages) + len(self._dm_messages)
            ),
            "nodes": len(self._nodes),
            "traceroutes": len(self._traceroutes),
            "waypoints": len(self._waypoints),
            "favorites": len(self._favorite_nodes),
            "ignored": len(self._ignored_nodes),
        }

    def get_channel_messages(self, entity_id: str) -> list[dict[str, Any]]:
        """Get messages for a channel."""
        return list(self._channel_messages.get(entity_id, []))

    def get_dm_messages(self, partner_id: str) -> list[dict[str, Any]]:
        """Get messages for a DM conversation."""
        return list(self._dm_messages.get(partner_id, []))

    def get_all_messages(self) -> dict[str, list[dict[str, Any]]]:
        """Get all messages (channels + DMs)."""
        result: dict[str, list[dict[str, Any]]] = {}
        for eid, msgs in self._channel_messages.items():
            result[eid] = list(msgs)
        for eid, msgs in self._dm_messages.items():
            result[eid] = list(msgs)
        return result

    def get_all_channel_ids(self) -> list[str]:
        """Get all channel entity IDs that have messages."""
        return list(self._channel_messages.keys())

    def get_all_dm_ids(self) -> list[str]:
        """Get all DM partner IDs that have messages."""
        return list(self._dm_messages.keys())

    def get_nodes(self) -> dict[str, dict[str, Any]]:
        """Get all tracked nodes."""
        return dict(self._nodes)

    @property
    def messages_today(self) -> int:
        """Return today's message count."""
        self._check_date_rollover()
        return self._messages_today

    @property
    def total_nodes(self) -> int:
        """Return total number of tracked nodes."""
        return len(self._nodes)

    @property
    def active_nodes_count(self) -> int:
        """Return number of nodes seen within the active window."""
        now = datetime.now(timezone.utc)
        count = 0
        for node_data in self._nodes.values():
            last_seen = node_data.get("_last_seen")
            if last_seen:
                seen_dt = datetime.fromisoformat(last_seen)
                if (now - seen_dt).total_seconds() < ACTIVE_NODE_WINDOW_SECONDS:
                    count += 1
        return count

    @property
    def channel_count(self) -> int:
        """Return number of known channels."""
        return len(self._channel_messages)

    @property
    def favorite_nodes(self) -> set[str]:
        """Return the set of favorite node IDs."""
        return set(self._favorite_nodes)

    @property
    def ignored_nodes(self) -> set[str]:
        """Return the set of ignored node IDs."""
        return set(self._ignored_nodes)

    def set_favorite(self, node_id: str, is_favorite: bool) -> None:
        """Add or remove a node from favorites."""
        node_id = normalize_node_id(node_id)
        if is_favorite:
            self._favorite_nodes.add(node_id)
        else:
            self._favorite_nodes.discard(node_id)
        self._schedule_save()

    def set_ignored(self, node_id: str, is_ignored: bool) -> None:
        """Add or remove a node from ignored list."""
        node_id = normalize_node_id(node_id)
        if is_ignored:
            self._ignored_nodes.add(node_id)
        else:
            self._ignored_nodes.discard(node_id)
        self._schedule_save()

    def add_waypoint(self, waypoint_id: int, data: dict[str, Any]) -> None:
        """Add or update a waypoint."""
        self._waypoints[waypoint_id] = data
        self._schedule_save()

    def remove_waypoint(self, waypoint_id: int) -> None:
        """Remove a waypoint."""
        if waypoint_id in self._waypoints:
            del self._waypoints[waypoint_id]
            self._schedule_save()

    def get_waypoints(self) -> dict[int, dict[str, Any]]:
        """Get all waypoints, pruning expired ones."""
        now_ts = int(datetime.now(timezone.utc).timestamp())
        expired = [
            wp_id for wp_id, wp in self._waypoints.items()
            if wp.get("expire", 0) > 0 and wp["expire"] < now_ts
        ]
        for wp_id in expired:
            del self._waypoints[wp_id]
        if expired:
            self._schedule_save()
        return dict(self._waypoints)

    def set_traceroute(self, node_id: str, data: dict[str, Any]) -> None:
        """Store a traceroute result for a node."""
        node_id = normalize_node_id(node_id)
        data["_timestamp"] = datetime.now(timezone.utc).isoformat()
        self._traceroutes[node_id] = data
        self._schedule_save()

    def get_traceroute(self, node_id: str) -> dict[str, Any] | None:
        """Get the last traceroute result for a node."""
        return self._traceroutes.get(normalize_node_id(node_id))

    def get_all_traceroutes(self) -> dict[str, dict[str, Any]]:
        """Get all stored traceroute results."""
        return dict(self._traceroutes)

    def get_notification_prefs(self) -> dict[str, Any]:
        """Get notification preferences."""
        return dict(self._notification_prefs)

    def set_notification_prefs(self, prefs: dict[str, Any]) -> None:
        """Update notification preferences."""
        self._notification_prefs.update(prefs)
        self._schedule_save()

    def _check_date_rollover(self) -> None:
        """Reset daily counter if date has changed."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._counter_date != today:
            self._messages_today = 0
            self._counter_date = today
            self._schedule_save()


class TimeSeriesStore:
    """Separate persistent store for time-series chart data."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str | None = None,
        migrate_legacy: bool = False,
    ) -> None:
        self._hass = hass
        key = f"{TS_STORAGE_KEY}.{entry_id}" if entry_id else TS_STORAGE_KEY
        self._store = Store(hass, TS_STORAGE_VERSION, key)
        self._legacy_store: Store | None = (
            Store(hass, TS_STORAGE_VERSION, TS_STORAGE_KEY)
            if migrate_legacy and entry_id
            else None
        )

    async def async_load(self) -> dict[str, dict[str, list[float]]] | None:
        """Load time-series data from disk.

        Returns a dict with 'data' and 'packetTypes' keys, each mapping
        series name to a list of floats, or None if no saved data.
        Falls back to the pre-multi-radio global key on first load if
        per-entry data is missing (one-time migration).
        """
        data = await self._store.async_load()
        if data is None and self._legacy_store is not None:
            data = await self._legacy_store.async_load()
        return data

    async def async_save(self, ts_dict: dict[str, Any]) -> None:
        """Immediately save time-series data to disk."""
        data_deques = ts_dict.get("data", {})
        pt_deques = ts_dict.get("packetTypes", {})
        payload = {
            "data": {k: list(v) for k, v in data_deques.items()},
            "packetTypes": {k: list(v) for k, v in pt_deques.items()},
        }
        await self._store.async_save(payload)

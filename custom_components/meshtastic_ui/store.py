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
)


class MeshtasticUiStore:
    """Persistent store for messages and node data."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._channel_messages: dict[str, deque[dict[str, Any]]] = {}
        self._dm_messages: dict[str, deque[dict[str, Any]]] = {}
        self._nodes: dict[str, dict[str, Any]] = {}
        self._messages_today: int = 0
        self._counter_date: str = ""

    async def async_load(self) -> None:
        """Load stored data from disk."""
        data = await self._store.async_load()
        if data is None:
            return

        # Restore channel messages
        for entity_id, messages in data.get("channel_messages", {}).items():
            self._channel_messages[entity_id] = deque(
                messages, maxlen=MAX_CHANNEL_MESSAGES
            )

        # Restore DM messages
        for entity_id, messages in data.get("dm_messages", {}).items():
            self._dm_messages[entity_id] = deque(messages, maxlen=MAX_DM_MESSAGES)

        # Restore nodes, prune stale entries
        now = datetime.now(timezone.utc)
        for node_id, node_data in data.get("nodes", {}).items():
            last_seen = node_data.get("_last_seen")
            if last_seen:
                seen_dt = datetime.fromisoformat(last_seen)
                if (now - seen_dt).days > NODE_RETENTION_DAYS:
                    continue
            self._nodes[node_id] = node_data

        # Restore daily counter
        today = now.strftime("%Y-%m-%d")
        stored_date = data.get("counter_date", "")
        if stored_date == today:
            self._messages_today = data.get("messages_today", 0)
        else:
            self._messages_today = 0
        self._counter_date = today

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

    def update_node(self, node_id: str, data: dict[str, Any]) -> None:
        """Update or create a node entry."""
        existing = self._nodes.get(node_id, {})
        existing.update(data)
        existing["_last_seen"] = datetime.now(timezone.utc).isoformat()
        self._nodes[node_id] = existing
        self._schedule_save()

    def bulk_update_nodes(self, updates: dict[str, dict[str, Any]]) -> None:
        """Bulk update or create multiple node entries efficiently."""
        for node_id, data in updates.items():
            existing = self._nodes.get(node_id, {})
            existing.update(data)
            if "_last_seen" not in existing:
                existing["_last_seen"] = datetime.now(timezone.utc).isoformat()
            self._nodes[node_id] = existing
        self._schedule_save()

    def remove_node(self, node_id: str) -> None:
        """Remove a node entry."""
        if node_id in self._nodes:
            del self._nodes[node_id]
            self._schedule_save()

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

    def _check_date_rollover(self) -> None:
        """Reset daily counter if date has changed."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._counter_date != today:
            self._messages_today = 0
            self._counter_date = today
            self._schedule_save()

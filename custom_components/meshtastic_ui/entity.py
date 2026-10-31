"""Shared entity helpers: radio/node devices and dynamic node entities."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CONF_MONITORED_NODES,
    DOMAIN,
    SIGNAL_CONNECTION_STATE,
    SIGNAL_MONITORED_NODES,
    SIGNAL_NODE_UPDATE,
)
from .store import MeshtasticUiStore, normalize_node_id


def node_device_identifier(entry_id: str, node_id: str) -> str:
    """Device registry identifier for a monitored mesh node on one radio."""
    return f"{entry_id}_{node_id}"


def gateway_device_info(entry_id: str) -> DeviceInfo:
    """Device info pointing at the radio (gateway) device for an entry."""
    return DeviceInfo(identifiers={(DOMAIN, entry_id)})


def local_node_id(entry_data: dict[str, Any]) -> str | None:
    """Return the connected radio's own node ID, once known."""
    node_num = entry_data.get("ts", {}).get("local_node_num")
    return f"!{node_num:08x}" if node_num is not None else None


def monitored_node_ids(entry: ConfigEntry) -> set[str]:
    """Nodes the user chose to expose as Home Assistant devices."""
    return {
        normalize_node_id(node_id)
        for node_id in entry.options.get(CONF_MONITORED_NODES, [])
    }


def tracked_nodes(entry: ConfigEntry, entry_data: dict[str, Any]) -> dict[str, bool]:
    """Map every node that gets entities to whether it is the local radio.

    The radio's own node always gets entities (on the gateway device);
    other nodes only when the user picked them.
    """
    local_id = local_node_id(entry_data)
    nodes = {node_id: False for node_id in monitored_node_ids(entry)}
    if local_id:
        nodes[local_id] = True
    return nodes


class MeshNodeEntity(Entity):
    """Base for entities that report on one mesh node."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self,
        store: MeshtasticUiStore,
        entry_id: str,
        node_id: str,
        is_local: bool,
        key: str,
    ) -> None:
        self._store = store
        self._entry_id = entry_id
        self._node_id = node_id
        self._is_local = is_local
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_{node_id}_{key}"
        if is_local:
            self._attr_device_info = gateway_device_info(entry_id)
        else:
            node = store.get_node(node_id)
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, node_device_identifier(entry_id, node_id))},
                name=node.get("name") or node_id,
                manufacturer="Meshtastic",
                model=node.get("hardware_model"),
                serial_number=node_id,
                via_device=(DOMAIN, entry_id),
            )

    @property
    def node(self) -> dict[str, Any]:
        """Current stored data for this node."""
        return self._store.get_node(self._node_id)

    @property
    def available(self) -> bool:
        """Unavailable once the node drops out of the store (e.g. cleared)."""
        return bool(self.node)

    async def async_added_to_hass(self) -> None:
        """Refresh when this node's data changes."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_NODE_UPDATE, self._handle_node_update
            )
        )

    @callback
    def _handle_node_update(self, payload: Any) -> None:
        if not isinstance(payload, dict):
            return
        if payload.get("entry_id") not in (None, self._entry_id):
            return
        if payload.get("node_id") != self._node_id:
            return
        self.async_write_ha_state()


EntityFactory = Callable[[str, bool, dict[str, Any], set[str]], Iterable[Entity]]


@callback
def async_setup_node_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    entry_data: dict[str, Any],
    async_add_entities: AddEntitiesCallback,
    factory: EntityFactory,
) -> None:
    """Add node entities now and whenever a tracked node gains data.

    `factory(node_id, is_local, node_data, known_unique_ids)` returns the
    entities that don't exist yet. Sensors appear only once a node has
    reported the value, so a node without an environment sensor never
    gets an empty temperature entity.
    """
    store: MeshtasticUiStore = entry_data["store"]
    entry_id = entry.entry_id
    known: set[str] = set()

    @callback
    def _add_for(node_ids: Iterable[str] | None = None) -> None:
        tracked = tracked_nodes(entry, entry_data)
        wanted = tracked if node_ids is None else {
            node_id: tracked[node_id] for node_id in node_ids if node_id in tracked
        }
        new_entities: list[Entity] = []
        for node_id, is_local in wanted.items():
            node = store.get_node(node_id)
            if not node:
                continue
            for entity in factory(node_id, is_local, node, known):
                known.add(entity.unique_id)
                new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)

    @callback
    def _on_node_update(payload: Any) -> None:
        if isinstance(payload, dict) and payload.get("entry_id") in (None, entry_id):
            node_id = payload.get("node_id")
            if node_id:
                _add_for([node_id])

    @callback
    def _on_entry_signal(payload: Any) -> None:
        if isinstance(payload, dict) and payload.get("entry_id") not in (None, entry_id):
            return
        if isinstance(payload, dict) and "removed" in payload:
            removed = set(payload["removed"])
            known.difference_update(
                uid for uid in list(known)
                if any(uid.startswith(f"{DOMAIN}_{entry_id}_{node}_") for node in removed)
            )
        _add_for()

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_NODE_UPDATE, _on_node_update)
    )
    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_MONITORED_NODES, _on_entry_signal)
    )
    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_CONNECTION_STATE, _on_entry_signal)
    )
    _add_for()

"""Device tracker platform: last reported position of tracked mesh nodes."""

from __future__ import annotations

from typing import Any

from homeassistant.components.device_tracker import SourceType, TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import MeshNodeEntity, async_setup_node_entities
from .store import MeshtasticUiStore


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up a location entity for each tracked node that reports a position."""
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        return
    store: MeshtasticUiStore = entry_data["store"]

    def _node_trackers(
        node_id: str, is_local: bool, node: dict[str, Any], known: set[str]
    ) -> list[MeshNodeTracker]:
        if node.get("latitude") is None or node.get("longitude") is None:
            return []
        tracker = MeshNodeTracker(store, entry.entry_id, node_id, is_local)
        return [] if tracker.unique_id in known else [tracker]

    async_setup_node_entities(hass, entry, entry_data, async_add_entities, _node_trackers)


class MeshNodeTracker(MeshNodeEntity, TrackerEntity):
    """GPS position a node last broadcast over the mesh."""

    _attr_translation_key = "location"

    def __init__(
        self, store: MeshtasticUiStore, entry_id: str, node_id: str, is_local: bool
    ) -> None:
        super().__init__(store, entry_id, node_id, is_local, "location")

    @property
    def source_type(self) -> SourceType:
        """Positions come from the node's GPS (or its fixed position)."""
        return SourceType.GPS

    @property
    def latitude(self) -> float | None:
        """Return the node's latitude."""
        return self.node.get("latitude")

    @property
    def longitude(self) -> float | None:
        """Return the node's longitude."""
        return self.node.get("longitude")

    @property
    def location_accuracy(self) -> float:
        """Meshtastic positions don't carry an accuracy radius."""
        return 0

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose altitude, which the tracker base has no field for."""
        altitude = self.node.get("altitude")
        return {"altitude": altitude} if altitude is not None else {}

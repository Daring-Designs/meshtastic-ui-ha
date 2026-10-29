"""Sensor platform for Meshtastic UI."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONCENTRATION_MICROGRAMS_PER_CUBIC_METER,
    CONCENTRATION_PARTS_PER_MILLION,
    DEGREE,
    LIGHT_LUX,
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    EntityCategory,
    UnitOfElectricCurrent,
    UnitOfElectricPotential,
    UnitOfLength,
    UnitOfMass,
    UnitOfPrecipitationDepth,
    UnitOfPressure,
    UnitOfSpeed,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_NEW_MESSAGE
from .entity import MeshNodeEntity, async_setup_node_entities, gateway_device_info
from .store import MeshtasticUiStore


@dataclass(frozen=True, kw_only=True)
class MeshNodeSensorDescription(SensorEntityDescription):
    """Describes a sensor read from one node-store key."""

    value_fn: Callable[[Any], Any] = lambda value: value
    # Link-quality readings only make sense for nodes other than our radio.
    remote_only: bool = False


def _parse_timestamp(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _measurement(
    key: str,
    unit: str | None = None,
    device_class: SensorDeviceClass | None = None,
    **kwargs: Any,
) -> MeshNodeSensorDescription:
    return MeshNodeSensorDescription(
        key=key,
        translation_key=key,
        native_unit_of_measurement=unit,
        device_class=device_class,
        state_class=kwargs.pop("state_class", SensorStateClass.MEASUREMENT),
        **kwargs,
    )


_VOLT = UnitOfElectricPotential.VOLT
_MILLIAMP = UnitOfElectricCurrent.MILLIAMPERE

NODE_SENSORS: tuple[MeshNodeSensorDescription, ...] = (
    # Device metrics
    _measurement(
        "battery", PERCENTAGE, SensorDeviceClass.BATTERY,
        # Firmware reports 101 when running on external power.
        value_fn=lambda value: min(value, 100),
    ),
    _measurement("voltage", _VOLT, SensorDeviceClass.VOLTAGE, suggested_display_precision=2),
    _measurement("channel_utilization", PERCENTAGE, suggested_display_precision=1),
    _measurement("air_util_tx", PERCENTAGE, suggested_display_precision=1),
    _measurement(
        "uptime", UnitOfTime.SECONDS, SensorDeviceClass.DURATION,
        state_class=None, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    # Link quality (as heard by our radio)
    _measurement(
        "snr", SIGNAL_STRENGTH_DECIBELS, SensorDeviceClass.SIGNAL_STRENGTH,
        entity_category=EntityCategory.DIAGNOSTIC, remote_only=True,
    ),
    _measurement(
        "rssi", SIGNAL_STRENGTH_DECIBELS_MILLIWATT, SensorDeviceClass.SIGNAL_STRENGTH,
        entity_category=EntityCategory.DIAGNOSTIC, remote_only=True,
    ),
    _measurement("hops", entity_category=EntityCategory.DIAGNOSTIC, remote_only=True),
    MeshNodeSensorDescription(
        key="_last_seen",
        translation_key="last_heard",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=_parse_timestamp,
        remote_only=True,
    ),
    # Environment metrics
    _measurement("temperature", UnitOfTemperature.CELSIUS, SensorDeviceClass.TEMPERATURE, suggested_display_precision=1),
    _measurement("humidity", PERCENTAGE, SensorDeviceClass.HUMIDITY, suggested_display_precision=1),
    _measurement("pressure", UnitOfPressure.HPA, SensorDeviceClass.ATMOSPHERIC_PRESSURE, suggested_display_precision=1),
    _measurement("gas_resistance", "MΩ", suggested_display_precision=2),
    _measurement("iaq", None, SensorDeviceClass.AQI),
    _measurement("env_voltage", _VOLT, SensorDeviceClass.VOLTAGE, suggested_display_precision=2),
    _measurement("env_current", _MILLIAMP, SensorDeviceClass.CURRENT, suggested_display_precision=1),
    _measurement("lux", LIGHT_LUX, SensorDeviceClass.ILLUMINANCE),
    _measurement("white_lux", LIGHT_LUX, SensorDeviceClass.ILLUMINANCE),
    _measurement("ir_lux", LIGHT_LUX, SensorDeviceClass.ILLUMINANCE),
    _measurement("uv_lux", LIGHT_LUX, SensorDeviceClass.ILLUMINANCE),
    _measurement("wind_direction", DEGREE, state_class=None),
    _measurement("wind_speed", UnitOfSpeed.METERS_PER_SECOND, SensorDeviceClass.WIND_SPEED, suggested_display_precision=1),
    _measurement("wind_gust", UnitOfSpeed.METERS_PER_SECOND, SensorDeviceClass.WIND_SPEED, suggested_display_precision=1),
    _measurement("wind_lull", UnitOfSpeed.METERS_PER_SECOND, SensorDeviceClass.WIND_SPEED, suggested_display_precision=1),
    _measurement("rainfall_1h", UnitOfPrecipitationDepth.MILLIMETERS, SensorDeviceClass.PRECIPITATION, suggested_display_precision=1),
    _measurement("rainfall_24h", UnitOfPrecipitationDepth.MILLIMETERS, SensorDeviceClass.PRECIPITATION, suggested_display_precision=1),
    _measurement("soil_moisture", PERCENTAGE, SensorDeviceClass.MOISTURE),
    _measurement("soil_temperature", UnitOfTemperature.CELSIUS, SensorDeviceClass.TEMPERATURE, suggested_display_precision=1),
    _measurement("weight", UnitOfMass.KILOGRAMS, SensorDeviceClass.WEIGHT, suggested_display_precision=2),
    _measurement("distance", UnitOfLength.MILLIMETERS, SensorDeviceClass.DISTANCE),
    _measurement("radiation", "µR/h", suggested_display_precision=2),
    # Air quality metrics
    _measurement("pm1_0", CONCENTRATION_MICROGRAMS_PER_CUBIC_METER, SensorDeviceClass.PM1),
    _measurement("pm2_5", CONCENTRATION_MICROGRAMS_PER_CUBIC_METER, SensorDeviceClass.PM25),
    _measurement("pm10", CONCENTRATION_MICROGRAMS_PER_CUBIC_METER, SensorDeviceClass.PM10),
    _measurement("co2", CONCENTRATION_PARTS_PER_MILLION, SensorDeviceClass.CO2),
    # Power metrics (INA sensors)
    *(
        _measurement(f"ch{channel}_{kind}", unit, device_class, suggested_display_precision=2)
        for channel in (1, 2, 3)
        for kind, unit, device_class in (
            ("voltage", _VOLT, SensorDeviceClass.VOLTAGE),
            ("current", _MILLIAMP, SensorDeviceClass.CURRENT),
        )
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Meshtastic UI sensors."""
    domain_data = hass.data.get(DOMAIN, {})
    entries = domain_data.get("entries", {})
    entry_data = entries.get(entry.entry_id)
    # Backwards-compat for tests that still build the old singleton dict.
    if entry_data is None and "store" in domain_data:
        entry_data = domain_data
    if entry_data is None:
        return
    store: MeshtasticUiStore = entry_data["store"]
    async_add_entities(
        [
            MeshMessagesTodaySensor(store, entry.entry_id),
            MeshActiveNodesSensor(store, entry.entry_id),
        ]
    )

    def _node_sensors(
        node_id: str, is_local: bool, node: dict[str, Any], known: set[str]
    ) -> list[MeshNodeSensor]:
        new_sensors = []
        for description in NODE_SENSORS:
            if description.remote_only and is_local:
                continue
            if node.get(description.key) is None:
                continue
            sensor = MeshNodeSensor(store, entry.entry_id, node_id, is_local, description)
            if sensor.unique_id not in known:
                new_sensors.append(sensor)
        return new_sensors

    async_setup_node_entities(hass, entry, entry_data, async_add_entities, _node_sensors)


class _PerEntrySensor(SensorEntity):
    """Base for sensors that filter signal payloads by entry_id."""

    _attr_has_entity_name = True

    def __init__(self, store: MeshtasticUiStore, entry_id: str) -> None:
        self._store = store
        self._entry_id = entry_id
        self._attr_device_info = gateway_device_info(entry_id)

    @callback
    def _matches_entry(self, data: Any) -> bool:
        if isinstance(data, dict):
            event_entry_id = data.get("entry_id")
            return event_entry_id is None or event_entry_id == self._entry_id
        return True


class MeshMessagesTodaySensor(_PerEntrySensor):
    """Sensor tracking total messages received today."""

    _attr_name = "Messages Today"
    _attr_icon = "mdi:message-text"
    _attr_state_class = SensorStateClass.TOTAL_INCREASING
    _attr_native_unit_of_measurement = "messages"

    def __init__(self, store: MeshtasticUiStore, entry_id: str) -> None:
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_messages_today"

    @property
    def native_value(self) -> int:
        """Return today's message count."""
        return self._store.messages_today

    async def async_added_to_hass(self) -> None:
        """Subscribe to message updates."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_NEW_MESSAGE, self._handle_new_message
            )
        )

    @callback
    def _handle_new_message(self, data: Any) -> None:
        """Update when a new message arrives for this entry's radio."""
        if not self._matches_entry(data):
            return
        self.async_write_ha_state()


class MeshActiveNodesSensor(_PerEntrySensor):
    """Sensor tracking active nodes (seen within 1 hour)."""

    _attr_name = "Active Nodes"
    _attr_icon = "mdi:access-point-network"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "nodes"

    def __init__(self, store: MeshtasticUiStore, entry_id: str) -> None:
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_active_nodes"

    @property
    def native_value(self) -> int:
        """Return count of active nodes."""
        return self._store.active_nodes_count

    async def async_added_to_hass(self) -> None:
        """Subscribe to message updates to refresh node counts."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_NEW_MESSAGE, self._handle_update
            )
        )

    @callback
    def _handle_update(self, data: Any) -> None:
        """Refresh when activity occurs for this entry's radio."""
        if not self._matches_entry(data):
            return
        self.async_write_ha_state()


class MeshNodeSensor(MeshNodeEntity, SensorEntity):
    """One telemetry or link-quality reading from a mesh node."""

    entity_description: MeshNodeSensorDescription

    def __init__(
        self,
        store: MeshtasticUiStore,
        entry_id: str,
        node_id: str,
        is_local: bool,
        description: MeshNodeSensorDescription,
    ) -> None:
        super().__init__(store, entry_id, node_id, is_local, description.translation_key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        """Return the latest stored value for this reading."""
        value = self.node.get(self.entity_description.key)
        if value is None:
            return None
        return self.entity_description.value_fn(value)

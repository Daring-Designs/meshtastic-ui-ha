"""Map Meshtastic telemetry payloads onto flat node-store keys."""

from __future__ import annotations

from typing import Any

# (telemetry section, protobuf JSON field) -> node-store key.
# Store keys are flat so the panel and the sensor platform read one shape,
# whether the values arrived in the radio's node DB or a live packet.
TELEMETRY_FIELDS: dict[str, dict[str, str]] = {
    "deviceMetrics": {
        "batteryLevel": "battery",
        "voltage": "voltage",
        "channelUtilization": "channel_utilization",
        "airUtilTx": "air_util_tx",
        "uptimeSeconds": "uptime",
    },
    "environmentMetrics": {
        "temperature": "temperature",
        "relativeHumidity": "humidity",
        "barometricPressure": "pressure",
        "gasResistance": "gas_resistance",
        "iaq": "iaq",
        "voltage": "env_voltage",
        "current": "env_current",
        "lux": "lux",
        "whiteLux": "white_lux",
        "irLux": "ir_lux",
        "uvLux": "uv_lux",
        "windDirection": "wind_direction",
        "windSpeed": "wind_speed",
        "windGust": "wind_gust",
        "windLull": "wind_lull",
        "rainfall1h": "rainfall_1h",
        "rainfall24h": "rainfall_24h",
        "soilMoisture": "soil_moisture",
        "soilTemperature": "soil_temperature",
        "weight": "weight",
        "distance": "distance",
        "radiation": "radiation",
    },
    "airQualityMetrics": {
        "pm10Standard": "pm1_0",
        "pm25Standard": "pm2_5",
        "pm100Standard": "pm10",
        "co2": "co2",
    },
    "powerMetrics": {
        "ch1Voltage": "ch1_voltage",
        "ch1Current": "ch1_current",
        "ch2Voltage": "ch2_voltage",
        "ch2Current": "ch2_current",
        "ch3Voltage": "ch3_voltage",
        "ch3Current": "ch3_current",
    },
}

# Request types accepted by the request_telemetry action, mapped to the
# Telemetry oneof field the firmware answers with.
TELEMETRY_REQUEST_TYPES = {
    "device": "device_metrics",
    "environment": "environment_metrics",
    "air_quality": "air_quality_metrics",
    "power": "power_metrics",
}


def extract_telemetry(source: dict[str, Any]) -> dict[str, Any]:
    """Return flat node-store values from a node dict or a Telemetry payload."""
    values: dict[str, Any] = {}
    for section, fields in TELEMETRY_FIELDS.items():
        metrics = source.get(section)
        if not isinstance(metrics, dict):
            continue
        for field, key in fields.items():
            if metrics.get(field) is not None:
                values[key] = metrics[field]
    return values

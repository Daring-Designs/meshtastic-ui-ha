"""Device triggers: pick "message received" in the automation editor.

Each trigger is a filtered listener on the meshtastic_ui_message_received
event, so anything a device trigger does can also be written as a plain
event trigger with event_data.
"""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components.device_automation import DEVICE_TRIGGER_BASE_SCHEMA
from homeassistant.components.homeassistant.triggers import event as event_trigger
from homeassistant.const import CONF_DEVICE_ID, CONF_DOMAIN, CONF_PLATFORM, CONF_TYPE
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.trigger import TriggerActionType, TriggerInfo
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, EVENT_MESSAGE_RECEIVED

# Triggers on the radio device.
RADIO_TRIGGERS = {
    "message_received": {},
    "channel_message_received": {"type": "channel"},
    "direct_message_received": {"type": "dm"},
}
# Triggers on a monitored node's device.
NODE_TRIGGERS = {
    "message_from_node": {},
    "direct_message_from_node": {"type": "dm"},
}

TRIGGER_SCHEMA = DEVICE_TRIGGER_BASE_SCHEMA.extend(
    {vol.Required(CONF_TYPE): vol.In({**RADIO_TRIGGERS, **NODE_TRIGGERS})}
)


def _device_target(
    hass: HomeAssistant, device_id: str
) -> tuple[str, str | None] | None:
    """Return (config entry ID, node ID or None for the radio) for a device."""
    device = dr.async_get(hass).async_get(device_id)
    if device is None:
        return None
    for domain, identifier in device.identifiers:
        if domain != DOMAIN:
            continue
        for entry_id in device.config_entries:
            if identifier == entry_id:
                return entry_id, None
            if identifier.startswith(f"{entry_id}_"):
                return entry_id, identifier[len(entry_id) + 1:]
    return None


async def async_get_triggers(
    hass: HomeAssistant, device_id: str
) -> list[dict[str, str]]:
    """List the triggers a radio or node device offers."""
    target = _device_target(hass, device_id)
    if target is None:
        return []
    trigger_types = RADIO_TRIGGERS if target[1] is None else NODE_TRIGGERS
    return [
        {
            CONF_PLATFORM: "device",
            CONF_DOMAIN: DOMAIN,
            CONF_DEVICE_ID: device_id,
            CONF_TYPE: trigger_type,
        }
        for trigger_type in trigger_types
    ]


async def async_attach_trigger(
    hass: HomeAssistant,
    config: ConfigType,
    action: TriggerActionType,
    trigger_info: TriggerInfo,
) -> CALLBACK_TYPE:
    """Listen for matching message events."""
    target = _device_target(hass, config[CONF_DEVICE_ID])
    if target is None:
        raise vol.Invalid(f"Unknown Meshtastic UI device {config[CONF_DEVICE_ID]}")
    entry_id, node_id = target
    trigger_type = config[CONF_TYPE]
    event_data = {
        "config_entry_id": entry_id,
        **RADIO_TRIGGERS.get(trigger_type, {}),
        **NODE_TRIGGERS.get(trigger_type, {}),
    }
    if node_id is not None:
        event_data["from"] = node_id
    event_config = event_trigger.TRIGGER_SCHEMA(
        {
            event_trigger.CONF_PLATFORM: "event",
            event_trigger.CONF_EVENT_TYPE: EVENT_MESSAGE_RECEIVED,
            event_trigger.CONF_EVENT_DATA: event_data,
        }
    )
    return await event_trigger.async_attach_trigger(
        hass, event_config, action, trigger_info, platform_type="device"
    )

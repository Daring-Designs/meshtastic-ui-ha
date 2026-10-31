"""Tests for the automation surface: actions, events, triggers and node entities."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.components import automation
from homeassistant.components.device_automation import DeviceAutomationType
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_get_device_automations,
)

from custom_components.meshtastic_ui.const import (
    CONF_MONITORED_NODES,
    DOMAIN,
    EVENT_DELIVERY_STATUS,
    EVENT_MESSAGE_RECEIVED,
)
from custom_components.meshtastic_ui.entity import node_device_identifier

LOCAL_NUM = 305419896  # !12345678
LOCAL_ID = "!12345678"
REMOTE_ID = "!a1b2c3d4"


@pytest.fixture
def radio(mock_connection: MagicMock) -> MagicMock:
    """A mock radio whose node DB holds our node and one remote node."""
    mock_connection.my_info = {
        "num": LOCAL_NUM,
        "user": {"longName": "Base", "shortName": "BASE", "hwModel": "HELTEC_V3"},
        "deviceMetrics": {"batteryLevel": 101, "voltage": 4.2},
    }
    mock_connection.nodes = {
        LOCAL_ID: mock_connection.my_info,
        REMOTE_ID: {
            "num": 0xA1B2C3D4,
            "user": {"longName": "Isberget", "shortName": "ISB", "hwModel": "RAK4631"},
            "deviceMetrics": {"batteryLevel": 76, "voltage": 3.9},
        },
    }
    mock_connection.async_request_nodeinfo = AsyncMock()
    mock_connection.async_request_telemetry = AsyncMock()
    mock_connection.async_force_reconnect = AsyncMock()
    return mock_connection


async def _setup(
    hass: HomeAssistant, radio: MagicMock, options: dict | None = None
) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"connection_type": "tcp", "tcp_hostname": "10.0.0.5", "tcp_port": 4403},
        options=options or {},
        unique_id=LOCAL_ID,
        title="Base",
        version=2,
    )
    entry.add_to_hass(hass)
    with (
        patch("custom_components.meshtastic_ui._create_connection", return_value=radio),
        patch("custom_components.meshtastic_ui.async_register_panel", AsyncMock()),
        patch("custom_components.meshtastic_ui.async_register_websocket_api"),
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    return entry


def _packet_callback(radio: MagicMock):
    return radio.register_message_callback.call_args[0][0]


def _entity_id(hass: HomeAssistant, platform: str, unique_id: str) -> str | None:
    return er.async_get(hass).async_get_entity_id(platform, DOMAIN, unique_id)


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------


async def test_local_radio_entities(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio)
    prefix = f"{DOMAIN}_{entry.entry_id}"

    battery = _entity_id(hass, "sensor", f"{prefix}_{LOCAL_ID}_battery")
    assert battery is not None
    # 101 means external power; report it as full.
    assert hass.states.get(battery).state == "100"

    connected = _entity_id(hass, "binary_sensor", f"{prefix}_connected")
    assert hass.states.get(connected).state == "on"

    device = dr.async_get(hass).async_get_device(identifiers={(DOMAIN, entry.entry_id)})
    assert device.model == "HELTEC_V3"
    assert device.serial_number == LOCAL_ID

    # Remote nodes don't get entities until the user picks them.
    assert _entity_id(hass, "sensor", f"{prefix}_{REMOTE_ID}_battery") is None


async def test_monitored_node_gets_device_and_live_telemetry(
    hass: HomeAssistant, radio: MagicMock
) -> None:
    entry = await _setup(hass, radio, {CONF_MONITORED_NODES: [REMOTE_ID]})
    prefix = f"{DOMAIN}_{entry.entry_id}_{REMOTE_ID}"

    device = dr.async_get(hass).async_get_device(
        identifiers={(DOMAIN, node_device_identifier(entry.entry_id, REMOTE_ID))}
    )
    assert device.name == "Isberget"
    assert hass.states.get(_entity_id(hass, "sensor", f"{prefix}_battery")).state == "76"
    # No environment reading yet, so no empty temperature entity.
    assert _entity_id(hass, "sensor", f"{prefix}_temperature") is None

    _packet_callback(radio)(
        {
            "fromId": REMOTE_ID,
            "from": 0xA1B2C3D4,
            "rxSnr": 6.5,
            "rxRssi": -98,
            "decoded": {
                "portnum": "TELEMETRY_APP",
                "telemetry": {
                    "environmentMetrics": {
                        "temperature": 21.4,
                        "relativeHumidity": 55.0,
                        "barometricPressure": 1012.3,
                    }
                },
            },
        }
    )
    await hass.async_block_till_done()

    assert hass.states.get(_entity_id(hass, "sensor", f"{prefix}_temperature")).state == "21.4"
    assert hass.states.get(_entity_id(hass, "sensor", f"{prefix}_humidity")).state == "55.0"
    assert hass.states.get(_entity_id(hass, "sensor", f"{prefix}_rssi")).state == "-98"

    _packet_callback(radio)(
        {
            "fromId": REMOTE_ID,
            "decoded": {
                "portnum": "POSITION_APP",
                "position": {"latitudeI": 594000000, "longitudeI": 180000000, "altitude": 812},
            },
        }
    )
    await hass.async_block_till_done()
    tracker = hass.states.get(_entity_id(hass, "device_tracker", f"{prefix}_location"))
    assert tracker.attributes["latitude"] == pytest.approx(59.4)
    assert tracker.attributes["altitude"] == 812


async def test_unmonitoring_node_removes_its_device(
    hass: HomeAssistant, radio: MagicMock
) -> None:
    entry = await _setup(hass, radio, {CONF_MONITORED_NODES: [REMOTE_ID]})
    identifiers = {(DOMAIN, node_device_identifier(entry.entry_id, REMOTE_ID))}
    assert dr.async_get(hass).async_get_device(identifiers=identifiers) is not None

    hass.config_entries.async_update_entry(entry, options={CONF_MONITORED_NODES: []})
    await hass.async_block_till_done()

    assert dr.async_get(hass).async_get_device(identifiers=identifiers) is None
    assert _entity_id(hass, "sensor", f"{DOMAIN}_{entry.entry_id}_{REMOTE_ID}_battery") is None

    # Picking it again brings the entities back.
    hass.config_entries.async_update_entry(entry, options={CONF_MONITORED_NODES: [REMOTE_ID]})
    await hass.async_block_till_done()
    assert _entity_id(hass, "sensor", f"{DOMAIN}_{entry.entry_id}_{REMOTE_ID}_battery") is not None


async def test_options_flow_saves_monitored_nodes(
    hass: HomeAssistant, radio: MagicMock
) -> None:
    entry = await _setup(hass, radio)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    options = result["data_schema"].schema[CONF_MONITORED_NODES].config["options"]
    # Our own radio isn't offered; it always has entities.
    assert [option["value"] for option in options] == [REMOTE_ID]

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_MONITORED_NODES: [REMOTE_ID.upper().replace("!A", "!a")]}
    )
    assert entry.options[CONF_MONITORED_NODES] == [REMOTE_ID]

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_MONITORED_NODES: ["not-a-node"]}
    )
    assert result["errors"] == {CONF_MONITORED_NODES: "invalid_node_id"}


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


async def test_send_message_to_channel(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio)
    response = await hass.services.async_call(
        DOMAIN, "send_message", {"message": "Porch 21 °C", "channel": 1},
        blocking=True, return_response=True,
    )
    radio.async_send_text.assert_awaited_once_with(
        "Porch 21 °C", destination_id=None, channel_index=1, reply_id=None
    )
    assert response == {"packet_id": 12345, "to": None, "channel": 1}
    store = hass.data[DOMAIN]["entries"][entry.entry_id]["store"]
    assert store.get_channel_messages("1")[-1]["text"] == "Porch 21 °C"


async def test_send_message_dm_by_name(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    await hass.services.async_call(
        DOMAIN, "send_message", {"message": "hi", "to": "isberget"}, blocking=True
    )
    assert radio.async_send_text.await_args.kwargs["destination_id"] == REMOTE_ID


async def test_send_message_validation(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "send_message", {"message": "x" * 229}, blocking=True
        )
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "send_message", {"message": "hi", "to": "Nobody"}, blocking=True
        )
    radio.async_send_text.assert_not_awaited()


async def test_request_telemetry(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    await hass.services.async_call(
        DOMAIN, "request_telemetry", {"node": REMOTE_ID, "type": "environment"},
        blocking=True,
    )
    radio.async_request_telemetry.assert_awaited_once_with(REMOTE_ID, "environment_metrics")


async def test_trace_route_by_short_name(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    await hass.services.async_call(DOMAIN, "trace_route", {"node": "ISB"}, blocking=True)
    radio.async_send_traceroute.assert_awaited_once_with(REMOTE_ID)


# ---------------------------------------------------------------------------
# Events and device triggers
# ---------------------------------------------------------------------------


def _text_packet(
    text: str, to: str = "^all", packet_id: int = 777, **overrides
) -> dict:
    return {
        "fromId": REMOTE_ID,
        "toId": to,
        "channel": 0,
        "id": packet_id,
        "rxSnr": 4.0,
        "rxRssi": -101,
        "pkiEncrypted": to != "^all",
        "decoded": {"portnum": "TEXT_MESSAGE_APP", "text": text},
        **overrides,
    }


async def test_message_received_event(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio)
    events = async_capture_events(hass, EVENT_MESSAGE_RECEIVED)

    _packet_callback(radio)(_text_packet("lights on", to=LOCAL_ID))
    await hass.async_block_till_done()

    assert len(events) == 1
    data = events[0].data
    assert data["config_entry_id"] == entry.entry_id
    assert data["type"] == "dm"
    assert data["from"] == REMOTE_ID
    assert data["from_name"] == "Isberget"
    assert data["message"] == "lights on"
    assert data["pki_encrypted"] is True
    assert data["authenticated"] is True
    assert data["rssi"] == -101


async def test_authenticated_flag(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    events = async_capture_events(hass, EVENT_MESSAGE_RECEIVED)
    callback = _packet_callback(radio)

    callback(_text_packet("channel", packet_id=1))
    callback(_text_packet("legacy dm", to=LOCAL_ID, packet_id=2, pkiEncrypted=False))
    callback(_text_packet("mqtt dm", to=LOCAL_ID, packet_id=3, viaMqtt=True))
    await hass.async_block_till_done()

    assert [event.data["authenticated"] for event in events] == [False, False, False]


async def test_replayed_message_is_dropped(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio)
    events = async_capture_events(hass, EVENT_MESSAGE_RECEIVED)
    callback = _packet_callback(radio)

    callback(_text_packet("open", to=LOCAL_ID, packet_id=4242))
    callback(_text_packet("open", to=LOCAL_ID, packet_id=4242))
    callback(_text_packet("open", to=LOCAL_ID, packet_id=4243))
    await hass.async_block_till_done()

    assert [event.data["message_id"] for event in events] == [4242, 4243]
    store = hass.data[DOMAIN]["entries"][entry.entry_id]["store"]
    assert len(store.get_dm_messages(REMOTE_ID)) == 2
    # The history is saved, so a replay after a restart is dropped too.
    assert f"{REMOTE_ID}:4242" in store._data_to_save()["seen_messages"]


async def test_ignored_node_fires_no_event(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio)
    hass.data[DOMAIN]["entries"][entry.entry_id]["store"].set_ignored(REMOTE_ID, True)
    events = async_capture_events(hass, EVENT_MESSAGE_RECEIVED)
    _packet_callback(radio)(_text_packet("spam"))
    await hass.async_block_till_done()
    assert events == []


async def test_delivery_status_event(hass: HomeAssistant, radio: MagicMock) -> None:
    await _setup(hass, radio)
    events = async_capture_events(hass, EVENT_DELIVERY_STATUS)
    await hass.services.async_call(
        DOMAIN, "send_message", {"message": "ping", "to": REMOTE_ID}, blocking=True
    )
    _packet_callback(radio)(
        {
            "fromId": REMOTE_ID,
            "decoded": {"portnum": "ROUTING_APP", "requestId": 12345, "routing": {"errorReason": "NONE"}},
        }
    )
    await hass.async_block_till_done()
    assert events[0].data["status"] == "delivered"
    assert events[0].data["message"] == "ping"
    assert events[0].data["to"] == REMOTE_ID


async def test_device_triggers(hass: HomeAssistant, radio: MagicMock) -> None:
    entry = await _setup(hass, radio, {CONF_MONITORED_NODES: [REMOTE_ID]})
    device_registry = dr.async_get(hass)
    radio_device = device_registry.async_get_device(identifiers={(DOMAIN, entry.entry_id)})
    node_device = device_registry.async_get_device(
        identifiers={(DOMAIN, node_device_identifier(entry.entry_id, REMOTE_ID))}
    )

    radio_triggers = await async_get_device_automations(
        hass, DeviceAutomationType.TRIGGER, radio_device.id
    )
    assert {
        trigger["type"] for trigger in radio_triggers if trigger["domain"] == DOMAIN
    } == {
        "message_received", "channel_message_received", "direct_message_received",
    }

    calls = []
    hass.services.async_register("test", "automation", lambda call: calls.append(call))
    assert await async_setup_component(
        hass,
        automation.DOMAIN,
        {
            automation.DOMAIN: [
                {
                    "trigger": {
                        "platform": "device", "domain": DOMAIN,
                        "device_id": node_device.id, "type": "direct_message_from_node",
                    },
                    "action": {
                        "service": "test.automation",
                        "data": {"text": "{{ trigger.event.data.message }}"},
                    },
                },
            ]
        },
    )

    callback = _packet_callback(radio)
    callback(_text_packet("broadcast", packet_id=1))
    callback(_text_packet("legacy", to=LOCAL_ID, packet_id=2, pkiEncrypted=False))
    callback(_text_packet("garage", to=LOCAL_ID, packet_id=3))
    await hass.async_block_till_done()

    assert [call.data["text"] for call in calls] == ["garage"]


async def test_action_descriptions_load(hass: HomeAssistant, radio: MagicMock) -> None:
    from homeassistant.helpers.service import async_get_all_descriptions

    await _setup(hass, radio)
    descriptions = (await async_get_all_descriptions(hass))[DOMAIN]
    assert set(descriptions) == {
        "send_message", "send_waypoint", "trace_route",
        "request_position", "request_nodeinfo", "request_telemetry",
    }
    assert "config_entry_id" in descriptions["request_position"]["fields"]


async def test_non_admin_cannot_transmit(
    hass: HomeAssistant, radio: MagicMock, hass_read_only_user
) -> None:
    from homeassistant.core import Context
    from homeassistant.exceptions import Unauthorized

    await _setup(hass, radio)
    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN, "send_message", {"message": "hi"}, blocking=True,
            context=Context(user_id=hass_read_only_user.id),
        )
    radio.async_send_text.assert_not_awaited()

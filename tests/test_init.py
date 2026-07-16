"""Tests for Meshtastic UI __init__ (setup, handlers, helpers)."""

from __future__ import annotations

import time
from collections import deque
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from custom_components.meshtastic_ui import (
    _extract_node_data,
    _handle_delivery_ack,
    _handle_text_message,
    _handle_traceroute,
    _handle_waypoint,
    _num_to_id,
)
from custom_components.meshtastic_ui.const import (
    DOMAIN,
    SIGNAL_DELIVERY_STATUS,
    SIGNAL_NEW_MESSAGE,
    SIGNAL_TRACEROUTE_RESULT,
    SIGNAL_WAYPOINT_UPDATE,
)
from custom_components.meshtastic_ui.store import MeshtasticUiStore


# ---------------------------------------------------------------------------
# _num_to_id
# ---------------------------------------------------------------------------

class TestNumToId:
    """Tests for _num_to_id helper."""

    def test_basic_conversion(self):
        assert _num_to_id(305419896) == "!12345678"

    def test_zero(self):
        assert _num_to_id(0) == "!00000000"

    def test_max_32bit(self):
        assert _num_to_id(0xFFFFFFFF) == "!ffffffff"


# ---------------------------------------------------------------------------
# _extract_node_data
# ---------------------------------------------------------------------------

class TestExtractNodeData:
    """Tests for _extract_node_data helper."""

    def test_user_info(self):
        node = {"user": {"longName": "Alice", "shortName": "AL", "hwModel": "TBEAM"}}
        data = _extract_node_data(node)
        assert data["name"] == "Alice"
        assert data["short_name"] == "AL"
        assert data["hardware_model"] == "TBEAM"

    def test_position(self):
        node = {"position": {"latitude": 40.7, "longitude": -74.0, "altitude": 10}}
        data = _extract_node_data(node)
        assert data["latitude"] == 40.7
        assert data["longitude"] == -74.0
        assert data["altitude"] == 10

    def test_device_metrics(self):
        node = {"deviceMetrics": {"batteryLevel": 85, "voltage": 3.7, "channelUtilization": 5.2, "airUtilTx": 1.1, "uptimeSeconds": 3600}}
        data = _extract_node_data(node)
        assert data["battery"] == 85
        assert data["voltage"] == 3.7
        assert data["channel_utilization"] == 5.2
        assert data["air_util_tx"] == 1.1
        assert data["uptime"] == 3600

    def test_snr_and_hops(self):
        node = {"snr": 10.5, "hopsAway": 2}
        data = _extract_node_data(node)
        assert data["snr"] == 10.5
        assert data["hops"] == 2

    def test_last_heard(self):
        ts = int(datetime(2025, 6, 1, tzinfo=timezone.utc).timestamp())
        node = {"lastHeard": ts}
        data = _extract_node_data(node)
        assert "2025-06-01" in data["_last_seen"]

    def test_via_mqtt(self):
        data = _extract_node_data({"viaMqtt": True})
        assert data["via_mqtt"] is True

    def test_via_mqtt_absent(self):
        data = _extract_node_data({"snr": 1.0})
        assert "via_mqtt" not in data

    def test_empty_node(self):
        data = _extract_node_data({})
        assert "_last_seen" in data


# ---------------------------------------------------------------------------
# _handle_text_message
# ---------------------------------------------------------------------------

class TestHandleTextMessage:
    """Tests for _handle_text_message."""

    async def test_channel_broadcast(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        received = []
        async_dispatcher_connect(hass, SIGNAL_NEW_MESSAGE, lambda d: received.append(d))

        packet = {
            "decoded": {"text": "hello mesh", "portnum": "TEXT_MESSAGE_APP"},
            "fromId": "!aabbccdd",
            "toId": "^all",
            "channel": 0,
        }
        _handle_text_message(hass, "_legacy", store, packet)
        await hass.async_block_till_done()

        msgs = store.get_channel_messages("0")
        assert len(msgs) == 1
        assert msgs[0]["text"] == "hello mesh"
        assert len(received) == 1
        assert received[0]["type"] == "channel"

    async def test_dm_message(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        received = []
        async_dispatcher_connect(hass, SIGNAL_NEW_MESSAGE, lambda d: received.append(d))

        packet = {
            "decoded": {"text": "hey", "portnum": "TEXT_MESSAGE_APP"},
            "fromId": "!aabbccdd",
            "toId": "!12345678",
            "channel": 0,
        }
        _handle_text_message(hass, "_legacy", store, packet)
        await hass.async_block_till_done()

        msgs = store.get_dm_messages("!aabbccdd")
        assert len(msgs) == 1
        assert msgs[0]["text"] == "hey"
        assert len(received) == 1
        assert received[0]["type"] == "dm"

    async def test_local_echo_skipped(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        # local_node_num=305419896 => !12345678
        packet = {
            "decoded": {"text": "my own message", "portnum": "TEXT_MESSAGE_APP"},
            "fromId": "!12345678",
            "toId": "^all",
            "channel": 0,
        }
        _handle_text_message(hass, "_legacy", store, packet)
        assert store.get_channel_messages("0") == []

    async def test_empty_text_ignored(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        packet = {
            "decoded": {"text": "", "portnum": "TEXT_MESSAGE_APP"},
            "fromId": "!aabbccdd",
            "toId": "^all",
            "channel": 0,
        }
        _handle_text_message(hass, "_legacy", store, packet)
        assert store.get_channel_messages("0") == []


# ---------------------------------------------------------------------------
# _handle_delivery_ack
# ---------------------------------------------------------------------------

class TestHandleDeliveryAck:
    """Tests for _handle_delivery_ack."""

    async def test_delivered(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        hass_data["pending_acks"][42] = {"text": "hi", "to": "!aa", "_ts": time.time()}
        received = []
        async_dispatcher_connect(hass, SIGNAL_DELIVERY_STATUS, lambda d: received.append(d))

        packet = {
            "decoded": {"routing": {"errorReason": "NONE"}, "portnum": "ROUTING_APP"},
            "requestId": 42,
        }
        _handle_delivery_ack(hass, "_legacy", packet)
        await hass.async_block_till_done()

        assert len(received) == 1
        assert received[0]["status"] == "delivered"
        assert 42 not in hass_data["pending_acks"]

    async def test_failed(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        hass_data["pending_acks"][42] = {"text": "hi", "to": "!aa", "_ts": time.time()}
        received = []
        async_dispatcher_connect(hass, SIGNAL_DELIVERY_STATUS, lambda d: received.append(d))

        packet = {
            "decoded": {"routing": {"errorReason": "NO_RESPONSE"}, "portnum": "ROUTING_APP"},
            "requestId": 42,
        }
        _handle_delivery_ack(hass, "_legacy", packet)
        await hass.async_block_till_done()

        assert received[0]["status"] == "failed"

    async def test_unknown_request_id_ignored(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        packet = {
            "decoded": {"routing": {"errorReason": "NONE"}, "portnum": "ROUTING_APP"},
            "requestId": 999,
        }
        _handle_delivery_ack(hass, "_legacy", packet)  # Should not raise

    async def test_no_request_id_ignored(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        packet = {"decoded": {"routing": {}}}
        _handle_delivery_ack(hass, "_legacy", packet)


# ---------------------------------------------------------------------------
# _handle_traceroute
# ---------------------------------------------------------------------------

class TestHandleTraceroute:
    """Tests for _handle_traceroute."""

    async def test_route_parsed_and_stored(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        received = []
        async_dispatcher_connect(hass, SIGNAL_TRACEROUTE_RESULT, lambda d: received.append(d))

        packet = {
            "decoded": {
                "portnum": "TRACEROUTE_APP",
                "traceroute": {
                    "route": [100, 200],
                    "routeBack": [200, 100],
                    "snrTowards": [10.0, 8.0],
                    "snrBack": [9.0, 7.0],
                },
            },
            "fromId": "!aabbccdd",
            "toId": "!12345678",
        }
        _handle_traceroute(hass, "_legacy", store, packet)
        await hass.async_block_till_done()

        result = store.get_traceroute("!aabbccdd")
        assert result is not None
        assert result["route"] == ["!00000064", "!000000c8"]
        assert len(received) == 1

    async def test_missing_ids_skipped(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        packet = {"decoded": {"portnum": "TRACEROUTE_APP", "traceroute": {}}, "fromId": "", "toId": ""}
        _handle_traceroute(hass, "_legacy", store, packet)
        assert store.get_all_traceroutes() == {}


# ---------------------------------------------------------------------------
# _handle_waypoint
# ---------------------------------------------------------------------------

class TestHandleWaypoint:
    """Tests for _handle_waypoint."""

    async def test_add_waypoint(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        received = []
        async_dispatcher_connect(hass, SIGNAL_WAYPOINT_UPDATE, lambda d: received.append(d))

        future_ts = int(datetime.now(timezone.utc).timestamp()) + 3600
        packet = {
            "decoded": {
                "portnum": "WAYPOINT_APP",
                "waypoint": {
                    "id": 42,
                    "latitudeI": 407000000,
                    "longitudeI": -740000000,
                    "name": "TestWP",
                    "description": "A test",
                    "expire": future_ts,
                },
            },
            "fromId": "!aabbccdd",
        }
        _handle_waypoint(hass, "_legacy", store, packet)
        await hass.async_block_till_done()

        wps = store.get_waypoints()
        assert 42 in wps
        assert wps[42]["name"] == "TestWP"
        assert received[0]["action"] == "add"

    async def test_expired_waypoint_deleted(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        # Pre-add the waypoint
        store.add_waypoint(42, {"name": "Old", "expire": 0})
        received = []
        async_dispatcher_connect(hass, SIGNAL_WAYPOINT_UPDATE, lambda d: received.append(d))

        past_ts = int(datetime.now(timezone.utc).timestamp()) - 100
        packet = {
            "decoded": {
                "portnum": "WAYPOINT_APP",
                "waypoint": {
                    "id": 42,
                    "latitudeI": 0,
                    "longitudeI": 0,
                    "name": "",
                    "description": "",
                    "expire": past_ts,
                },
            },
            "fromId": "!aabbccdd",
        }
        _handle_waypoint(hass, "_legacy", store, packet)
        await hass.async_block_till_done()

        assert 42 not in store.get_waypoints()
        assert received[0]["action"] == "delete"

    async def test_no_waypoint_data_ignored(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        packet = {"decoded": {"portnum": "WAYPOINT_APP", "waypoint": {}}, "fromId": "!aa"}
        _handle_waypoint(hass, "_legacy", store, packet)
        assert store.get_waypoints() == {}

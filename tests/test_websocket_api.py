"""Tests for Meshtastic UI WebSocket API commands."""

from __future__ import annotations

from collections import deque
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshtastic_ui.const import (
    CONF_BLE_ADDRESS,
    CONF_CONNECTION_TYPE,
    DOMAIN,
    SIGNAL_NOTIFICATION_PREFS,
    TS_MAX_POINTS,
)
from custom_components.meshtastic_ui.store import MeshtasticUiStore
from custom_components.meshtastic_ui.websocket_api import (
    _downsample,
    _format_address_last4,
    ws_disconnect,
    ws_gateways,
    ws_get_timeseries,
    ws_messages,
    ws_node_admin,
    ws_nodes,
    ws_radios,
    ws_send_message,
    ws_set_notification_prefs,
    ws_stats,
)

# Unwrap @async_response / @websocket_command to get the original async funcs
_ws_gateways = ws_gateways.__wrapped__
_ws_messages = ws_messages.__wrapped__
_ws_nodes = ws_nodes.__wrapped__
_ws_stats = ws_stats.__wrapped__
_ws_send_message = ws_send_message.__wrapped__
_ws_node_admin = ws_node_admin.__wrapped__
_ws_set_notification_prefs = ws_set_notification_prefs.__wrapped__
_ws_radios = ws_radios.__wrapped__
_ws_disconnect = ws_disconnect.__wrapped__
# ws_get_timeseries is @callback (sync), not @async_response — websocket_command
# doesn't wrap sync callbacks, so no __wrapped__ unwinding needed here.
_ws_get_timeseries = ws_get_timeseries


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ws_connection(*, is_admin: bool = True) -> MagicMock:
    """Create a mock ActiveConnection."""
    conn = MagicMock()
    conn.send_result = MagicMock()
    conn.send_error = MagicMock()
    conn.send_event = MagicMock()
    conn.subscriptions = {}
    conn.user = MagicMock()
    conn.user.is_admin = is_admin
    return conn


# ---------------------------------------------------------------------------
# _downsample
# ---------------------------------------------------------------------------

class TestDownsample:
    """Tests for the _downsample utility."""

    def test_no_downsample(self):
        values = [1.0, 2.0, 3.0]
        assert _downsample(values, 1, False) == [1.0, 2.0, 3.0]

    def test_counter_summing(self):
        values = [1.0, 2.0, 3.0, 4.0]
        result = _downsample(values, 2, True)
        assert result == [3.0, 7.0]

    def test_snapshot_averaging(self):
        values = [2.0, 4.0, 6.0, 8.0]
        result = _downsample(values, 2, False)
        assert result == [3.0, 7.0]

    def test_partial_last_bucket_counter(self):
        values = [1.0, 2.0, 3.0]
        result = _downsample(values, 2, True)
        assert result == [3.0, 3.0]

    def test_partial_last_bucket_snapshot(self):
        values = [2.0, 4.0, 6.0]
        result = _downsample(values, 2, False)
        assert result == [3.0, 6.0]

    def test_empty(self):
        assert _downsample([], 2, True) == []


# ---------------------------------------------------------------------------
# ws_messages
# ---------------------------------------------------------------------------

class TestWsMessages:
    """Tests for ws_messages command."""

    async def test_returns_all_messages(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "ch0"})
        store.add_dm_message("!aa", {"text": "dm1"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/messages"}
        await _ws_messages(hass, conn, msg)

        conn.send_result.assert_called_once()
        result = conn.send_result.call_args[0][1]
        assert "0" in result["messages"]
        assert "!aa" in result["messages"]
        assert "0" in result["channels"]
        assert "!aa" in result["dms"]

    async def test_filter_by_entity_id(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "ch0"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/messages", "entity_id": "0"}
        await _ws_messages(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert len(result["messages"]) == 1
        assert result["messages"][0]["text"] == "ch0"


# ---------------------------------------------------------------------------
# ws_nodes
# ---------------------------------------------------------------------------

class TestWsNodes:
    """Tests for ws_nodes command."""

    async def test_returns_nodes_with_favorites(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.set_favorite("!aabbccdd", True)
        store.set_ignored("!eeff0011", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/nodes"}
        await _ws_nodes(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert "!aabbccdd" in result["nodes"]
        assert "!aabbccdd" in result["favorite_nodes"]
        assert "!eeff0011" in result["ignored_nodes"]


# ---------------------------------------------------------------------------
# ws_stats
# ---------------------------------------------------------------------------

class TestWsStats:
    """Tests for ws_stats command."""

    async def test_returns_summary(self, hass: HomeAssistant, store: MeshtasticUiStore, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.add_channel_message("0", {"text": "hi"})
        store.update_node("!aa", {"name": "A"})

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/stats"}
        await _ws_stats(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert result["messages_today"] == 1
        assert result["total_nodes"] == 1
        assert result["channel_count"] == 1


# ---------------------------------------------------------------------------
# ws_get_timeseries
# ---------------------------------------------------------------------------

def _ts_blob(battery_value: float) -> dict:
    """Build a minimal per-entry 'ts' dict with one distinguishing value."""
    data = {k: deque(maxlen=TS_MAX_POINTS) for k in ("airtimeTx", "battery", "channelUtil", "packetRx", "packetTx")}
    data["battery"].append(battery_value)
    return {"data": data, "packetTypes": {}}


class TestWsGetTimeseries:
    """Tests for ws_get_timeseries command (issue #62: multi-radio regression)."""

    async def test_legacy_single_entry_returns_data(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/get_timeseries", "window": 3600}
        _ws_get_timeseries(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert result["timeseries"] is not None

    async def test_multi_radio_returns_data_for_requested_radio(self, hass: HomeAssistant):
        # New per-entry shape: hass.data[DOMAIN]["ts"] doesn't exist at the top
        # level, only nested under each entry. The old code read the top-level
        # key directly and always got None here, regardless of radio_id.
        hass.data[DOMAIN] = {
            "entries": {
                "radioA": {"ts": _ts_blob(3.3)},
                "radioB": {"ts": _ts_blob(4.4)},
            }
        }

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/get_timeseries", "radio_id": "radioB", "window": 3600}
        _ws_get_timeseries(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert result["timeseries"] is not None
        assert result["timeseries"]["battery"] == [4.4]

    async def test_multi_radio_unknown_radio_id_returns_none(self, hass: HomeAssistant):
        hass.data[DOMAIN] = {"entries": {"radioA": {"ts": _ts_blob(3.3)}}}

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/get_timeseries", "radio_id": "does_not_exist", "window": 3600}
        _ws_get_timeseries(hass, conn, msg)

        result = conn.send_result.call_args[0][1]
        assert result["timeseries"] is None


# ---------------------------------------------------------------------------
# ws_send_message
# ---------------------------------------------------------------------------

class TestWsSendMessage:
    """Tests for ws_send_message command."""

    async def test_channel_broadcast(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/send_message", "text": "hello", "channel": 0}
        await _ws_send_message(hass, conn, msg)

        mock_connection.async_send_text.assert_called_once_with(
            "hello", destination_id=None, channel_index=0, reply_id=None
        )
        conn.send_result.assert_called_once()
        result = conn.send_result.call_args[0][1]
        assert result["success"] is True

        # Should store the outgoing message
        msgs = store.get_channel_messages("0")
        assert len(msgs) == 1
        assert msgs[0]["_outgoing"] is True

    async def test_dm_message(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/send_message", "text": "hey", "to": "!aabbccdd"}
        await _ws_send_message(hass, conn, msg)

        mock_connection.async_send_text.assert_called_once_with(
            "hey", destination_id="!aabbccdd", channel_index=0, reply_id=None
        )
        msgs = store.get_dm_messages("!aabbccdd")
        assert len(msgs) == 1

    async def test_ble_send_failure_does_not_force_reconnect(self, hass: HomeAssistant, mock_connection: MagicMock, hass_data: dict):
        from custom_components.meshtastic_ui.connection import ConnectionType

        hass.data[DOMAIN] = hass_data
        mock_connection._connection_type = ConnectionType.BLE
        mock_connection.async_send_text.side_effect = TimeoutError("Timed out waiting for connection completion")
        mock_connection.async_force_reconnect = AsyncMock()

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/send_message", "text": "hello"}
        await _ws_send_message(hass, conn, msg)

        # Should send send_failed error without triggering force reconnect
        conn.send_error.assert_called_once()
        assert conn.send_error.call_args[0][1] == "send_failed"
        mock_connection.async_force_reconnect.assert_not_called()



# ---------------------------------------------------------------------------
# ws_node_admin
# ---------------------------------------------------------------------------

class TestWsNodeAdmin:
    """Tests for ws_node_admin command."""

    async def test_favorite(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "favorite"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" in store.favorite_nodes
        conn.send_result.assert_called_once()

    async def test_unfavorite(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.set_favorite("!aabbccdd", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "unfavorite"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" not in store.favorite_nodes

    async def test_ignore(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "ignore"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" in store.ignored_nodes

    async def test_remove(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        store.update_node("!aabbccdd", {"name": "Alice"})
        store.set_favorite("!aabbccdd", True)

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "remove"}
        await _ws_node_admin(hass, conn, msg)

        assert "!aabbccdd" not in store.get_nodes()
        assert "!aabbccdd" not in store.favorite_nodes

    async def test_remove_requires_admin(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection(is_admin=False)
        msg = {"id": 1, "type": "meshtastic_ui/node_admin", "node_id": "!aabbccdd", "action": "remove"}
        await _ws_node_admin(hass, conn, msg)

        conn.send_error.assert_called_once()
        assert "unauthorized" in conn.send_error.call_args[0][1]


# ---------------------------------------------------------------------------
# ws_set_notification_prefs
# ---------------------------------------------------------------------------

class TestWsSetNotificationPrefs:
    """Tests for ws_set_notification_prefs command (issue #47: HA switch entity)."""

    async def test_dispatches_prefs_signal(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        received = []
        async_dispatcher_connect(
            hass, SIGNAL_NOTIFICATION_PREFS, lambda data: received.append(data)
        )

        conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/set_notification_prefs", "enabled": True}
        await _ws_set_notification_prefs(hass, conn, msg)

        assert store.get_notification_prefs()["enabled"] is True
        assert len(received) == 1
        assert received[0]["entry_id"] == hass_data["entry_id"]

    async def test_requires_admin(self, hass: HomeAssistant, store: MeshtasticUiStore, mock_connection: MagicMock, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        conn = _make_ws_connection(is_admin=False)
        msg = {"id": 1, "type": "meshtastic_ui/set_notification_prefs", "enabled": True}
        await _ws_set_notification_prefs(hass, conn, msg)

        conn.send_error.assert_called_once()
        assert "unauthorized" in conn.send_error.call_args[0][1]


# ---------------------------------------------------------------------------
# _format_address_last4
# ---------------------------------------------------------------------------

class TestFormatAddressLast4:
    """Tests for _format_address_last4 helper."""

    def test_formats_mac_addresses(self):
        assert _format_address_last4("AA:BB:CC:DD:EE:FF") == "ee:ff"
        assert _format_address_last4("aa:bb:cc:dd:ee:ff") == "ee:ff"
        assert _format_address_last4("AA-BB-CC-DD-EE-FF") == "ee:ff"
        assert _format_address_last4("aabbccddeeff") == "ee:ff"
        assert _format_address_last4("aabb.ccdd.eeff") == "ee:ff"
        assert _format_address_last4("  AA:BB:CC:DD:EE:FF  ") == "ee:ff"
        assert _format_address_last4("6ba1b218-15a8-461f-9fa8-5dcae273eafd") == "ea:fd"
        assert _format_address_last4("6BA1B218-15A8-461F-9FA8-5DCAE273EAFD") == "ea:fd"

    def test_rejects_non_mac_addresses(self):
        assert _format_address_last4(None) is None
        assert _format_address_last4("") is None
        assert _format_address_last4("192.168.1.100") is None
        assert _format_address_last4("192.168.100.200") is None
        assert _format_address_last4("100.200.123.456") is None
        assert _format_address_last4("2001:0db8:85a3:0000:0000:8a2e:0370:7334") is None
        assert _format_address_last4("/dev/ttyUSB0") is None
        assert _format_address_last4("not-a-mac") is None
        assert _format_address_last4("ZZ:ZZ:ZZ:ZZ:ZZ:ZZ") is None


# ---------------------------------------------------------------------------
# ws_radios
# ---------------------------------------------------------------------------

class TestWsRadios:
    """Tests for ws_radios WebSocket API command."""

    async def test_legacy_format(self, hass: HomeAssistant, hass_data: dict):
        hass.data[DOMAIN] = hass_data
        ws_conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/radios"}

        await _ws_radios(hass, ws_conn, msg)

        ws_conn.send_result.assert_called_once()
        result = ws_conn.send_result.call_args[0][1]
        assert "radios" in result
        assert len(result["radios"]) == 1
        assert result["radios"][0]["radio_id"] == "_legacy"

    async def test_ble_radio(self, hass: HomeAssistant):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
            unique_id="AA:BB:CC:DD:EE:FF",
            title="Meshtastic (AA:BB:CC:DD:EE:FF)",
        )
        entry.add_to_hass(hass)

        mock_conn = MagicMock()
        mock_conn.my_info = {"user": {"longName": "Test Radio", "shortName": "TRAD"}}
        mock_conn.state = "connected"

        hass.data[DOMAIN] = {
            "entries": {
                entry.entry_id: {
                    "connection": mock_conn,
                    "config": entry.data,
                    "title": entry.title,
                }
            }
        }

        ws_conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/radios"}

        await _ws_radios(hass, ws_conn, msg)

        ws_conn.send_result.assert_called_once()
        result = ws_conn.send_result.call_args[0][1]
        assert len(result["radios"]) == 1
        radio = result["radios"][0]
        assert radio["radio_id"] == entry.entry_id
        assert radio["title"] == "Test Radio"
        assert radio["name"] == "Test Radio"
        assert radio["short_name"] == "TRAD"
        assert radio["last4"] == "ee:ff"
        assert radio["connection_type"] == "ble"
        assert radio["address"] == "AA:BB:CC:DD:EE:FF"
        assert radio["state"] == "connected"


class TestWsGateways:
    """Tests for ws_gateways WebSocket API command."""

    async def test_gateways_ble_returns_address_and_short_name(
        self, hass: HomeAssistant
    ):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
            unique_id="AA:BB:CC:DD:EE:FF",
            title="Meshtastic (AA:BB:CC:DD:EE:FF)",
        )
        entry.add_to_hass(hass)

        mock_conn = MagicMock()
        mock_conn.my_info = {
            "user": {"longName": "Test Radio", "shortName": "TRAD", "hwModel": "HELTEC_V3"},
            "num": 0x12345678,
        }
        mock_conn.metadata = {"firmwareVersion": "2.5.0"}
        mock_conn.interface = None
        mock_conn.state = "connected"

        hass.data[DOMAIN] = {
            "entries": {
                entry.entry_id: {
                    "entry_id": entry.entry_id,
                    "connection": mock_conn,
                    "config": entry.data,
                    "title": entry.title,
                }
            }
        }

        ws_conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/gateways", "radio_id": entry.entry_id}

        await _ws_gateways(hass, ws_conn, msg)

        ws_conn.send_result.assert_called_once()
        result = ws_conn.send_result.call_args[0][1]
        assert "gateways" in result
        assert len(result["gateways"]) == 1
        gw = result["gateways"][0]
        assert gw["name"] == "Test Radio"
        assert gw["short_name"] == "TRAD"
        assert gw["address"] == "AA:BB:CC:DD:EE:FF"
        assert gw["connection_type"] == "ble"
        assert gw["state"] == "connected"
        assert gw["node_id"] == "!12345678"

    async def test_gateways_tcp_returns_ip_address(self, hass: HomeAssistant):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={CONF_CONNECTION_TYPE: "tcp", "tcp_hostname": "192.0.2.1"},
            unique_id="192.0.2.1",
            title="Meshtastic 192.0.2.1",
        )
        entry.add_to_hass(hass)

        mock_conn = MagicMock()
        mock_conn.my_info = {"user": {"longName": "Router Node", "shortName": "RN"}}
        mock_conn.metadata = {}
        mock_conn.interface = None
        mock_conn.state = "connected"

        hass.data[DOMAIN] = {
            "entries": {
                entry.entry_id: {
                    "entry_id": entry.entry_id,
                    "connection": mock_conn,
                    "config": entry.data,
                    "title": entry.title,
                }
            }
        }

        ws_conn = _make_ws_connection()
        msg = {"id": 1, "type": "meshtastic_ui/gateways", "radio_id": entry.entry_id}

        await _ws_gateways(hass, ws_conn, msg)

        ws_conn.send_result.assert_called_once()
        result = ws_conn.send_result.call_args[0][1]
        gw = result["gateways"][0]
        assert gw["name"] == "Router Node"
        assert gw["short_name"] == "RN"
        assert gw["address"] == "192.0.2.1"
        assert gw["connection_type"] == "tcp"


class TestWsDisconnect:
    """Tests for ws_disconnect WebSocket API command."""

    async def test_disconnect_admin_success(self, hass: HomeAssistant):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
            unique_id="AA:BB:CC:DD:EE:FF",
            title="Meshtastic Radio",
        )
        entry.add_to_hass(hass)

        mock_conn = MagicMock()
        mock_conn.async_disconnect = AsyncMock()

        hass.data[DOMAIN] = {
            "entries": {
                entry.entry_id: {
                    "entry_id": entry.entry_id,
                    "connection": mock_conn,
                    "config": entry.data,
                    "title": entry.title,
                }
            }
        }

        ws_conn = _make_ws_connection(is_admin=True)
        msg = {"id": 1, "type": "meshtastic_ui/disconnect", "radio_id": entry.entry_id}

        await _ws_disconnect(hass, ws_conn, msg)

        mock_conn.async_disconnect.assert_awaited_once()
        ws_conn.send_result.assert_called_once_with(1, {"success": True})

    async def test_disconnect_unauthorized_non_admin(self, hass: HomeAssistant):
        ws_conn = _make_ws_connection(is_admin=False)
        msg = {"id": 1, "type": "meshtastic_ui/disconnect"}

        await _ws_disconnect(hass, ws_conn, msg)

        ws_conn.send_error.assert_called_once_with(
            1, "unauthorized", "Admin access required"
        )

    async def test_disconnect_failure_handled(self, hass: HomeAssistant):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={CONF_CONNECTION_TYPE: "tcp"},
            unique_id="192.0.2.1",
            title="Meshtastic TCP",
        )
        entry.add_to_hass(hass)

        mock_conn = MagicMock()
        mock_conn.async_disconnect = AsyncMock(side_effect=RuntimeError("GATT bus error"))

        hass.data[DOMAIN] = {
            "entries": {
                entry.entry_id: {
                    "entry_id": entry.entry_id,
                    "connection": mock_conn,
                    "config": entry.data,
                    "title": entry.title,
                }
            }
        }

        ws_conn = _make_ws_connection(is_admin=True)
        msg = {"id": 1, "type": "meshtastic_ui/disconnect", "radio_id": entry.entry_id}

        await _ws_disconnect(hass, ws_conn, msg)

        ws_conn.send_error.assert_called_once_with(
            1, "disconnect_failed", "Operation failed"
        )




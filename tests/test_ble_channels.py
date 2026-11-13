"""Tests for keeping the host adapter's Bluetooth links off busy channels."""

from __future__ import annotations

import inspect
import struct
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshtastic_ui import ble_channels
from custom_components.meshtastic_ui.ble_channels import (
    MODE_AUTO,
    MODE_MANUAL,
    MODE_OFF,
    BleChannelManager,
    WifiUnavailableError,
    auto_channels,
    ble_channel_freq,
    build_hci_command,
    channel_scores,
    channels_to_mask,
    ieee802154_channel_freq,
    mask_to_channels,
    wifi_channel_freq,
    wifi_freq_channel,
)
from custom_components.meshtastic_ui.const import CONF_BLE_ADDRESS, DOMAIN
from custom_components.meshtastic_ui.websocket_api import (
    ws_get_ble_channels,
    ws_scan_wifi,
    ws_set_ble_channels,
)


def _wifi(channel: int, strength: int | None = None) -> dict:
    return {"center": wifi_channel_freq(channel), "width": 20, "strength": strength}


class TestChannelMath:
    def test_ble_frequencies(self):
        assert [ble_channel_freq(c) for c in (0, 10, 11, 36)] == [2404, 2424, 2428, 2478]
        # Advertising channels sit between and around the data channels.
        assert [ble_channel_freq(c) for c in (37, 38, 39)] == [2402, 2426, 2480]

    def test_wifi_and_802154_frequencies(self):
        assert wifi_channel_freq(1) == 2412
        assert wifi_channel_freq(14) == 2484
        assert wifi_freq_channel(2437) == 6
        assert wifi_freq_channel(5180) is None  # 5 GHz is not our problem
        assert ieee802154_channel_freq(15) == 2425

    def test_wifi_channel_covers_about_ten_ble_channels(self):
        busy = [ch for ch, s in enumerate(channel_scores([_wifi(6)])) if s]
        assert busy == list(range(11, 21))

    def test_scores_weight_by_strength(self):
        scores = channel_scores([_wifi(1, strength=40), _wifi(1, strength=60)])
        assert scores[3] == pytest.approx(1.0)

    def test_auto_avoids_the_three_busy_wifi_channels(self):
        # The map that fixed MeCw's dropouts: Wi-Fi on 1, 6 and 10.
        assert auto_channels([_wifi(1), _wifi(6), _wifi(10)]) == [9, 10, 31, 32, 33, 34, 35, 36]

    def test_auto_keeps_every_channel_when_nothing_is_nearby(self):
        assert auto_channels([]) == list(range(37))

    def test_auto_never_drops_below_eight(self):
        occupants = [_wifi(ch) for ch in range(1, 14)]
        assert len(auto_channels(occupants)) == 8

    def test_mask_round_trip(self):
        channels = [9, 10, 31, 32, 33, 34, 35, 36]
        assert channels_to_mask(channels).hex(" ") == "00 06 00 80 1f"
        assert mask_to_channels(channels_to_mask(channels)) == channels

    def test_mask_ignores_advertising_channels(self):
        assert channels_to_mask([37, 38, 39]) == bytes(5)

    def test_hci_command_packet(self):
        pkt = build_hci_command(0x2014, bytes(5))
        assert pkt[0] == 0x01
        assert struct.unpack_from("<H", pkt, 1)[0] == 0x2014
        assert pkt[3] == 5


@pytest.fixture
def set_channels():
    with patch.object(ble_channels, "hci_set_host_channels") as mock:
        yield mock


@pytest.fixture
def no_hardware():
    with (
        patch.object(ble_channels, "hci_read_link_maps", return_value=[]),
        patch.object(ble_channels, "list_adapters", return_value=["hci0"]),
    ):
        yield


class TestManager:
    async def test_off_by_default_and_leaves_the_adapter_alone(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        await manager.async_setup()
        manager.async_teardown()
        assert manager.settings["mode"] == MODE_OFF
        set_channels.assert_not_called()

    async def test_manual_mode_applies_and_persists(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        await manager.async_update({"mode": MODE_MANUAL, "manual_channels": [36, 9, 10]})
        set_channels.assert_called_once_with("hci0", [9, 10, 36])
        assert manager.applied == [9, 10, 36]

        reloaded = BleChannelManager(hass)
        await reloaded.async_setup()
        reloaded.async_teardown()
        assert reloaded.settings["manual_channels"] == [36, 9, 10]
        assert set_channels.call_count == 2  # re-applied at startup

    async def test_manual_mode_needs_two_channels(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        with pytest.raises(ValueError):
            await manager.async_update({"mode": MODE_MANUAL, "manual_channels": [5]})
        set_channels.assert_not_called()

    async def test_auto_mode_uses_hand_entered_wifi(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        wifi = [{"ssid": "Home", "channel": ch, "width": 20} for ch in (1, 6, 10)]
        await manager.async_update({"mode": MODE_AUTO, "wifi_manual": wifi})
        set_channels.assert_called_once_with("hci0", [9, 10, 31, 32, 33, 34, 35, 36])

    async def test_switching_off_restores_every_channel(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        await manager.async_update({"mode": MODE_OFF})
        set_channels.assert_called_once_with("hci0", list(range(37)))

    async def test_failure_is_recorded_not_raised(self, hass: HomeAssistant, set_channels):
        set_channels.side_effect = OSError("adapter down")
        manager = BleChannelManager(hass)
        await manager.async_update({"mode": MODE_AUTO})
        assert manager.last_error == "adapter down"
        assert manager.applied is None

    async def test_wifi_scan_feeds_auto_mode(self, hass: HomeAssistant, set_channels):
        networks = [
            {"ssid": "A", "bssid": "x", "channel": 1, "width": 20, "strength": 90},
            {"ssid": "B", "bssid": "y", "channel": 11, "width": 20, "strength": 50},
        ]
        manager = BleChannelManager(hass)
        manager.settings["mode"] = MODE_AUTO
        with patch.object(ble_channels, "async_scan_wifi", AsyncMock(return_value=networks)):
            await manager.async_scan_wifi()
        assert manager.settings["wifi_scan"]["networks"] == networks
        applied = set_channels.call_args.args[1]
        assert 3 not in applied and 30 not in applied and 15 in applied

    async def test_reapplies_when_a_radio_connects(self, hass: HomeAssistant, set_channels):
        manager = BleChannelManager(hass)
        manager.settings["mode"] = MODE_AUTO
        manager._on_connection_state({"entry_id": "x", "state": "connected"})
        await hass.async_block_till_done()
        set_channels.assert_called_once()

    async def test_state_shape(self, hass: HomeAssistant, set_channels, no_hardware):
        manager = BleChannelManager(hass)
        state = await manager.async_state()
        assert len(state["channels"]) == 37
        assert [a["index"] for a in state["advertising"]] == [37, 38, 39]
        assert state["adapters"] == ["hci0"]
        assert state["auto_channels"] == list(range(37))


async def test_links_are_named_after_our_radio(hass: HomeAssistant, set_channels):
    """The page says which device uses a channel, not just its address."""
    hass.data[DOMAIN] = {
        "entries": {"e1": {"title": "MeCw", "config": {CONF_BLE_ADDRESS: "90:70:69:9c:55:59"}}}
    }
    links = [{"address": "90:70:69:9C:55:59", "channels": [9, 10]}]
    with (
        patch.object(ble_channels, "hci_read_link_maps", return_value=links),
        patch.object(ble_channels, "list_adapters", return_value=["hci0"]),
    ):
        state = await BleChannelManager(hass).async_state()
    assert state["links"][0]["name"] == "MeCw"


def _ws_conn(*, is_admin: bool = True) -> MagicMock:
    conn = MagicMock()
    conn.user.is_admin = is_admin
    return conn


class TestWebSocket:
    async def test_get_and_set(self, hass: HomeAssistant, set_channels, no_hardware):
        hass.data[DOMAIN] = {"entries": {}, "ble_channels": BleChannelManager(hass)}
        conn = _ws_conn()
        await inspect.unwrap(ws_set_ble_channels)(
            hass, conn, {"id": 1, "mode": MODE_MANUAL, "manual_channels": [1, 2, 3]}
        )
        state = conn.send_result.call_args.args[1]
        assert state["mode"] == MODE_MANUAL and state["applied"] == [1, 2, 3]

        await inspect.unwrap(ws_get_ble_channels)(hass, conn, {"id": 2})
        assert conn.send_result.call_args.args[1]["manual_channels"] == [1, 2, 3]

    async def test_set_rejects_a_single_channel(self, hass: HomeAssistant, set_channels):
        hass.data[DOMAIN] = {"entries": {}, "ble_channels": BleChannelManager(hass)}
        conn = _ws_conn()
        await inspect.unwrap(ws_set_ble_channels)(
            hass, conn, {"id": 1, "mode": MODE_MANUAL, "manual_channels": [4]}
        )
        assert conn.send_error.call_args.args[1] == "invalid_format"

    async def test_scan_reports_missing_wifi(self, hass: HomeAssistant):
        hass.data[DOMAIN] = {"entries": {}, "ble_channels": BleChannelManager(hass)}
        conn = _ws_conn()
        with patch.object(
            ble_channels, "async_scan_wifi", AsyncMock(side_effect=WifiUnavailableError("no Wi-Fi"))
        ):
            await inspect.unwrap(ws_scan_wifi)(hass, conn, {"id": 1})
        assert conn.send_error.call_args.args[1:] == ("wifi_unavailable", "no Wi-Fi")

    async def test_not_ready_before_setup(self, hass: HomeAssistant):
        hass.data[DOMAIN] = {"entries": {}}
        conn = _ws_conn()
        await inspect.unwrap(ws_get_ble_channels)(hass, conn, {"id": 1})
        assert conn.send_error.call_args.args[1] == "not_ready"

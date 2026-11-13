"""Tests for Bluetooth pairing helper module."""

from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from custom_components.meshtastic_ui import ble_pairing


def test_clean_mac():
    """Test MAC address normalization for BlueZ D-Bus paths."""
    assert ble_pairing._clean_mac("AA:BB:CC:DD:EE:FF") == "AA_BB_CC_DD_EE_FF"
    assert ble_pairing._clean_mac("aa:bb:cc:dd:ee:ff") == "AA_BB_CC_DD_EE_FF"
    assert ble_pairing._clean_mac("aa-bb-cc-dd-ee-ff") == "AA_BB_CC_DD_EE_FF"
    assert ble_pairing._clean_mac("  AA:BB:CC:DD:EE:FF  ") == "AA_BB_CC_DD_EE_FF"


def test_get_unique_agent_path():
    """Test generating unique D-Bus agent object paths."""
    path1 = ble_pairing._get_unique_agent_path()
    path2 = ble_pairing._get_unique_agent_path()
    assert path1.startswith("/io/homeassistant/meshtastic_ui/agent_")
    assert path2.startswith("/io/homeassistant/meshtastic_ui/agent_")
    assert path1 != path2


@pytest.mark.asyncio
async def test_async_pair_device_with_pin():
    """Test async_pair_device_with_pin returns None."""
    result = await ble_pairing.async_pair_device_with_pin(None, "AA:BB:CC:DD:EE:FF", "123456")
    assert result is None


@pytest.mark.asyncio
async def test_async_pair_and_trust_device():
    """Test async_pair_and_trust_device delegates properly."""
    result = await ble_pairing.async_pair_and_trust_device("AA:BB:CC:DD:EE:FF", "123456")
    assert result is None


@pytest.mark.asyncio
async def test_async_is_device_bonded_dbus_unavailable():
    """Test async_is_device_bonded when dbus_fast is unavailable."""
    with patch.object(ble_pairing, "DBUS_FAST_AVAILABLE", False):
        bonded = await ble_pairing.async_is_device_bonded("AA:BB:CC:DD:EE:FF")
        assert bonded is False


@pytest.mark.asyncio
async def test_async_pair_bleak_client_dbus_unavailable():
    """Test async_pair_bleak_client when dbus_fast is unavailable returns True."""
    mock_client = MagicMock()
    with patch.object(ble_pairing, "DBUS_FAST_AVAILABLE", False):
        success = await ble_pairing.async_pair_bleak_client(mock_client, "AA:BB:CC:DD:EE:FF", "123456")
        assert success is True


@pytest.mark.asyncio
async def test_async_pair_bleak_client_already_bonded():
    """Test async_pair_bleak_client when device is already bonded."""
    mock_client = MagicMock()
    with patch.object(ble_pairing, "DBUS_FAST_AVAILABLE", True), \
         patch.object(ble_pairing, "async_is_device_bonded", AsyncMock(return_value=True)):
        success = await ble_pairing.async_pair_bleak_client(mock_client, "AA:BB:CC:DD:EE:FF", "123456")
        assert success is True
        mock_client.pair.assert_not_called()


def test_bluez_adapter_from_ble_device():
    """Local adapter sightings carry a BlueZ path; proxy sightings don't."""
    from types import SimpleNamespace
    local = SimpleNamespace(details={"path": "/org/bluez/hci1/dev_AA_BB_CC_DD_EE_FF"})
    proxy = SimpleNamespace(details={"source": "esphome-proxy", "address_type": 0})
    assert ble_pairing.bluez_adapter_from_ble_device(local) == "hci1"
    assert ble_pairing.bluez_adapter_from_ble_device(proxy) is None
    assert ble_pairing.bluez_adapter_from_ble_device(SimpleNamespace(details=None)) is None


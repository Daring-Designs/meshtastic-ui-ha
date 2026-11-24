"""Tests for Meshtastic UI config flow."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from home_assistant_bluetooth import BluetoothServiceInfoBleak
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshtastic_ui.const import (
    CONF_BLE_ADDRESS,
    CONF_BLE_PIN,
    CONF_CONNECTION_TYPE,
    CONF_ENABLE_BLUETOOTH,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_BLE_PIN,
    DEFAULT_TCP_PORT,
    DOMAIN,
)


@pytest.fixture(autouse=True)
def mock_setup_entry():
    """Mock async_setup_entry to prevent running real connection setup during config flow tests."""
    with patch(
        "custom_components.meshtastic_ui.async_setup_entry",
        return_value=True,
    ):
        yield


async def test_user_step_shows_form(hass: HomeAssistant):
    """Test the initial user step shows connection type selector."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"


async def test_tcp_step_success(hass: HomeAssistant):
    """Test TCP step with valid input creates config entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        return_value="!aabbccdd",
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        assert result["step_id"] == "tcp"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        assert result["data"][CONF_CONNECTION_TYPE] == "tcp"
        assert result["data"][CONF_TCP_HOSTNAME] == "192.168.1.100"
        assert result["data"][CONF_TCP_PORT] == DEFAULT_TCP_PORT


async def test_tcp_step_failure(hass: HomeAssistant):
    """Test TCP step shows error on connection failure."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        side_effect=Exception("Connection refused"),
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["errors"]["base"] == "cannot_connect"


async def test_serial_step_success(hass: HomeAssistant):
    """Test serial step with valid input creates config entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    with (
        patch(
            "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_serial_connection"
        ),
        patch(
            "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._find_serial_ports",
            return_value=["/dev/ttyUSB0"],
        ),
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "serial"},
        )
        assert result["step_id"] == "serial"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_SERIAL_DEV_PATH: "/dev/ttyUSB0"},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        assert result["data"][CONF_CONNECTION_TYPE] == "serial"
        assert result["data"][CONF_SERIAL_DEV_PATH] == "/dev/ttyUSB0"


async def test_serial_step_failure(hass: HomeAssistant):
    """Test serial step shows error on connection failure."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    with (
        patch(
            "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_serial_connection",
            side_effect=Exception("Device not found"),
        ),
        patch(
            "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._find_serial_ports",
            return_value=[],
        ),
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "serial"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_SERIAL_DEV_PATH: "/dev/ttyUSB0"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["errors"]["base"] == "cannot_connect"


async def test_duplicate_tcp_aborts(hass: HomeAssistant):
    """Test adding the same TCP host twice aborts as already_configured."""
    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        return_value="!aabbccdd",
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY

        result2 = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result2 = await hass.config_entries.flow.async_configure(
            result2["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result2 = await hass.config_entries.flow.async_configure(
            result2["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result2["type"] is FlowResultType.ABORT
        assert result2["reason"] == "already_configured"


async def test_tcp_entry_keyed_on_node_id(hass: HomeAssistant):
    """Test a TCP entry's unique_id is the radio's node ID, not its IP."""
    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        return_value="!aabbccdd",
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.unique_id == "!aabbccdd"


async def test_readd_after_ip_change_updates_host(hass: HomeAssistant):
    """Test re-adding the same radio at a new IP updates the existing entry."""
    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        return_value="!aabbccdd",
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY

        # Same radio, new DHCP address.
        result2 = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result2 = await hass.config_entries.flow.async_configure(
            result2["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result2 = await hass.config_entries.flow.async_configure(
            result2["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.200", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result2["type"] is FlowResultType.ABORT
        assert result2["reason"] == "already_configured"

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.data[CONF_TCP_HOSTNAME] == "192.168.1.200"


async def test_zeroconf_rediscovery_updates_host(hass: HomeAssistant):
    """Test zeroconf discovery at a new IP updates the existing entry's host."""
    from ipaddress import ip_address

    from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection",
        return_value="!aabbccdd",
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "tcp"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_TCP_HOSTNAME: "192.168.1.100", CONF_TCP_PORT: DEFAULT_TCP_PORT},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY

    discovery = ZeroconfServiceInfo(
        ip_address=ip_address("192.168.1.200"),
        ip_addresses=[ip_address("192.168.1.200")],
        hostname="meshtastic-ccdd.local.",
        name="Meshtastic-ccdd._meshtastic._tcp.local.",
        port=DEFAULT_TCP_PORT,
        properties={"id": "!aabbccdd", "shortname": "CCDD"},
        type="_meshtastic._tcp.local.",
    )
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_ZEROCONF},
        data=discovery,
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.data[CONF_TCP_HOSTNAME] == "192.168.1.200"


async def test_ble_step_user_selection(hass: HomeAssistant):
    """Test user selecting a discovered BLE device."""
    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._get_discovered_ble_devices",
        return_value={"AA:BB:CC:DD:EE:FF": "Meshtastic_aabb (AA:BB:CC:DD:EE:FF)"},
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        assert result["type"] is FlowResultType.FORM

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "ble"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "ble"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "ble_pin"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_PIN: "123456"},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        assert result["data"][CONF_CONNECTION_TYPE] == "ble"
        assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
        assert result["data"][CONF_BLE_PIN] == "123456"


def test_get_discovered_ble_devices_filtering(hass: HomeAssistant):
    """Test _get_discovered_ble_devices filters by service UUID and name."""
    import sys
    from custom_components.meshtastic_ui.config_flow import MeshtasticUiConfigFlow

    flow = MeshtasticUiConfigFlow()
    flow.hass = hass

    mesh_device = MagicMock()
    mesh_device.address = "AA:BB:CC:DD:EE:FF"
    mesh_device.name = "Meshtastic_aabb"
    mesh_device.service_uuids = ["6ba1b218-15a8-461f-9fa8-5dcae273eafd"]

    uuid_device = MagicMock()
    uuid_device.address = "11:22:33:44:55:66"
    uuid_device.name = "Unknown"
    uuid_device.service_uuids = ["6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"]

    legacy_uuid_device = MagicMock()
    legacy_uuid_device.address = "22:33:44:55:66:77"
    legacy_uuid_device.name = "MeRt_1230"
    legacy_uuid_device.service_uuids = ["e0820f56-3400-0000-0000-0000003fccbb"]

    other_device = MagicMock()
    other_device.address = "00:11:22:33:44:55"
    other_device.name = "Other Device"
    other_device.service_uuids = ["0000180d-0000-1000-8000-00805f9b34fb"]

    mock_bt = MagicMock()
    mock_bt.async_discovered_service_info.return_value = [mesh_device, uuid_device, legacy_uuid_device, other_device]

    with patch.dict(sys.modules, {"homeassistant.components.bluetooth": mock_bt}):
        devices = flow._get_discovered_ble_devices()
        assert "AA:BB:CC:DD:EE:FF" in devices
        assert "11:22:33:44:55:66" in devices
        assert "22:33:44:55:66:77" in devices
        assert devices["22:33:44:55:66:77"] == "MeRt (22:33:44:55:66:77)"
        assert "00:11:22:33:44:55" not in devices

        # Test BlueZ cache augmentation when HA only cached truncated 'Me'
        uuid_device.name = "Me"
        devices_augmented = flow._get_discovered_ble_devices(
            bluez_names={
                "11:22:33:44:55:66": "MeCw_5558",
                "33:44:55:66:77:88": "MeEx_9999",  # BlueZ-only device not in HA in-memory scanner
            }
        )
        assert devices_augmented["11:22:33:44:55:66"] == "MeCw (11:22:33:44:55:66)"
        assert "33:44:55:66:77:88" in devices_augmented
        assert devices_augmented["33:44:55:66:77:88"] == "MeEx (33:44:55:66:77:88)"


async def test_async_bleak_scan_filtering(hass: HomeAssistant):
    """Test _async_bleak_scan filters discover results by UUID and name."""
    import sys
    from custom_components.meshtastic_ui.config_flow import MeshtasticUiConfigFlow

    flow = MeshtasticUiConfigFlow()
    flow.hass = hass

    mesh_dev = MagicMock()
    mesh_dev.address = "AA:BB:CC:DD:EE:FF"
    mesh_dev.name = "Meshtastic 1234"
    mesh_dev.metadata = {"uuids": []}

    uuid_dev = MagicMock()
    uuid_dev.address = "11:22:33:44:55:66"
    uuid_dev.name = None
    uuid_dev.metadata = {"uuids": ["6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"]}

    other_dev = MagicMock()
    other_dev.address = "00:11:22:33:44:55"
    other_dev.name = "Smart Bulb"
    other_dev.metadata = {"uuids": ["1234"]}

    mock_scanner = MagicMock()
    mock_scanner.discover = AsyncMock(return_value=[mesh_dev, uuid_dev, other_dev])

    with patch("bleak.BleakScanner.discover", mock_scanner.discover):
        devices = await flow._async_bleak_scan()
        assert "AA:BB:CC:DD:EE:FF" in devices
        assert "11:22:33:44:55:66" in devices
        assert "00:11:22:33:44:55" not in devices


async def test_ble_step_live_scan(hass: HomeAssistant):
    """Test user triggering a live BLE scan."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    assert result["step_id"] == "ble"

    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._async_bleak_scan",
        return_value={"AA:BB:CC:DD:EE:FF": "Meshtastic (AA:BB:CC:DD:EE:FF)"},
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_ADDRESS: "scan"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "ble_scan"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "ble_pin"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_PIN: "123456"},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        assert result["data"][CONF_CONNECTION_TYPE] == "ble"
        assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
        assert result["data"][CONF_BLE_PIN] == "123456"


async def test_ble_step_manual_entry(hass: HomeAssistant):
    """Test user entering MAC address manually."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    assert result["step_id"] == "ble"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "aa:bb:cc:dd:ee:ff"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_CONNECTION_TYPE] == "ble"
    assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
    assert result["data"][CONF_BLE_PIN] == "123456"


async def test_ble_manual_entry_invalid(hass: HomeAssistant):
    """Test invalid MAC address in manual entry displays error."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "not-a-mac-address"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"]["base"] == "cannot_connect"


async def test_bluetooth_auto_discovery_confirm(hass: HomeAssistant):
    """Test Home Assistant Bluetooth auto-discovery confirmation."""
    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "AA:BB:CC:DD:EE:FF"
    mock_service_info.name = "Meshtastic_aabb"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "bluetooth_confirm"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_CONNECTION_TYPE] == "ble"
    assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
    assert result["data"][CONF_BLE_PIN] == "123456"
    assert result["result"].unique_id == "AA:BB:CC:DD:EE:FF"


async def test_bluetooth_auto_discovery_already_configured(hass: HomeAssistant):
    """Test duplicate Bluetooth discovery aborts if already configured."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        unique_id="AA:BB:CC:DD:EE:FF",
    )
    entry.add_to_hass(hass)

    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "AA:BB:CC:DD:EE:FF"
    mock_service_info.name = "Meshtastic_aabb"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_bluetooth_disabled_abort(hass: HomeAssistant):
    """Test Bluetooth discovery and BLE step abort when Bluetooth is disabled."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "tcp", CONF_TCP_HOSTNAME: "192.168.1.100"},
        options={CONF_ENABLE_BLUETOOTH: False},
    )
    entry.add_to_hass(hass)

    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "AA:BB:CC:DD:EE:FF"
    mock_service_info.name = "Meshtastic_aabb"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "bluetooth_disabled"

    result2 = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result2 = await hass.config_entries.flow.async_configure(
        result2["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    assert result2["type"] is FlowResultType.ABORT
    assert result2["reason"] == "bluetooth_disabled"


async def test_options_flow_toggle(hass: HomeAssistant):
    """Test toggling bluetooth in options flow."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "tcp", CONF_TCP_HOSTNAME: "192.168.1.100"},
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_ENABLE_BLUETOOTH: False},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_ENABLE_BLUETOOTH] is False


async def test_async_bleak_scan_advertisement_data_structure(hass: HomeAssistant):
    """Test _async_bleak_scan parses dict of (BLEDevice, AdvertisementData) tuples."""
    from bleak.backends.device import BLEDevice
    from bleak.backends.scanner import AdvertisementData
    from custom_components.meshtastic_ui.config_flow import MeshtasticUiConfigFlow

    flow = MeshtasticUiConfigFlow()
    flow.hass = hass

    custom_dev = BLEDevice("aa-bb-cc-dd-ee-ff", "CustomNode", None)
    custom_adv = AdvertisementData(
        local_name="CustomNode",
        manufacturer_data={},
        service_data={},
        service_uuids=["6ba1b218-15a8-461f-9fa8-5dcae273eafd"],
        tx_power=0,
        rssi=-60,
        platform_data=(),
    )

    other_dev = BLEDevice("00:11:22:33:44:55", "Sensor", None)
    other_adv = AdvertisementData(
        local_name="Sensor",
        manufacturer_data={},
        service_data={},
        service_uuids=["0000180d-0000-1000-8000-00805f9b34fb"],
        tx_power=0,
        rssi=-80,
        platform_data=(),
    )

    mock_return = {
        "aa-bb-cc-dd-ee-ff": (custom_dev, custom_adv),
        "00:11:22:33:44:55": (other_dev, other_adv),
    }

    with patch("bleak.BleakScanner.discover", new=AsyncMock(return_value=mock_return)):
        devices = await flow._async_bleak_scan()
        assert "AA:BB:CC:DD:EE:FF" in devices
        assert "00:11:22:33:44:55" not in devices
        assert devices["AA:BB:CC:DD:EE:FF"] == "CustomNode (AA:BB:CC:DD:EE:FF)"


async def test_ble_user_selection_already_configured(hass: HomeAssistant):
    """Test user selecting a BLE device that is already configured aborts."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        unique_id="AA:BB:CC:DD:EE:FF",
    )
    entry.add_to_hass(hass)

    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._get_discovered_ble_devices",
        return_value={"AA:BB:CC:DD:EE:FF": "Meshtastic (AA:BB:CC:DD:EE:FF)"},
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "ble"},
        )
        assert result["step_id"] == "ble"

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        )
        assert result["type"] is FlowResultType.ABORT
        assert result["reason"] == "already_configured"


async def test_ble_manual_entry_already_configured(hass: HomeAssistant):
    """Test user manually entering a MAC that is already configured aborts even with hyphens."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        unique_id="AA:BB:CC:DD:EE:FF",
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "aa-bb-cc-dd-ee-ff"},
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_bluetooth_auto_discovery_case_insensitive(hass: HomeAssistant):
    """Test Bluetooth auto-discovery aborts when address matches case-insensitively."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_CONNECTION_TYPE: "ble", CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        unique_id="AA:BB:CC:DD:EE:FF",
    )
    entry.add_to_hass(hass)

    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "aa:bb:cc:dd:ee:ff"
    mock_service_info.name = "Meshtastic_aabb"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_ble_step_manual_entry_bare_hex(hass: HomeAssistant):
    """Test manual entry accepts 12-char bare hex MAC and normalizes to colon format."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "aabbccddeeff"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_CONNECTION_TYPE] == "ble"
    assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
    assert result["data"][CONF_BLE_PIN] == "123456"


async def test_ble_step_manual_entry_cisco_dot(hass: HomeAssistant):
    """Test manual entry accepts Cisco 3-group dot notation and normalizes."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "aabb.ccdd.eeff"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_CONNECTION_TYPE] == "ble"
    assert result["data"][CONF_BLE_ADDRESS] == "AA:BB:CC:DD:EE:FF"
    assert result["data"][CONF_BLE_PIN] == "123456"


async def test_ble_step_manual_entry_uuid(hass: HomeAssistant):
    """Test manual entry accepts 128-bit CoreBluetooth UUID and normalizes to uppercase."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "6ba1b218-15a8-461f-9fa8-5dcae273eafd"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_CONNECTION_TYPE] == "ble"
    assert result["data"][CONF_BLE_ADDRESS] == "6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"
    assert result["data"][CONF_BLE_PIN] == "123456"
    assert result["result"].unique_id == "6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"


async def test_bluetooth_auto_discovery_uuid(hass: HomeAssistant):
    """Test Bluetooth auto-discovery normalizes CoreBluetooth UUID to uppercase."""
    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "6ba1b218-15a8-461f-9fa8-5dcae273eafd"
    mock_service_info.name = "Meshtastic_aabb"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "bluetooth_confirm"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_BLE_ADDRESS] == "6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"
    assert result["data"][CONF_BLE_PIN] == "123456"
    assert result["result"].unique_id == "6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"


async def test_ble_step_manual_entry_rejects_ipv4(hass: HomeAssistant):
    """Test manual entry rejects 12-char IPv4 addresses."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "192.168.100.200"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"]["base"] == "cannot_connect"


async def test_ble_step_manual_entry_none_value(hass: HomeAssistant):
    """Test manual entry handles None value without raising an exception."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CONNECTION_TYPE: "ble"},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: "manual"},
    )
    assert result["step_id"] == "ble_manual"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_ADDRESS: None},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"]["base"] == "cannot_connect"


async def test_bluetooth_auto_discovery_no_name_uses_mac_in_title(hass: HomeAssistant):
    """Test Bluetooth auto-discovery falls back to MAC address in entry title when radio has no name."""
    mock_service_info = MagicMock(spec=BluetoothServiceInfoBleak)
    mock_service_info.address = "AA:BB:CC:DD:EE:FF"
    mock_service_info.name = "Meshtastic"

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_BLUETOOTH},
        data=mock_service_info,
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "bluetooth_confirm"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ble_pin"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BLE_PIN: "123456"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["result"].title == "Meshtastic (AA:BB:CC:DD:EE:FF)"
    assert result["data"][CONF_BLE_PIN] == "123456"


def test_is_valid_ble_address_helper():
    """Test _is_valid_ble_address rejects non-MAC inputs and handles None/empty."""
    from custom_components.meshtastic_ui.config_flow import _is_valid_ble_address, _normalize_ble_address

    assert _is_valid_ble_address(None) is False
    assert _is_valid_ble_address("") is False
    assert _is_valid_ble_address("192.168.100.200") is False
    assert _is_valid_ble_address("100.200.123.456") is False
    assert _is_valid_ble_address("AA:BB:CC:DD:EE:FF") is True
    assert _is_valid_ble_address("aa-bb-cc-dd-ee-ff") is True
    assert _is_valid_ble_address("aabb.ccdd.eeff") is True
    assert _is_valid_ble_address("aabbccddeeff") is True
    assert _is_valid_ble_address("6ba1b218-15a8-461f-9fa8-5dcae273eafd") is True

    assert _normalize_ble_address(None) == ""
    assert _normalize_ble_address("") == ""
    assert _normalize_ble_address("192.168.100.200") == "192.168.100.200"
    assert _normalize_ble_address("aabbccddeeff") == "AA:BB:CC:DD:EE:FF"




def test_extract_ble_short_name_and_label_formatting():
    """Test _extract_ble_short_name extracts short name from various BLE broadcast names."""
    from custom_components.meshtastic_ui.config_flow import (
        _extract_ble_short_name,
        _format_ble_device_label,
    )

    # Standard Meshtastic pattern: <ShortName>_<last4>
    assert _extract_ble_short_name("MeCw_5558") == "MeCw"
    assert _extract_ble_short_name("MeRt_1230") == "MeRt"

    # Default unconfigured pattern: Meshtastic_<last4>
    assert _extract_ble_short_name("Meshtastic_1230") == "1230"
    assert _extract_ble_short_name("Meshtastic_aabb") == "aabb"

    # Custom direct short name
    assert _extract_ble_short_name("NATE") == "NATE"
    assert _extract_ble_short_name("CustomNode") == "CustomNode"

    # Ignored fallback names and truncated legacy fragments
    assert _extract_ble_short_name(None) is None
    assert _extract_ble_short_name("") is None
    assert _extract_ble_short_name("Unknown") is None
    assert _extract_ble_short_name("Meshtastic") is None
    assert _extract_ble_short_name("AA-BB-CC-DD-EE-FF") is None
    assert _extract_ble_short_name("AA:BB:CC:DD:EE:FF") is None
    assert _extract_ble_short_name("Me") is None
    assert _extract_ble_short_name("M") is None
    assert _extract_ble_short_name("me") is None
    assert _extract_ble_short_name("ME") is None

    # Label formatting with Short Name
    label, short_name = _format_ble_device_label("MeCw_5558", "AA:BB:CC:DD:EE:FF")
    assert label == "MeCw (AA:BB:CC:DD:EE:FF)"
    assert short_name == "MeCw"

    # Label formatting with fallback
    label, short_name = _format_ble_device_label(None, "AA:BB:CC:DD:EE:FF")
    assert label == "Meshtastic (AA:BB:CC:DD:EE:FF)"
    assert short_name is None


async def test_ble_pin_validation_and_errors(hass: HomeAssistant):
    """Test validation of Bluetooth pairing PIN (rejects non-6-digit, handles pairing failure)."""
    with patch(
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._get_discovered_ble_devices",
        return_value={"AA:BB:CC:DD:EE:FF": "MeCw (AA:BB:CC:DD:EE:FF)"},
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CONNECTION_TYPE: "ble"},
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "ble_pin"

        # Invalid PIN: 5 digits
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_PIN: "12345"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["errors"][CONF_BLE_PIN] == "invalid_pin"

        # Invalid PIN: non-digits
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_BLE_PIN: "abcdef"},
        )
        assert result["type"] is FlowResultType.FORM
        assert result["errors"][CONF_BLE_PIN] == "invalid_pin"

        # Pairing failure from BlueZ
        with patch(
            "custom_components.meshtastic_ui.config_flow.async_submit_pairing_pin",
            return_value="pairing_failed",
        ):
            result = await hass.config_entries.flow.async_configure(
                result["flow_id"],
                {CONF_BLE_PIN: "123456"},
            )
            assert result["type"] is FlowResultType.FORM
            assert result["errors"]["base"] == "pairing_failed"


async def test_options_flow_ble_pin_update(hass: HomeAssistant):
    """Test updating pairing PIN in options flow for a BLE entry."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_CONNECTION_TYPE: "ble",
            CONF_BLE_ADDRESS: "AA:BB:CC:DD:EE:FF",
            CONF_BLE_PIN: "123456",
        },
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"

    # Submit invalid PIN
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_ENABLE_BLUETOOTH: True, CONF_BLE_PIN: "999"},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"][CONF_BLE_PIN] == "invalid_pin"

    # Submit valid updated PIN
    with patch(
        "custom_components.meshtastic_ui.config_flow.async_pair_and_trust_device",
        return_value=None,
    ) as mock_pair:
        result = await hass.config_entries.options.async_configure(
            result["flow_id"],
            {CONF_ENABLE_BLUETOOTH: True, CONF_BLE_PIN: "654321"},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        mock_pair.assert_called_once_with("AA:BB:CC:DD:EE:FF", "654321")

"""Config flow for Meshtastic UI."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components.bluetooth import (
    BluetoothServiceInfoBleak,
    async_discovered_service_info,
)
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import (
    CONF_BLE_ADDRESS,
    CONF_BLE_PIN,
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
    MESHTASTIC_BLE_SERVICE_UUID,
)

_LOGGER = logging.getLogger(__name__)

MANUAL_ENTRY = "manual"


def _resolve_ble_name(info: BluetoothServiceInfoBleak) -> str:
    """Pick a human-readable name for a discovered BLE device.

    bleak reports the address as `name` when no local_name is advertised — fall
    back through the advertisement data before giving up on a generic label.
    """
    candidates = [
        info.name,
        getattr(info, "advertisement", None) and info.advertisement.local_name,
    ]
    address_upper = info.address.upper()
    for candidate in candidates:
        if candidate and candidate.upper() != address_upper:
            return candidate
    return "Meshtastic Radio"


class MeshtasticUiConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow for Meshtastic UI integration."""

    VERSION = 2

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._connection_type: str | None = None
        self._discovered_address: str | None = None
        self._discovered_name: str | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 1: Choose connection type."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            self._connection_type = user_input[CONF_CONNECTION_TYPE]
            if self._connection_type == "tcp":
                return await self.async_step_tcp()
            if self._connection_type == "serial":
                return await self.async_step_serial()
            if self._connection_type == "ble":
                return await self.async_step_ble()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_CONNECTION_TYPE, default="tcp"): vol.In(
                        {
                            "tcp": "TCP/IP (network)",
                            "serial": "Serial (USB)",
                            "ble": "Bluetooth (BLE)",
                        }
                    ),
                }
            ),
        )

    async def async_step_bluetooth(
        self, discovery_info: BluetoothServiceInfoBleak
    ) -> ConfigFlowResult:
        """Handle Bluetooth discovery of a Meshtastic device."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        self._discovered_address = discovery_info.address
        self._discovered_name = _resolve_ble_name(discovery_info)

        self.context["title_placeholders"] = {
            "name": self._discovered_name,
            "address": self._discovered_address,
        }

        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm Bluetooth discovery."""
        errors: dict[str, str] = {}

        if user_input is not None:
            pin = (user_input.get(CONF_BLE_PIN) or "").strip()
            if pin and not pin.isdigit():
                errors[CONF_BLE_PIN] = "invalid_pin"
            else:
                data: dict[str, Any] = {
                    CONF_CONNECTION_TYPE: "ble",
                    CONF_BLE_ADDRESS: self._discovered_address,
                }
                if pin:
                    data[CONF_BLE_PIN] = pin
                return self.async_create_entry(
                    title=f"Meshtastic (BLE {self._discovered_name})",
                    data=data,
                )

        return self.async_show_form(
            step_id="bluetooth_confirm",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_BLE_PIN, default=""): str,
                }
            ),
            description_placeholders={
                "name": self._discovered_name,
                "address": self._discovered_address,
            },
            errors=errors,
        )

    async def async_step_tcp(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 2a: TCP connection details."""
        errors: dict[str, str] = {}

        if user_input is not None:
            hostname = user_input[CONF_TCP_HOSTNAME]
            port = user_input.get(CONF_TCP_PORT, DEFAULT_TCP_PORT)

            error = await self._async_validate_tcp(hostname, port)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=f"Meshtastic ({hostname})",
                    data={
                        CONF_CONNECTION_TYPE: "tcp",
                        CONF_TCP_HOSTNAME: hostname,
                        CONF_TCP_PORT: port,
                    },
                )

        return self.async_show_form(
            step_id="tcp",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TCP_HOSTNAME): str,
                    vol.Optional(CONF_TCP_PORT, default=DEFAULT_TCP_PORT): int,
                }
            ),
            errors=errors,
        )

    async def async_step_serial(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 2b: Serial connection details."""
        errors: dict[str, str] = {}

        if user_input is not None:
            dev_path = user_input[CONF_SERIAL_DEV_PATH]

            error = await self._async_validate_serial(dev_path)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=f"Meshtastic ({dev_path})",
                    data={
                        CONF_CONNECTION_TYPE: "serial",
                        CONF_SERIAL_DEV_PATH: dev_path,
                    },
                )

        # Try to auto-detect serial ports.
        suggested = await self._async_detect_serial_ports()

        return self.async_show_form(
            step_id="serial",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_SERIAL_DEV_PATH,
                        default=suggested,
                    ): str,
                }
            ),
            errors=errors,
        )

    async def async_step_ble(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 2c: BLE connection details with discovered device picker."""
        errors: dict[str, str] = {}

        if user_input is not None:
            address = user_input[CONF_BLE_ADDRESS]
            if address == MANUAL_ENTRY:
                return await self.async_step_ble_manual()

            error = await self._async_validate_ble(address)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=f"Meshtastic (BLE {address})",
                    data={
                        CONF_CONNECTION_TYPE: "ble",
                        CONF_BLE_ADDRESS: address,
                    },
                )

        # List every nearby BLE device. Some Meshtastic hardware (e.g. nRF52
        # Wio Tracker) omits the service UUID from its primary advert, so
        # filtering on the UUID alone hides them. We validate the device is
        # actually Meshtastic on connect by inspecting the GATT service table.
        known: dict[str, str] = {}
        other: dict[str, str] = {}
        for info in async_discovered_service_info(self.hass):
            is_meshtastic = MESHTASTIC_BLE_SERVICE_UUID in [
                str(u) for u in info.service_uuids
            ]
            display_name = info.name or "Unknown"
            label = f"{display_name} ({info.address})"
            if is_meshtastic:
                known[info.address] = f"✓ {label}"
            else:
                other[info.address] = label

        devices = {**known, **other}

        if devices:
            devices[MANUAL_ENTRY] = "Enter address manually..."
            return self.async_show_form(
                step_id="ble",
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_BLE_ADDRESS): vol.In(devices),
                    }
                ),
                errors=errors,
            )

        # No discovered devices — fall through to manual entry.
        return await self.async_step_ble_manual()

    async def async_step_ble_manual(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manual BLE address entry (fallback when no devices discovered)."""
        errors: dict[str, str] = {}

        if user_input is not None:
            address = user_input[CONF_BLE_ADDRESS]

            error = await self._async_validate_ble(address)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=f"Meshtastic (BLE {address})",
                    data={
                        CONF_CONNECTION_TYPE: "ble",
                        CONF_BLE_ADDRESS: address,
                    },
                )

        return self.async_show_form(
            step_id="ble_manual",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BLE_ADDRESS): str,
                }
            ),
            errors=errors,
        )

    async def _async_validate_tcp(self, hostname: str, port: int) -> str | None:
        """Test a TCP connection. Returns error key or None on success."""
        try:
            await self.hass.async_add_executor_job(
                self._test_tcp_connection, hostname, port
            )
        except Exception as err:
            _LOGGER.debug("TCP validation failed: %s", err)
            return "cannot_connect"
        return None

    async def _async_validate_serial(self, dev_path: str) -> str | None:
        """Test a serial connection. Returns error key or None on success."""
        try:
            await self.hass.async_add_executor_job(
                self._test_serial_connection, dev_path
            )
        except Exception as err:
            _LOGGER.debug("Serial validation failed: %s", err)
            return "cannot_connect"
        return None

    async def _async_validate_ble(self, address: str) -> str | None:
        """Validate a BLE device through HA's bluetooth stack.

        Connects, inspects the GATT service table for the Meshtastic service
        UUID, and disconnects. Avoids relying on advertisement data (which
        some hardware truncates) and works through ESPHome bluetooth proxies.
        """
        from bleak import BleakClient
        from bleak_retry_connector import establish_connection
        from homeassistant.components.bluetooth import (
            async_ble_device_from_address,
        )

        ble_device = async_ble_device_from_address(
            self.hass, address, connectable=True
        )
        if ble_device is None:
            return "ble_unreachable"

        client: BleakClient | None = None
        try:
            client = await establish_connection(BleakClient, ble_device, address)
            uuids = {
                str(char_service.uuid).lower()
                for char_service in client.services
            }
            if MESHTASTIC_BLE_SERVICE_UUID.lower() not in uuids:
                return "not_meshtastic"
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("BLE validation failed for %s: %s", address, err)
            return "cannot_connect"
        finally:
            if client is not None and client.is_connected:
                try:
                    await client.disconnect()
                except Exception:  # noqa: BLE001
                    pass
        return None

    @staticmethod
    def _test_tcp_connection(hostname: str, port: int) -> None:
        """Try connecting via TCP (runs in executor)."""
        from meshtastic.tcp_interface import TCPInterface

        iface = TCPInterface(hostname=hostname, portNumber=port)
        iface.close()

    @staticmethod
    def _test_serial_connection(dev_path: str) -> None:
        """Try connecting via serial (runs in executor)."""
        from meshtastic.serial_interface import SerialInterface

        iface = SerialInterface(devPath=dev_path)
        iface.close()

    async def _async_detect_serial_ports(self) -> str:
        """Auto-detect Meshtastic serial ports."""
        try:
            ports = await self.hass.async_add_executor_job(self._find_serial_ports)
            if ports:
                return ports[0]
        except Exception:  # noqa: BLE001
            pass
        return "/dev/ttyUSB0"

    @staticmethod
    def _find_serial_ports() -> list[str]:
        """Find Meshtastic serial ports (runs in executor)."""
        from meshtastic.util import findPorts

        return findPorts()

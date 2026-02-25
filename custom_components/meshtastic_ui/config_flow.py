"""Config flow for Meshtastic UI."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow

from .const import (
    CONF_BLE_ADDRESS,
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class MeshtasticUiConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow for Meshtastic UI integration."""

    VERSION = 2

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._connection_type: str | None = None

    async def async_step_user(self, user_input=None):
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

    async def async_step_tcp(self, user_input=None):
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

    async def async_step_serial(self, user_input=None):
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

        # Try to auto-detect serial ports
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

    async def async_step_ble(self, user_input=None):
        """Step 2c: BLE connection details."""
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
            step_id="ble",
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
        """Test a BLE connection. Returns error key or None on success."""
        try:
            await self.hass.async_add_executor_job(
                self._test_ble_connection, address
            )
        except Exception as err:
            _LOGGER.debug("BLE validation failed: %s", err)
            return "cannot_connect"
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

    @staticmethod
    def _test_ble_connection(address: str) -> None:
        """Try connecting via BLE (runs in executor)."""
        from meshtastic.ble_interface import BLEInterface

        iface = BLEInterface(address=address)
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

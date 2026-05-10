"""Config flow for Meshtastic UI."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from .const import (
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
        self._discovered_name: str | None = None
        self._discovered_host: str | None = None
        self._discovered_port: int | None = None
        self._proxy_entry_id: str | None = None
        self._proxy_title: str | None = None
        self._proxy_port: int | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 1: Choose connection type."""
        if user_input is not None:
            self._connection_type = user_input[CONF_CONNECTION_TYPE]
            if self._connection_type == "tcp":
                return await self.async_step_tcp()
            if self._connection_type == "serial":
                return await self.async_step_serial()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_CONNECTION_TYPE, default="tcp"): vol.In(
                        {
                            "tcp": "TCP/IP (network)",
                            "serial": "Serial (USB)",
                        }
                    ),
                }
            ),
        )

    async def async_step_zeroconf(
        self, discovery_info: ZeroconfServiceInfo
    ) -> ConfigFlowResult:
        """Handle mDNS/zeroconf discovery of a Meshtastic radio."""
        host = discovery_info.host
        await self.async_set_unique_id(f"tcp:{host}")
        self._abort_if_unique_id_configured()
        if discovery_info.type == "_meshtastic._tcp.local.":
            port = discovery_info.port or DEFAULT_TCP_PORT
        else:
            port = DEFAULT_TCP_PORT

        self._discovered_host = host
        self._discovered_port = port
        self._discovered_name = (
            discovery_info.name.split(".")[0] if discovery_info.name else host
        )

        self.context["title_placeholders"] = {
            "name": self._discovered_name,
            "address": f"{host}:{port}",
        }

        return await self.async_step_zeroconf_confirm()

    async def async_step_zeroconf_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm zeroconf discovery."""
        errors: dict[str, str] = {}

        if user_input is not None:
            error = await self._async_validate_tcp(
                self._discovered_host, self._discovered_port
            )
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=f"Meshtastic ({self._discovered_host})",
                    data={
                        CONF_CONNECTION_TYPE: "tcp",
                        CONF_TCP_HOSTNAME: self._discovered_host,
                        CONF_TCP_PORT: self._discovered_port,
                    },
                )

        return self.async_show_form(
            step_id="zeroconf_confirm",
            description_placeholders={
                "name": self._discovered_name,
                "host": self._discovered_host,
                "port": str(self._discovered_port),
            },
            errors=errors,
        )

    async def async_step_integration_discovery(
        self, discovery_info: dict[str, Any]
    ) -> ConfigFlowResult:
        """Handle discovery of a meshtastic integration TCP proxy."""
        self._proxy_entry_id = discovery_info["entry_id"]
        self._proxy_title = discovery_info["title"]
        self._proxy_port = discovery_info["port"]

        await self.async_set_unique_id(f"proxy:{self._proxy_entry_id}")
        self._abort_if_unique_id_configured()

        self.context["title_placeholders"] = {
            "name": self._proxy_title,
            "address": f"127.0.0.1:{self._proxy_port}",
        }

        return await self.async_step_integration_discovery_confirm()

    async def async_step_integration_discovery_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm setting up via the meshtastic integration proxy."""
        if user_input is not None:
            return self.async_create_entry(
                title=f"Meshtastic ({self._proxy_title} proxy)",
                data={
                    CONF_CONNECTION_TYPE: "tcp",
                    CONF_TCP_HOSTNAME: "127.0.0.1",
                    CONF_TCP_PORT: self._proxy_port,
                },
            )

        return self.async_show_form(
            step_id="integration_discovery_confirm",
            description_placeholders={
                "name": self._proxy_title,
                "port": str(self._proxy_port),
            },
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
                await self.async_set_unique_id(f"tcp:{hostname}")
                self._abort_if_unique_id_configured()
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
                await self.async_set_unique_id(f"serial:{dev_path}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"Meshtastic ({dev_path})",
                    data={
                        CONF_CONNECTION_TYPE: "serial",
                        CONF_SERIAL_DEV_PATH: dev_path,
                    },
                )

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

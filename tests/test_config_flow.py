"""Tests for Meshtastic UI config flow."""

from __future__ import annotations

from unittest.mock import patch

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.meshtastic_ui.const import (
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
)


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
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection"
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
        "custom_components.meshtastic_ui.config_flow.MeshtasticUiConfigFlow._test_tcp_connection"
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

"""Config flow for Meshtastic UI."""

from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from home_assistant_bluetooth import BluetoothServiceInfoBleak
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from .const import (
    CONF_BLE_ADDRESS,
    CONF_BLE_PIN,
    CONF_CONNECTION_TYPE,
    CONF_ENABLE_BLUETOOTH,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_BLE_PIN,
    DEFAULT_ENABLE_BLUETOOTH,
    DEFAULT_TCP_PORT,
    DOMAIN,
    KNOWN_MESHTASTIC_BLE_SERVICE_UUIDS,
    MESHTASTIC_BLE_SERVICE_UUID,
)
from .ble_pairing import (
    async_pair_and_trust_device,
    async_start_proactive_pairing,
    async_submit_pairing_pin,
)

_LOGGER = logging.getLogger(__name__)

_NODE_ID_RE = re.compile(r"![0-9a-fA-F]{8}")
_PIN_RE = re.compile(r"^\d{6}$")
_MAC_COLON_RE = re.compile(r"^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$")
_MAC_HYPHEN_RE = re.compile(r"^([0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2}$")
_MAC_DOT_RE = re.compile(r"^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$")
_MAC_BARE_RE = re.compile(r"^[0-9a-fA-F]{12}$")
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _is_valid_ble_address(address: str | None) -> bool:
    """Check if address is a valid MAC address (colon/hyphen/dot/bare hex) or UUID."""
    if not address:
        return False
    cleaned = address.strip()
    return bool(
        _UUID_RE.match(cleaned)
        or _MAC_COLON_RE.match(cleaned)
        or _MAC_HYPHEN_RE.match(cleaned)
        or _MAC_DOT_RE.match(cleaned)
        or _MAC_BARE_RE.match(cleaned)
    )


def _normalize_ble_address(address: str | None) -> str:
    """Normalize BLE address to standard uppercase format (colon-separated MAC or UUID)."""
    if not address:
        return ""
    cleaned = address.strip()
    if _UUID_RE.match(cleaned):
        return cleaned.upper()
    if (
        _MAC_COLON_RE.match(cleaned)
        or _MAC_HYPHEN_RE.match(cleaned)
        or _MAC_DOT_RE.match(cleaned)
        or _MAC_BARE_RE.match(cleaned)
    ):
        hex_only = cleaned.replace(":", "").replace("-", "").replace(".", "")
        return ":".join(hex_only[i : i + 2].upper() for i in range(0, 12, 2))
    return cleaned


def _node_id_from_properties(properties: dict[str, Any] | None) -> str | None:
    """Extract the radio's node ID (!hex) from mDNS TXT records, if advertised."""
    raw = (properties or {}).get("id")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    if _NODE_ID_RE.fullmatch(raw):
        return raw.lower()
    return None


def _extract_ble_short_name(raw_name: str | None) -> str | None:
    """Extract Meshtastic 4-character short name from BLE advertised name.

    Meshtastic advertises either '<ShortName>_<last4>' (e.g. 'MeCw_5558', 'MeRt_1230')
    or 'Meshtastic_<last4>' (e.g. 'Meshtastic_1230').
    """
    if not raw_name or not isinstance(raw_name, str):
        return None
    name = raw_name.strip()
    if not name or name.lower() in ("unknown", "meshtastic"):
        return None
    # If formatted as a MAC address (e.g. 'AA:BB:CC:DD:EE:FF' or 'AA-BB-...'), not a short name
    if re.match(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$", name):
        return None
    if "_" in name:
        prefix, suffix = name.split("_", 1)
        if prefix.lower() == "meshtastic":
            return suffix or None
        if len(prefix) > 0:
            return prefix
    # 1-2 character fragment (e.g. 'Me' from truncated ADV_IND packet) is not a short name
    if len(name) <= 2 or name.lower() == "me":
        return None
    return name


async def _async_get_bluez_names() -> dict[str, str]:
    """Retrieve device names directly from BlueZ D-Bus cache if available on Linux."""
    names: dict[str, str] = {}
    try:
        import asyncio
        from dbus_fast import BusType
        from dbus_fast.aio import MessageBus
        from dbus_fast.constants import MessageType
        from dbus_fast.message import Message

        bus = await asyncio.wait_for(
            MessageBus(bus_type=BusType.SYSTEM).connect(),
            timeout=2.0,
        )
        try:
            reply = await asyncio.wait_for(
                bus.call(
                    Message(
                        destination="org.bluez",
                        path="/",
                        interface="org.freedesktop.DBus.ObjectManager",
                        member="GetManagedObjects",
                    )
                ),
                timeout=2.0,
            )
            if reply.message_type == MessageType.METHOD_RETURN and reply.body:
                managed_objects = reply.body[0]
                for path_str, interfaces in managed_objects.items():
                    dev_props = interfaces.get("org.bluez.Device1")
                    if dev_props and isinstance(dev_props, dict):
                        addr_var = dev_props.get("Address")
                        name_var = dev_props.get("Name") or dev_props.get("Alias")
                        addr = addr_var.value if hasattr(addr_var, "value") else addr_var
                        name = name_var.value if hasattr(name_var, "value") else name_var
                        if addr and name and isinstance(addr, str) and isinstance(name, str):
                            norm_addr = _normalize_ble_address(addr)
                            names[norm_addr] = name.strip()
            _LOGGER.debug("BlueZ D-Bus returned %d devices: %s", len(names), names)
        finally:
            bus.disconnect()
    except Exception as err:
        _LOGGER.debug("Could not query BlueZ D-Bus: %s", err)
    return names


def _format_ble_device_label(name: str | None, address: str) -> tuple[str, str | None]:
    """Format dropdown label with Short Name and MAC address.

    Returns (label, short_name).
    """
    norm_addr = _normalize_ble_address(address)
    short_name = _extract_ble_short_name(name)
    if short_name:
        return f"{short_name} ({norm_addr})", short_name
    return f"Meshtastic ({norm_addr})", None


_MESHTASTIC_NAME_RE = re.compile(r"^(meshtastic|[^\s_]{1,4})_[0-9a-fA-F]{4}$", re.IGNORECASE)


def _is_meshtastic_device(
    uuids: list[str] | None, candidates: list[Any]
) -> tuple[bool, str | None]:
    """Determine if a BLE device is a Meshtastic radio and pick best candidate name."""
    valid_candidates = [
        c.strip() for c in candidates if isinstance(c, str) and c.strip()
    ]
    uuids_lower = {str(u).lower() for u in (uuids or [])}
    known_uuids_lower = {u.lower() for u in KNOWN_MESHTASTIC_BLE_SERVICE_UUIDS}

    has_meshtastic_uuid = bool(uuids_lower & known_uuids_lower)
    has_meshtastic_keyword = any("meshtastic" in c.lower() for c in valid_candidates)
    has_meshtastic_name_pattern = any(_MESHTASTIC_NAME_RE.match(c) for c in valid_candidates)

    is_meshtastic = has_meshtastic_uuid or has_meshtastic_keyword or has_meshtastic_name_pattern
    if not is_meshtastic:
        return False, None

    # Pick the best candidate name
    best_candidate: str | None = None
    for cand in valid_candidates:
        short = _extract_ble_short_name(cand)
        if short:
            best_candidate = cand
            break

    if not best_candidate and valid_candidates:
        best_candidate = valid_candidates[0]

    return True, best_candidate


class MeshtasticUiConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow for Meshtastic UI integration."""

    VERSION = 2

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._connection_type: str | None = None
        self._discovered_name: str | None = None
        self._discovered_host: str | None = None
        self._discovered_port: int | None = None
        self._discovered_address: str | None = None
        self._discovered_short_names: dict[str, str] = {}
        self._validated_node_id: str | None = None
        self._ble_address: str | None = None
        self._ble_title: str | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 1: Choose connection type."""
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

    async def async_step_zeroconf(
        self, discovery_info: ZeroconfServiceInfo
    ) -> ConfigFlowResult:
        """Handle mDNS/zeroconf discovery of a Meshtastic radio."""
        host = discovery_info.host
        if discovery_info.type == "_meshtastic._tcp.local.":
            port = discovery_info.port or DEFAULT_TCP_PORT
        else:
            port = DEFAULT_TCP_PORT

        # Prefer the stable node ID from TXT records (newer firmware) over
        # the IP so a DHCP address change updates the existing entry instead
        # of rediscovering the radio as a new device.
        node_id = _node_id_from_properties(discovery_info.properties)
        await self.async_set_unique_id(node_id or f"tcp:{host}")
        self._abort_if_unique_id_configured(
            updates={CONF_TCP_HOSTNAME: host, CONF_TCP_PORT: port}
        )

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
                # Older firmware doesn't advertise its node ID over mDNS;
                # validation just learned it, so re-key before creating.
                if self._validated_node_id:
                    await self.async_set_unique_id(self._validated_node_id)
                    self._abort_if_unique_id_configured(
                        updates={
                            CONF_TCP_HOSTNAME: self._discovered_host,
                            CONF_TCP_PORT: self._discovered_port,
                        }
                    )
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
                await self.async_set_unique_id(
                    self._validated_node_id or f"tcp:{hostname}"
                )
                self._abort_if_unique_id_configured(
                    updates={CONF_TCP_HOSTNAME: hostname, CONF_TCP_PORT: port}
                )
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
        """Test a TCP connection. Returns error key or None on success.

        On success, stashes the radio's node ID in self._validated_node_id
        (None if the radio didn't report one).
        """
        try:
            self._validated_node_id = await self.hass.async_add_executor_job(
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
    def _test_tcp_connection(hostname: str, port: int) -> str | None:
        """Try connecting via TCP (runs in executor).

        Returns the radio's node ID (!hex) when available so the entry can
        be keyed on it instead of the (DHCP-changeable) IP address.
        """
        from meshtastic.tcp_interface import TCPInterface

        iface = TCPInterface(hostname=hostname, portNumber=port)
        try:
            node_num = getattr(iface.myInfo, "my_node_num", None)
        finally:
            iface.close()
        return f"!{node_num:08x}" if node_num is not None else None

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

    def _is_bluetooth_enabled(self) -> bool:
        """Check if Bluetooth discovery and scanning is enabled in options."""
        for entry in self._async_current_entries():
            if not entry.options.get(
                CONF_ENABLE_BLUETOOTH,
                entry.data.get(CONF_ENABLE_BLUETOOTH, DEFAULT_ENABLE_BLUETOOTH),
            ):
                return False
        return True

    async def _async_get_discovered_ble_devices(self) -> dict[str, str]:
        """Get Meshtastic BLE devices discovered by HA, augmented by BlueZ D-Bus."""
        bluez_names = await _async_get_bluez_names()
        return self._get_discovered_ble_devices(bluez_names)

    def _get_discovered_ble_devices(
        self, bluez_names: dict[str, str] | None = None
    ) -> dict[str, str]:
        """Get Meshtastic BLE devices already discovered by Home Assistant or BlueZ."""
        devices: dict[str, str] = {}
        bz_names = bluez_names or {}
        seen_addresses: set[str] = set()

        try:
            from homeassistant.components.bluetooth import (
                async_discovered_service_info,
            )

            service_infos = async_discovered_service_info(self.hass, connectable=True)
            for info in service_infos:
                uuids = [u.lower() for u in (info.service_uuids or [])]
                norm_addr = _normalize_ble_address(info.address)
                seen_addresses.add(norm_addr)

                dev = getattr(info, "device", None)
                adv = getattr(info, "advertisement", None)
                details = getattr(dev, "details", None)
                props = details.get("props") if isinstance(details, dict) else {}

                candidates = [
                    bz_names.get(norm_addr),
                    props.get("Name") if isinstance(props, dict) else None,
                    props.get("Alias") if isinstance(props, dict) else None,
                    getattr(info, "name", None),
                    getattr(adv, "local_name", None),
                    getattr(dev, "name", None),
                ]

                is_msh, best_name = _is_meshtastic_device(uuids, candidates)
                _LOGGER.debug("Candidates for %s: %s (best_name=%s)", norm_addr, candidates, best_name)
                if is_msh:
                    label, short_name = _format_ble_device_label(best_name, norm_addr)
                    if short_name:
                        self._discovered_short_names[norm_addr] = short_name
                    devices[norm_addr] = label

        except Exception as err:
            _LOGGER.debug("Error getting discovered Bluetooth devices: %s", err)

        # Merge known devices from Linux BlueZ D-Bus that may not be in HA's
        # in-memory scanner history yet (e.g. directly after Core restart)
        try:
            for bz_addr, bz_name in bz_names.items():
                if bz_addr in seen_addresses:
                    continue
                is_msh, best_name = _is_meshtastic_device([], [bz_name])
                if is_msh:
                    label, short_name = _format_ble_device_label(best_name, bz_addr)
                    if short_name:
                        self._discovered_short_names[bz_addr] = short_name
                    devices[bz_addr] = label
        except Exception as err:
            _LOGGER.debug("Error merging BlueZ devices: %s", err)

        return devices

    async def _async_bleak_scan(self) -> dict[str, str]:
        """Perform on-demand active scan (~10s) using HA scanner or Bleak fallback."""
        devices: dict[str, str] = {}
        try:
            bluez_names = await _async_get_bluez_names()
            discovered = None

            try:
                from homeassistant.components import bluetooth
                scanner = bluetooth.async_get_scanner(self.hass)
                if scanner and hasattr(scanner, "discover"):
                    discovered = await scanner.discover(timeout=10.0, return_adv=True)
            except Exception as scan_err:
                _LOGGER.debug("HA async_get_scanner failed: %s, falling back to BleakScanner", scan_err)

            if discovered is None:
                from bleak import BleakScanner
                discovered = await BleakScanner.discover(timeout=10.0, return_adv=True)
            items = discovered.values() if isinstance(discovered, dict) else discovered
            for item in items:
                if isinstance(item, tuple) and len(item) == 2:
                    d, adv = item
                    raw_uuids = getattr(adv, "service_uuids", [])
                    raw_name = getattr(adv, "local_name", None) or getattr(d, "name", None) or ""
                    address = getattr(d, "address", "")
                    details = getattr(d, "details", None)
                else:
                    d = item
                    address = getattr(d, "address", "")
                    raw_name = getattr(d, "name", "")
                    details = getattr(d, "details", None)
                    raw_uuids = []
                    if hasattr(d, "metadata") and isinstance(d.metadata, dict):
                        raw_uuids = d.metadata.get("uuids", [])
                    elif hasattr(d, "service_uuids"):
                        raw_uuids = d.service_uuids

                norm_addr = _normalize_ble_address(address)
                props = details.get("props") if isinstance(details, dict) else {}

                candidates = [
                    bluez_names.get(norm_addr),
                    props.get("Name") if isinstance(props, dict) else None,
                    props.get("Alias") if isinstance(props, dict) else None,
                    raw_name,
                ]

                is_msh, best_name = _is_meshtastic_device(raw_uuids, candidates)
                if is_msh:
                    label, short_name = _format_ble_device_label(best_name, norm_addr)
                    if short_name:
                        self._discovered_short_names[norm_addr] = short_name
                    devices[norm_addr] = label
        except Exception as err:
            _LOGGER.debug("Bleak active scan failed: %s", err)
        return devices

    def _abort_in_progress_matching_flows(self, unique_id: str) -> None:
        """Abort any other in-progress flows matching this unique ID (e.g. background discovery flows)."""
        for flow in self._async_in_progress(include_uninitialized=True):
            flow_id = flow.get("flow_id") if isinstance(flow, dict) else getattr(flow, "flow_id", None)
            flow_unique_id = (
                flow.get("unique_id")
                if isinstance(flow, dict)
                else getattr(flow, "unique_id", None)
            )
            if flow_id and flow_id != self.flow_id and flow_unique_id == unique_id:
                try:
                    self.hass.config_entries.flow.async_abort(flow_id)
                except Exception:
                    pass

    async def async_step_ble(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 2c: Choose BLE device from discovered list, or trigger scan/manual."""
        if not self._is_bluetooth_enabled():
            return self.async_abort(reason="bluetooth_disabled")

        errors: dict[str, str] = {}

        if user_input is not None:
            address = user_input.get(CONF_BLE_ADDRESS)
            if address == "scan":
                return await self.async_step_ble_scan()
            if address == "manual":
                return await self.async_step_ble_manual()

            if address:
                norm_addr = _normalize_ble_address(address)
                self._abort_in_progress_matching_flows(norm_addr)
                await self.async_set_unique_id(norm_addr, raise_on_progress=False)
                self._abort_if_unique_id_configured()
                short_name = self._discovered_short_names.get(norm_addr)
                if not short_name:
                    bluez_names = await _async_get_bluez_names()
                    short_name = _extract_ble_short_name(bluez_names.get(norm_addr))
                title = f"Meshtastic {short_name} ({norm_addr})" if short_name else f"Meshtastic ({norm_addr})"
                self._ble_address = norm_addr
                self._ble_title = title
                self._discovered_name = short_name or "Meshtastic"
                await async_start_proactive_pairing(norm_addr, hass=self.hass)
                return await self.async_step_ble_pin()

        discovered = await self._async_get_discovered_ble_devices()
        options = dict(discovered)
        options["scan"] = "Scan for nearby radios..."
        options["manual"] = "Enter MAC address manually..."

        return self.async_show_form(
            step_id="ble",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BLE_ADDRESS): vol.In(options),
                }
            ),
            errors=errors,
        )

    async def async_step_ble_scan(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Active on-demand Bleak scan (~10s)."""
        if not self._is_bluetooth_enabled():
            return self.async_abort(reason="bluetooth_disabled")

        errors: dict[str, str] = {}

        if user_input is not None:
            address = user_input.get(CONF_BLE_ADDRESS)
            if address == "scan":
                return await self.async_step_ble_scan()
            if address == "manual":
                return await self.async_step_ble_manual()

            if address:
                norm_addr = _normalize_ble_address(address)
                self._abort_in_progress_matching_flows(norm_addr)
                await self.async_set_unique_id(norm_addr, raise_on_progress=False)
                self._abort_if_unique_id_configured()
                short_name = self._discovered_short_names.get(norm_addr)
                if not short_name:
                    bluez_names = await _async_get_bluez_names()
                    short_name = _extract_ble_short_name(bluez_names.get(norm_addr))
                title = f"Meshtastic {short_name} ({norm_addr})" if short_name else f"Meshtastic ({norm_addr})"
                self._ble_address = norm_addr
                self._ble_title = title
                self._discovered_name = short_name or "Meshtastic"
                await async_start_proactive_pairing(norm_addr, hass=self.hass)
                return await self.async_step_ble_pin()

        discovered = await self._async_bleak_scan()
        options = dict(discovered)
        options["scan"] = "Scan again..."
        options["manual"] = "Enter MAC address manually..."

        return self.async_show_form(
            step_id="ble_scan",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BLE_ADDRESS): vol.In(options),
                }
            ),
            errors=errors,
        )

    async def async_step_ble_manual(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manual MAC address entry fallback."""
        if not self._is_bluetooth_enabled():
            return self.async_abort(reason="bluetooth_disabled")

        errors: dict[str, str] = {}

        if user_input is not None:
            raw_addr = (user_input.get(CONF_BLE_ADDRESS) or "").strip()
            if not raw_addr or not _is_valid_ble_address(raw_addr):
                errors["base"] = "cannot_connect"
            else:
                norm_addr = _normalize_ble_address(raw_addr)
                self._abort_in_progress_matching_flows(norm_addr)
                await self.async_set_unique_id(norm_addr, raise_on_progress=False)
                self._abort_if_unique_id_configured()
                short_name = self._discovered_short_names.get(norm_addr)
                if not short_name:
                    bluez_names = await _async_get_bluez_names()
                    short_name = _extract_ble_short_name(bluez_names.get(norm_addr))
                title = f"Meshtastic {short_name} ({norm_addr})" if short_name else f"Meshtastic ({norm_addr})"
                self._ble_address = norm_addr
                self._ble_title = title
                self._discovered_name = short_name or "Meshtastic"
                await async_start_proactive_pairing(norm_addr, hass=self.hass)
                return await self.async_step_ble_pin()

        return self.async_show_form(
            step_id="ble_manual",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BLE_ADDRESS): vol.Any(str, None),
                }
            ),
            errors=errors,
        )

    async def async_step_bluetooth(
        self, discovery_info: BluetoothServiceInfoBleak
    ) -> ConfigFlowResult:
        """Handle Home Assistant Bluetooth auto-discovery."""
        if not self._is_bluetooth_enabled():
            return self.async_abort(reason="bluetooth_disabled")

        address = _normalize_ble_address(discovery_info.address)
        await self.async_set_unique_id(address)
        self._abort_if_unique_id_configured()

        bluez_names = await _async_get_bluez_names()
        cand_name = bluez_names.get(address)

        raw_name = (
            (cand_name if cand_name and _extract_ble_short_name(cand_name) else None)
            or discovery_info.name
            or getattr(getattr(discovery_info, "advertisement", None), "local_name", None)
            or getattr(getattr(discovery_info, "device", None), "name", None)
            or "Meshtastic"
        )
        short_name = _extract_ble_short_name(raw_name)
        if short_name:
            self._discovered_short_names[address] = short_name
            disp_name = f"{short_name} ({raw_name})" if short_name != raw_name else short_name
        else:
            disp_name = raw_name

        self._discovered_address = address
        self._discovered_name = disp_name

        self.context["title_placeholders"] = {
            "name": self._discovered_name,
            "address": self._discovered_address,
        }

        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm bluetooth auto-discovery."""
        if user_input is not None:
            norm_addr = _normalize_ble_address(self._discovered_address)
            self._abort_in_progress_matching_flows(norm_addr)
            await self.async_set_unique_id(norm_addr, raise_on_progress=False)
            self._abort_if_unique_id_configured()
            short_name = self._discovered_short_names.get(norm_addr)
            if short_name:
                title = f"Meshtastic {short_name} ({norm_addr})"
            else:
                title_name = (
                    self._discovered_name
                    if (self._discovered_name and self._discovered_name.strip().lower() != "meshtastic")
                    else norm_addr
                )
                title = f"Meshtastic ({title_name})"
            self._ble_address = norm_addr
            self._ble_title = title
            await async_start_proactive_pairing(norm_addr, hass=self.hass)
            return await self.async_step_ble_pin()

        self._set_confirm_only()
        return self.async_show_form(
            step_id="bluetooth_confirm",
            description_placeholders={
                "name": self._discovered_name or "Meshtastic",
                "address": self._discovered_address,
            },
        )

    async def async_step_ble_pin(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 3c: Bluetooth Pairing PIN entry."""
        errors: dict[str, str] = {}

        if user_input is not None:
            pin = str(user_input.get(CONF_BLE_PIN, "")).strip()
            if not _PIN_RE.fullmatch(pin):
                errors[CONF_BLE_PIN] = "invalid_pin"
            else:
                pair_err = await async_submit_pairing_pin(self._ble_address, pin, hass=self.hass)
                if pair_err:
                    errors["base"] = pair_err
                else:
                    return self.async_create_entry(
                        title=self._ble_title or f"Meshtastic ({self._ble_address})",
                        data={
                            CONF_CONNECTION_TYPE: "ble",
                            CONF_BLE_ADDRESS: self._ble_address,
                            CONF_BLE_PIN: pin,
                        },
                    )

        return self.async_show_form(
            step_id="ble_pin",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BLE_PIN, default=DEFAULT_BLE_PIN): str,
                }
            ),
            description_placeholders={
                "name": self._discovered_name or "Meshtastic",
                "address": self._ble_address or "",
            },
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> OptionsFlow:
        """Get the options flow for this handler."""
        return MeshtasticUiOptionsFlowHandler(config_entry)


class MeshtasticUiOptionsFlowHandler(OptionsFlow):
    """Handle options flow for Meshtastic UI."""

    def __init__(self, config_entry: ConfigEntry | None = None) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    @property
    def _entry(self) -> ConfigEntry:
        """Return config entry."""
        if self._config_entry is not None:
            return self._config_entry
        return self.config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage options."""
        entry = self._entry
        is_ble = entry.data.get(CONF_CONNECTION_TYPE) == "ble"

        if user_input is not None:
            if is_ble and CONF_BLE_PIN in user_input:
                new_pin = str(user_input[CONF_BLE_PIN]).strip()
                if not _PIN_RE.fullmatch(new_pin):
                    return self.async_show_form(
                        step_id="init",
                        data_schema=self._get_options_schema(is_ble),
                        errors={CONF_BLE_PIN: "invalid_pin"},
                    )
                ble_addr = entry.data.get(CONF_BLE_ADDRESS)
                if ble_addr:
                    await async_pair_and_trust_device(ble_addr, new_pin)
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=self._get_options_schema(is_ble),
        )

    def _get_options_schema(self, is_ble: bool) -> vol.Schema:
        """Construct schema for options form."""
        entry = self._entry
        current_bt = entry.options.get(
            CONF_ENABLE_BLUETOOTH,
            entry.data.get(CONF_ENABLE_BLUETOOTH, DEFAULT_ENABLE_BLUETOOTH),
        )
        schema_dict: dict[Any, Any] = {
            vol.Required(CONF_ENABLE_BLUETOOTH, default=current_bt): bool,
        }
        if is_ble:
            current_pin = entry.options.get(
                CONF_BLE_PIN,
                entry.data.get(CONF_BLE_PIN, DEFAULT_BLE_PIN),
            )
            schema_dict[vol.Required(CONF_BLE_PIN, default=current_pin)] = str
        return vol.Schema(schema_dict)

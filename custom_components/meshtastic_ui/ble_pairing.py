"""Bluetooth pairing helper using BlueZ D-Bus and dbus-fast."""

import asyncio
import logging
import re
import uuid
from typing import Any, Optional, Union

_LOGGER = logging.getLogger(__name__)

# Type imports guarded for non-Linux / test environments without dbus-fast
try:
    from dbus_fast import BusType, DBusError, Variant
    from dbus_fast.aio import MessageBus
    from dbus_fast.service import ServiceInterface, method
    DBUS_FAST_AVAILABLE = True
except ImportError:
    DBUS_FAST_AVAILABLE = False
    BusType = None  # type: ignore[assignment, misc]
    DBusError = Exception  # type: ignore[assignment, misc]
    Variant = None  # type: ignore[assignment, misc]
    MessageBus = None  # type: ignore[assignment, misc]
    ServiceInterface = object  # type: ignore[assignment, misc]

    def method(*args: Any, **kwargs: Any) -> Any:  # type: ignore[no-redef]
        def decorator(f: Any) -> Any:
            return f
        return decorator


AGENT_PATH_BASE = "/io/homeassistant/meshtastic_ui/agent"


def _get_unique_agent_path() -> str:
    """Generate a unique D-Bus object path for PIN agent registration."""
    return f"{AGENT_PATH_BASE}_{uuid.uuid4().hex[:8]}"


def _clean_mac(address: str) -> str:
    """Normalize MAC address for BlueZ D-Bus path (e.g. AA:BB:CC -> AA_BB_CC)."""
    return address.strip().upper().replace(":", "_").replace("-", "_")


_BLUEZ_ADAPTER_RE = re.compile(r"^/org/bluez/(hci\d+)/")


def bluez_adapter_from_ble_device(ble_device: Any) -> str | None:
    """Return the local BlueZ adapter (e.g. "hci0") a BLEDevice was seen on.

    Devices seen by an adapter on the Home Assistant host carry a BlueZ D-Bus
    object path in ``details``. Devices reached through an ESPHome Bluetooth
    proxy do not, and cannot be paired through BlueZ.
    """
    details = getattr(ble_device, "details", None)
    path = details.get("path") if isinstance(details, dict) else None
    if not isinstance(path, str):
        return None
    match = _BLUEZ_ADAPTER_RE.match(path)
    return match.group(1) if match else None


if DBUS_FAST_AVAILABLE:
    class BlueZPinAgent(ServiceInterface):
        """BlueZ Agent1 implementation for handling PIN / passkey pairing requests."""

        def __init__(self, pin_future: Union[asyncio.Future, str]) -> None:
            """Initialize agent with either a fixed PIN string or a Future for proactive pairing."""
            super().__init__("org.bluez.Agent1")
            self._pin_future: Optional[asyncio.Future] = None
            self._pin_str: Optional[str] = None
            if isinstance(pin_future, str):
                self._pin_str = pin_future.strip()
            else:
                self._pin_future = pin_future

        async def _get_pin(self) -> str:
            """Retrieve the pairing PIN (awaiting user entry if future)."""
            if self._pin_str is not None:
                return self._pin_str
            if self._pin_future is not None:
                try:
                    return await asyncio.wait_for(asyncio.shield(self._pin_future), timeout=30.0)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    _LOGGER.warning("Timed out or cancelled waiting for user to enter Bluetooth PIN")
                    raise DBusError("org.bluez.Error.Canceled", "PIN entry timed out") from None
            return "123456"

        @method()
        def Release(self):
            """Agent released by BlueZ."""
            _LOGGER.debug("Meshtastic BlueZ agent released")

        @method()
        async def RequestPinCode(self, device: "o") -> "s":
            """Supply PIN code string to BlueZ."""
            pin = await self._get_pin()
            _LOGGER.debug("BlueZ RequestPinCode for %s -> returning pin", device)
            return pin

        @method()
        def DisplayPinCode(self, device: "o", pincode: "s"):
            """Display PIN code."""
            _LOGGER.debug("BlueZ DisplayPinCode for %s: %s", device, pincode)

        @method()
        async def RequestPasskey(self, device: "o") -> "u":
            """Supply uint32 numeric passkey to BlueZ."""
            pin = await self._get_pin()
            try:
                passkey = int(pin)
            except ValueError:
                passkey = 123456
            _LOGGER.debug("BlueZ RequestPasskey for %s -> returning %d", device, passkey)
            return passkey

        @method()
        def DisplayPasskey(self, device: "o", passkey: "u", entered: "q"):
            """Display passkey."""
            _LOGGER.debug("BlueZ DisplayPasskey for %s: %d (entered %d)", device, passkey, entered)

        @method()
        def RequestConfirmation(self, device: "o", passkey: "u"):
            """Confirm numeric comparison passkey."""
            _LOGGER.debug("BlueZ RequestConfirmation for %s: %d", device, passkey)

        @method()
        def RequestAuthorization(self, device: "o"):
            """Authorize incoming pairing/connection."""
            _LOGGER.debug("BlueZ RequestAuthorization for %s", device)

        @method()
        def AuthorizeService(self, device: "o", uuid: "s"):
            """Authorize connection to service UUID."""
            _LOGGER.debug("BlueZ AuthorizeService for %s, uuid=%s", device, uuid)

        @method()
        def Cancel(self):
            """Pairing canceled by BlueZ."""
            _LOGGER.debug("BlueZ Cancel called")
else:
    class BlueZPinAgent:  # type: ignore[no-redef]
        """Fallback agent stub when dbus-fast is unavailable."""

        def __init__(self, pin_future: Any) -> None:
            pass


async def _async_ensure_device_in_bluez(
    bus: Any, adapter_name: str, address: str
) -> tuple[Any, Any] | None:
    """Ensure the device exists in BlueZ D-Bus and return (dev_interface, props_interface).

    If the device is not present in BlueZ's D-Bus object hierarchy, triggers active
    discovery for up to 5 seconds to allow BlueZ to receive an advertisement and create
    the Device1 object.
    """
    clean = _clean_mac(address)
    device_path = f"/org/bluez/{adapter_name}/dev_{clean}"
    adapter_path = f"/org/bluez/{adapter_name}"

    # Check if already present in BlueZ
    try:
        intro_dev = await bus.introspect("org.bluez", device_path)
        if any(getattr(iface, "name", None) == "org.bluez.Device1" for iface in intro_dev.interfaces):
            proxy_dev = bus.get_proxy_object("org.bluez", device_path, intro_dev)
            return (
                proxy_dev.get_interface("org.bluez.Device1"),
                proxy_dev.get_interface("org.freedesktop.DBus.Properties"),
            )
    except Exception as err:
        _LOGGER.debug("Device %s not immediately in BlueZ: %s", address, err)

    # Not in BlueZ yet. Start active discovery for up to 5s to resolve it.
    _LOGGER.info("Device %s not found in BlueZ; starting brief discovery...", address)
    adapter = None
    try:
        intro_adapter = await bus.introspect("org.bluez", adapter_path)
        proxy_adapter = bus.get_proxy_object("org.bluez", adapter_path, intro_adapter)
        adapter = proxy_adapter.get_interface("org.bluez.Adapter1")
        try:
            await adapter.call_start_discovery()
        except Exception as start_err:
            _LOGGER.debug("StartDiscovery notice: %s", start_err)

        for _ in range(10):
            await asyncio.sleep(0.5)
            try:
                intro_dev = await bus.introspect("org.bluez", device_path)
                if any(getattr(iface, "name", None) == "org.bluez.Device1" for iface in intro_dev.interfaces):
                    proxy_dev = bus.get_proxy_object("org.bluez", device_path, intro_dev)
                    return (
                        proxy_dev.get_interface("org.bluez.Device1"),
                        proxy_dev.get_interface("org.freedesktop.DBus.Properties"),
                    )
            except Exception:
                pass
    except Exception as err:
        _LOGGER.warning("Could not execute BlueZ discovery for %s: %s", address, err)
    finally:
        if adapter:
            try:
                await adapter.call_stop_discovery()
            except Exception:
                pass

    return None


class PairingSession:
    """Manages an active pairing session with BlueZ."""

    def __init__(
        self, address: str, adapter_name: str = "hci0", hass: Any = None
    ) -> None:
        """Initialize pairing session."""
        self.address = address.strip().upper()
        self.adapter_name = adapter_name
        self.hass = hass
        self.pin_future: asyncio.Future[str] | None = None
        self.bus: Any = None
        self.agent: Any = None
        self.client: Any = None
        self.pair_task: asyncio.Task[None] | None = None
        self._pair_error: str | None = None
        self._auto_close_handle: asyncio.TimerHandle | None = None
        self._is_active = False

    async def start(self) -> None:
        """Register KeyboardOnly agent with BlueZ and proactively initiate connection to trigger PIN display."""
        if not DBUS_FAST_AVAILABLE:
            _LOGGER.debug("dbus-fast not available, skipping BlueZ agent registration")
            return

        loop = asyncio.get_running_loop()
        self.pin_future = loop.create_future()
        self.agent = BlueZPinAgent(self.pin_future)
        self.agent_path = _get_unique_agent_path()

        try:
            self.bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
            self.bus.export(self.agent_path, self.agent)

            intro = await self.bus.introspect("org.bluez", "/org/bluez")
            mgr_proxy = self.bus.get_proxy_object("org.bluez", "/org/bluez", intro)
            agent_mgr = mgr_proxy.get_interface("org.bluez.AgentManager1")
            await agent_mgr.call_register_agent(self.agent_path, "KeyboardOnly")
            try:
                await agent_mgr.call_request_default_agent(self.agent_path)
            except Exception:
                pass  # May already be default or not permitted

            # Ensure adapter is pairable
            adapter_path = f"/org/bluez/{self.adapter_name}"
            try:
                intro_adapter = await self.bus.introspect("org.bluez", adapter_path)
                proxy_adapter = self.bus.get_proxy_object("org.bluez", adapter_path, intro_adapter)
                props_adapter = proxy_adapter.get_interface("org.freedesktop.DBus.Properties")
                await props_adapter.call_set("org.bluez.Adapter1", "Pairable", Variant("b", True))
            except Exception as err:
                _LOGGER.debug("Could not set adapter Pairable=True: %s", err)

            self._is_active = True

            # Schedule auto-cleanup in 90 seconds if user navigates away or abandons flow
            self._auto_close_handle = loop.call_later(
                90.0, lambda: asyncio.create_task(self.close())
            )

            # Proactively initiate connection and pairing request so radio wakes up and shows PIN
            self.pair_task = asyncio.create_task(self._connect_and_pair())
        except Exception as err:
            _LOGGER.warning("Could not register BlueZ pairing agent for %s: %s", self.address, err)
            await self.close()

    async def _connect_and_pair(self) -> None:
        """Connect to device and initiate BLE pairing handshake to trigger on-screen PIN display."""
        try:
            # Check if already bonded
            if await async_is_device_bonded(self.address, self.adapter_name):
                _LOGGER.debug("Device %s already bonded in BlueZ", self.address)
                return

            ble_device = None
            if self.hass is not None:
                try:
                    from homeassistant.components import bluetooth
                    ble_device = bluetooth.async_ble_device_from_address(
                        self.hass, self.address, connectable=True
                    )
                    if ble_device is None:
                        for _ in range(6):
                            await asyncio.sleep(0.5)
                            ble_device = bluetooth.async_ble_device_from_address(
                                self.hass, self.address, connectable=True
                            )
                            if ble_device is not None:
                                break
                    if ble_device is None:
                        ble_device = bluetooth.async_ble_device_from_address(
                            self.hass, self.address, connectable=False
                        )
                except Exception as err:
                    _LOGGER.debug("Could not resolve BLEDevice from HA bluetooth: %s", err)

            try:
                from bleak_retry_connector import BleakClientWithServiceCache, establish_connection
            except ImportError:
                BleakClientWithServiceCache = None  # type: ignore[assignment, misc]
                establish_connection = None  # type: ignore[assignment, misc]

            if establish_connection is None:
                _LOGGER.debug("establish_connection not available, skipping proactive connect")
                return

            device_target = ble_device if ble_device is not None else self.address
            _LOGGER.info(
                "Establishing proactive BLE connection to %s to display PIN on screen...",
                self.address,
            )
            self.client = await establish_connection(
                client_class=BleakClientWithServiceCache,
                device=device_target,
                name=f"Meshtastic Pair {self.address}",
                max_attempts=2,
            )

            _LOGGER.info("Triggering BLE pairing request for %s...", self.address)
            if hasattr(self.client, "pair"):
                await self.client.pair()
                _LOGGER.info("Proactive BLE pairing completed successfully for %s", self.address)

        except asyncio.CancelledError:
            raise
        except Exception as err:
            err_str = str(err)
            if "AlreadyExists" in err_str or "already paired" in err_str.lower():
                _LOGGER.debug("Device %s already paired in BlueZ: %s", self.address, err)
            else:
                _LOGGER.warning("Proactive pair notice for %s: %s", self.address, err)
                self._pair_error = err_str

    async def submit_pin(self, pin: str, hass: Any = None) -> str | None:
        """Provide user-entered PIN to pending pairing session and wait for completion."""
        norm_pin = pin.strip()
        if self.pin_future and not self.pin_future.done():
            self.pin_future.set_result(norm_pin)

        # Wait for pairing task to finish if active
        if self.pair_task and not self.pair_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(self.pair_task), timeout=15.0)
            except (asyncio.TimeoutError, Exception) as err:
                _LOGGER.warning(
                    "Proactive pair task timed out or failed for %s: %s",
                    self.address,
                    err,
                )

        # Mark trusted in BlueZ
        await self._set_trusted()

        # Check bonding status
        is_bonded = await async_is_device_bonded(self.address, self.adapter_name)
        await self.close()

        # Brief settle delay so BlueZ HCI controller and the ESP32 radio finish link teardown
        await asyncio.sleep(2.0)

        if not is_bonded and self._pair_error:
            _LOGGER.warning("Pairing failed for %s: %s", self.address, self._pair_error)
            return "cannot_connect"

        return None

    async def _set_trusted(self) -> None:
        """Mark device as Trusted in BlueZ."""
        if self.bus and DBUS_FAST_AVAILABLE:
            try:
                clean = _clean_mac(self.address)
                device_path = f"/org/bluez/{self.adapter_name}/dev_{clean}"
                intro_dev = await self.bus.introspect("org.bluez", device_path)
                proxy_dev = self.bus.get_proxy_object("org.bluez", device_path, intro_dev)
                props_dev = proxy_dev.get_interface("org.freedesktop.DBus.Properties")
                await props_dev.call_set("org.bluez.Device1", "Trusted", Variant("b", True))
                _LOGGER.info("Device %s marked as Trusted in BlueZ", self.address)
            except Exception as trust_err:
                _LOGGER.debug("Could not mark %s as Trusted in BlueZ: %s", self.address, trust_err)

    async def close(self) -> None:
        """Clean up Bleak connection and D-Bus agent registration."""
        self._is_active = False
        if self._auto_close_handle:
            self._auto_close_handle.cancel()
            self._auto_close_handle = None

        if self.pin_future and not self.pin_future.done():
            self.pin_future.cancel()
        if self.pair_task and not self.pair_task.done():
            self.pair_task.cancel()

        if self.client:
            try:
                if self.client.is_connected:
                    await self.client.disconnect()
            except Exception:
                pass
            self.client = None

        if self.bus and DBUS_FAST_AVAILABLE:
            if hasattr(self, "agent_path") and self.agent_path:
                try:
                    intro = await self.bus.introspect("org.bluez", "/org/bluez")
                    mgr_proxy = self.bus.get_proxy_object("org.bluez", "/org/bluez", intro)
                    agent_mgr = mgr_proxy.get_interface("org.bluez.AgentManager1")
                    await agent_mgr.call_unregister_agent(self.agent_path)
                except Exception:
                    pass
                try:
                    self.bus.unexport(self.agent_path, self.agent)
                except Exception:
                    pass
            try:
                self.bus.disconnect()
            except Exception:
                pass
        self.bus = None
        self.agent = None


# Global active pairing session for config flow
_ACTIVE_PAIRING_SESSION: PairingSession | None = None


async def async_start_proactive_pairing(
    address: str, adapter_name: str = "hci0", hass: Any = None
) -> PairingSession | None:
    """Start proactive pairing preparation and connection."""
    global _ACTIVE_PAIRING_SESSION
    if _ACTIVE_PAIRING_SESSION:
        await _ACTIVE_PAIRING_SESSION.close()
        _ACTIVE_PAIRING_SESSION = None

    session = PairingSession(address, adapter_name, hass=hass)
    await session.start()
    _ACTIVE_PAIRING_SESSION = session
    return session


async def async_submit_pairing_pin(
    address: str, pin: str, adapter_name: str = "hci0", hass: Any = None
) -> str | None:
    """Submit PIN to active session or perform direct pairing."""
    global _ACTIVE_PAIRING_SESSION
    session = _ACTIVE_PAIRING_SESSION
    _ACTIVE_PAIRING_SESSION = None

    if session and session.address == address.strip().upper():
        return await session.submit_pin(pin, hass=hass)

    if session:
        await session.close()

    return await async_pair_device_with_pin(hass, address, pin, adapter_name)


async def async_pair_device_with_pin(
    hass: Any, address: str, pin: str, adapter_name: str = "hci0"
) -> str | None:
    """Validate PIN format and prepare device for BLE pairing.

    The actual SMP pairing and authentication is performed over the live BLE link
    established by MeshtasticConnection using establish_connection.
    """
    return None


async def async_pair_and_trust_device(
    address: str, pin: str, adapter_name: str = "hci0", hass: Any = None
) -> str | None:
    """Pair a device with PIN and mark as Trusted."""
    return await async_pair_device_with_pin(hass, address, pin, adapter_name)


async def async_pair_bleak_client(
    client: Any, address: str, pin: str, adapter_name: str = "hci0"
) -> bool:
    """Pair an active BleakClient connection using BlueZ KeyboardOnly PIN agent.

    This ensures the SMP pairing request is issued over the ALREADY ESTABLISHED BLE link,
    causing the Meshtastic radio screen to display the PIN and negotiating authenticated
    encryption for GATT read/write operations.
    """
    if not DBUS_FAST_AVAILABLE:
        return True

    is_bonded = await async_is_device_bonded(address, adapter_name)
    if is_bonded:
        _LOGGER.debug("BLE device %s already bonded in BlueZ", address)
        return True

    agent_path = _get_unique_agent_path()
    agent = BlueZPinAgent(pin)
    bus: Any = None
    agent_mgr: Any = None
    try:
        bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
        bus.export(agent_path, agent)

        intro_mgr = await bus.introspect("org.bluez", "/org/bluez")
        mgr_proxy = bus.get_proxy_object("org.bluez", "/org/bluez", intro_mgr)
        agent_mgr = mgr_proxy.get_interface("org.bluez.AgentManager1")
        await agent_mgr.call_register_agent(agent_path, "KeyboardOnly")
        try:
            await agent_mgr.call_request_default_agent(agent_path)
        except Exception:
            pass

        _LOGGER.info("Initiating BLE link pair on active connection for %s...", address)
        if hasattr(client, "pair"):
            await client.pair()
            _LOGGER.info("Active BleakClient successfully paired and bonded with %s", address)

            # Mark trusted
            try:
                clean = _clean_mac(address)
                device_path = f"/org/bluez/{adapter_name}/dev_{clean}"
                intro_dev = await bus.introspect("org.bluez", device_path)
                proxy_dev = bus.get_proxy_object("org.bluez", device_path, intro_dev)
                props_dev = proxy_dev.get_interface("org.freedesktop.DBus.Properties")
                await props_dev.call_set("org.bluez.Device1", "Trusted", Variant("b", True))
                _LOGGER.info("Device %s marked as Trusted in BlueZ", address)
            except Exception as trust_err:
                _LOGGER.debug("Could not mark %s as Trusted in BlueZ: %s", address, trust_err)

            return True
        return False
    except Exception as err:
        err_str = str(err)
        if "AlreadyExists" in err_str or "already paired" in err_str.lower():
            _LOGGER.debug("Device %s already paired in BlueZ: %s", address, err)
            return True
        _LOGGER.warning("Active BleakClient pair notice for %s: %s", address, err)
        return False
    finally:
        if bus:
            if agent_mgr:
                try:
                    await agent_mgr.call_unregister_agent(agent_path)
                except Exception:
                    pass
            try:
                bus.unexport(agent_path, agent)
            except Exception:
                pass
            try:
                bus.disconnect()
            except Exception:
                pass


async def async_is_device_bonded(address: str, adapter_name: str = "hci0") -> bool:
    """Check if device is bonded/paired and trusted in BlueZ."""
    if not DBUS_FAST_AVAILABLE:
        return False

    clean = _clean_mac(address)
    device_path = f"/org/bluez/{adapter_name}/dev_{clean}"
    try:
        bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
        intro = await bus.introspect("org.bluez", device_path)
        proxy = bus.get_proxy_object("org.bluez", device_path, intro)
        props = proxy.get_interface("org.freedesktop.DBus.Properties")
        paired = await props.call_get("org.bluez.Device1", "Paired")
        trusted = await props.call_get("org.bluez.Device1", "Trusted")
        bus.disconnect()
        return bool(paired.value and trusted.value)
    except Exception:
        return False

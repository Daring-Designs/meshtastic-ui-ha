"""Meshtastic radio connection manager."""

from __future__ import annotations

import asyncio
import enum
import logging
import re
import time
from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant

try:
    from meshtastic.mesh_interface import MeshInterface
except ImportError:
    MeshInterface = object  # type: ignore[assignment, misc]

try:
    from bleak_retry_connector import BleakClientWithServiceCache, establish_connection
except ImportError:
    BleakClientWithServiceCache = None  # type: ignore[assignment, misc]
    establish_connection = None  # type: ignore[assignment, misc]

try:
    from homeassistant.components import bluetooth
except ImportError:
    bluetooth = None  # type: ignore[assignment, misc]

from .const import (
    DEFAULT_BLE_PIN,
    MESHTASTIC_BLE_FROMNUM_UUID,
    MESHTASTIC_BLE_FROMRADIO_UUID,
    MESHTASTIC_BLE_LOGRADIO_UUID,
    MESHTASTIC_BLE_TORADIO_UUID,
)

_LOGGER = logging.getLogger(__name__)

_MAC_COLON_RE = re.compile(r"^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$")
_MAC_HYPHEN_RE = re.compile(r"^([0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2}$")
_MAC_DOT_RE = re.compile(r"^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$")
_MAC_BARE_RE = re.compile(r"^[0-9a-fA-F]{12}$")
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

MIN_RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 300  # 5 minutes
WATCHDOG_INTERVAL = 60    # seconds between liveness checks
WATCHDOG_TIMEOUT = 30     # seconds to wait for a liveness probe
WATCHDOG_THRESHOLD = 300  # seconds of inactivity before a deeper probe
BLE_HEARTBEAT_INTERVAL = 25  # seconds between BLE heartbeats
SEND_RECONNECT_WAIT = 45    # seconds a send waits for a reconnect in progress


def _is_repeated(field: Any) -> bool:
    """Return whether a protobuf FieldDescriptor is a repeated field.

    protobuf 7 removed ``FieldDescriptor.label`` in favour of
    ``is_repeated``, which older releases (4.x) don't have.
    """
    is_repeated = getattr(field, "is_repeated", None)
    if is_repeated is not None:
        return bool(is_repeated)
    from google.protobuf.descriptor import FieldDescriptor

    return field.label == FieldDescriptor.LABEL_REPEATED


def _apply_protobuf_values(
    proto_obj: Any, values: dict[str, Any], context: str = ""
) -> None:
    """Recursively apply dict values to a protobuf message object.

    Handles nested sub-messages (dicts) and repeated fields (lists)
    that can't be assigned directly via setattr.
    """
    from google.protobuf.descriptor import FieldDescriptor

    descriptor = proto_obj.DESCRIPTOR
    field_map = {f.name: f for f in descriptor.fields}

    for key, value in values.items():
        if key not in field_map:
            if hasattr(proto_obj, key):
                # Field exists on the object but not in descriptor (oneof, etc.).
                try:
                    setattr(proto_obj, key, value)
                except (AttributeError, TypeError, ValueError):
                    _LOGGER.warning(
                        "Cannot set field '%s' in %s", key, context or "config"
                    )
            else:
                _LOGGER.warning(
                    "Unknown config field '%s' in '%s'", key, context or "config"
                )
            continue

        field = field_map[key]

        if field.message_type is not None and not _is_repeated(field):
            # Nested sub-message — recurse into it.
            if isinstance(value, dict):
                sub_msg = getattr(proto_obj, key)
                _apply_protobuf_values(sub_msg, value, f"{context}.{key}")
            else:
                _LOGGER.warning(
                    "Expected dict for sub-message field '%s' in '%s', got %s",
                    key, context or "config", type(value).__name__,
                )
        elif _is_repeated(field):
            # Repeated field — clear and extend.
            repeated = getattr(proto_obj, key)
            del repeated[:]
            if isinstance(value, (list, tuple)):
                repeated.extend(value)
        elif field.type == FieldDescriptor.TYPE_ENUM and isinstance(value, str):
            # Enum field sent as string name (e.g. "ENABLED") — resolve to int.
            enum_type = field.enum_type
            enum_val = enum_type.values_by_name.get(value) if enum_type else None
            if enum_val is not None:
                setattr(proto_obj, key, enum_val.number)
            else:
                _LOGGER.warning(
                    "Unknown enum value '%s' for field '%s' in '%s'",
                    value, key, context or "config",
                )
        else:
            # Scalar field — direct assignment.
            try:
                setattr(proto_obj, key, value)
            except (AttributeError, TypeError, ValueError) as err:
                _LOGGER.warning(
                    "Cannot set field '%s' in '%s': %s", key, context or "config", err
                )


def _split_mqtt_address(address: str) -> tuple[str, int]:
    """Split an MQTT broker address into (host, port).

    The MQTT module config has no port field — firmware expects the port
    inside the address string as ``host:port``, defaulting to 1883.
    Bare IPv6 addresses (``2001:db8::1``) are left intact; bracketed
    ones (``[::1]:8883``) split normally.
    """
    host, sep, port_str = address.rpartition(":")
    if sep and port_str.isdigit() and not host.endswith(":"):
        port = int(port_str)
        if 1 <= port <= 65535:
            return host, port
    return address, 1883


def _message_to_dict(proto_obj: Any, **kwargs: Any) -> dict[str, Any]:
    """Wrap MessageToDict with protobuf version compatibility.

    protobuf < 4.21 uses ``including_default_value_fields``; newer versions
    renamed it to ``always_print_fields_with_no_presence``.
    """
    from google.protobuf.json_format import MessageToDict

    if "including_default_value_fields" in kwargs:
        try:
            return MessageToDict(proto_obj, **kwargs)
        except TypeError:
            kwargs["always_print_fields_with_no_presence"] = kwargs.pop(
                "including_default_value_fields"
            )
    return MessageToDict(proto_obj, **kwargs)


def _fill_enum_defaults(proto_obj: Any, d: dict[str, Any]) -> None:
    """Fill in missing enum fields with their default (value-0) string name.

    MessageToDict omits proto3 fields at their default value.  For enum
    fields the default is 0, so e.g. gps_mode=DISABLED is silently dropped.
    This walks the descriptor and adds any missing enum fields back with
    the string name of value 0.  Recurses into sub-messages.
    """
    from google.protobuf.descriptor import FieldDescriptor

    for field in proto_obj.DESCRIPTOR.fields:
        if field.type == FieldDescriptor.TYPE_ENUM:
            if field.name not in d:
                enum_val = field.enum_type.values_by_number.get(0)
                if enum_val:
                    d[field.name] = enum_val.name
        elif (
            field.message_type is not None
            and not _is_repeated(field)
        ):
            sub_dict = d.get(field.name)
            if isinstance(sub_dict, dict):
                sub_msg = getattr(proto_obj, field.name)
                _fill_enum_defaults(sub_msg, sub_dict)


class HomeAssistantBLEInterface(MeshInterface):
    """MeshInterface using Home Assistant native Bluetooth stack and bleak-retry-connector."""

    def __init__(
        self,
        hass: HomeAssistant,
        address: str,
        pin: str | None = None,
        debugOut: Any = None,
        noProto: bool = False,
        noNodes: bool = False,
        timeout: int = 300,
    ) -> None:
        """Initialize BLE interface."""
        if MeshInterface is not object:
            super().__init__(
                debugOut=debugOut, noProto=noProto, noNodes=noNodes, timeout=timeout
            )
        else:
            self.nodes = {}
            self.myInfo = None
            self.metadata = None
        self._hass = hass
        self._address = address.strip().upper()
        self._pin = pin or DEFAULT_BLE_PIN
        self.client: Any = None
        self._link_up = False
        self._outgoing_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._in_flight: bytes | None = None  # being written, not yet confirmed
        # Called with the packet IDs of mesh packets that never reached the radio.
        self.on_unsent: Callable[[list[int]], None] | None = None
        self._send_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._read_lock = asyncio.Lock()

    async def async_connect(self) -> None:
        """Establish BLE connection via Home Assistant's bluetooth manager."""
        from .ble_pairing import (
            async_is_device_bonded,
            async_pair_bleak_client,
            bluez_adapter_from_ble_device,
        )

        if bluetooth is None:
            raise RuntimeError("homeassistant.components.bluetooth is not available")

        # Check / obtain BLEDevice from HA bluetooth manager
        ble_device = bluetooth.async_ble_device_from_address(
            self._hass, self._address, connectable=True
        )
        if ble_device is None:
            # Wait up to 10 seconds for an advertisement to appear
            for _ in range(20):
                await asyncio.sleep(0.5)
                ble_device = bluetooth.async_ble_device_from_address(
                    self._hass, self._address, connectable=True
                )
                if ble_device is not None:
                    break

        if ble_device is None:
            ble_device = bluetooth.async_ble_device_from_address(
                self._hass, self._address, connectable=False
            )

        if ble_device is None:
            raise RuntimeError(
                f"No BLE device found for address {self._address} in Home Assistant bluetooth history"
            )

        # Pairing goes through BlueZ, so the radio must be seen by an adapter on
        # the HA host. Prefer such a sighting if a proxy reported the best one.
        adapter = bluez_adapter_from_ble_device(ble_device)
        if adapter is None and hasattr(bluetooth, "async_scanner_devices_by_address"):
            for scanner_device in bluetooth.async_scanner_devices_by_address(
                self._hass, self._address, connectable=True
            ):
                adapter = bluez_adapter_from_ble_device(scanner_device.ble_device)
                if adapter is not None:
                    ble_device = scanner_device.ble_device
                    break
        if adapter is None:
            raise RuntimeError(
                f"BLE device {self._address} is only reachable through a Bluetooth "
                "proxy. Meshtastic BLE needs a Bluetooth adapter on the Home "
                "Assistant host because the radio must be paired through BlueZ"
            )

        _LOGGER.debug("Connecting to BLE device %s using BleakClientWithServiceCache", self._address)
        if establish_connection is None:
            raise RuntimeError("bleak_retry_connector is not available")

        client = await establish_connection(
            client_class=BleakClientWithServiceCache,
            device=ble_device,
            name=f"Meshtastic {self._address}",
            disconnected_callback=self._on_ble_disconnected,
            max_attempts=3,
        )
        self.client = client

        # Ensure BLE link is paired and authenticated before GATT transactions.
        # The radio sends nothing to an unpaired client, so a failed pairing
        # must fail the connect rather than show Connected with no data.
        is_bonded = await async_is_device_bonded(self._address, adapter)
        if not is_bonded:
            _LOGGER.info("BLE device %s is not bonded; pairing active connection with PIN", self._address)
            paired = await async_pair_bleak_client(client, self._address, self._pin, adapter)
            if not paired:
                await self.async_close()
                raise RuntimeError(
                    f"BLE pairing with {self._address} failed; check the PIN "
                    "shown on the radio"
                )

        self._link_up = True
        self.isConnected.set()

        # Subscribe to FROMNUM notifications
        await client.start_notify(MESHTASTIC_BLE_FROMNUM_UUID, self._on_fromnum_notify)

        # Subscribe to LOGRADIO if characteristic present
        try:
            if client.services.get_characteristic(MESHTASTIC_BLE_LOGRADIO_UUID):
                await client.start_notify(MESHTASTIC_BLE_LOGRADIO_UUID, self._on_logradio_notify)
        except Exception:
            pass

        # Start background outgoing packet sender task
        self._send_task = self._create_bg_task(
            self._send_loop(), f"meshtastic_ble_send_{self._address}"
        )

        # Start background heartbeat loop
        self._heartbeat_task = self._create_bg_task(
            self._heartbeat_loop(), f"meshtastic_ble_heartbeat_{self._address}"
        )

        # Start Meshtastic config handshake
        _LOGGER.debug("Starting Meshtastic config handshake over BLE for %s", self._address)
        if hasattr(self, "_startConfig"):
            self._startConfig()

        # Initial drain of any pending FromRadio (allow retries while radio prepares NodeDB)
        self._create_bg_task(
            self._read_from_radio(max_empty_retries=10),
            f"meshtastic_ble_read_{self._address}",
        )

        # Brief wait for initial node info to populate
        for _ in range(6):
            if getattr(self, "nodes", None):
                break
            await asyncio.sleep(0.5)

    def _create_bg_task(self, coro: Any, name: str) -> asyncio.Task[Any]:
        """Create a background task that does not block Home Assistant startup."""
        if hasattr(self._hass, "async_create_background_task"):
            return self._hass.async_create_background_task(coro, name)
        return self._hass.async_create_task(coro)

    def _on_ble_disconnected(self, client: Any) -> None:
        """Callback when BLE link drops."""
        if not self._link_up:
            return  # already handled, or an intentional close
        _LOGGER.warning("BLE device %s disconnected", self._address)
        self._link_up = False
        if hasattr(self, "isConnected") and hasattr(self.isConnected, "clear"):
            self.isConnected.clear()
        if self._send_task and not self._send_task.done():
            self._send_task.cancel()
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
        self._report_unsent()
        if hasattr(self, "_disconnected"):
            self._disconnected()

    def _report_unsent(self) -> None:
        """Drop queued and in-flight packets and report the mesh packet IDs among them.

        The queue belongs to this link and is discarded on reconnect, so these
        messages are lost. Reporting them lets the UI show them as failed now
        instead of timing out minutes later.
        """
        pending = [self._in_flight] if self._in_flight is not None else []
        self._in_flight = None
        while not self._outgoing_queue.empty():
            pending.append(self._outgoing_queue.get_nowait())
        if not pending or self.on_unsent is None:
            return
        from meshtastic import mesh_pb2

        packet_ids = []
        for b in pending:
            to_radio = mesh_pb2.ToRadio()
            try:
                to_radio.ParseFromString(b)
            except Exception:  # noqa: BLE001
                continue
            if to_radio.HasField("packet") and to_radio.packet.id:
                packet_ids.append(to_radio.packet.id)
        if packet_ids:
            self.on_unsent(packet_ids)

    def _on_fromnum_notify(self, characteristic: Any, data: bytearray) -> None:
        """Handle FROMNUM notify indicating the radio has packet data waiting."""
        self._create_bg_task(
            self._read_from_radio(max_empty_retries=3),
            f"meshtastic_ble_read_{self._address}",
        )

    def _on_logradio_notify(self, characteristic: Any, data: bytearray) -> None:
        """Handle LOGRADIO log lines."""
        try:
            from meshtastic import mesh_pb2
            log_record = mesh_pb2.LogRecord()
            log_record.ParseFromString(bytes(data))
            msg = f"[{log_record.source}] {log_record.message}" if log_record.source else log_record.message
            if hasattr(self, "_handleLogLine"):
                self._handleLogLine(msg)
        except Exception:
            pass

    async def _read_from_radio(self, max_empty_retries: int = 1) -> None:
        """Read pending packets from FROMRADIO GATT characteristic."""
        if not self._link_up or not self.client or not self.client.is_connected:
            return
        async with self._read_lock:
            empty_count = 0
            while self._link_up and self.client and self.client.is_connected:
                try:
                    b = await self.client.read_gatt_char(MESHTASTIC_BLE_FROMRADIO_UUID)
                except Exception as err:
                    _LOGGER.debug("Error reading FROMRADIO: %s", err)
                    break
                if not b:
                    empty_count += 1
                    if empty_count <= max_empty_retries:
                        await asyncio.sleep(0.08)
                        continue
                    break
                empty_count = 0
                _LOGGER.debug("FROMRADIO packet read (%d bytes)", len(b))
                try:
                    if hasattr(self, "_handleFromRadio"):
                        self._handleFromRadio(bytes(b))
                except Exception as err:
                    _LOGGER.warning("Error handling FROMRADIO packet: %s", err)

    async def _send_loop(self) -> None:
        """Worker task processing outbound TORADIO packets."""
        while self._link_up and self.client and self.client.is_connected:
            try:
                b = await self._outgoing_queue.get()
                self._in_flight = b
                char =self.client.services.get_characteristic(MESHTASTIC_BLE_TORADIO_UUID)
                props = getattr(char, "properties", []) or []
                use_response = "write" in props
                try:
                    await self.client.write_gatt_char(MESHTASTIC_BLE_TORADIO_UUID, b, response=use_response)
                except Exception as write_err:
                    _LOGGER.debug(
                        "write_gatt_char (response=%s) failed on %s (%s), retrying opposite",
                        use_response,
                        self._address,
                        write_err,
                    )
                    await self.client.write_gatt_char(MESHTASTIC_BLE_TORADIO_UUID, b, response=not use_response)
                self._in_flight = None
                self._outgoing_queue.task_done()
                await asyncio.sleep(0.02)
                await self._read_from_radio(max_empty_retries=2)
            except asyncio.CancelledError:
                break
            except Exception as err:
                # The link can still look up while writes fail. Treat it as a
                # disconnect so the reconnect loop runs instead of leaving
                # packets stuck in the queue behind a Connected status.
                _LOGGER.error(
                    "Failed to write to TORADIO on %s: %s; reconnecting", self._address, err
                )
                self._on_ble_disconnected(self.client)
                break

    async def _heartbeat_loop(self) -> None:
        """Send a periodic heartbeat to keep the ESP32 BLE session active.

        Each heartbeat write is followed by a FROMRADIO drain in the send loop,
        which also picks up packets whose FROMNUM notify was missed.
        """
        nonce = 0
        while self._link_up and self.client and self.client.is_connected:
            try:
                await asyncio.sleep(BLE_HEARTBEAT_INTERVAL)
                if not self._link_up or not self.client or not self.client.is_connected:
                    break
                # The firmware drops a ToRadio write identical to the previous
                # one, so vary the nonce or every heartbeat after the first is lost.
                nonce = (nonce + 1) & 0xFFFFFFFF
                from meshtastic import mesh_pb2
                p = mesh_pb2.ToRadio()
                p.heartbeat.nonce = nonce
                self._sendToRadioImpl(p)
            except asyncio.CancelledError:
                break
            except Exception as err:
                _LOGGER.debug("BLE heartbeat loop error: %s", err)
                break

    def _sendToRadioImpl(self, toRadio: Any) -> None:
        """Enqueue outbound protobuf packet to be written to TORADIO."""
        b: bytes = toRadio.SerializeToString()
        if not b or not self._link_up:
            return
        if self._hass.loop.is_running():
            self._hass.loop.call_soon_threadsafe(self._outgoing_queue.put_nowait, b)
        else:
            self._outgoing_queue.put_nowait(b)

    def _waitConnected(self, timeout: float = 30.0) -> None:
        """BLE interface is already connected when active."""
        if not self._link_up or not self.client or not self.client.is_connected:
            if MeshInterface is not object and hasattr(MeshInterface, "MeshInterfaceError"):
                raise MeshInterface.MeshInterfaceError("BLE interface is not connected")
            raise RuntimeError("BLE interface is not connected")

    async def async_close(self) -> None:
        """Cleanly disconnect BLE client and stop background tasks."""
        self._link_up = False
        if hasattr(self, "isConnected") and hasattr(self.isConnected, "clear"):
            self.isConnected.clear()
        if MeshInterface is not object and hasattr(MeshInterface, "close"):
            try:
                MeshInterface.close(self)
            except Exception:
                pass
        if self._send_task and not self._send_task.done():
            self._send_task.cancel()
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
        self._report_unsent()
        if self.client:
            try:
                if self.client.is_connected:
                    await self.client.disconnect()
            except Exception:
                pass
            self.client = None
        if hasattr(self, "_disconnected"):
            self._disconnected()

    def close(self) -> None:
        """Sync close interface."""
        if self._hass and self._hass.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.async_close(), self._hass.loop)
        else:
            self._link_up = False
            self.client = None
            if hasattr(self, "_disconnected"):
                self._disconnected()


class ConnectionType(enum.StrEnum):
    """Radio connection types."""

    TCP = "tcp"
    SERIAL = "serial"
    BLE = "ble"


class ConnectionState(enum.StrEnum):
    """Radio connection states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


class MeshtasticConnection:
    """Manages the connection to a Meshtastic radio."""

    def __init__(
        self,
        hass: HomeAssistant,
        connection_type: ConnectionType,
        *,
        hostname: str | None = None,
        port: int = 4403,
        serial_path: str | None = None,
        ble_address: str | None = None,
        ble_pin: str | None = None,
    ) -> None:
        """Initialize the connection manager."""
        self._hass = hass
        self._connection_type = connection_type
        self._hostname = hostname
        self._port = port
        self._serial_path = serial_path
        self._ble_pin = str(ble_pin).strip() if ble_pin else DEFAULT_BLE_PIN
        if ble_address:
            stripped = ble_address.strip()
            if _UUID_RE.match(stripped):
                self._ble_address = stripped.upper()
            elif (
                _MAC_COLON_RE.match(stripped)
                or _MAC_HYPHEN_RE.match(stripped)
                or _MAC_DOT_RE.match(stripped)
                or _MAC_BARE_RE.match(stripped)
            ):
                hex_only = stripped.replace(":", "").replace("-", "").replace(".", "")
                self._ble_address = ":".join(
                    hex_only[i : i + 2].upper() for i in range(0, 12, 2)
                )
            else:
                self._ble_address = stripped
        else:
            self._ble_address = None

        self._interface: Any | None = None
        self._state = ConnectionState.DISCONNECTED
        self._reconnect_task: asyncio.Task | None = None
        self._reconnect_gen: int = 0  # incremented each time a new loop is started
        self._watchdog_task: asyncio.Task | None = None
        self._attempt_in_progress = False
        self._last_activity_time: float = 0.0
        self._connected_event = asyncio.Event()

        self._message_callbacks: list[Callable] = []
        self._node_update_callbacks: list[Callable] = []
        self._connection_change_callbacks: list[Callable] = []
        self._unsent_callbacks: list[Callable] = []
        self._pubsub_listeners: list[Any] = []

    @property
    def state(self) -> ConnectionState:
        """Return the current connection state."""
        return self._state

    @property
    def connection_type(self) -> ConnectionType:
        """Return the connection type."""
        return self._connection_type

    @property
    def ble_address(self) -> str | None:
        """Return the BLE address."""
        return self._ble_address

    @property
    def ble_pin(self) -> str:
        """Return the BLE pairing PIN."""
        return self._ble_pin

    @property
    def interface(self) -> Any | None:
        """Return the raw meshtastic interface (or None)."""
        return self._interface

    @property
    def nodes(self) -> dict[str, Any]:
        """Return the meshtastic node database."""
        if self._interface is None:
            return {}
        try:
            return dict(self._interface.nodes or {})
        except Exception:  # noqa: BLE001
            return {}

    @property
    def my_info(self) -> dict[str, Any]:
        """Return our node's info from the radio."""
        if self._interface is None:
            return {}
        try:
            my_node_num = self._interface.myInfo.my_node_num
            for node in (self._interface.nodes or {}).values():
                if node.get("num") == my_node_num:
                    return node
        except Exception:  # noqa: BLE001
            pass
        return {}

    @property
    def metadata(self) -> dict[str, Any]:
        """Return device metadata (firmware, hardware, etc)."""
        if self._interface is None:
            return {}
        try:
            return dict(self._interface.metadata or {})
        except Exception:  # noqa: BLE001
            return {}

    def register_unsent_callback(self, callback: Callable) -> Callable:
        """Register a callback for packet IDs lost when the link dropped. Returns unsubscribe callable."""
        self._unsent_callbacks.append(callback)
        return lambda: self._unsent_callbacks.remove(callback)

    def _async_dispatch_unsent(self, packet_ids: list[int]) -> None:
        """Dispatch lost packet IDs to callbacks (runs on HA event loop)."""
        _LOGGER.warning(
            "%d outgoing packet(s) were not sent before the radio link dropped",
            len(packet_ids),
        )
        for cb in self._unsent_callbacks:
            try:
                cb(packet_ids)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error in unsent packet callback")

    def register_message_callback(self, callback: Callable) -> Callable:
        """Register a callback for received messages. Returns unsubscribe callable."""
        self._message_callbacks.append(callback)
        return lambda: self._message_callbacks.remove(callback)

    def register_node_update_callback(self, callback: Callable) -> Callable:
        """Register a callback for node updates. Returns unsubscribe callable."""
        self._node_update_callbacks.append(callback)
        return lambda: self._node_update_callbacks.remove(callback)

    def register_connection_change_callback(self, callback: Callable) -> Callable:
        """Register a callback for connection state changes. Returns unsubscribe callable."""
        self._connection_change_callbacks.append(callback)
        return lambda: self._connection_change_callbacks.remove(callback)

    async def async_connect(self) -> None:
        """Connect to the radio."""
        self._set_state(ConnectionState.CONNECTING)
        gen = self._reconnect_gen
        try:
            new_iface = await self._async_safe_create_interface(gen)
            if new_iface is None:
                return

            self._interface = new_iface
            self._setup_pubsub_listeners()
            self._set_state(ConnectionState.CONNECTED)
            self._start_watchdog()
            _LOGGER.debug(
                "Connected to Meshtastic radio via %s", self._connection_type
            )
        except asyncio.CancelledError:
            raise
        except Exception as err:
            _LOGGER.warning(
                "Initial connection to Meshtastic radio failed (%s), will retry", err
            )
            self._interface = None
            self._reconnect_gen += 1
            self._set_state(ConnectionState.RECONNECTING)
            if self._reconnect_task is None or self._reconnect_task.done():
                self._reconnect_task = asyncio.ensure_future(
                    self._async_reconnect_loop(gen=self._reconnect_gen)
                )

    async def async_disconnect(self) -> None:
        """Disconnect from the radio and stop reconnection attempts."""
        self._set_state(ConnectionState.DISCONNECTED)
        self._stop_watchdog()
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None

        if self._watchdog_task is not None:
            self._watchdog_task.cancel()
            try:
                await self._watchdog_task
            except asyncio.CancelledError:
                pass
            self._watchdog_task = None

        self._teardown_pubsub_listeners()

        if self._interface is not None:
            iface = self._interface
            self._interface = None
            if isinstance(iface, HomeAssistantBLEInterface):
                await iface.async_close()
            else:
                try:
                    await self._hass.async_add_executor_job(iface.close)
                except Exception:  # noqa: BLE001
                    pass

    async def async_force_reconnect(self) -> None:
        """Force a full disconnect and reconnect regardless of current state.

        Unlike the automatic reconnect loop (which only triggers on a
        connection.lost pubsub event), this can be called at any time —
        including when the state is stuck at CONNECTED but the radio is
        silently unresponsive.
        """
        if self._attempt_in_progress:
            _LOGGER.info(
                "Connection attempt already in progress, ignoring reconnect request"
            )
            return

        now = time.monotonic()
        if (
            self._state in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING)
            and hasattr(self, "_last_force_reconnect_time")
            and (now - self._last_force_reconnect_time) < 8.0
        ):
            _LOGGER.info(
                "Force reconnect already in progress (%.1fs elapsed), ignoring rapid duplicate request",
                now - self._last_force_reconnect_time,
            )
            return

        self._last_force_reconnect_time = now
        _LOGGER.info("Force reconnect requested by user")

        self._stop_watchdog()

        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None

        self._teardown_pubsub_listeners()

        if self._interface is not None:
            old = self._interface
            self._interface = None
            if isinstance(old, HomeAssistantBLEInterface):
                await old.async_close()
            else:
                try:
                    await self._hass.async_add_executor_job(old.close)
                except Exception:  # noqa: BLE001
                    pass

        # Bypass the DISCONNECTED guard in _async_handle_disconnected —
        # always start a fresh reconnect loop, skipping the initial backoff delay.
        self._reconnect_gen += 1
        self._set_state(ConnectionState.RECONNECTING)
        self._reconnect_task = asyncio.ensure_future(
            self._async_reconnect_loop(initial_delay=0, gen=self._reconnect_gen)
        )

    async def async_send_text(
        self,
        text: str,
        destination_id: str | None = None,
        channel_index: int = 0,
        reply_id: int | None = None,
    ) -> int | None:
        """Send a text message via the radio. Returns the packet ID if available."""
        await self._async_wait_for_reconnect()
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _send() -> int | None:
            # wantAck is required for the firmware to report delivery back
            # (real ack for DMs, implicit ack on rebroadcast for channels).
            kwargs: dict[str, Any] = {"channelIndex": channel_index, "wantAck": True}
            if destination_id:
                kwargs["destinationId"] = destination_id
            if reply_id is not None:
                kwargs["replyId"] = reply_id
            meshPacket = iface.sendText(text, **kwargs)
            if meshPacket and hasattr(meshPacket, "id"):
                return meshPacket.id
            return None

        return await self._hass.async_add_executor_job(_send)

    async def async_send_traceroute(self, destination_id: str) -> None:
        """Send a traceroute request (non-blocking).

        Uses sendData directly instead of sendTraceRoute to avoid blocking
        the executor thread waiting for a response. The traceroute result
        arrives asynchronously via the meshtastic.receive pubsub callback.
        """
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _trace() -> None:
            from meshtastic.protobuf import mesh_pb2, portnums_pb2

            route_discovery = mesh_pb2.RouteDiscovery()
            iface.sendData(
                route_discovery,
                destination_id,
                portNum=portnums_pb2.TRACEROUTE_APP,
                wantResponse=True,
            )

        await self._hass.async_add_executor_job(_trace)

    async def async_request_position(self, destination_id: str) -> None:
        """Request a position update from a node."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _request() -> None:
            iface.sendPosition(destinationId=destination_id, wantResponse=True)

        await self._hass.async_add_executor_job(_request)

    async def async_request_nodeinfo(self, destination_id: str) -> None:
        """Request node info from a remote node (non-blocking).

        Sends an empty User proto with wantResponse=True so the remote
        node replies with its own NODEINFO_APP packet.
        """
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _request() -> None:
            from meshtastic.protobuf import mesh_pb2, portnums_pb2

            user = mesh_pb2.User()
            iface.sendData(
                user,
                destination_id,
                portNum=portnums_pb2.NODEINFO_APP,
                wantResponse=True,
            )

        await self._hass.async_add_executor_job(_request)

    async def async_request_telemetry(
        self, destination_id: str, telemetry_type: str = "device_metrics"
    ) -> None:
        """Request a telemetry reading from a remote node (non-blocking).

        Sends an empty Telemetry proto with only the requested variant set;
        the node answers with a TELEMETRY_APP packet that arrives through
        the meshtastic.receive pubsub callback. Nodes without the matching
        sensor (e.g. no environment sensor) don't answer.
        """
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _request() -> None:
            from meshtastic.protobuf import portnums_pb2, telemetry_pb2

            telemetry = telemetry_pb2.Telemetry()
            getattr(telemetry, telemetry_type).SetInParent()
            iface.sendData(
                telemetry,
                destination_id,
                portNum=portnums_pb2.TELEMETRY_APP,
                wantResponse=True,
            )

        await self._hass.async_add_executor_job(_request)

    async def async_get_config(self) -> dict[str, Any]:
        """Read full config from the radio (local, module, channels, owner, metadata)."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _read() -> dict[str, Any]:
            node = iface.localNode
            my_node = iface.getMyNodeInfo() or {}
            result: dict[str, Any] = {}

            # Local config sections.
            if node.localConfig:
                result["local_config"] = _message_to_dict(
                    node.localConfig,
                    preserving_proto_field_name=True,
                    including_default_value_fields=True,
                )
                _fill_enum_defaults(node.localConfig, result["local_config"])
            else:
                result["local_config"] = {}

            # Module config sections.
            if node.moduleConfig:
                result["module_config"] = _message_to_dict(
                    node.moduleConfig,
                    preserving_proto_field_name=True,
                    including_default_value_fields=True,
                )
                _fill_enum_defaults(node.moduleConfig, result["module_config"])
            else:
                result["module_config"] = {}

            # Channels (radio supports indices 0-7 only).
            channels = []
            for ch in (node.channels or [])[:8]:
                channels.append(_message_to_dict(ch, preserving_proto_field_name=True))
            result["channels"] = channels

            # The MQTT config has no port field — the port is embedded in
            # the address string, so split it out for the UI's Port field.
            mqtt_cfg = result["module_config"].get("mqtt")
            if mqtt_cfg is not None:
                host, port = _split_mqtt_address(str(mqtt_cfg.get("address") or ""))
                mqtt_cfg["address"] = host
                mqtt_cfg["port"] = port

            # Fixed-position coordinates are not part of PositionConfig —
            # they live on the node's own position record, so merge them
            # into the position section for the UI to display.
            position_cfg = result["local_config"].get("position")
            if position_cfg is not None:
                node_pos = my_node.get("position") or {}
                lat = node_pos.get("latitude")
                lng = node_pos.get("longitude")
                if lat is None:
                    lat = (node_pos.get("latitudeI") or node_pos.get("latitude_i") or 0) * 1e-7
                if lng is None:
                    lng = (node_pos.get("longitudeI") or node_pos.get("longitude_i") or 0) * 1e-7
                position_cfg["fixed_lat"] = lat
                position_cfg["fixed_lng"] = lng
                position_cfg["fixed_altitude"] = node_pos.get("altitude", 0)

            # Owner info.
            result["owner"] = my_node.get("user", {})

            # Device metadata.
            try:
                result["metadata"] = dict(iface.metadata or {})
            except Exception:  # noqa: BLE001
                result["metadata"] = {}

            return result

        return await self._hass.async_add_executor_job(_read)

    async def async_set_config(self, section: str, values: dict[str, Any]) -> None:
        """Write a config section to the radio."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _write() -> None:
            node = iface.localNode

            # Determine if this is a local_config or module_config section.
            local_sections = {
                "bluetooth", "device", "display", "lora",
                "network", "position", "power", "security",
            }
            module_sections = {
                "ambient_lighting", "audio", "canned_message",
                "detection_sensor", "external_notification", "mqtt",
                "neighbor_info", "paxcounter", "range_test", "serial",
                "store_forward", "telemetry",
            }

            if section in local_sections:
                config_obj = getattr(node.localConfig, section, None)
            elif section in module_sections:
                config_obj = getattr(node.moduleConfig, section, None)
            else:
                raise ValueError(f"Unknown config section: {section}")

            if config_obj is None:
                raise ValueError(f"Config section '{section}' not found on node")

            # Fixed-position lat/lng/altitude are not part of PositionConfig —
            # they live on the node's Position and are set via a separate
            # admin message (setFixedPosition / removeFixedPosition).
            remaining = dict(values)
            fixed_position = None
            fixed_lat = fixed_lng = fixed_altitude = 0
            if section == "position":
                fixed_lat = remaining.pop("fixed_lat", 0) or 0
                fixed_lng = remaining.pop("fixed_lng", 0) or 0
                fixed_altitude = remaining.pop("fixed_altitude", 0) or 0
                if "fixed_position" in remaining:
                    fixed_position = remaining.pop("fixed_position")

            # The MQTT config has no port field — fold the UI's Port value
            # back into the address string the firmware expects.
            if section == "mqtt" and "port" in remaining:
                port_val = remaining.pop("port")
                if "address" in remaining:
                    host, _ = _split_mqtt_address(str(remaining["address"]).strip())
                    try:
                        port_num = int(port_val)
                    except (TypeError, ValueError):
                        port_num = 1883
                    remaining["address"] = (
                        f"{host}:{port_num}" if host and port_num != 1883 else host
                    )

            if remaining:
                _apply_protobuf_values(config_obj, remaining, section)
                node.writeConfig(section)

            # Only push coordinates when real values were provided — a
            # payload without them (0, 0) would silently overwrite a
            # position already stored on the radio.
            if fixed_position is True and (fixed_lat or fixed_lng):
                node.setFixedPosition(
                    float(fixed_lat),
                    float(fixed_lng),
                    int(fixed_altitude),
                )
            elif fixed_position is False:
                node.removeFixedPosition()

        await self._hass.async_add_executor_job(_write)

    async def async_set_channel(self, index: int, settings: dict[str, Any]) -> None:
        """Write channel settings to the radio."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _write() -> None:
            node = iface.localNode
            channels = node.channels
            if not channels or index >= len(channels):
                raise ValueError(f"Channel index {index} out of range")

            ch = channels[index]
            ch_settings = ch.settings

            role_map = {"DISABLED": 0, "PRIMARY": 1, "SECONDARY": 2}
            for key, value in settings.items():
                if key == "role":
                    ch.role = role_map.get(value, value) if isinstance(value, str) else value
                elif key == "psk":
                    if isinstance(value, str):
                        import base64
                        ch_settings.psk = base64.b64decode(value)
                    elif isinstance(value, bytes):
                        ch_settings.psk = value
                elif hasattr(ch_settings, key):
                    setattr(ch_settings, key, value)
                else:
                    _LOGGER.warning("Unknown channel setting: %s", key)

            node.writeChannel(index)

        await self._hass.async_add_executor_job(_write)

    async def async_set_owner(
        self,
        long_name: str | None = None,
        short_name: str | None = None,
        is_licensed: bool = False,
    ) -> None:
        """Set the owner info on the radio."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _write() -> None:
            iface.localNode.setOwner(
                long_name=long_name,
                short_name=short_name,
                is_licensed=is_licensed,
            )

        await self._hass.async_add_executor_job(_write)

    async def async_device_action(self, action: str, *, seconds: int = 5) -> None:
        """Execute a device action (reboot, shutdown, factory reset, etc)."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _execute() -> None:
            node = iface.localNode
            if action == "reboot":
                node.reboot(seconds)
            elif action == "shutdown":
                node.shutdown(seconds)
            elif action == "factory_reset_config":
                node.factoryReset()
            elif action == "factory_reset_device":
                node.factoryReset()
                node.resetNodeDb()
            elif action == "reboot_ota":
                node.rebootOTA(seconds)
            elif action == "reset_nodedb":
                node.resetNodeDb()
            else:
                raise ValueError(f"Unknown device action: {action}")

        await self._hass.async_add_executor_job(_execute)

    async def async_send_waypoint(
        self,
        latitude: float,
        longitude: float,
        name: str = "",
        description: str = "",
        expire: int = 0,
        waypoint_id: int | None = None,
    ) -> int | None:
        """Send a waypoint to the mesh. Returns the waypoint ID."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _send() -> int | None:
            meshPacket = iface.sendWaypoint(
                name=name or "Waypoint",
                description=description or "",
                icon=0,
                expire=expire,
                waypoint_id=waypoint_id,
                latitude=latitude,
                longitude=longitude,
            )
            if meshPacket and hasattr(meshPacket, "id"):
                return meshPacket.id
            return None

        return await self._hass.async_add_executor_job(_send)

    async def async_delete_waypoint(self, waypoint_id: int) -> None:
        """Delete a waypoint from the mesh."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _delete() -> None:
            from meshtastic.protobuf import mesh_pb2

            wp = mesh_pb2.Waypoint()
            wp.id = waypoint_id
            wp.expire = 1  # Set to already expired to signal deletion
            iface.sendWaypoint(wp)

        await self._hass.async_add_executor_job(_delete)

    async def async_node_admin(self, node_id: str, action: str) -> None:
        """Perform admin action on a remote node."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _execute() -> None:
            if action == "favorite":
                iface.localNode.setFavorite(node_id)
            elif action == "unfavorite":
                iface.localNode.removeFavorite(node_id)
            elif action == "ignore":
                iface.localNode.setIgnored(node_id)
            elif action == "unignore":
                iface.localNode.removeIgnored(node_id)
            elif action == "remove":
                iface.localNode.removeNode(node_id)
            else:
                raise ValueError(f"Unknown node admin action: {action}")

        await self._hass.async_add_executor_job(_execute)

    def _start_watchdog(self) -> None:
        """Start the connection watchdog task."""
        self._stop_watchdog()
        self._last_activity_time = time.monotonic()  # reset on every (re)connect
        self._watchdog_task = asyncio.ensure_future(self._async_watchdog_loop())

    def _stop_watchdog(self) -> None:
        """Cancel the connection watchdog task."""
        if self._watchdog_task is not None:
            self._watchdog_task.cancel()
            self._watchdog_task = None

    async def _async_watchdog_loop(self) -> None:
        """Periodically probe the radio to detect silent TCP hangs.

        The meshtastic TCP interface can go silently dead — the socket stays
        open but stops receiving data, so no connection.lost pubsub event
        fires and the reconnect loop never starts.

        Two-stage detection:
        1. Fast check: meshtastic's internal _isConnected flag — catches clean drops.
        2. Inactivity probe: if no packets for WATCHDOG_THRESHOLD seconds, do a
           deeper interface probe with a WATCHDOG_TIMEOUT deadline — catches hung sockets.
        """
        await asyncio.sleep(WATCHDOG_INTERVAL)
        while self._state == ConnectionState.CONNECTED:
            # Stage 1: fast check, no I/O.
            if not await self._hass.async_add_executor_job(self._check_alive):
                _LOGGER.warning("Watchdog: interface reports disconnected, triggering reconnect")
                self._hass.loop.call_soon_threadsafe(self._async_handle_disconnected)
                return

            # Stage 2: deeper probe only when traffic has been absent too long.
            elapsed = time.monotonic() - self._last_activity_time
            if elapsed > WATCHDOG_THRESHOLD:
                _LOGGER.debug("Watchdog: no traffic for %.0fs, probing interface", elapsed)
                try:
                    alive = await asyncio.wait_for(
                        self._hass.async_add_executor_job(self._probe_interface),
                        timeout=WATCHDOG_TIMEOUT,
                    )
                    if not alive:
                        raise RuntimeError("probe returned falsy")
                    # Probe succeeded — reset timer so we don't probe every cycle.
                    self._last_activity_time = time.monotonic()
                    _LOGGER.debug("Watchdog: probe OK, radio is alive")
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning(
                        "Watchdog detected dead connection (%s), triggering reconnect", err
                    )
                    self._hass.loop.call_soon_threadsafe(self._async_handle_disconnected)
                    return
            else:
                _LOGGER.debug("Watchdog: radio is alive")

            await asyncio.sleep(WATCHDOG_INTERVAL)

    def _probe_interface(self) -> bool:
        """Lightweight liveness check — runs in executor.

        Returns True if the interface appears alive, raises or returns False
        if it is dead.  Uses the node count as a proxy: a connected interface
        always has at least our own node in the database.
        """
        if self._interface is None:
            return False
        try:
            nodes = self._interface.nodes
            # An empty dict is valid on a fresh connection; None means broken.
            return nodes is not None
        except Exception:  # noqa: BLE001
            return False

    def _create_interface(self) -> Any:
        """Create a meshtastic interface (runs in executor)."""
        if self._connection_type == ConnectionType.TCP:
            from meshtastic.tcp_interface import TCPInterface

            return TCPInterface(hostname=self._hostname, portNumber=self._port)

        if self._connection_type == ConnectionType.SERIAL:
            from meshtastic.serial_interface import SerialInterface

            return SerialInterface(devPath=self._serial_path)

        if self._connection_type == ConnectionType.BLE:
            from meshtastic.ble_interface import BLEInterface

            return BLEInterface(address=self._ble_address)

        raise ValueError(f"Unknown connection type: {self._connection_type}")

    async def _async_safe_create_interface(self, gen: int) -> Any:
        """Create interface (handles BLE natively on event loop, TCP/Serial in executor)."""
        if (
            self._state not in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING)
            or gen != self._reconnect_gen
        ):
            return None

        is_custom_factory = getattr(self._create_interface, "__func__", None) is not MeshtasticConnection._create_interface

        # Lets async_force_reconnect leave a running attempt alone; BLE
        # connects can take 20s+ and cancelling them only delays things.
        self._attempt_in_progress = True
        try:
            if self._connection_type == ConnectionType.BLE and not is_custom_factory:
                if not self._ble_address:
                    raise ValueError("BLE address not configured")
                ble_iface = HomeAssistantBLEInterface(
                    self._hass,
                    self._ble_address,
                    pin=self._ble_pin,
                )
                ble_iface.on_unsent = self._async_dispatch_unsent
                await ble_iface.async_connect()
                new_iface = ble_iface
            else:
                new_iface = await self._hass.async_add_executor_job(
                    self._safe_create_interface, gen
                )
        finally:
            self._attempt_in_progress = False

        if (
            self._state not in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING)
            or gen != self._reconnect_gen
        ):
            if isinstance(new_iface, HomeAssistantBLEInterface):
                await new_iface.async_close()
            elif new_iface is not None:
                try:
                    await self._hass.async_add_executor_job(new_iface.close)
                except Exception:
                    pass
            return None

        return new_iface

    def _safe_create_interface(self, gen: int) -> Any:
        """Create interface in executor and close immediately if aborted/disconnected."""
        if (
            self._state not in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING)
            or gen != self._reconnect_gen
        ):
            return None

        iface = self._create_interface()

        if (
            self._state not in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING)
            or gen != self._reconnect_gen
        ):
            try:
                iface.close()
            except Exception:  # noqa: BLE001
                pass
            return None

        return iface

    def _teardown_pubsub_listeners(self) -> None:
        """Unsubscribe all pubsub listeners from previous connections."""
        from pubsub import pub

        for callback_fn, topic in self._pubsub_listeners:
            try:
                pub.unsubscribe(callback_fn, topic)
            except Exception:  # noqa: BLE001
                pass
        self._pubsub_listeners.clear()

    def _setup_pubsub_listeners(self) -> None:
        """Subscribe to meshtastic pubsub events from the interface."""
        from pubsub import pub

        # Clean up any old subscriptions first (prevents duplicates on reconnect).
        self._teardown_pubsub_listeners()

        def _on_receive(packet: dict, interface: Any) -> None:
            if interface is not self._interface:
                return
            self._last_activity_time = time.monotonic()
            decoded = packet.get("decoded") or {}
            _LOGGER.debug(
                "Received packet portnum=%s from=%s",
                decoded.get("portnum", "?"),
                packet.get("fromId", "?"),
            )
            self._call_on_loop(self._async_dispatch_message, packet)

        def _on_connection_established(interface: Any, topic: Any = None) -> None:
            if interface is not self._interface:
                return
            self._call_on_loop(self._async_handle_connected)

        def _on_connection_lost(interface: Any, topic: Any = None) -> None:
            if interface is not self._interface:
                return
            self._call_on_loop(self._async_handle_disconnected)

        def _on_node_updated(node: dict, interface: Any = None) -> None:
            if interface is not None and interface is not self._interface:
                return
            self._last_activity_time = time.monotonic()
            self._call_on_loop(self._async_dispatch_node_update, node)

        # Store (callback, topic) tuples for cleanup on disconnect/reconnect.
        topics = [
            (_on_receive, "meshtastic.receive"),
            (_on_connection_established, "meshtastic.connection.established"),
            (_on_connection_lost, "meshtastic.connection.lost"),
            (_on_node_updated, "meshtastic.node.updated"),
        ]
        for callback_fn, topic in topics:
            pub.subscribe(callback_fn, topic)
            self._pubsub_listeners.append((callback_fn, topic))

    def _call_on_loop(self, func: Callable, *args: Any) -> None:
        """Schedule func on the HA event loop from a meshtastic worker thread.

        The radio can deliver a packet after HA has closed its loop during
        shutdown; drop it then instead of raising in the meshtastic thread.
        """
        if self._hass.loop.is_closed():
            return
        try:
            self._hass.loop.call_soon_threadsafe(func, *args)
        except RuntimeError:
            pass  # loop closed between the check and the call

    def _async_dispatch_message(self, packet: dict) -> None:
        """Dispatch a received packet to callbacks (runs on HA event loop)."""
        for cb in self._message_callbacks:
            try:
                cb(packet)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error in message callback")

    def _async_dispatch_node_update(self, node: dict) -> None:
        """Dispatch a node update to callbacks (runs on HA event loop)."""
        for cb in self._node_update_callbacks:
            try:
                cb(node)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error in node update callback")

    def _async_handle_connected(self) -> None:
        """Handle connection established (runs on HA event loop)."""
        self._set_state(ConnectionState.CONNECTED)
        self._start_watchdog()

    def _async_handle_disconnected(self) -> None:
        """Handle connection lost — start reconnect loop (runs on HA event loop)."""
        if self._state == ConnectionState.DISCONNECTED:
            return  # intentional disconnect, don't reconnect
        if (
            self._state == ConnectionState.RECONNECTING
            and self._reconnect_task is not None
            and not self._reconnect_task.done()
        ):
            return  # already actively reconnecting
        _LOGGER.warning("Lost connection to Meshtastic radio, will reconnect")
        self._stop_watchdog()
        self._reconnect_gen += 1
        self._set_state(ConnectionState.RECONNECTING)
        self._reconnect_task = asyncio.ensure_future(
            self._async_reconnect_loop(gen=self._reconnect_gen)
        )

    async def _async_reconnect_loop(self, initial_delay: int = MIN_RECONNECT_DELAY, gen: int = 0) -> None:
        """Attempt to reconnect with exponential backoff."""
        delay = initial_delay
        while self._state == ConnectionState.RECONNECTING and gen == self._reconnect_gen:
            if delay > 0:
                _LOGGER.debug("Reconnecting in %d seconds...", delay)
                await asyncio.sleep(delay)
            if self._state != ConnectionState.RECONNECTING or gen != self._reconnect_gen:
                return

            # Clean up old interface.
            if self._interface is not None:
                old = self._interface
                self._interface = None
                if isinstance(old, HomeAssistantBLEInterface):
                    await old.async_close()
                else:
                    try:
                        await self._hass.async_add_executor_job(old.close)
                    except Exception:  # noqa: BLE001
                        pass

            try:
                new_iface = await self._async_safe_create_interface(gen)
                if new_iface is None:
                    return

                self._interface = new_iface
                self._setup_pubsub_listeners()
                self._set_state(ConnectionState.CONNECTED)
                self._start_watchdog()
                _LOGGER.debug("Reconnected to Meshtastic radio")
                return
            except asyncio.CancelledError:
                raise
            except Exception as err:
                next_delay = min(max(delay * 2, MIN_RECONNECT_DELAY), MAX_RECONNECT_DELAY)
                _LOGGER.debug(
                    "Reconnect attempt failed (%s), next try in %d seconds",
                    err,
                    next_delay,
                )
                delay = next_delay

    async def _async_wait_for_reconnect(self) -> None:
        """Wait briefly for a reconnect in progress before sending.

        A BLE link can drop every few minutes and takes 15-40s to come back.
        Waiting turns a send made in that window into a short delay instead of
        a failure. A user-requested disconnect is not waited on.
        """
        if self._state not in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING):
            return
        try:
            await asyncio.wait_for(self._connected_event.wait(), SEND_RECONNECT_WAIT)
        except TimeoutError:
            pass

    def _set_state(self, new_state: ConnectionState) -> None:
        """Update connection state and notify callbacks."""
        old_state = self._state
        self._state = new_state
        if new_state == ConnectionState.CONNECTED:
            self._connected_event.set()
        else:
            self._connected_event.clear()
        if old_state != new_state:
            for cb in self._connection_change_callbacks:
                try:
                    cb(new_state, old_state)
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Error in connection change callback")

    def _check_alive(self) -> bool:
        """Check if the meshtastic interface is still connected (runs in executor)."""
        try:
            iface = self._interface
            if iface is None:
                return False
            if isinstance(iface, HomeAssistantBLEInterface):
                return bool(iface._link_up and iface.client and iface.client.is_connected)
            if hasattr(iface, "_isConnected") and not iface._isConnected:
                return False
            if hasattr(iface, "isConnected"):
                if hasattr(iface.isConnected, "is_set"):
                    if not iface.isConnected.is_set():
                        return False
                elif not iface.isConnected:
                    return False
            if hasattr(iface, "client") and iface.client is not None:
                if hasattr(iface.client, "is_connected") and not iface.client.is_connected:
                    return False
            return True
        except Exception:  # noqa: BLE001
            return False


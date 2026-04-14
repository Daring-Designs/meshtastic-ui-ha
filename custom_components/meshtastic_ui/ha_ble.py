"""HA-native BLE client and interface for Meshtastic radios.

Routes BLE connections through Home Assistant's Bluetooth stack,
enabling support for ESPHome Bluetooth proxies and local adapters alike.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Meshtastic BLE characteristic UUIDs.
SERVICE_UUID = "6ba1b218-15a8-461f-9fa8-5dcae273eafd"
TORADIO_UUID = "f75c76d2-129e-4dad-a1dd-7866124401e7"
FROMRADIO_UUID = "2c55e69e-4993-11ed-b878-0242ac120002"
FROMNUM_UUID = "ed9da18c-a800-4f66-a670-aa7547e34453"
LOGRADIO_UUID = "5a3d6e49-06e6-4423-9944-e9de8cdf9547"

# Timeout for bridging sync calls to HA's async event loop.
_ASYNC_TIMEOUT = 30


class HaBLEClient:
    """Synchronous BLE client that routes through HA's Bluetooth stack.

    Implements the same interface as meshtastic's internal ``BLEClient``
    wrapper so it can be used as a drop-in replacement.  All async
    operations are bridged to Home Assistant's event loop via
    ``asyncio.run_coroutine_threadsafe``.
    """

    def __init__(
        self,
        hass: HomeAssistant,
        address: str,
        disconnected_callback: Any = None,
    ) -> None:
        self._hass = hass
        self._address = address
        self._disconnected_callback = disconnected_callback
        self._client: Any | None = None  # BleakClient
        self._lock = threading.Lock()

    # -- async helpers -------------------------------------------------------

    def _run_async(self, coro: Any, timeout: float = _ASYNC_TIMEOUT) -> Any:
        """Run *coro* on HA's event loop from a worker thread."""
        future = asyncio.run_coroutine_threadsafe(coro, self._hass.loop)
        return future.result(timeout=timeout)

    # -- public sync interface (matches meshtastic BLEClient) ----------------

    def connect(self) -> None:
        """Establish a BLE connection through HA's proxy-aware stack."""
        _LOGGER.debug("HaBLEClient: connecting to %s via HA Bluetooth", self._address)
        self._run_async(self._async_connect())

    async def _async_connect(self) -> None:
        from bleak_retry_connector import establish_connection
        from homeassistant.components.bluetooth import (
            async_ble_device_from_address,
        )

        ble_device = async_ble_device_from_address(
            self._hass, self._address, connectable=True
        )
        if ble_device is None:
            raise ConnectionError(
                f"Meshtastic device {self._address} not found in HA Bluetooth. "
                "Ensure a Bluetooth adapter or proxy can reach the device."
            )

        _LOGGER.debug(
            "HaBLEClient: resolved BLE device %s via HA (source: %s)",
            ble_device.address,
            getattr(ble_device, "details", {}).get("source", "local"),
        )

        from bleak import BleakClient

        def _on_disconnect(client: Any) -> None:
            _LOGGER.debug("HaBLEClient: disconnected from %s", self._address)
            if self._disconnected_callback:
                self._disconnected_callback(client)

        self._client = await establish_connection(
            BleakClient,
            ble_device,
            self._address,
            disconnected_callback=_on_disconnect,
        )
        _LOGGER.info("HaBLEClient: connected to %s via HA Bluetooth", self._address)

    def disconnect(self) -> None:
        """Disconnect from the BLE device."""
        if self._client and self._client.is_connected:
            try:
                self._run_async(self._client.disconnect())
            except Exception:  # noqa: BLE001
                pass
        self._client = None

    def discover(
        self,
        timeout: float = 10,
        return_adv: bool = False,
        service_uuids: list[str] | None = None,
    ) -> Any:
        """Discover BLE devices via HA's Bluetooth stack.

        ``async_discovered_service_info`` must be called from HA's event
        loop thread, so we schedule it there and block for the result.
        """

        async def _gather() -> list:
            from homeassistant.components.bluetooth import (
                async_discovered_service_info,
            )

            result = []
            for info in async_discovered_service_info(self._hass):
                if service_uuids:
                    info_uuids = [str(u) for u in info.service_uuids]
                    if not any(u in info_uuids for u in service_uuids):
                        continue
                result.append(info.device)
            return result

        future = asyncio.run_coroutine_threadsafe(_gather(), self._hass.loop)
        return future.result(timeout=timeout + 5)

    def read_gatt_char(self, uuid: str) -> bytes:
        """Read a GATT characteristic."""
        if self._client is None:
            raise RuntimeError("Not connected")
        return self._run_async(self._client.read_gatt_char(uuid))

    def write_gatt_char(
        self, uuid: str, data: bytes, response: bool = False
    ) -> None:
        """Write to a GATT characteristic."""
        if self._client is None:
            raise RuntimeError("Not connected")
        self._run_async(self._client.write_gatt_char(uuid, data, response=response))

    def start_notify(self, uuid: str, callback: Any) -> None:
        """Subscribe to notifications on a GATT characteristic."""
        if self._client is None:
            raise RuntimeError("Not connected")
        self._run_async(self._client.start_notify(uuid, callback))

    def has_characteristic(self, uuid: str) -> bool:
        """Check whether the device exposes a GATT characteristic."""
        if self._client is None:
            return False
        try:
            services = self._client.services
            if services is None:
                return False
            for service in services:
                for char in service.characteristics:
                    if char.uuid == uuid:
                        return True
        except Exception:  # noqa: BLE001
            pass
        return False

    @property
    def is_connected(self) -> bool:
        """Return True if the BLE client is connected."""
        return self._client is not None and self._client.is_connected

    # -- context manager -----------------------------------------------------

    def __enter__(self) -> HaBLEClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.disconnect()


def create_ha_ble_interface(
    hass: HomeAssistant,
    address: str,
    noProto: bool = False,
    noNodes: bool = False,
) -> Any:
    """Create a meshtastic BLEInterface that uses HA's Bluetooth stack.

    Patches meshtastic's BLEClient and find_device so the standard
    BLEInterface constructor routes through HA's Bluetooth proxies.
    ``find_device`` is replaced to skip redundant scanning — we already
    know the address from HA's discovery.
    """
    import meshtastic.ble_interface as ble_mod
    from meshtastic.ble_interface import BLEInterface

    OrigBLEClient = ble_mod.BLEClient
    orig_find_device = BLEInterface.find_device

    class _PatchedBLEClient(HaBLEClient):
        """Adapter that matches the meshtastic BLEClient constructor."""

        def __init__(self, client_address: str | None = None, **kwargs: Any) -> None:
            super().__init__(
                hass=hass,
                address=client_address or address,
                disconnected_callback=kwargs.get("disconnected_callback"),
            )

    def _patched_find_device(self_iface: Any, addr: str | None = None) -> Any:
        """Skip BLE scanning — return a synthetic BLEDevice for the known address.

        HA already discovered the device, so re-scanning is unnecessary and
        would fail anyway because meshtastic's scan uses raw Bleak.
        """
        from bleak import BLEDevice

        target = addr or address
        _LOGGER.debug(
            "HaBLEInterface: skipping scan, using known address %s", target
        )
        return BLEDevice(address=target, name="Meshtastic")

    # Patch, construct, restore.
    ble_mod.BLEClient = _PatchedBLEClient
    BLEInterface.find_device = _patched_find_device
    try:
        _LOGGER.debug("HaBLEInterface: creating interface for %s", address)
        iface = BLEInterface(
            address=address,
            noProto=noProto,
            noNodes=noNodes,
        )
    finally:
        ble_mod.BLEClient = OrigBLEClient
        BLEInterface.find_device = orig_find_device

    return iface

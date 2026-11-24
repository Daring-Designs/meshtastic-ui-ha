"""Keep the HA host's Bluetooth links off busy 2.4 GHz channels.

A BLE connection hops across 37 data channels. When Wi-Fi, Zigbee or Thread
sit on some of them, packets sent there are lost, and enough losses in a row
end the link with a supervision timeout. The adapter running the connection
can be told which channels to avoid (HCI LE Set Host Channel Classification);
it then leaves them out of every link's hopping pattern.

The setting lives in the controller and is lost when the adapter resets, so
it is re-applied at startup, whenever a BLE radio connects, and on a timer.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import select
import socket
import struct
import time
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from .const import CONF_BLE_ADDRESS, DOMAIN, SIGNAL_CONNECTION_STATE

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.ble_channels"
STORAGE_VERSION = 1
REAPPLY_INTERVAL = timedelta(minutes=5)

MODE_OFF = "off"
MODE_AUTO = "auto"
MODE_MANUAL = "manual"
MODES = (MODE_OFF, MODE_AUTO, MODE_MANUAL)

NUM_DATA_CHANNELS = 37
ADV_CHANNELS = {37: 2402, 38: 2426, 39: 2480}
MIN_CHANNELS = 2  # the spec's minimum for a channel map
AUTO_MIN_CHANNELS = 8  # automatic mode never goes below this many
BLE_HALF_WIDTH = 1  # a BLE channel occupies about +-1 MHz
IEEE802154_WIDTH = 2  # Zigbee and Thread channels are 2 MHz wide

# HCI command opcodes (OGF 0x08, LE controller commands).
_OP_SET_HOST_CHANNEL_CLASSIFICATION = (0x08 << 10) | 0x0014
_OP_READ_CHANNEL_MAP = (0x08 << 10) | 0x0015
_HCI_COMMAND_PKT = 0x01
_HCI_EVENT_PKT = 0x04
_EVT_CMD_COMPLETE = 0x0E
_HCIGETCONNLIST = 0x800448D4
_LE_LINK = 0x80
_BT_CONNECTED = 1
_HCI_TIMEOUT = 2.0

# NetworkManager D-Bus names.
_NM_BUS = "org.freedesktop.NetworkManager"
_NM_PATH = "/org/freedesktop/NetworkManager"
_NM_DEVICE = "org.freedesktop.NetworkManager.Device"
_NM_WIRELESS = "org.freedesktop.NetworkManager.Device.Wireless"
_NM_AP = "org.freedesktop.NetworkManager.AccessPoint"
_NM_DEVICE_TYPE_WIFI = 2
_NM_STATE_DISCONNECTED = 30
_WIFI_WAIT = 15.0

Z2M_INFO_TOPIC = "zigbee2mqtt/bridge/info"


# ── Channel math ────────────────────────────────────────────────────────


def ble_channel_freq(channel: int) -> int:
    """Return the centre frequency in MHz of a BLE channel (0-39)."""
    if channel in ADV_CHANNELS:
        return ADV_CHANNELS[channel]
    if channel <= 10:
        return 2404 + 2 * channel
    return 2428 + 2 * (channel - 11)


def wifi_channel_freq(channel: int) -> int:
    """Return the centre frequency in MHz of a 2.4 GHz Wi-Fi channel."""
    return 2484 if channel == 14 else 2407 + 5 * channel


def wifi_freq_channel(freq: int) -> int | None:
    """Return the 2.4 GHz Wi-Fi channel for a frequency, or None outside the band."""
    if freq == 2484:
        return 14
    if 2412 <= freq <= 2472 and (freq - 2407) % 5 == 0:
        return (freq - 2407) // 5
    return None


def ieee802154_channel_freq(channel: int) -> int:
    """Return the centre frequency in MHz of a Zigbee/Thread channel (11-26)."""
    return 2405 + 5 * (channel - 11)


def channel_scores(occupants: list[dict[str, Any]]) -> list[float]:
    """Return how busy each BLE data channel is, 0 meaning nothing overlaps it.

    Each overlapping neighbour adds its strength (0-1); neighbours with no
    measured strength, such as hand-entered networks, count as 1.
    """
    scores = [0.0] * NUM_DATA_CHANNELS
    for occ in occupants:
        low = occ["center"] - occ["width"] / 2
        high = occ["center"] + occ["width"] / 2
        weight = occ["strength"] / 100 if occ.get("strength") is not None else 1.0
        for ch in range(NUM_DATA_CHANNELS):
            freq = ble_channel_freq(ch)
            if freq + BLE_HALF_WIDTH > low and freq - BLE_HALF_WIDTH < high:
                scores[ch] += weight
    return scores


def auto_channels(occupants: list[dict[str, Any]]) -> list[int]:
    """Pick the BLE data channels nothing overlaps, keeping at least AUTO_MIN_CHANNELS."""
    scores = channel_scores(occupants)
    chosen = [ch for ch in range(NUM_DATA_CHANNELS) if scores[ch] == 0]
    if len(chosen) < AUTO_MIN_CHANNELS:
        # Among equally busy channels, prefer those farthest from a neighbour's
        # centre, where its energy is lowest.
        def _distance(ch: int) -> float:
            freq = ble_channel_freq(ch)
            return min((abs(freq - occ["center"]) for occ in occupants), default=0)

        extra = sorted(
            (ch for ch in range(NUM_DATA_CHANNELS) if ch not in chosen),
            key=lambda ch: (scores[ch], -_distance(ch), ch),
        )
        chosen = sorted(chosen + extra[: AUTO_MIN_CHANNELS - len(chosen)])
    return chosen


def channels_to_mask(channels: list[int]) -> bytes:
    """Encode BLE data channels as the 5-byte HCI channel map (bit n = channel n)."""
    value = 0
    for ch in channels:
        if 0 <= ch < NUM_DATA_CHANNELS:
            value |= 1 << ch
    return value.to_bytes(5, "little")


def mask_to_channels(mask: bytes) -> list[int]:
    """Decode a 5-byte HCI channel map into BLE data channels."""
    value = int.from_bytes(mask[:5], "little")
    return [ch for ch in range(NUM_DATA_CHANNELS) if value & (1 << ch)]


# ── HCI access ──────────────────────────────────────────────────────────


def _adapter_index(adapter: str) -> int:
    if not adapter.startswith("hci") or not adapter[3:].isdigit():
        raise ValueError(f"not a Bluetooth adapter name: {adapter}")
    return int(adapter[3:])


def _hci_socket(dev_id: int) -> socket.socket:
    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_RAW, socket.BTPROTO_HCI)
    sock.bind((dev_id,))
    # Event packets only; struct hci_ufilter is padded to 16 bytes.
    sock.setsockopt(
        socket.SOL_HCI,
        socket.HCI_FILTER,
        struct.pack("<IIIHxx", 1 << _HCI_EVENT_PKT, 0xFFFFFFFF, 0xFFFFFFFF, 0),
    )
    return sock


def build_hci_command(opcode: int, params: bytes) -> bytes:
    """Build an HCI command packet."""
    return struct.pack("<BHB", _HCI_COMMAND_PKT, opcode, len(params)) + params


def _hci_request(sock: socket.socket, opcode: int, params: bytes) -> bytes:
    """Send an HCI command and return its Command Complete return parameters."""
    sock.send(build_hci_command(opcode, params))
    deadline = time.monotonic() + _HCI_TIMEOUT
    while (remaining := deadline - time.monotonic()) > 0:
        ready, _, _ = select.select([sock], [], [], remaining)
        if not ready:
            break
        pkt = sock.recv(260)
        if (
            len(pkt) >= 6
            and pkt[1] == _EVT_CMD_COMPLETE
            and struct.unpack_from("<H", pkt, 4)[0] == opcode
        ):
            return pkt[6:]
    raise TimeoutError(f"no response to HCI command 0x{opcode:04x}")


def _le_connections(sock: socket.socket, dev_id: int) -> list[tuple[int, str]]:
    """Return (handle, address) for each LE link on the adapter."""
    import fcntl  # noqa: PLC0415  # Linux only

    max_conns = 10
    buf = bytearray(struct.pack("<HH", dev_id, max_conns) + bytes(16 * max_conns))
    fcntl.ioctl(sock.fileno(), _HCIGETCONNLIST, buf)
    count = struct.unpack_from("<H", buf, 2)[0]
    links = []
    for i in range(min(count, max_conns)):
        off = 4 + 16 * i
        handle = struct.unpack_from("<H", buf, off)[0]
        address = ":".join(f"{b:02X}" for b in reversed(buf[off + 2 : off + 8]))
        link_type = buf[off + 8]
        state = struct.unpack_from("<H", buf, off + 10)[0]
        if link_type == _LE_LINK and state == _BT_CONNECTED:
            links.append((handle, address))
    return links


def hci_set_host_channels(adapter: str, channels: list[int]) -> None:
    """Tell the adapter which BLE data channels its links may use (blocking)."""
    sock = _hci_socket(_adapter_index(adapter))
    try:
        result = _hci_request(
            sock, _OP_SET_HOST_CHANNEL_CLASSIFICATION, channels_to_mask(channels)
        )
    finally:
        sock.close()
    if result[0] != 0:
        raise OSError(f"controller rejected the channel map (status 0x{result[0]:02x})")


def hci_read_link_maps(adapter: str) -> list[dict[str, Any]]:
    """Return the channel map each LE link on the adapter is using (blocking)."""
    dev_id = _adapter_index(adapter)
    sock = _hci_socket(dev_id)
    try:
        maps = []
        for handle, address in _le_connections(sock, dev_id):
            result = _hci_request(sock, _OP_READ_CHANNEL_MAP, struct.pack("<H", handle))
            if result[0] == 0:
                maps.append({"address": address, "channels": mask_to_channels(result[3:8])})
        return maps
    finally:
        sock.close()


def list_adapters() -> list[str]:
    """Return the Bluetooth adapters on the host."""
    try:
        return sorted(n for n in os.listdir("/sys/class/bluetooth") if n[3:].isdigit())
    except OSError:
        return []


# ── Neighbour sources ───────────────────────────────────────────────────


class WifiUnavailableError(Exception):
    """The host has no Wi-Fi radio that NetworkManager can scan with."""


async def async_scan_wifi() -> list[dict[str, Any]]:
    """Scan for 2.4 GHz Wi-Fi networks through NetworkManager.

    Wi-Fi shares the radio with Bluetooth on many boards, so if it was switched
    off it is switched on only for the scan and off again afterwards.
    """
    try:
        from dbus_fast import BusType  # noqa: PLC0415
        from dbus_fast.aio import MessageBus  # noqa: PLC0415
    except ImportError as err:
        raise WifiUnavailableError("D-Bus support is not available") from err

    try:
        bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    except Exception as err:  # noqa: BLE001
        raise WifiUnavailableError(f"cannot reach the system D-Bus: {err}") from err

    async def _iface(path: str, name: str) -> Any:
        intro = await bus.introspect(_NM_BUS, path)
        return bus.get_proxy_object(_NM_BUS, path, intro).get_interface(name)

    try:
        try:
            nm = await _iface(_NM_PATH, _NM_BUS)
        except Exception as err:  # noqa: BLE001
            raise WifiUnavailableError("NetworkManager is not available") from err
        if not await nm.get_wireless_hardware_enabled():
            raise WifiUnavailableError("the Wi-Fi radio is switched off in hardware")
        was_enabled = await nm.get_wireless_enabled()
        if not was_enabled:
            await nm.set_wireless_enabled(True)
        try:
            return await _scan_with_nm(nm, _iface)
        finally:
            if not was_enabled:
                await nm.set_wireless_enabled(False)
    finally:
        bus.disconnect()


async def _scan_with_nm(nm: Any, _iface: Any) -> list[dict[str, Any]]:
    deadline = time.monotonic() + _WIFI_WAIT
    wireless = None
    while wireless is None:
        for path in await nm.call_get_devices():
            dev = await _iface(path, _NM_DEVICE)
            if (
                await dev.get_device_type() == _NM_DEVICE_TYPE_WIFI
                and await dev.get_state() >= _NM_STATE_DISCONNECTED
            ):
                wireless = await _iface(path, _NM_WIRELESS)
                break
        if wireless is None:
            if time.monotonic() > deadline:
                raise WifiUnavailableError("the host has no Wi-Fi interface")
            await asyncio.sleep(0.5)

    last_scan = await wireless.get_last_scan()
    try:
        await wireless.call_request_scan({})
    except Exception:  # noqa: BLE001
        # A scan already running counts; we only need fresh results.
        _LOGGER.debug("Wi-Fi scan request refused", exc_info=True)
    while time.monotonic() < deadline:
        if await wireless.get_last_scan() != last_scan:
            break
        await asyncio.sleep(0.5)

    networks = []
    for path in await wireless.call_get_all_access_points():
        ap = await _iface(path, _NM_AP)
        freq = await ap.get_frequency()
        channel = wifi_freq_channel(freq)
        if channel is None:
            continue
        try:
            width = int(await ap.get_bandwidth()) or 20
        except Exception:  # noqa: BLE001
            width = 20
        networks.append(
            {
                "ssid": bytes(await ap.get_ssid()).decode("utf-8", "replace"),
                "bssid": await ap.get_hw_address(),
                "channel": channel,
                "width": width,
                "strength": int(await ap.get_strength()),
            }
        )
    return networks


async def _async_thread_channels(hass: HomeAssistant) -> list[int]:
    if "thread" not in hass.config.components:
        return []
    try:
        from python_otbr_api.tlv_parser import MeshcopTLVType, parse_tlv  # noqa: PLC0415

        from homeassistant.components.thread import async_get_preferred_dataset  # noqa: PLC0415

        dataset = await async_get_preferred_dataset(hass)
        if not dataset:
            return []
        item = parse_tlv(dataset).get(MeshcopTLVType.CHANNEL)
        return [item.channel & 0xFFFF] if item is not None else []
    except Exception:  # noqa: BLE001
        _LOGGER.debug("Could not read the Thread channel", exc_info=True)
        return []


async def _async_zha_channels(hass: HomeAssistant) -> list[int]:
    if "zha" not in hass.config.components:
        return []
    try:
        from homeassistant.components.zha.api import async_get_network_settings  # noqa: PLC0415

        settings = await async_get_network_settings(hass)
        return [int(settings.network_info.channel)] if settings else []
    except Exception:  # noqa: BLE001
        _LOGGER.debug("Could not read the ZHA channel", exc_info=True)
        return []


# ── Manager ─────────────────────────────────────────────────────────────


class BleChannelManager:
    """Owns the host adapter's channel setting and the neighbours shown for it."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.settings: dict[str, Any] = {
            "adapter": "hci0",
            "mode": MODE_OFF,
            "manual_channels": list(range(NUM_DATA_CHANNELS)),
            "wifi_manual": [],
            "wifi_scan": None,
        }
        self.applied: list[int] | None = None
        self.last_applied_at: float | None = None
        self.last_error: str | None = None
        self._z2m_channel: int | None = None
        self._unsubs: list[Any] = []
        self._lock = asyncio.Lock()

    async def async_setup(self) -> None:
        """Load settings, apply them, and keep them applied."""
        if saved := await self._store.async_load():
            self.settings.update(saved)
        self._unsubs.append(
            async_track_time_interval(self._hass, self._async_periodic, REAPPLY_INTERVAL)
        )
        self._unsubs.append(
            async_dispatcher_connect(
                self._hass, SIGNAL_CONNECTION_STATE, self._on_connection_state
            )
        )
        await self._async_subscribe_z2m()
        if self.settings["mode"] != MODE_OFF:
            await self.async_apply()

    def async_teardown(self) -> None:
        """Stop re-applying and drop subscriptions."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    async def _async_subscribe_z2m(self) -> None:
        if "mqtt" not in self._hass.config.components:
            return
        try:
            from homeassistant.components import mqtt  # noqa: PLC0415

            @callback
            def _on_info(msg: Any) -> None:
                try:
                    self._z2m_channel = int(json.loads(msg.payload)["network"]["channel"])
                except (ValueError, KeyError, TypeError):
                    pass

            self._unsubs.append(await mqtt.async_subscribe(self._hass, Z2M_INFO_TOPIC, _on_info))
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Could not subscribe to Zigbee2MQTT bridge info", exc_info=True)

    @callback
    def _on_connection_state(self, data: dict[str, Any]) -> None:
        # A connect may follow an adapter reset, which clears the setting.
        if str(data.get("state")) == "connected" and self.settings["mode"] != MODE_OFF:
            self._hass.async_create_task(self.async_apply())

    async def _async_periodic(self, _now: Any) -> None:
        if self.settings["mode"] != MODE_OFF:
            await self.async_apply()

    async def async_occupants(self) -> list[dict[str, Any]]:
        """Return the 2.4 GHz neighbours known right now."""
        occupants: list[dict[str, Any]] = []
        scan = self.settings.get("wifi_scan") or {}
        for net in scan.get("networks", []):
            occupants.append(
                {
                    "kind": "wifi",
                    "source": "scan",
                    "label": net["ssid"] or net["bssid"],
                    "channel": net["channel"],
                    "center": wifi_channel_freq(net["channel"]),
                    "width": net["width"],
                    "strength": net["strength"],
                }
            )
        for net in self.settings["wifi_manual"]:
            occupants.append(
                {
                    "kind": "wifi",
                    "source": "manual",
                    "label": net["ssid"],
                    "channel": net["channel"],
                    "center": wifi_channel_freq(net["channel"]),
                    "width": net["width"],
                    "strength": None,
                }
            )
        for kind, source, channels in (
            ("thread", "thread", await _async_thread_channels(self._hass)),
            ("zigbee", "zha", await _async_zha_channels(self._hass)),
            ("zigbee", "zigbee2mqtt", [self._z2m_channel] if self._z2m_channel else []),
        ):
            for ch in channels:
                occupants.append(
                    {
                        "kind": kind,
                        "source": source,
                        "label": f"{source} {ch}",
                        "channel": ch,
                        "center": ieee802154_channel_freq(ch),
                        "width": IEEE802154_WIDTH,
                        "strength": None,
                    }
                )
        return occupants

    async def async_target_channels(self) -> list[int]:
        """Return the channels the current mode allows."""
        mode = self.settings["mode"]
        if mode == MODE_AUTO:
            return auto_channels(await self.async_occupants())
        if mode == MODE_MANUAL:
            return sorted(self.settings["manual_channels"])
        return list(range(NUM_DATA_CHANNELS))

    async def async_apply(self) -> None:
        """Send the allowed channels to the adapter."""
        async with self._lock:
            channels = await self.async_target_channels()
            try:
                await self._hass.async_add_executor_job(
                    hci_set_host_channels, self.settings["adapter"], channels
                )
            except Exception as err:  # noqa: BLE001
                if self.last_error != str(err):
                    _LOGGER.warning("Could not set the Bluetooth channel map: %s", err)
                self.last_error = str(err)
                return
            self.applied = channels
            self.last_applied_at = time.time()
            self.last_error = None

    async def async_update(self, changes: dict[str, Any]) -> None:
        """Save new settings and apply them."""
        if "manual_channels" in changes and len(changes["manual_channels"]) < MIN_CHANNELS:
            raise ValueError(f"at least {MIN_CHANNELS} channels must stay allowed")
        self.settings.update(changes)
        await self._store.async_save(self.settings)
        await self.async_apply()

    async def async_scan_wifi(self) -> None:
        """Scan for Wi-Fi networks, keep the result and re-apply automatic mode."""
        networks = await async_scan_wifi()
        self.settings["wifi_scan"] = {"time": time.time(), "networks": networks}
        await self._store.async_save(self.settings)
        if self.settings["mode"] == MODE_AUTO:
            await self.async_apply()

    def _device_name(self, address: str) -> str | None:
        """Name a connected device: our radio's title, else what Bluetooth calls it."""
        for entry_data in self._hass.data.get(DOMAIN, {}).get("entries", {}).values():
            configured = entry_data.get("config", {}).get(CONF_BLE_ADDRESS) or ""
            if configured.upper() == address.upper():
                return entry_data.get("title")
        try:
            from homeassistant.components import bluetooth  # noqa: PLC0415

            device = bluetooth.async_ble_device_from_address(self._hass, address)
        except Exception:  # noqa: BLE001
            return None
        return device.name if device is not None and device.name != address else None

    async def async_state(self) -> dict[str, Any]:
        """Return everything the settings page shows."""
        occupants = await self.async_occupants()
        scores = channel_scores(occupants)
        try:
            links = await self._hass.async_add_executor_job(
                hci_read_link_maps, self.settings["adapter"]
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Could not read link channel maps: %s", err)
            links = []
        for link in links:
            link["name"] = self._device_name(link["address"])
        return {
            **{k: self.settings[k] for k in ("adapter", "mode", "manual_channels", "wifi_manual")},
            "wifi_scan": self.settings.get("wifi_scan"),
            "adapters": await self._hass.async_add_executor_job(list_adapters),
            "occupants": occupants,
            "channels": [
                {"index": ch, "freq": ble_channel_freq(ch), "score": round(scores[ch], 2)}
                for ch in range(NUM_DATA_CHANNELS)
            ],
            "advertising": [{"index": ch, "freq": f} for ch, f in ADV_CHANNELS.items()],
            "auto_channels": auto_channels(occupants),
            "applied": self.applied,
            "last_applied_at": self.last_applied_at,
            "last_error": self.last_error,
            "links": links,
        }

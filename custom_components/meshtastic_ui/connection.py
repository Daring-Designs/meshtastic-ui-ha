"""Meshtastic radio connection manager."""

from __future__ import annotations

import asyncio
import enum
import logging
from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

MIN_RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 300  # 5 minutes


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
    ) -> None:
        """Initialize the connection manager."""
        self._hass = hass
        self._connection_type = connection_type
        self._hostname = hostname
        self._port = port
        self._serial_path = serial_path
        self._ble_address = ble_address

        self._interface: Any | None = None
        self._state = ConnectionState.DISCONNECTED
        self._reconnect_task: asyncio.Task | None = None

        self._message_callbacks: list[Callable] = []
        self._node_update_callbacks: list[Callable] = []
        self._connection_change_callbacks: list[Callable] = []

    @property
    def state(self) -> ConnectionState:
        """Return the current connection state."""
        return self._state

    @property
    def connection_type(self) -> ConnectionType:
        """Return the connection type."""
        return self._connection_type

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
        try:
            self._interface = await self._hass.async_add_executor_job(
                self._create_interface
            )
            self._setup_pubsub_listeners()
            self._set_state(ConnectionState.CONNECTED)
            _LOGGER.info(
                "Connected to Meshtastic radio via %s", self._connection_type
            )
        except Exception as err:
            _LOGGER.error("Failed to connect to Meshtastic radio: %s", err)
            self._interface = None
            self._set_state(ConnectionState.DISCONNECTED)
            raise

    async def async_disconnect(self) -> None:
        """Disconnect from the radio and stop reconnection attempts."""
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            self._reconnect_task = None

        if self._interface is not None:
            iface = self._interface
            self._interface = None
            try:
                await self._hass.async_add_executor_job(iface.close)
            except Exception:  # noqa: BLE001
                pass

        self._set_state(ConnectionState.DISCONNECTED)

    async def async_send_text(
        self,
        text: str,
        destination_id: str | None = None,
        channel_index: int = 0,
    ) -> None:
        """Send a text message via the radio."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _send() -> None:
            if destination_id:
                iface.sendText(
                    text, destinationId=destination_id, channelIndex=channel_index
                )
            else:
                iface.sendText(text, channelIndex=channel_index)

        await self._hass.async_add_executor_job(_send)

    async def async_send_traceroute(self, destination_id: str) -> None:
        """Send a traceroute request."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _trace() -> None:
            iface.sendTraceRoute(dest=destination_id)

        await self._hass.async_add_executor_job(_trace)

    async def async_request_position(self, destination_id: str) -> None:
        """Request a position update from a node."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _request() -> None:
            iface.sendPosition(destinationId=destination_id, wantResponse=True)

        await self._hass.async_add_executor_job(_request)

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

    def _setup_pubsub_listeners(self) -> None:
        """Subscribe to meshtastic pubsub events from the interface."""
        from pubsub import pub

        def _on_receive(packet: dict, interface: Any) -> None:
            if interface is not self._interface:
                return
            self._hass.loop.call_soon_threadsafe(
                self._async_dispatch_message, packet
            )

        def _on_connection_established(interface: Any, topic: Any = None) -> None:
            if interface is not self._interface:
                return
            self._hass.loop.call_soon_threadsafe(
                self._async_handle_connected
            )

        def _on_connection_lost(interface: Any, topic: Any = None) -> None:
            if interface is not self._interface:
                return
            self._hass.loop.call_soon_threadsafe(
                self._async_handle_disconnected
            )

        def _on_node_updated(node: dict, interface: Any = None) -> None:
            if interface is not None and interface is not self._interface:
                return
            self._hass.loop.call_soon_threadsafe(
                self._async_dispatch_node_update, node
            )

        pub.subscribe(_on_receive, "meshtastic.receive")
        pub.subscribe(_on_connection_established, "meshtastic.connection.established")
        pub.subscribe(_on_connection_lost, "meshtastic.connection.lost")
        pub.subscribe(_on_node_updated, "meshtastic.node.updated")

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

    def _async_handle_disconnected(self) -> None:
        """Handle connection lost — start reconnect loop (runs on HA event loop)."""
        if self._state == ConnectionState.DISCONNECTED:
            return  # intentional disconnect, don't reconnect
        _LOGGER.warning("Lost connection to Meshtastic radio, will reconnect")
        self._set_state(ConnectionState.RECONNECTING)
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.ensure_future(
                self._async_reconnect_loop()
            )

    async def _async_reconnect_loop(self) -> None:
        """Attempt to reconnect with exponential backoff."""
        delay = MIN_RECONNECT_DELAY
        while self._state == ConnectionState.RECONNECTING:
            _LOGGER.debug("Reconnecting in %d seconds...", delay)
            await asyncio.sleep(delay)
            if self._state != ConnectionState.RECONNECTING:
                return

            # Clean up old interface
            if self._interface is not None:
                old = self._interface
                self._interface = None
                try:
                    await self._hass.async_add_executor_job(old.close)
                except Exception:  # noqa: BLE001
                    pass

            try:
                self._interface = await self._hass.async_add_executor_job(
                    self._create_interface
                )
                self._setup_pubsub_listeners()
                self._set_state(ConnectionState.CONNECTED)
                _LOGGER.info("Reconnected to Meshtastic radio")
                return
            except Exception:  # noqa: BLE001
                _LOGGER.debug(
                    "Reconnect attempt failed, next try in %d seconds",
                    min(delay * 2, MAX_RECONNECT_DELAY),
                )
                delay = min(delay * 2, MAX_RECONNECT_DELAY)

    def _set_state(self, new_state: ConnectionState) -> None:
        """Update connection state and notify callbacks."""
        old_state = self._state
        self._state = new_state
        if old_state != new_state:
            for cb in self._connection_change_callbacks:
                try:
                    cb(new_state, old_state)
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Error in connection change callback")

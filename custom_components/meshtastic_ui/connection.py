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

        if field.message_type is not None and field.label != FieldDescriptor.LABEL_REPEATED:
            # Nested sub-message — recurse into it.
            if isinstance(value, dict):
                sub_msg = getattr(proto_obj, key)
                _apply_protobuf_values(sub_msg, value, f"{context}.{key}")
            else:
                _LOGGER.warning(
                    "Expected dict for sub-message field '%s' in '%s', got %s",
                    key, context or "config", type(value).__name__,
                )
        elif field.label == FieldDescriptor.LABEL_REPEATED:
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
            and field.label != FieldDescriptor.LABEL_REPEATED
        ):
            sub_dict = d.get(field.name)
            if isinstance(sub_dict, dict):
                sub_msg = getattr(proto_obj, field.name)
                _fill_enum_defaults(sub_msg, sub_dict)


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
            _LOGGER.debug(
                "Connected to Meshtastic radio via %s", self._connection_type
            )
        except Exception as err:
            _LOGGER.warning(
                "Initial connection to Meshtastic radio failed (%s), will retry", err
            )
            self._interface = None
            self._set_state(ConnectionState.RECONNECTING)
            if self._reconnect_task is None or self._reconnect_task.done():
                self._reconnect_task = asyncio.ensure_future(
                    self._async_reconnect_loop()
                )

    async def async_disconnect(self) -> None:
        """Disconnect from the radio and stop reconnection attempts."""
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            self._reconnect_task = None

        self._teardown_pubsub_listeners()

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
        reply_id: int | None = None,
    ) -> int | None:
        """Send a text message via the radio. Returns the packet ID if available."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _send() -> int | None:
            kwargs: dict[str, Any] = {"channelIndex": channel_index}
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

    async def async_get_config(self) -> dict[str, Any]:
        """Read full config from the radio (local, module, channels, owner, metadata)."""
        if self._interface is None:
            raise RuntimeError("Not connected to radio")

        iface = self._interface

        def _read() -> dict[str, Any]:
            node = iface.localNode
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

            # Owner info.
            my_node = iface.getMyNodeInfo() or {}
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

            if remaining:
                _apply_protobuf_values(config_obj, remaining, section)
                node.writeConfig(section)

            if fixed_position is True:
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

    def _create_interface(self) -> Any:
        """Create a meshtastic interface (runs in executor)."""
        if self._connection_type == ConnectionType.TCP:
            from meshtastic.tcp_interface import TCPInterface

            return TCPInterface(hostname=self._hostname, portNumber=self._port)

        if self._connection_type == ConnectionType.SERIAL:
            from meshtastic.serial_interface import SerialInterface

            return SerialInterface(devPath=self._serial_path)

        if self._connection_type == ConnectionType.BLE:
            from .ha_ble import create_ha_ble_interface

            return create_ha_ble_interface(
                hass=self._hass, address=self._ble_address
            )

        raise ValueError(f"Unknown connection type: {self._connection_type}")

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
            _LOGGER.debug(
                "Received packet portnum=%s from=%s",
                packet.get("decoded", {}).get("portnum", "?"),
                packet.get("fromId", "?"),
            )
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

            # Clean up old interface.
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
                _LOGGER.debug("Reconnected to Meshtastic radio")
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

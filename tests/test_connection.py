"""Tests for connection.py config read/write, focused on fixed-position handling."""
from unittest.mock import MagicMock

import pytest

from custom_components.meshtastic_ui import connection as connection_mod
from custom_components.meshtastic_ui.connection import (
    ConnectionType,
    MeshtasticConnection,
)


@pytest.fixture
def conn():
    """A connection with a mocked hass executor and radio interface."""
    hass = MagicMock()

    async def _run_in_executor(func, *args):
        return func(*args)

    hass.async_add_executor_job = _run_in_executor

    conn = MeshtasticConnection(hass, ConnectionType.TCP, hostname="test-host")
    conn._interface = MagicMock()
    return conn


class TestGetConfigFixedPosition:
    """async_get_config must merge the node's coordinates into the position section."""

    def _prepare(self, conn, monkeypatch, node_position):
        iface = conn._interface
        iface.localNode.channels = []
        iface.metadata = {}
        iface.getMyNodeInfo.return_value = {
            "user": {"longName": "Test Node"},
            "position": node_position,
        }
        monkeypatch.setattr(
            connection_mod,
            "_message_to_dict",
            lambda proto, **kwargs: {"position": {"fixed_position": True}},
        )
        monkeypatch.setattr(
            connection_mod, "_fill_enum_defaults", lambda proto, d: None
        )

    async def test_merges_coordinates_from_node_position(self, conn, monkeypatch):
        self._prepare(
            conn,
            monkeypatch,
            {"latitude": 40.123456, "longitude": -86.654321, "altitude": 250},
        )

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == 40.123456
        assert position["fixed_lng"] == -86.654321
        assert position["fixed_altitude"] == 250

    async def test_falls_back_to_integer_coordinates(self, conn, monkeypatch):
        self._prepare(
            conn,
            monkeypatch,
            {"latitudeI": 401234560, "longitudeI": -866543210},
        )

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == pytest.approx(40.123456)
        assert position["fixed_lng"] == pytest.approx(-86.654321)
        assert position["fixed_altitude"] == 0

    async def test_handles_missing_node_position(self, conn, monkeypatch):
        self._prepare(conn, monkeypatch, {})

        result = await conn.async_get_config()

        position = result["local_config"]["position"]
        assert position["fixed_lat"] == 0
        assert position["fixed_lng"] == 0
        assert position["fixed_altitude"] == 0


class TestSplitMqttAddress:
    """_split_mqtt_address must extract host:port and default to 1883."""

    def test_plain_host(self):
        assert connection_mod._split_mqtt_address("mqtt.meshtastic.org") == (
            "mqtt.meshtastic.org", 1883,
        )

    def test_host_with_port(self):
        assert connection_mod._split_mqtt_address("broker.local:8883") == (
            "broker.local", 8883,
        )

    def test_bare_ipv6_left_intact(self):
        assert connection_mod._split_mqtt_address("2001:db8::1") == (
            "2001:db8::1", 1883,
        )

    def test_bracketed_ipv6_with_port(self):
        assert connection_mod._split_mqtt_address("[::1]:8883") == ("[::1]", 8883)

    def test_out_of_range_port_left_intact(self):
        assert connection_mod._split_mqtt_address("host:99999") == (
            "host:99999", 1883,
        )


class TestConfigMqttPort:
    """The MQTT port must round-trip through the address string."""

    async def test_get_config_splits_port_from_address(self, conn, monkeypatch):
        iface = conn._interface
        iface.localNode.channels = []
        iface.metadata = {}
        iface.getMyNodeInfo.return_value = {}
        monkeypatch.setattr(
            connection_mod,
            "_message_to_dict",
            lambda proto, **kwargs: {"mqtt": {"address": "broker.local:8883"}},
        )
        monkeypatch.setattr(
            connection_mod, "_fill_enum_defaults", lambda proto, d: None
        )

        result = await conn.async_get_config()

        mqtt = result["module_config"]["mqtt"]
        assert mqtt["address"] == "broker.local"
        assert mqtt["port"] == 8883

    async def test_set_config_folds_port_into_address(self, conn, monkeypatch):
        applied = {}
        monkeypatch.setattr(
            connection_mod,
            "_apply_protobuf_values",
            lambda obj, values, ctx: applied.update(values),
        )

        await conn.async_set_config(
            "mqtt", {"address": "broker.local", "port": 8883, "enabled": True}
        )

        assert applied["address"] == "broker.local:8883"
        assert "port" not in applied
        conn._interface.localNode.writeConfig.assert_called_once_with("mqtt")

    async def test_set_config_default_port_omitted_from_address(self, conn, monkeypatch):
        applied = {}
        monkeypatch.setattr(
            connection_mod,
            "_apply_protobuf_values",
            lambda obj, values, ctx: applied.update(values),
        )

        await conn.async_set_config(
            "mqtt", {"address": "broker.local:8883", "port": 1883}
        )

        assert applied["address"] == "broker.local"
        assert "port" not in applied


class TestSetConfigFixedPosition:
    """async_set_config must never overwrite the radio's position with zeros."""

    async def test_skips_set_fixed_position_without_coordinates(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {"fixed_position": True, "fixed_lat": 0, "fixed_lng": 0, "fixed_altitude": 0},
        )

        node.setFixedPosition.assert_not_called()
        node.removeFixedPosition.assert_not_called()

    async def test_pushes_fixed_position_with_coordinates(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {
                "fixed_position": True,
                "fixed_lat": 40.123456,
                "fixed_lng": -86.654321,
                "fixed_altitude": 250,
            },
        )

        node.setFixedPosition.assert_called_once_with(40.123456, -86.654321, 250)

    async def test_removes_fixed_position_when_disabled(self, conn):
        node = conn._interface.localNode

        await conn.async_set_config(
            "position",
            {"fixed_position": False, "fixed_lat": 0, "fixed_lng": 0, "fixed_altitude": 0},
        )

        node.removeFixedPosition.assert_called_once()
        node.setFixedPosition.assert_not_called()


class TestIsRepeated:
    """protobuf 7 dropped FieldDescriptor.label; is_repeated replaces it (#81)."""

    @pytest.mark.parametrize("repeated", [True, False])
    def test_uses_is_repeated_without_label(self, repeated):
        from types import SimpleNamespace

        field = SimpleNamespace(is_repeated=repeated)
        assert connection_mod._is_repeated(field) is repeated


class TestBleConnection:
    """Tests for BLE connection handling."""

    def test_init_ble(self):
        """Test initializing a BLE connection."""
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        assert conn.connection_type == ConnectionType.BLE
        assert conn.ble_address == "AA:BB:CC:DD:EE:FF"

    def test_create_interface_ble(self, monkeypatch):
        """Test _create_interface instantiates BLEInterface with address."""
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )

        mock_ble_iface = MagicMock()
        mock_ble_class = MagicMock(return_value=mock_ble_iface)
        import meshtastic.ble_interface
        monkeypatch.setattr(meshtastic.ble_interface, "BLEInterface", mock_ble_class)

        iface = conn._create_interface()
        assert iface is mock_ble_iface
        mock_ble_class.assert_called_once_with(address="AA:BB:CC:DD:EE:FF")

    async def test_reconnect_pubsub_listener(self):
        """Test connection.lost pubsub event transitions BLE connection to RECONNECTING."""
        hass = MagicMock()
        hass.loop.is_closed.return_value = False
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        mock_iface = MagicMock()
        conn._interface = mock_iface
        conn._set_state(connection_mod.ConnectionState.CONNECTED)

        conn._setup_pubsub_listeners()

        from pubsub import pub

        # Trigger connection lost
        pub.sendMessage("meshtastic.connection.lost", interface=mock_iface)

        # Event loop callback scheduled
        assert hass.loop.call_soon_threadsafe.called
        callback = hass.loop.call_soon_threadsafe.call_args[0][0]
        callback()

        assert conn.state == connection_mod.ConnectionState.RECONNECTING
        if conn._reconnect_task:
            conn._reconnect_task.cancel()
        conn._teardown_pubsub_listeners()

    def test_init_ble_normalizes_address(self):
        """Test initializing a BLE connection normalizes MAC with hyphens/lowercase/bare/dot/UUID."""
        hass = MagicMock()
        conn1 = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="aa-bb-cc-dd-ee-ff"
        )
        assert conn1.ble_address == "AA:BB:CC:DD:EE:FF"

        conn2 = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="aabbccddeeff"
        )
        assert conn2.ble_address == "AA:BB:CC:DD:EE:FF"

        conn3 = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="aabb.ccdd.eeff"
        )
        assert conn3.ble_address == "AA:BB:CC:DD:EE:FF"

        conn4 = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="6ba1b218-15a8-461f-9fa8-5dcae273eafd"
        )
        assert conn4.ble_address == "6BA1B218-15A8-461F-9FA8-5DCAE273EAFD"

    def test_check_alive_ble(self):
        """Test _check_alive detects when interface.isConnected is cleared or client disconnected."""
        import threading
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        assert conn._check_alive() is False

        mock_iface = MagicMock()
        mock_iface.isConnected = threading.Event()
        mock_iface.isConnected.set()
        mock_iface.client = MagicMock()
        mock_iface.client.is_connected = True
        conn._interface = mock_iface

        assert conn._check_alive() is True

        # Event cleared
        mock_iface.isConnected.clear()
        assert conn._check_alive() is False

        # Reset event, test client disconnected
        mock_iface.isConnected.set()
        mock_iface.client.is_connected = False
        assert conn._check_alive() is False

    async def test_reconnect_loop_not_aborted_by_concurrent_disconnect(self):
        """Test that multiple disconnect events while reconnecting do not kill the loop."""
        import asyncio
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        conn._create_interface = MagicMock()
        conn._set_state(connection_mod.ConnectionState.CONNECTED)

        # First disconnect event starts reconnect loop
        conn._async_handle_disconnected()
        assert conn.state == connection_mod.ConnectionState.RECONNECTING
        task1 = conn._reconnect_task
        assert task1 is not None
        gen1 = conn._reconnect_gen

        # Second disconnect event arrives while task1 is sleeping in backoff
        conn._async_handle_disconnected()
        # Should NOT increment gen or cancel the active reconnect loop
        assert conn._reconnect_task is task1
        assert conn._reconnect_gen == gen1
        assert not task1.done()

        # Clean up
        await conn.async_disconnect()

    async def test_reconnect_loop_closes_interface_if_cancelled(self):
        """Test that if connection transitions away from RECONNECTING during interface creation, the new interface is closed."""
        import asyncio
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        mock_iface = MagicMock()

        def _mock_create():
            # Transition away to DISCONNECTED while executor runs interface creation
            conn._set_state(connection_mod.ConnectionState.DISCONNECTED)
            return mock_iface

        conn._create_interface = _mock_create

        async def _fake_executor(func, *args):
            return func(*args)

        hass.async_add_executor_job = _fake_executor
        conn._set_state(connection_mod.ConnectionState.RECONNECTING)
        conn._reconnect_gen = 1

        await conn._async_reconnect_loop(initial_delay=0, gen=1)

        # Interface should have been closed because state was no longer RECONNECTING
        assert conn._interface is None
        assert mock_iface.close.called

    def test_init_ble_rejects_ipv4(self):
        """Test initializing a BLE connection does not normalize 12-digit IPv4 addresses."""
        hass = MagicMock()
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="192.168.100.200"
        )
        assert conn.ble_address == "192.168.100.200"

    async def test_disconnect_during_reconnect_closes_interface_no_leak(self):
        """Test async_disconnect cancels reconnect task and closes interface created in executor."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        hass = MagicMock()
        mock_iface = MagicMock()
        loop = asyncio.get_running_loop()
        hass.loop = loop
        pool = ThreadPoolExecutor(max_workers=2)

        def mock_create():
            import time
            time.sleep(0.05)
            return mock_iface

        async def real_executor(func, *args):
            return await loop.run_in_executor(pool, func, *args)

        hass.async_add_executor_job = real_executor

        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        conn._create_interface = mock_create
        conn._set_state(connection_mod.ConnectionState.RECONNECTING)
        conn._reconnect_gen = 1

        conn._reconnect_task = asyncio.create_task(
            conn._async_reconnect_loop(initial_delay=0, gen=1)
        )
        await asyncio.sleep(0.01)  # allow loop to enter executor

        # Disconnect called while thread is active in executor
        await conn.async_disconnect()
        await asyncio.sleep(0.1)  # wait for executor thread to finish

        assert mock_iface.close.called
        pool.shutdown(wait=False)

    def test_on_receive_handles_none_decoded(self):
        """Test _on_receive handles packets with decoded=None without crashing."""
        hass = MagicMock()
        hass.loop.is_closed.return_value = False
        conn = MeshtasticConnection(
            hass, ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        mock_iface = MagicMock()
        conn._interface = mock_iface
        conn._setup_pubsub_listeners()

        from pubsub import pub
        # Packet with decoded=None
        pub.sendMessage("meshtastic.receive", packet={"decoded": None, "fromId": "!aabbccdd"}, interface=mock_iface)
        assert hass.loop.call_soon_threadsafe.called
        conn._teardown_pubsub_listeners()

    async def test_ble_interface_read_from_radio_retries(self):
        """Test that HomeAssistantBLEInterface._read_from_radio retries on transient empty reads."""
        hass = MagicMock()
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        mock_client = MagicMock()
        mock_client.is_connected = True

        # Simulate read_gatt_char returning empty twice, then a packet, then empty
        reads = [b"", b"", b"\x08\x01", b""]
        async def mock_read(char_uuid):
            if reads:
                return reads.pop(0)
            return b""

        mock_client.read_gatt_char = mock_read
        ble_iface.client = mock_client
        handled_packets = []
        ble_iface._handleFromRadio = lambda b: handled_packets.append(b)

        await ble_iface._read_from_radio(max_empty_retries=2)
        assert len(handled_packets) == 1
        assert handled_packets[0] == b"\x08\x01"

    async def test_ble_interface_async_close_cancels_tasks(self):
        """Test that async_close cancels both send and heartbeat tasks."""
        import asyncio
        from unittest.mock import AsyncMock
        hass = MagicMock()
        hass.loop = asyncio.get_running_loop()
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        mock_client = MagicMock()
        mock_client.is_connected = True
        mock_client.disconnect = AsyncMock()
        ble_iface.client = mock_client

        async def dummy_loop():
            try:
                while True:
                    await asyncio.sleep(10)
            except asyncio.CancelledError:
                pass

        ble_iface._send_task = asyncio.create_task(dummy_loop())
        ble_iface._heartbeat_task = asyncio.create_task(dummy_loop())

        await ble_iface.async_close()
        await asyncio.sleep(0)  # yield to allow cancellation to propagate
        assert not ble_iface._link_up
        assert ble_iface._send_task.done()
        assert ble_iface._heartbeat_task.done()

    def test_packet_after_loop_closed_is_dropped(self):
        """A packet delivered after HA closed its loop during shutdown doesn't raise."""
        hass = MagicMock()
        hass.loop.is_closed.return_value = True
        conn = connection_mod.MeshtasticConnection(
            hass, connection_mod.ConnectionType.TCP, hostname="radio.local"
        )
        conn._call_on_loop(conn._async_dispatch_message, {})
        hass.loop.call_soon_threadsafe.assert_not_called()

        hass.loop.is_closed.return_value = False
        hass.loop.call_soon_threadsafe.side_effect = RuntimeError("Event loop is closed")
        conn._call_on_loop(conn._async_dispatch_message, {})  # must not raise

    async def test_ble_heartbeats_are_not_identical(self, monkeypatch):
        """The firmware drops a repeated ToRadio write, so each heartbeat must differ."""
        import asyncio
        hass = MagicMock()
        hass.loop.is_running.return_value = False
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        mock_client = MagicMock()
        mock_client.is_connected = True
        ble_iface.client = mock_client
        monkeypatch.setattr(connection_mod, "BLE_HEARTBEAT_INTERVAL", 0)

        task = asyncio.create_task(ble_iface._heartbeat_loop())
        while ble_iface._outgoing_queue.qsize() < 3:
            await asyncio.sleep(0)
        task.cancel()

        sent = [ble_iface._outgoing_queue.get_nowait() for _ in range(3)]
        assert len(set(sent)) == 3

    async def test_force_reconnect_debounces_rapid_calls(self):
        """Test that async_force_reconnect ignores duplicate calls within 8 seconds."""
        import asyncio
        import time
        from unittest.mock import AsyncMock
        hass = MagicMock()
        hass.loop = asyncio.get_running_loop()
        conn = connection_mod.MeshtasticConnection(
            hass,
            connection_mod.ConnectionType.BLE,
            ble_address="AA:BB:CC:DD:EE:FF",
        )
        conn._state = connection_mod.ConnectionState.RECONNECTING
        conn._last_force_reconnect_time = time.monotonic()

        reconnect_task = MagicMock()
        conn._reconnect_task = reconnect_task

        # Call again immediately
        await conn.async_force_reconnect()

        # Should not cancel existing task because it was debounced
        reconnect_task.cancel.assert_not_called()

    async def test_send_loop_write_failure_triggers_reconnect(self):
        """A TORADIO write that fails both ways drops the link instead of stalling the queue."""
        import asyncio
        from unittest.mock import AsyncMock
        hass = MagicMock()
        hass.loop = asyncio.get_running_loop()
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        mock_client = MagicMock()
        mock_client.is_connected = True
        mock_client.write_gatt_char = AsyncMock(side_effect=OSError("write failed"))
        ble_iface.client = mock_client
        ble_iface._disconnected = MagicMock()

        ble_iface._outgoing_queue.put_nowait(b"")
        await asyncio.wait_for(ble_iface._send_loop(), timeout=1)

        assert mock_client.write_gatt_char.await_count == 2
        assert not ble_iface._link_up
        ble_iface._disconnected.assert_called_once()

    async def test_ble_connect_rejects_proxy_only_device(self, monkeypatch):
        """A radio seen only through a Bluetooth proxy fails with a clear error."""
        from types import SimpleNamespace
        hass = MagicMock()
        proxy_device = SimpleNamespace(details={"source": "esphome-proxy"})
        fake_bt = SimpleNamespace(
            async_ble_device_from_address=lambda *a, **k: proxy_device,
            async_scanner_devices_by_address=lambda *a, **k: [
                SimpleNamespace(ble_device=proxy_device)
            ],
        )
        monkeypatch.setattr(connection_mod, "bluetooth", fake_bt)
        establish = MagicMock()
        monkeypatch.setattr(connection_mod, "establish_connection", establish)

        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        with pytest.raises(RuntimeError, match="Bluetooth proxy"):
            await ble_iface.async_connect()
        establish.assert_not_called()


    def test_ble_link_flag_does_not_shadow_mesh_interface_connected(self):
        """MeshInterface._handleConfigComplete calls self._connected(); it must stay a method."""
        hass = MagicMock()
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        assert callable(ble_iface._connected)

    async def test_ble_disconnect_reports_unsent_packets(self):
        """Queued and in-flight mesh packets are reported as unsent when the link drops."""
        from meshtastic import mesh_pb2
        hass = MagicMock()
        ble_iface = connection_mod.HomeAssistantBLEInterface(hass, "AA:BB:CC:DD:EE:FF")
        ble_iface._link_up = True
        ble_iface._disconnected = MagicMock()
        reported = []
        ble_iface.on_unsent = reported.extend

        def to_radio(packet_id):
            msg = mesh_pb2.ToRadio()
            msg.packet.id = packet_id
            return msg.SerializeToString()

        heartbeat = mesh_pb2.ToRadio()
        heartbeat.heartbeat.CopyFrom(mesh_pb2.Heartbeat())
        ble_iface._in_flight = to_radio(111)
        ble_iface._outgoing_queue.put_nowait(heartbeat.SerializeToString())
        ble_iface._outgoing_queue.put_nowait(to_radio(222))

        ble_iface._on_ble_disconnected(None)

        assert reported == [111, 222]
        assert ble_iface._outgoing_queue.empty()
        assert ble_iface._in_flight is None

    async def test_force_reconnect_leaves_running_attempt_alone(self):
        """A reconnect request while a connect attempt is running doesn't cancel it."""
        hass = MagicMock()
        conn = connection_mod.MeshtasticConnection(
            hass, connection_mod.ConnectionType.BLE, ble_address="AA:BB:CC:DD:EE:FF"
        )
        conn._state = connection_mod.ConnectionState.RECONNECTING
        conn._attempt_in_progress = True
        reconnect_task = MagicMock()
        conn._reconnect_task = reconnect_task

        await conn.async_force_reconnect()

        reconnect_task.cancel.assert_not_called()

"""Meshtastic UI — companion dashboard integration (direct radio connection)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .connection import ConnectionState, ConnectionType, MeshtasticConnection
from .const import (
    CONF_BLE_ADDRESS,
    CONF_CONNECTION_TYPE,
    CONF_SERIAL_DEV_PATH,
    CONF_TCP_HOSTNAME,
    CONF_TCP_PORT,
    DEFAULT_TCP_PORT,
    DOMAIN,
    SIGNAL_CONNECTION_STATE,
    SIGNAL_NEW_MESSAGE,
    SIGNAL_NODE_UPDATE,
)
from .frontend import async_register_panel, async_unregister_panel
from .store import MeshtasticUiStore
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Meshtastic UI component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Meshtastic UI from a config entry."""
    store = MeshtasticUiStore(hass)
    await store.async_load()

    # Create the radio connection
    connection = _create_connection(hass, entry.data)

    hass.data[DOMAIN] = {
        "store": store,
        "connection": connection,
        "unsub_callbacks": [],
    }

    # Register radio callbacks
    _register_radio_callbacks(hass, store, connection)

    # Connect to the radio
    try:
        await connection.async_connect()
    except Exception:  # noqa: BLE001
        _LOGGER.error("Initial connection to Meshtastic radio failed; will retry")

    # Sync nodes from radio's mesh database
    _sync_nodes_from_radio(store, connection)

    # Register WebSocket API
    async_register_websocket_api(hass)

    # Register frontend panel
    await async_register_panel(hass)

    # Set up sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        data = hass.data.pop(DOMAIN, {})
        for unsub in data.get("unsub_callbacks", []):
            unsub()
        connection: MeshtasticConnection | None = data.get("connection")
        if connection is not None:
            await connection.async_disconnect()
        async_unregister_panel(hass)

    return unload_ok


def _create_connection(
    hass: HomeAssistant, config_data: dict[str, Any]
) -> MeshtasticConnection:
    """Create a MeshtasticConnection from config entry data."""
    conn_type = ConnectionType(config_data[CONF_CONNECTION_TYPE])

    if conn_type == ConnectionType.TCP:
        return MeshtasticConnection(
            hass,
            conn_type,
            hostname=config_data[CONF_TCP_HOSTNAME],
            port=config_data.get(CONF_TCP_PORT, DEFAULT_TCP_PORT),
        )
    if conn_type == ConnectionType.SERIAL:
        return MeshtasticConnection(
            hass,
            conn_type,
            serial_path=config_data[CONF_SERIAL_DEV_PATH],
        )
    if conn_type == ConnectionType.BLE:
        return MeshtasticConnection(
            hass,
            conn_type,
            ble_address=config_data[CONF_BLE_ADDRESS],
        )

    raise ValueError(f"Unknown connection type: {conn_type}")


@callback
def _register_radio_callbacks(
    hass: HomeAssistant,
    store: MeshtasticUiStore,
    connection: MeshtasticConnection,
) -> None:
    """Wire radio callbacks to the store and dispatcher."""
    unsub_callbacks = hass.data[DOMAIN]["unsub_callbacks"]

    @callback
    def _on_packet(packet: dict) -> None:
        """Handle a received packet from the radio."""
        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum")

        if portnum == "TEXT_MESSAGE_APP":
            _handle_text_message(hass, store, packet)

        # Track sender as a node
        sender_id = packet.get("fromId")
        if sender_id:
            node_update: dict[str, Any] = {
                "_last_seen": datetime.now(timezone.utc).isoformat(),
            }
            if "snr" in packet:
                node_update["snr"] = packet["snr"]
            if "hopStart" in packet and "hopLimit" in packet:
                node_update["hops"] = packet["hopStart"] - packet["hopLimit"]
            elif "hopsAway" in packet:
                node_update["hops"] = packet["hopsAway"]
            if "rssi" in packet:
                node_update["rssi"] = packet["rssi"]
            store.update_node(sender_id, node_update)

    @callback
    def _on_node_update(node: dict) -> None:
        """Handle a node update from the radio's node database."""
        node_num = node.get("num")
        if node_num is None:
            return

        node_id = _num_to_id(node_num)
        data = _extract_node_data(node)
        store.update_node(node_id, data)
        async_dispatcher_send(hass, SIGNAL_NODE_UPDATE, node_id)

    @callback
    def _on_connection_state_change(
        new_state: ConnectionState, old_state: ConnectionState
    ) -> None:
        """Handle connection state changes."""
        _LOGGER.info(
            "Meshtastic connection: %s -> %s", old_state, new_state
        )
        async_dispatcher_send(hass, SIGNAL_CONNECTION_STATE, new_state)

        if new_state == ConnectionState.CONNECTED and old_state in (
            ConnectionState.RECONNECTING,
            ConnectionState.CONNECTING,
        ):
            # Re-sync nodes on reconnect
            _sync_nodes_from_radio(store, connection)

    unsub_callbacks.append(connection.register_message_callback(_on_packet))
    unsub_callbacks.append(connection.register_node_update_callback(_on_node_update))
    unsub_callbacks.append(
        connection.register_connection_change_callback(_on_connection_state_change)
    )


@callback
def _handle_text_message(
    hass: HomeAssistant, store: MeshtasticUiStore, packet: dict
) -> None:
    """Parse a text message packet and route to channel or DM store."""
    decoded = packet.get("decoded", {})
    text = decoded.get("text", "")
    if not text:
        return

    sender_id = packet.get("fromId", "unknown")
    to_id = packet.get("toId", "")
    channel_index = packet.get("channel", 0)
    timestamp = datetime.now(timezone.utc).isoformat()

    message: dict[str, Any] = {
        "text": text,
        "from": sender_id,
        "to": to_id,
        "timestamp": timestamp,
        "channel": channel_index,
    }

    # Broadcast destinations: ^all or !ffffffff
    is_broadcast = to_id in ("^all", "!ffffffff", "")

    if is_broadcast:
        channel_key = str(channel_index)
        store.add_channel_message(channel_key, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"type": "channel", "channel": channel_key, **message},
        )
    else:
        # DM — key by the other party's ID
        store.add_dm_message(sender_id, message)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"type": "dm", "partner": sender_id, **message},
        )


def _sync_nodes_from_radio(
    store: MeshtasticUiStore, connection: MeshtasticConnection
) -> None:
    """Bulk import nodes from the radio's mesh database into the store."""
    nodes = connection.nodes
    if not nodes:
        return

    updates: dict[str, dict[str, Any]] = {}
    for _key, node in nodes.items():
        node_num = node.get("num")
        if node_num is None:
            continue
        node_id = _num_to_id(node_num)
        updates[node_id] = _extract_node_data(node)

    if updates:
        store.bulk_update_nodes(updates)
        _LOGGER.info("Synced %d nodes from radio mesh database", len(updates))


def _extract_node_data(node: dict) -> dict[str, Any]:
    """Extract normalized node data from a meshtastic node dict."""
    data: dict[str, Any] = {
        "_last_seen": datetime.now(timezone.utc).isoformat(),
    }

    # User info
    user = node.get("user", {})
    if user.get("longName"):
        data["name"] = user["longName"]
    if user.get("shortName"):
        data["short_name"] = user["shortName"]
    if user.get("hwModel"):
        data["hardware_model"] = user["hwModel"]

    # Position
    position = node.get("position", {})
    if position.get("latitude") is not None:
        data["latitude"] = position["latitude"]
    if position.get("longitude") is not None:
        data["longitude"] = position["longitude"]
    if position.get("altitude") is not None:
        data["altitude"] = position["altitude"]

    # Device metrics
    metrics = node.get("deviceMetrics", {})
    if metrics.get("batteryLevel") is not None:
        data["battery"] = metrics["batteryLevel"]
    if metrics.get("voltage") is not None:
        data["voltage"] = metrics["voltage"]
    if metrics.get("channelUtilization") is not None:
        data["channel_utilization"] = metrics["channelUtilization"]
    if metrics.get("airUtilTx") is not None:
        data["air_util_tx"] = metrics["airUtilTx"]
    if metrics.get("uptimeSeconds") is not None:
        data["uptime"] = metrics["uptimeSeconds"]

    # SNR / hops
    if node.get("snr") is not None:
        data["snr"] = node["snr"]
    if node.get("hopsAway") is not None:
        data["hops"] = node["hopsAway"]
    if node.get("lastHeard") is not None:
        try:
            data["_last_seen"] = datetime.fromtimestamp(
                node["lastHeard"], tz=timezone.utc
            ).isoformat()
        except (OSError, ValueError):
            pass

    return data


def _num_to_id(node_num: int) -> str:
    """Convert a numeric node ID to the !hex format."""
    return f"!{node_num:08x}"

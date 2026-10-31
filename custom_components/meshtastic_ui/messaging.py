"""Send text to the mesh and record it, shared by the panel and HA actions."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import SIGNAL_NEW_MESSAGE


async def async_send_text_message(
    hass: HomeAssistant,
    entry_data: dict[str, Any],
    text: str,
    *,
    channel: int = 0,
    to: str | None = None,
    reply_id: int | None = None,
    entry_id: str | None = None,
) -> int | None:
    """Send text via the entry's radio, then store and broadcast it.

    The outgoing message is added to the store and dispatched on
    SIGNAL_NEW_MESSAGE so the panel shows it, and registered in
    pending_acks so the delivery status resolves. Returns the packet ID.
    Exceptions from the radio propagate to the caller.
    """
    conn = entry_data["connection"]
    store = entry_data["store"]
    entry_id = entry_data.get("entry_id") or entry_id

    local_node_id = None
    node_num = conn.my_info.get("num")
    if node_num is not None:
        local_node_id = f"!{node_num:08x}"

    packet_id = await conn.async_send_text(
        text, destination_id=to, channel_index=channel, reply_id=reply_id,
    )
    if packet_id is not None:
        entry_data.setdefault("pending_acks", {})[packet_id] = {
            "text": text,
            "to": to,
            "channel": channel,
            "_ts": time.time(),
        }

    out_msg: dict[str, Any] = {
        "text": text,
        "from": local_node_id or "local",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_outgoing": True,
    }
    if packet_id is not None:
        out_msg["packet_id"] = packet_id
        out_msg["message_id"] = packet_id
    if reply_id:
        out_msg["reply_id"] = reply_id

    if to:
        out_msg["to"] = to
        store.add_dm_message(to, out_msg)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"entry_id": entry_id, "type": "dm", "partner": to, **out_msg},
        )
    else:
        channel_key = str(channel)
        out_msg["to"] = "^all"
        out_msg["channel"] = channel_key
        store.add_channel_message(channel_key, out_msg)
        async_dispatcher_send(
            hass,
            SIGNAL_NEW_MESSAGE,
            {"entry_id": entry_id, "type": "channel", "channel": channel_key, **out_msg},
        )

    return packet_id


def looks_like_link_down(err: Exception) -> bool:
    """Return True when a send error means the radio link itself dropped."""
    err_text = str(err) or err.__class__.__name__
    link_down_signals = (
        "Not connected",
        "ConnectionError",
        "TimeoutError",
        "No connection",
        "is_connected",
    )
    return (
        any(signal in err_text for signal in link_down_signals)
        or "Connection" in type(err).__name__
    )

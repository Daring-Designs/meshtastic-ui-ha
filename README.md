# Meshtastic UI for Home Assistant

> **Beta / Work in Progress** — This integration is under active development. Expect rough edges and breaking changes. If you run into issues, please [open an issue on GitHub](https://github.com/Daring-Designs/meshtastic-ui-ha/issues).

A companion HACS integration that adds a full-featured dashboard for your [Meshtastic](https://meshtastic.org) mesh network in Home Assistant. Connects directly to your radio via TCP, Serial, or Bluetooth and provides messaging, node management, mapping, and complete radio configuration — all from the HA sidebar.

## Built With

- **Backend** — Python, using the [meshtastic](https://pypi.org/project/meshtastic/) library for all radio communication (TCP, Serial, BLE). Integrates with Home Assistant via its WebSocket API and async event system.
- **Frontend** — Vanilla ES modules built with [Lit](https://lit.dev/) 4.x web components, [Leaflet](https://leafletjs.com/) for mapping, and [D3](https://d3js.org/) for real-time charts. Vendor libraries are bundled via a build step; app-level JS is served directly by Home Assistant.

## Why Connect a Radio to Home Assistant?

A Meshtastic node plugged into your Home Assistant server becomes an **always-on gateway** to your mesh network. Unlike a phone or laptop that goes to sleep, a home server runs 24/7 — so your node never misses a message.

- **Never miss a message** — Every channel broadcast and direct message is captured and stored, even when your phone is off or out of range. Come back hours or days later and scroll through the full history.
- **Send messages from anywhere** — Open your HA dashboard from any browser or the HA mobile app and send messages to your mesh. Useful for remote check-ins or coordinating with people in the field when you're away from home.
- **Long-term message and node history** — All messages, node sightings, waypoints, and traceroute results are persisted to disk and survive HA restarts. Build up weeks of mesh activity without losing data.
- **Monitor your mesh passively** — Real-time charts track channel utilization, airtime, battery, and packet rates. See at a glance how busy your mesh is and whether your gateway node is healthy.
- **Automate with HA** — Pair with HA automations to get push notifications on your phone when a message arrives, trigger alerts based on node status, or log mesh telemetry to long-term databases like InfluxDB.

## Screenshots

| Radio | Nodes | Map |
|:---:|:---:|:---:|
| ![Radio Tab](docs/screenshots/radio-tab.png) | ![Nodes Tab](docs/screenshots/nodes-tab.png) | ![Map Tab](docs/screenshots/map-tab.png) |

| Settings | Node Detail | Notifications |
|:---:|:---:|:---:|
| ![Settings Tab](docs/screenshots/settings-tab.png) | ![Node Detail](docs/screenshots/node-detail.png) | ![Notifications](docs/screenshots/notifications.png) |

## Features

### Radio Tab

Gateway status dashboard showing connection state, hardware info, firmware version, uptime, battery, voltage, channel utilization, air utility TX, and packet counters (TX/RX/bad/relayed). Displays a channel table with name, index, role, PSK status, and uplink/downlink flags.

### Messages Tab

Chat-style messaging interface for both channel broadcasts and direct messages. Conversations are listed in a sidebar with channels and DM threads. Messages show sender name, timestamp, and delivery status icons (pending, delivered, failed). Includes a byte counter (228-byte Meshtastic limit) on the input field. Messages persist across restarts.

### Nodes Tab

Sortable, searchable table of all mesh nodes. Columns include favorite star, name, SNR, RSSI, hops, battery, and last seen time. Expandable filter panel with last heard window, minimum battery, maximum hops, and favorites-only toggle. Ignored nodes display a badge.

Click any node to open a detail dialog with identity, radio, power, environment, and position sections. Action buttons:

- **Send Message** — opens a DM conversation
- **Trace Route** — sends a traceroute request
- **Request Position** — asks the node for a GPS update
- **Favorite / Unfavorite**
- **Ignore / Unignore**
- **Remove Node** — deletes from the local database

### Map Tab

Interactive Leaflet/OpenStreetMap visualization with toggleable layers:

- **Nodes** — green (recent) and orange (stale) circle markers with popups
- **Waypoints** — blue diamond markers with name and description
- **SNR Lines** — colored by signal quality (green to red)
- **Traceroute Routes** — purple dashed lines showing mesh paths; click to see hop-by-hop details with SNR values

Auto-fits bounds to visible nodes. Shows a badge counting nodes without position data.

### Stats Tab

At-a-glance summary cards: messages today, active nodes, total nodes, and channel count.

### Settings Tab

Complete radio configuration UI matching the Meshtastic web app. All changes are written directly to the radio.

**Radio Config:**

- **LoRa** — region (20+ options), modem preset, hop limit, TX power, bandwidth, spread factor, coding rate, frequency offset, TX enabled, boosted RX gain, override duty cycle
- **Channels** — per-channel editor for all 8 slots: role, name, PSK (with generate), uplink/downlink, position precision

**Device Config:**

- **Owner** — long name, short name, licensed operator flag

**Module Config (12 panels):**

- **MQTT** — broker address/port/credentials, root topic, encryption, JSON, TLS, proxy to client, map reporting
- **Serial** — baud rate, mode (default/simple/protobuf/text/NMEA/CalTopo), GPIO pins, timeout, echo
- **External Notification** — output/vibra/buzzer GPIO, nag timeout, duration, alert triggers, PWM mode, polarity
- **Store & Forward** — records count, history return max/window, heartbeat, server role
- **Range Test** — sender interval, save to file
- **Telemetry** — device/environment/air quality/power metric intervals and display toggles
- **Canned Messages** — pipe-separated message list, input source (rotary encoder/up-down), GPIO pins, send channel
- **Audio** — Codec2 enable/bitrate, PTT GPIO, I2S pin config
- **Neighbor Info** — update interval
- **Ambient Lighting** — LED state, RGB color, brightness
- **Detection Sensor** — monitor pin, broadcast intervals, custom trigger messages, bell notification, pullup
- **Paxcounter** — update interval, WiFi/BLE counting toggles

**Device Actions:**

- Reboot
- Shutdown
- Factory Reset Config
- Factory Reset Device
- Reset Node Database
- Reboot OTA

### Sensors

Two sensor entities are created automatically:

- `sensor.meshtastic_ui_messages_today` — messages received today
- `sensor.meshtastic_ui_active_nodes` — nodes seen in the last hour

### Real-Time Updates

Five WebSocket subscriptions provide live updates without polling:

- Incoming messages
- Node status changes
- Message delivery acknowledgements
- Waypoint changes
- Traceroute results

### Data Persistence

All data persists across Home Assistant restarts: messages (channel and DM), node database, favorites, ignored nodes, waypoints, traceroute results, and daily message counters.

## Connection Types

| Type | Details |
|------|---------|
| **TCP/IP** | Hostname + port (default 4403) |
| **Serial** | USB device path (auto-detected) |
| **Bluetooth** | BLE MAC address |

Auto-reconnects with exponential backoff (5s to 5min) on connection loss.

## Prerequisites

- Home Assistant 2024.1+
- A Meshtastic radio accessible via TCP, Serial, or BLE
- The `meshtastic` Python package (installed automatically as a dependency)

## Installation

### HACS (Recommended)

1. Open **HACS** in Home Assistant
2. Click the three-dot menu > **Custom repositories**
3. Add `https://github.com/Daring-Designs/meshtastic-ui-ha` with category **Integration**
4. Find **Meshtastic UI** and click **Download**
5. Restart Home Assistant
6. Go to **Settings > Devices & Services > Add Integration** and search for **Meshtastic UI**
7. Select your connection type and enter the connection details

### Manual

Copy the `custom_components/meshtastic_ui` folder into your Home Assistant `config/custom_components/` directory, restart, and add the integration.

## Architecture

```
Frontend (Lit 4.x, ES modules)            Backend (Python, WebSocket API)
───────────────────────────────            ────────────────────────────────
ha_frontend/                               custom_components/meshtastic_ui/
  panel.js    (shell + router)               connection.py  (radio I/O)
  views.js    (5 tab components)             websocket_api.py (23 WS commands)
  settings.js (config panels)                store.py (persistent storage)
  modules.js  (module config panels)         config_flow.py (setup wizard)
  components.js (shared form widgets)        sensor.py (HA sensor entities)
  styles.js   (shared CSS)                   const.py (constants + signals)
```

The frontend is built with [Lit](https://lit.dev/) web components. The backend communicates with the radio through the [meshtastic](https://pypi.org/project/meshtastic/) Python library, with all blocking calls wrapped in `async_add_executor_job()`. Frontend and backend communicate exclusively via Home Assistant's WebSocket API.

## License

MIT

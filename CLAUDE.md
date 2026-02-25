# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meshtastic UI for Home Assistant — a HACS custom integration that adds a full dashboard for Meshtastic mesh networks. Connects directly to a radio via TCP, Serial, or BLE and provides messaging, node management, mapping, radio configuration, and stats.

## Development

There is no build step, test suite, or linter configured. The frontend is vanilla ES modules (Lit 4.x) served directly by Home Assistant. The backend is standard HA integration Python.

To test changes: copy `custom_components/meshtastic_ui/` into a Home Assistant `config/custom_components/` directory, restart HA, and hard-refresh the browser (Ctrl+Shift+R) to bypass cached JS.

## Architecture

```
Frontend (Lit 4.x web components)          Backend (Python, HA WebSocket API)
─────────────────────────────────          ────────────────────────────────────
ha_frontend/                               custom_components/meshtastic_ui/
  panel.js   → shell, router, tabs,          __init__.py   → entry setup, packet
               WS subscriptions,                              dispatch, node sync
               time-series state              connection.py → radio I/O via
  views.js   → 5 tab components:                              meshtastic lib,
               Radio, Messages,                               reconnect logic
               Nodes, Map, Stats              websocket_api.py → 23+ WS commands
  settings.js → radio/device config           store.py      → persistent storage
  modules.js  → module config panels                          (messages, nodes,
  components.js → shared form widgets                          waypoints, routes)
  styles.js   → shared CSS                   config_flow.py → setup wizard
                                              sensor.py     → HA sensor entities
                                              const.py      → signals, keys
                                              frontend.py   → panel registration
```

### Data Flow

1. **Radio → Backend**: `connection.py` wraps the `meshtastic` Python library. All blocking radio calls use `async_add_executor_job()`. Received packets trigger callbacks registered in `__init__.py`.
2. **Backend → Frontend**: `__init__.py` dispatches HA signals (`SIGNAL_NEW_MESSAGE`, `SIGNAL_NODE_UPDATE`, etc.). `websocket_api.py` exposes these as WebSocket subscriptions and commands.
3. **Frontend → Backend**: `panel.js` calls WS commands (prefix `meshtastic_ui/`) via `hass.callWS()`. All state flows through the panel shell and is passed as Lit properties to tab components.
4. **Persistence**: `store.py` uses HA's `Store` helper for messages, nodes, waypoints, traceroutes, and daily counters. Saves are debounced (30s delay).

### Key Conventions

- **Node IDs**: Always `!xxxxxxxx` hex format. Use `normalize_node_id()` from `store.py` and `_num_to_id()` from `__init__.py`.
- **Meshtastic traceroute semantics**: In `TRACEROUTE_APP` responses, `fromId` = destination (responder), `toId` = source (requester). Forward hops go from `to` through `route` to `from`.
- **Lit reactivity**: When updating typed arrays (Float64Array), create new instances — Lit won't detect mutations to existing array buffers.
- **Frontend shared styles**: Common CSS is in `styles.js`. Tab-specific styles live in each component's `static styles` block in `views.js`.
- **Settings/Modules pattern**: Config panels in `settings.js` and `modules.js` use a shared form widget system from `components.js` (select, number, text, toggle, password fields with `_renderField()`).

### WebSocket API

Commands are registered in `websocket_api.py` with prefix `meshtastic_ui/`. Key patterns:
- `get_*` / `set_*` — read/write store data
- `send_message` — send text to channel or DM
- `call_service` — radio operations (traceroute, position request, reboot, etc.)
- `subscribe_*` — real-time event streams (messages, nodes, delivery, waypoints, traceroutes)
- `get_radio_config` / `set_radio_config` — read/write radio configuration sections

## Git Conventions

- Author: `Daring Designs <contact@daring-designs.com>` — use `--author` flag on every commit
- Remote: `git@github.com:Daring-Designs/meshtastic-ui-ha.git`
- Branch: `main`

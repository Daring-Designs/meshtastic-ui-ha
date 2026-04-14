"""Constants for Meshtastic UI integration."""

DOMAIN = "meshtastic_ui"

# Storage
STORAGE_KEY = "meshtastic_ui.messages"
STORAGE_VERSION = 1
SAVE_DELAY = 30  # seconds

# Message limits
MAX_CHANNEL_MESSAGES = 500
MAX_DM_MESSAGES = 200

# Node retention
NODE_RETENTION_DAYS = 7
ACTIVE_NODE_WINDOW_SECONDS = 3600  # 1 hour

# Auto node-info request cooldown (seconds per node)
NODEINFO_REQUEST_COOLDOWN = 3600  # 1 hour

# Time-series charts
TS_POINTS = 360          # data points returned to frontend per query
TS_MAX_POINTS = 60480    # 7 days of raw 10s data (60480 × 10s = 604800s)
TS_FLUSH_SECONDS = 10    # seconds between flushes
TS_PERSIST_SECONDS = 300  # save time-series to disk every 5 minutes
TS_STORAGE_KEY = "meshtastic_ui.timeseries"
TS_STORAGE_VERSION = 1

# Internal dispatcher signals
SIGNAL_NEW_MESSAGE = f"{DOMAIN}_new_message"
SIGNAL_NODE_UPDATE = f"{DOMAIN}_node_update"
SIGNAL_CONNECTION_STATE = f"{DOMAIN}_connection_state"
SIGNAL_DELIVERY_STATUS = f"{DOMAIN}_delivery_status"
SIGNAL_WAYPOINT_UPDATE = f"{DOMAIN}_waypoint_update"
SIGNAL_TRACEROUTE_RESULT = f"{DOMAIN}_traceroute_result"
SIGNAL_NOTIFICATION_PREFS = f"{DOMAIN}_notification_prefs"

# WebSocket command prefix
WS_PREFIX = f"{DOMAIN}"

# Frontend
PANEL_URL = "meshtastic-ui"
PANEL_TITLE = "Mesh UI"
PANEL_ICON = "mdi:radio-handheld"
FRONTEND_PATH = "frontend"

# Connection config keys
CONF_CONNECTION_TYPE = "connection_type"
CONF_TCP_HOSTNAME = "tcp_hostname"
CONF_TCP_PORT = "tcp_port"
CONF_SERIAL_DEV_PATH = "serial_dev_path"
CONF_BLE_ADDRESS = "ble_address"
DEFAULT_TCP_PORT = 4403

# Meshtastic BLE service UUID (advertised by all Meshtastic radios)
MESHTASTIC_BLE_SERVICE_UUID = "6ba1b218-15a8-461f-9fa8-5dcae273eafd"

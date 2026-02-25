import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@4.1.1/lit-element.js?module";

const TABS = ["radio", "messages", "nodes", "map", "stats"];
const TAB_LABELS = {
  radio: "Radio",
  messages: "Messages",
  nodes: "Nodes",
  map: "Map",
  stats: "Stats",
};
const TAB_ICONS = {
  radio: "mdi:radio-handheld",
  messages: "mdi:message-text",
  nodes: "mdi:access-point-network",
  map: "mdi:map-marker-multiple",
  stats: "mdi:chart-bar",
};

class MeshtasticUiPanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      panel: { type: Object },
      _activeTab: { type: String },
      _gateways: { type: Array },
      _messages: { type: Object },
      _channels: { type: Array },
      _dms: { type: Array },
      _selectedConversation: { type: String },
      _nodes: { type: Object },
      _stats: { type: Object },
      _messageInput: { type: String },
      _sortColumn: { type: String },
      _sortAsc: { type: Boolean },
      _subscriptionId: { type: Number },
      // Node details dialog
      _selectedNodeId: { type: String },
      _selectedNode: { type: Object },
      _actionFeedback: { type: String },
      // Search & filtering
      _searchText: { type: String },
      _filterLastHeard: { type: String },
      _filterBatteryMin: { type: Number },
      _filterHopsMax: { type: Number },
      _filtersExpanded: { type: Boolean },
      // Map
      _leafletLoaded: { type: Boolean },
      _leafletError: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._activeTab = "radio";
    this._gateways = [];
    this._messages = {};
    this._channels = [];
    this._dms = [];
    this._selectedConversation = "";
    this._nodes = {};
    this._stats = { messages_today: 0, active_nodes: 0, total_nodes: 0, channel_count: 0 };
    this._messageInput = "";
    this._sortColumn = "name";
    this._sortAsc = true;
    this._subscriptionId = null;
    // Node details
    this._selectedNodeId = null;
    this._selectedNode = null;
    this._actionFeedback = "";
    // Filters
    this._searchText = "";
    this._filterLastHeard = "all";
    this._filterBatteryMin = 0;
    this._filterHopsMax = null;
    this._filtersExpanded = false;
    // Map (non-reactive internals)
    this._leafletLoaded = false;
    this._leafletError = false;
    this._mapInstance = null;
    this._mapMarkers = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe();
    this._destroyMap();
  }

  updated(changedProps) {
    if (changedProps.has("_nodes") && this._activeTab === "map" && this._mapInstance) {
      this._updateMapMarkers();
    }
    if (changedProps.has("_activeTab") && this._activeTab === "map" && this._leafletLoaded && !this._mapInstance) {
      this.updateComplete.then(() => this._initMap());
    }
  }

  async _loadData() {
    await this._loadGateways();
    await this._loadMessages();
    await this._loadNodes();
    await this._loadStats();
    this._subscribe();
  }

  async _wsCommand(type, data = {}) {
    if (!this.hass) return null;
    try {
      return await this.hass.callWS({ type, ...data });
    } catch (err) {
      console.error(`WS command ${type} failed:`, err);
      return null;
    }
  }

  async _loadGateways() {
    const result = await this._wsCommand("meshtastic_ui/gateways");
    if (result) this._gateways = result.gateways || [];
  }

  async _loadMessages() {
    const result = await this._wsCommand("meshtastic_ui/messages");
    if (result) {
      this._messages = result.messages || {};
      this._channels = result.channels || [];
      this._dms = result.dms || [];
    }
  }

  async _loadNodes() {
    const result = await this._wsCommand("meshtastic_ui/nodes");
    if (result) this._nodes = result.nodes || {};
  }

  async _loadStats() {
    const result = await this._wsCommand("meshtastic_ui/stats");
    if (result) this._stats = result;
  }

  _subscribe() {
    if (!this.hass || this._subscriptionId) return;

    this.hass.connection.subscribeMessage(
      (event) => this._handleRealtimeMessage(event),
      { type: "meshtastic_ui/subscribe" }
    ).then((unsub) => {
      this._unsubscribeFn = unsub;
    }).catch((err) => {
      console.error("Failed to subscribe:", err);
    });
  }

  _unsubscribe() {
    if (this._unsubscribeFn) {
      this._unsubscribeFn();
      this._unsubscribeFn = null;
    }
  }

  _handleRealtimeMessage(data) {
    const key = data.type === "dm" ? data.partner : data.channel;
    if (!key) return;

    if (!this._messages[key]) {
      this._messages[key] = [];
      if (data.type === "dm" && !this._dms.includes(key)) {
        this._dms = [...this._dms, key];
      } else if (data.type === "channel" && !this._channels.includes(key)) {
        this._channels = [...this._channels, key];
      }
    }

    this._messages = {
      ...this._messages,
      [key]: [...(this._messages[key] || []), data],
    };

    this._stats = {
      ...this._stats,
      messages_today: (this._stats.messages_today || 0) + 1,
    };
  }

  _setTab(tab) {
    this._activeTab = tab;
    if (tab === "radio") this._loadGateways();
    if (tab === "nodes") this._loadNodes();
    if (tab === "stats") this._loadStats();
    if (tab === "map") {
      this._loadNodes();
      if (!this._leafletLoaded && !this._leafletError) {
        this._loadLeaflet();
      }
    }
  }

  async _sendMessage() {
    if (!this._messageInput.trim()) return;

    const data = { text: this._messageInput };
    const conv = this._selectedConversation;

    if (this._dms.includes(conv)) {
      data.to = conv;
    } else if (conv) {
      data.channel = conv;
    }

    const result = await this._wsCommand("meshtastic_ui/send_message", data);
    if (result && result.success) {
      this._messageInput = "";
    }
  }

  _onInputKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  _sortNodes(column) {
    if (this._sortColumn === column) {
      this._sortAsc = !this._sortAsc;
    } else {
      this._sortColumn = column;
      this._sortAsc = true;
    }
  }

  _getSortedNodes() {
    const entries = Object.entries(this._nodes);
    const col = this._sortColumn;
    const asc = this._sortAsc;

    return entries.sort(([, a], [, b]) => {
      let va = a[col] ?? "";
      let vb = b[col] ?? "";

      if (col === "battery" || col === "snr" || col === "hops") {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }

      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }

  // --- Search & Filtering ---

  _getFilteredAndSortedNodes() {
    let entries = Object.entries(this._nodes);

    // Text search (name or node ID)
    if (this._searchText) {
      const q = this._searchText.toLowerCase();
      entries = entries.filter(([nodeId, node]) => {
        const name = (node.name || "").toLowerCase();
        const id = nodeId.toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    // Last heard filter
    if (this._filterLastHeard !== "all") {
      const now = Date.now();
      const windows = { "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800 };
      const maxAge = (windows[this._filterLastHeard] || 0) * 1000;
      if (maxAge > 0) {
        entries = entries.filter(([, node]) => {
          if (!node._last_seen) return false;
          return (now - new Date(node._last_seen).getTime()) <= maxAge;
        });
      }
    }

    // Battery minimum
    if (this._filterBatteryMin > 0) {
      entries = entries.filter(([, node]) => {
        const bat = parseFloat(node.battery);
        return !isNaN(bat) && bat >= this._filterBatteryMin;
      });
    }

    // Max hops
    if (this._filterHopsMax != null) {
      entries = entries.filter(([, node]) => {
        const hops = parseFloat(node.hops);
        return !isNaN(hops) && hops <= this._filterHopsMax;
      });
    }

    // Sort
    const col = this._sortColumn;
    const asc = this._sortAsc;
    return entries.sort(([, a], [, b]) => {
      let va = a[col] ?? "";
      let vb = b[col] ?? "";

      if (col === "battery" || col === "snr" || col === "hops") {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }

      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }

  // --- Node Details Dialog ---

  _openNodeDialog(nodeId) {
    this._selectedNodeId = nodeId;
    this._selectedNode = this._nodes[nodeId] || {};
    this._actionFeedback = "";
  }

  _closeNodeDialog() {
    this._selectedNodeId = null;
    this._selectedNode = null;
    this._actionFeedback = "";
  }

  _onDialogBackdropClick(e) {
    if (e.target.classList.contains("dialog-backdrop")) {
      this._closeNodeDialog();
    }
  }

  // --- Node Actions ---

  _actionSendMessage(nodeId) {
    this._closeNodeDialog();
    // Add to DMs if not present
    if (!this._dms.includes(nodeId)) {
      this._dms = [...this._dms, nodeId];
    }
    this._selectedConversation = nodeId;
    this._activeTab = "messages";
  }

  async _actionTraceRoute(nodeId) {
    const result = await this._wsCommand("meshtastic_ui/call_service", {
      service: "trace_route",
      service_data: { destination: nodeId },
    });
    if (result && result.success) {
      this._actionFeedback = "Trace route sent";
    } else {
      this._actionFeedback = "Trace route unavailable";
    }
    this._clearFeedbackAfterDelay();
  }

  async _actionRequestPosition(nodeId) {
    const result = await this._wsCommand("meshtastic_ui/call_service", {
      service: "request_position",
      service_data: { destination: nodeId },
    });
    if (result && result.success) {
      this._actionFeedback = "Position request sent";
    } else {
      this._actionFeedback = "Position request unavailable";
    }
    this._clearFeedbackAfterDelay();
  }

  _clearFeedbackAfterDelay() {
    setTimeout(() => {
      this._actionFeedback = "";
    }, 3000);
  }

  // --- Map ---

  async _loadLeaflet() {
    if (this._leafletLoaded) return;
    try {
      // Inject Leaflet CSS into shadow root
      const linkEl = document.createElement("link");
      linkEl.rel = "stylesheet";
      linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      this.shadowRoot.appendChild(linkEl);

      // Load Leaflet JS globally if not already loaded
      if (!window.L) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      this._leafletLoaded = true;
      await this.updateComplete;
      this._initMap();
    } catch (err) {
      console.error("Failed to load Leaflet:", err);
      this._leafletError = true;
    }
  }

  _initMap() {
    const container = this.shadowRoot.querySelector("#mesh-map");
    if (!container || this._mapInstance) return;

    const map = L.map(container).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    this._mapInstance = map;
    this._updateMapMarkers();
  }

  _updateMapMarkers() {
    if (!this._mapInstance) return;

    // Clear existing markers
    this._mapMarkers.forEach((m) => m.remove());
    this._mapMarkers = [];

    const bounds = [];

    for (const [nodeId, node] of Object.entries(this._nodes)) {
      const lat = parseFloat(node.latitude);
      const lon = parseFloat(node.longitude);
      if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

      const name = node.name || nodeId;
      const popupContent = `
        <strong>${name}</strong><br>
        ${node.battery != null ? `Battery: ${node.battery}%<br>` : ""}
        ${node.snr != null ? `SNR: ${node.snr} dB<br>` : ""}
        ${node.hops != null ? `Hops: ${node.hops}<br>` : ""}
        <a href="#" onclick="this.dispatchEvent(new CustomEvent('view-node', {bubbles: true, composed: true, detail: '${nodeId}'})); return false;">View Details</a>
      `;

      const marker = L.marker([lat, lon]).addTo(this._mapInstance);
      marker.bindPopup(popupContent);
      this._mapMarkers.push(marker);
      bounds.push([lat, lon]);
    }

    if (bounds.length > 0) {
      this._mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }

  _destroyMap() {
    if (this._mapInstance) {
      this._mapInstance.remove();
      this._mapInstance = null;
      this._mapMarkers = [];
    }
  }

  _formatTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  _formatLastSeen(iso) {
    if (!iso) return "Unknown";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = Math.floor((now - d) / 1000);
      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return "Unknown";
    }
  }

  _formatUptime(seconds) {
    const s = parseInt(seconds, 10);
    if (isNaN(s)) return seconds || "\u2014";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }

  static get styles() {
    return css`
      :host {
        display: block;
        height: 100%;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
      }

      .tabs {
        display: flex;
        border-bottom: 1px solid var(--divider-color);
        background: var(--card-background-color);
        padding: 0 16px;
      }

      .tab {
        padding: 12px 20px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        font-size: 14px;
        font-weight: 500;
        color: var(--secondary-text-color);
        transition: all 0.2s;
        user-select: none;
      }

      .tab:hover {
        color: var(--primary-text-color);
      }

      .tab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .content {
        padding: 16px;
        height: calc(100% - 49px);
        overflow-y: auto;
        box-sizing: border-box;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--secondary-text-color);
      }

      .empty-state ha-icon {
        --mdc-icon-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      /* Gateway status dashboard */
      .gateway-card {
        background: var(--card-background-color);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        margin-bottom: 16px;
        overflow: hidden;
      }

      .gateway-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
      }

      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .status-dot.connected {
        background: #4caf50;
        box-shadow: 0 0 6px rgba(76, 175, 80, 0.4);
      }

      .status-dot.disconnected {
        background: #f44336;
        box-shadow: 0 0 6px rgba(244, 67, 54, 0.4);
      }

      .gateway-name {
        font-size: 16px;
        font-weight: 600;
        flex: 1;
      }

      .gateway-meta {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: var(--secondary-text-color);
      }

      .gateway-meta span {
        white-space: nowrap;
      }

      .gateway-section {
        padding: 16px 20px;
      }

      .gateway-section + .gateway-section {
        border-top: 1px solid var(--divider-color);
      }

      .section-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        letter-spacing: 0.5px;
        margin-bottom: 12px;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
      }

      .metric-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .metric-label {
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .metric-value {
        font-size: 18px;
        font-weight: 600;
      }

      .channels-table {
        width: 100%;
        border-collapse: collapse;
      }

      .channels-table th {
        text-align: left;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        border-bottom: 1px solid var(--divider-color);
        letter-spacing: 0.5px;
      }

      .channels-table td {
        padding: 8px 12px;
        font-size: 14px;
        border-bottom: 1px solid var(--divider-color);
      }

      .channels-table tr:last-child td {
        border-bottom: none;
      }

      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }

      .badge.primary {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }

      .badge.secondary {
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }

      /* Messages tab */
      .messages-layout {
        display: flex;
        gap: 16px;
        height: calc(100vh - 150px);
      }

      .conversation-list {
        width: 240px;
        flex-shrink: 0;
        overflow-y: auto;
        border-right: 1px solid var(--divider-color);
        padding-right: 16px;
      }

      .conversation-item {
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 8px;
        margin-bottom: 4px;
        transition: background 0.15s;
      }

      .conversation-item:hover {
        background: var(--secondary-background-color);
      }

      .conversation-item.active {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }

      .conversation-header {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        padding: 8px 12px 4px;
        letter-spacing: 0.5px;
      }

      .chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }

      .chat-bubble {
        max-width: 75%;
        padding: 8px 14px;
        margin: 4px 0;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.4;
        word-break: break-word;
      }

      .chat-bubble.incoming {
        background: var(--secondary-background-color);
        border-bottom-left-radius: 4px;
        align-self: flex-start;
      }

      .chat-bubble .sender {
        font-size: 11px;
        font-weight: 600;
        color: var(--primary-color);
        margin-bottom: 2px;
      }

      .chat-bubble .time {
        font-size: 10px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .chat-input-row {
        display: flex;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
      }

      .chat-input-row input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        outline: none;
      }

      .chat-input-row input:focus {
        border-color: var(--primary-color);
      }

      .send-btn {
        padding: 8px 20px;
        background: var(--primary-color);
        color: var(--text-primary-color);
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }

      .send-btn:hover {
        opacity: 0.9;
      }

      /* Nodes table */
      .nodes-table {
        width: 100%;
        border-collapse: collapse;
      }

      .nodes-table th {
        text-align: left;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        border-bottom: 2px solid var(--divider-color);
        cursor: pointer;
        user-select: none;
        letter-spacing: 0.5px;
      }

      .nodes-table th:hover {
        color: var(--primary-text-color);
      }

      .sort-indicator {
        margin-left: 4px;
        font-size: 10px;
      }

      .nodes-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--divider-color);
        font-size: 14px;
      }

      .nodes-table tr.clickable-row {
        cursor: pointer;
      }

      .nodes-table tr.clickable-row:hover td {
        background: var(--secondary-background-color);
      }

      /* Stats cards */
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }

      .stat-card {
        background: var(--card-background-color);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid var(--divider-color);
      }

      .stat-card .label {
        font-size: 13px;
        color: var(--secondary-text-color);
        font-weight: 500;
        margin-bottom: 8px;
      }

      .stat-card .value {
        font-size: 32px;
        font-weight: 700;
        color: var(--primary-text-color);
      }

      ha-card {
        margin-bottom: 16px;
      }

      /* Node search & filters */
      .node-filters {
        margin-bottom: 16px;
      }

      .filter-row-main {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .search-input {
        flex: 1;
        padding: 8px 14px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        outline: none;
      }

      .search-input:focus {
        border-color: var(--primary-color);
      }

      .filter-toggle-btn {
        padding: 8px 14px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }

      .filter-toggle-btn:hover {
        color: var(--primary-text-color);
        border-color: var(--primary-color);
      }

      .filter-row-advanced {
        display: flex;
        gap: 16px;
        margin-top: 8px;
        padding: 12px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        flex-wrap: wrap;
      }

      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .filter-group label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        letter-spacing: 0.5px;
      }

      .filter-group select,
      .filter-group input {
        padding: 6px 10px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        font-size: 13px;
        outline: none;
      }

      /* Node details dialog */
      .dialog-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .dialog-card {
        background: var(--card-background-color);
        border-radius: 12px;
        width: 90%;
        max-width: 560px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .dialog-header {
        display: flex;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
      }

      .dialog-title {
        flex: 1;
        font-size: 18px;
        font-weight: 600;
      }

      .dialog-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--secondary-text-color);
        padding: 4px 8px;
        line-height: 1;
      }

      .dialog-close:hover {
        color: var(--primary-text-color);
      }

      .dialog-body {
        padding: 0;
      }

      .dialog-section {
        padding: 16px 20px;
      }

      .dialog-section + .dialog-section {
        border-top: 1px solid var(--divider-color);
      }

      .dialog-actions {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--divider-color);
        flex-wrap: wrap;
      }

      .action-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .action-btn.primary {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }

      .action-btn.secondary {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }

      .action-btn:hover {
        opacity: 0.85;
      }

      .action-feedback {
        padding: 8px 16px;
        font-size: 13px;
        color: var(--primary-color);
        font-weight: 500;
        display: flex;
        align-items: center;
      }

      /* Map */
      .map-container {
        position: relative;
        height: calc(100vh - 150px);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--divider-color);
      }

      .map-element {
        width: 100%;
        height: 100%;
      }

      .map-info-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        color: var(--secondary-text-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }
    `;
  }

  render() {
    return html`
      <div class="tabs">
        ${TABS.map(
          (tab) => html`
            <div
              class="tab ${this._activeTab === tab ? "active" : ""}"
              @click=${() => this._setTab(tab)}
            >
              ${TAB_LABELS[tab]}
            </div>
          `
        )}
      </div>
      <div class="content">
        ${this._renderActiveTab()}
      </div>
      ${this._renderNodeDialog()}
    `;
  }

  _renderActiveTab() {
    switch (this._activeTab) {
      case "radio":
        return this._renderRadioTab();
      case "messages":
        return this._renderMessagesTab();
      case "nodes":
        return this._renderNodesTab();
      case "map":
        return this._renderMapTab();
      case "stats":
        return this._renderStatsTab();
      default:
        return html``;
    }
  }

  _renderRadioTab() {
    if (!this._gateways.length) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:radio-handheld"></ha-icon>
          <div>No Meshtastic radio connected</div>
          <div style="font-size: 13px; margin-top: 8px;">
            Check the radio connection in the integration settings.
          </div>
        </div>
      `;
    }

    return html`${this._gateways.map((gw) => this._renderGatewayCard(gw))}`;
  }

  _renderGatewayCard(gw) {
    const isConnected = gw.state?.toLowerCase() === "connected" || gw.state?.toLowerCase() === "on";
    const sensors = gw.sensors || {};
    const channels = gw.channels || [];

    return html`
      <div class="gateway-card">
        <div class="gateway-card-header">
          <div class="status-dot ${isConnected ? "connected" : "disconnected"}"></div>
          <div class="gateway-name">${gw.name}</div>
          <div class="gateway-meta">
            ${gw.model ? html`<span>${gw.model}</span>` : ""}
            ${gw.firmware ? html`<span>v${gw.firmware}</span>` : ""}
            ${gw.serial ? html`<span>${gw.serial}</span>` : ""}
            ${sensors.uptime ? html`<span>Up ${this._formatUptime(sensors.uptime)}</span>` : ""}
          </div>
        </div>

        <div class="gateway-section">
          <div class="section-title">Metrics</div>
          <div class="metrics-grid">
            ${this._renderMetric("Battery", sensors.battery, "%")}
            ${this._renderMetric("Voltage", sensors.voltage, " V")}
            ${this._renderMetric("Ch. Utilization", sensors.channel_utilization, "%")}
            ${this._renderMetric("Airtime", sensors.air_util_tx || sensors.airtime, "%")}
            ${this._renderMetric("Packets TX", sensors.packets_tx)}
            ${this._renderMetric("Packets RX", sensors.packets_rx)}
            ${this._renderMetric("Packets Bad", sensors.packets_bad)}
            ${this._renderMetric("Packets Relayed", sensors.packets_relayed)}
          </div>
        </div>

        ${channels.length
          ? html`
              <div class="gateway-section">
                <div class="section-title">Channels</div>
                <table class="channels-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Index</th>
                      <th>Type</th>
                      <th>PSK</th>
                      <th>Uplink</th>
                      <th>Downlink</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${channels.map(
                      (ch) => html`
                        <tr>
                          <td>${ch.name}</td>
                          <td>${ch.index}</td>
                          <td>
                            <span class="badge ${ch.primary ? "primary" : "secondary"}">
                              ${ch.primary ? "Primary" : "Secondary"}
                            </span>
                          </td>
                          <td>${ch.psk ? "Yes" : "No"}</td>
                          <td>${ch.uplink ? "Yes" : "No"}</td>
                          <td>${ch.downlink ? "Yes" : "No"}</td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>
            `
          : ""}
      </div>
    `;
  }

  _renderMetric(label, value, suffix = "") {
    return html`
      <div class="metric-item">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value != null && value !== "" ? `${value}${suffix}` : "\u2014"}</div>
      </div>
    `;
  }

  _renderMessagesTab() {
    const allConversations = [...this._channels, ...this._dms];

    if (!allConversations.length) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:message-text-outline"></ha-icon>
          <div>No messages yet</div>
          <div style="font-size: 13px; margin-top: 8px;">
            Messages will appear here as they arrive from the mesh network.
          </div>
        </div>
      `;
    }

    const selected = this._selectedConversation || allConversations[0] || "";
    const currentMessages = this._messages[selected] || [];

    return html`
      <div class="messages-layout">
        <div class="conversation-list">
          ${this._channels.length
            ? html`
                <div class="conversation-header">Channels</div>
                ${this._channels.map(
                  (ch) => html`
                    <div
                      class="conversation-item ${selected === ch ? "active" : ""}"
                      @click=${() => (this._selectedConversation = ch)}
                    >
                      ${ch}
                    </div>
                  `
                )}
              `
            : ""}
          ${this._dms.length
            ? html`
                <div class="conversation-header">Direct Messages</div>
                ${this._dms.map(
                  (dm) => html`
                    <div
                      class="conversation-item ${selected === dm ? "active" : ""}"
                      @click=${() => (this._selectedConversation = dm)}
                    >
                      ${dm}
                    </div>
                  `
                )}
              `
            : ""}
        </div>

        <div class="chat-area">
          <div class="chat-messages">
            ${currentMessages.map(
              (msg) => html`
                <div class="chat-bubble incoming">
                  <div class="sender">${msg.from || "Unknown"}</div>
                  <div>${msg.text}</div>
                  <div class="time">${this._formatTime(msg.timestamp)}</div>
                </div>
              `
            )}
            ${!currentMessages.length
              ? html`
                  <div class="empty-state">
                    <div>No messages in this conversation</div>
                  </div>
                `
              : ""}
          </div>

          <div class="chat-input-row">
            <input
              type="text"
              placeholder="Type a message..."
              .value=${this._messageInput}
              @input=${(e) => (this._messageInput = e.target.value)}
              @keydown=${this._onInputKeydown}
            />
            <button class="send-btn" @click=${this._sendMessage}>Send</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderNodesTab() {
    const sortedNodes = this._getFilteredAndSortedNodes();
    const totalCount = Object.keys(this._nodes).length;

    const columns = [
      { key: "name", label: "Name" },
      { key: "snr", label: "SNR" },
      { key: "hops", label: "Hops" },
      { key: "battery", label: "Battery" },
      { key: "_last_seen", label: "Last Seen" },
    ];

    return html`
      <div class="node-filters">
        <div class="filter-row-main">
          <input
            class="search-input"
            type="text"
            placeholder="Search nodes by name or ID..."
            .value=${this._searchText}
            @input=${(e) => (this._searchText = e.target.value)}
          />
          <button
            class="filter-toggle-btn"
            @click=${() => (this._filtersExpanded = !this._filtersExpanded)}
          >
            Filters ${this._filtersExpanded ? "\u25B2" : "\u25BC"}
          </button>
        </div>
        ${this._filtersExpanded
          ? html`
              <div class="filter-row-advanced">
                <div class="filter-group">
                  <label>Last Heard</label>
                  <select
                    .value=${this._filterLastHeard}
                    @change=${(e) => (this._filterLastHeard = e.target.value)}
                  >
                    <option value="all">All Time</option>
                    <option value="1h">Last Hour</option>
                    <option value="6h">Last 6 Hours</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                  </select>
                </div>
                <div class="filter-group">
                  <label>Min Battery %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    .value=${String(this._filterBatteryMin)}
                    @change=${(e) => (this._filterBatteryMin = parseInt(e.target.value) || 0)}
                    style="width: 70px;"
                  />
                </div>
                <div class="filter-group">
                  <label>Max Hops</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    .value=${this._filterHopsMax != null ? String(this._filterHopsMax) : ""}
                    placeholder="Any"
                    @change=${(e) => {
                      const v = e.target.value;
                      this._filterHopsMax = v !== "" ? parseInt(v) : null;
                    }}
                    style="width: 70px;"
                  />
                </div>
              </div>
            `
          : ""}
      </div>

      ${!totalCount
        ? html`
            <div class="empty-state">
              <ha-icon icon="mdi:access-point-network-off"></ha-icon>
              <div>No mesh nodes discovered yet</div>
              <div style="font-size: 13px; margin-top: 8px;">
                Nodes will appear as they communicate on the mesh.
              </div>
            </div>
          `
        : !sortedNodes.length
          ? html`
              <div class="empty-state">
                <div>No nodes match the current filters</div>
              </div>
            `
          : html`
              <ha-card>
                <table class="nodes-table">
                  <thead>
                    <tr>
                      ${columns.map(
                        (col) => html`
                          <th @click=${() => this._sortNodes(col.key)}>
                            ${col.label}
                            ${this._sortColumn === col.key
                              ? html`<span class="sort-indicator"
                                  >${this._sortAsc ? "\u25B2" : "\u25BC"}</span
                                >`
                              : ""}
                          </th>
                        `
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedNodes.map(
                      ([nodeId, node]) => html`
                        <tr class="clickable-row" @click=${() => this._openNodeDialog(nodeId)}>
                          <td>${node.name || nodeId}</td>
                          <td>${node.snr ?? "\u2014"}</td>
                          <td>${node.hops ?? "\u2014"}</td>
                          <td>
                            ${node.battery != null ? `${node.battery}%` : "\u2014"}
                          </td>
                          <td>${this._formatLastSeen(node._last_seen)}</td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </ha-card>
            `}
    `;
  }

  _renderNodeDialog() {
    if (!this._selectedNodeId) return html``;

    const node = this._selectedNode || {};
    const nodeId = this._selectedNodeId;

    return html`
      <div class="dialog-backdrop" @click=${this._onDialogBackdropClick}>
        <div class="dialog-card">
          <div class="dialog-header">
            <div class="dialog-title">${node.name || nodeId}</div>
            <button class="dialog-close" @click=${this._closeNodeDialog}>\u00D7</button>
          </div>
          <div class="dialog-body">
            <!-- Identity -->
            <div class="dialog-section">
              <div class="section-title">Identity</div>
              <div class="metrics-grid">
                ${this._renderMetric("Node ID", nodeId)}
                ${this._renderMetric("Name", node.name)}
                ${this._renderMetric("Model", node.hardware_model || node.model)}
                ${this._renderMetric("Last Seen", this._formatLastSeen(node._last_seen))}
              </div>
            </div>

            <!-- Radio -->
            <div class="dialog-section">
              <div class="section-title">Radio</div>
              <div class="metrics-grid">
                ${this._renderMetric("SNR", node.snr, " dB")}
                ${this._renderMetric("Hops", node.hops)}
                ${this._renderMetric("Air Util TX", node.air_util_tx, "%")}
                ${this._renderMetric("Ch. Util", node.channel_utilization, "%")}
              </div>
            </div>

            <!-- Power -->
            <div class="dialog-section">
              <div class="section-title">Power</div>
              <div class="metrics-grid">
                ${this._renderMetric("Battery", node.battery, "%")}
                ${this._renderMetric("Voltage", node.voltage, " V")}
                ${this._renderMetric("Uptime", node.uptime ? this._formatUptime(node.uptime) : null)}
              </div>
            </div>

            <!-- Environment -->
            ${node.temperature != null || node.humidity != null || node.pressure != null
              ? html`
                  <div class="dialog-section">
                    <div class="section-title">Environment</div>
                    <div class="metrics-grid">
                      ${this._renderMetric("Temperature", node.temperature, "\u00B0C")}
                      ${this._renderMetric("Humidity", node.humidity, "%")}
                      ${this._renderMetric("Pressure", node.pressure, " hPa")}
                    </div>
                  </div>
                `
              : ""}

            <!-- Position -->
            ${node.latitude != null || node.longitude != null
              ? html`
                  <div class="dialog-section">
                    <div class="section-title">Position</div>
                    <div class="metrics-grid">
                      ${this._renderMetric("Latitude", node.latitude)}
                      ${this._renderMetric("Longitude", node.longitude)}
                      ${this._renderMetric("Altitude", node.altitude, " m")}
                    </div>
                  </div>
                `
              : ""}
          </div>

          <div class="dialog-actions">
            <button class="action-btn primary" @click=${() => this._actionSendMessage(nodeId)}>
              <ha-icon icon="mdi:message-text" style="--mdc-icon-size: 16px;"></ha-icon>
              Send Message
            </button>
            <button class="action-btn secondary" @click=${() => this._actionTraceRoute(nodeId)}>
              <ha-icon icon="mdi:routes" style="--mdc-icon-size: 16px;"></ha-icon>
              Trace Route
            </button>
            <button class="action-btn secondary" @click=${() => this._actionRequestPosition(nodeId)}>
              <ha-icon icon="mdi:crosshairs-gps" style="--mdc-icon-size: 16px;"></ha-icon>
              Request Position
            </button>
            ${this._actionFeedback
              ? html`<span class="action-feedback">${this._actionFeedback}</span>`
              : ""}
          </div>
        </div>
      </div>
    `;
  }

  _renderMapTab() {
    if (this._leafletError) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:map-marker-off"></ha-icon>
          <div>Failed to load map</div>
          <div style="font-size: 13px; margin-top: 8px;">
            Could not load Leaflet mapping library.
          </div>
        </div>
      `;
    }

    if (!this._leafletLoaded) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:map-clock"></ha-icon>
          <div>Loading map...</div>
        </div>
      `;
    }

    const nodesWithPosition = Object.values(this._nodes).filter((n) => {
      const lat = parseFloat(n.latitude);
      const lon = parseFloat(n.longitude);
      return !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);
    });
    const nodesWithout = Object.keys(this._nodes).length - nodesWithPosition.length;

    return html`
      <div class="map-container" @view-node=${(e) => this._openNodeDialog(e.detail)}>
        <div id="mesh-map" class="map-element"></div>
        ${nodesWithout > 0
          ? html`<div class="map-info-badge">
              ${nodesWithout} node${nodesWithout !== 1 ? "s" : ""} without position
            </div>`
          : ""}
      </div>
    `;
  }

  _renderStatsTab() {
    const cards = [
      {
        label: "Messages Today",
        value: this._stats.messages_today,
        icon: "mdi:message-text",
      },
      {
        label: "Active Nodes",
        value: this._stats.active_nodes,
        icon: "mdi:access-point",
      },
      {
        label: "Total Nodes",
        value: this._stats.total_nodes,
        icon: "mdi:radio-tower",
      },
      {
        label: "Channels",
        value: this._stats.channel_count,
        icon: "mdi:forum",
      },
    ];

    return html`
      <div class="stats-grid">
        ${cards.map(
          (card) => html`
            <div class="stat-card">
              <div class="label">
                <ha-icon icon="${card.icon}" style="--mdc-icon-size: 18px; vertical-align: middle; margin-right: 4px;"></ha-icon>
                ${card.label}
              </div>
              <div class="value">${card.value}</div>
            </div>
          `
        )}
      </div>
    `;
  }
}

customElements.define("meshtastic-ui-panel", MeshtasticUiPanel);

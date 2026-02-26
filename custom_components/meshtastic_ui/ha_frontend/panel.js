import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";

/* ── Import tab components ── */
import "./views.js";
import "./settings.js";

const TS_POLL_MS = 10000;  // poll backend for time-series every 10s

const TABS = ["radio", "messages", "nodes", "map", "settings"];
const TAB_LABELS = {
  radio: "Radio",
  messages: "Messages",
  nodes: "Nodes",
  map: "Map",
  settings: "Settings",
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
      _favoriteNodes: { type: Array },
      _ignoredNodes: { type: Array },
      _deliveryStatuses: { type: Object },
      _waypoints: { type: Object },
      _traceroutes: { type: Object },
      _localNodeId: { type: String },
      _timeSeries: { type: Object },
      _packetTypes: { type: Object },
      _chartWindow: { type: Number },
      _pendingTraceroute: { type: String },
      _pendingPosition: { type: String },
      _tracerouteDialog: { type: Object },
      _unreadCounts: { type: Object },
      _channelNames: { type: Object },
      _notificationPrefs: { type: Object },
      _showNotificationModal: { type: Boolean },
      _nodeDialogId: { type: String },
      _nodeDialogFeedback: { type: String },
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
    this._favoriteNodes = [];
    this._ignoredNodes = [];
    this._deliveryStatuses = {}; // packet_id -> {status, error}
    this._waypoints = {};
    this._traceroutes = {};
    this._localNodeId = "";
    this._pendingTraceroute = null;
    this._pendingPosition = null;
    this._tracerouteDialog = null;
    this._tracerouteTimeoutId = null;
    this._channelNames = {};
    this._unreadCounts = JSON.parse(localStorage.getItem("meshtastic_unread") || "{}");
    this._notificationPrefs = { enabled: false, service: "notify.notify", filter: "all" };
    this._showNotificationModal = false;
    this._nodeDialogId = null;
    this._nodeDialogFeedback = "";
    this._timeSeries = null;
    this._packetTypes = null;
    this._chartWindow = parseInt(localStorage.getItem("meshtastic_chart_window"), 10) || 3600;
    this._tsPollingId = null;
    this._unsubscribeFn = null;
    this._unsubNodesFn = null;
    this._unsubDeliveryFn = null;
    this._unsubWaypointsFn = null;
    this._unsubTraceroutesFn = null;
    this._subscribing = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
    // Poll backend for time-series data (collected server-side even with no UI open)
    if (!this._tsPollingId) {
      this._tsPollingId = setInterval(() => this._loadTimeSeries(), TS_POLL_MS);
    }
  }

  updated(changed) {
    if (changed.has("hass") && this.hass) {
      const conn = this.hass.connection;
      if (this._prevConnection && this._prevConnection !== conn) {
        // Connection was replaced (reconnect) — reload everything
        this._unsubscribeFn = null;
        this._unsubNodesFn = null;
        this._unsubDeliveryFn = null;
        this._unsubWaypointsFn = null;
        this._unsubTraceroutesFn = null;
        this._subscribing = false;
        this._prevConnection = conn;
        this._loadData();
        return;
      }
      this._prevConnection = conn;
      if (!this._unsubscribeFn && !this._subscribing) {
        // hass wasn't available during connectedCallback — retry
        this._loadData();
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe();
    if (this._tsPollingId) {
      clearInterval(this._tsPollingId);
      this._tsPollingId = null;
    }
    if (this._tracerouteTimeoutId) {
      clearTimeout(this._tracerouteTimeoutId);
      this._tracerouteTimeoutId = null;
    }
  }

  /* ── Data loading ── */

  async _loadData() {
    this._deliveryStatuses = {};
    await this._loadGateways();
    await this._loadMessages();
    await this._loadNodes();
    await this._loadWaypoints();
    await this._loadTraceroutes();
    await this._loadNotificationPrefs();
    await this._loadTimeSeries();
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
    if (result) {
      this._gateways = result.gateways || [];
      if (this._gateways.length > 0) {
        const gw = this._gateways[0];
        if (gw.node_id) this._localNodeId = gw.node_id;
      }
      // Build channel name map and seed channel list from gateway data.
      const channelNames = {};
      const gwChannels = [];
      for (const gw of this._gateways) {
        for (const ch of gw.channels || []) {
          const key = String(ch.index);
          channelNames[key] = ch.name;
          if (!gwChannels.includes(key)) gwChannels.push(key);
        }
      }
      this._channelNames = channelNames;
      const merged = [...new Set([...gwChannels, ...this._channels])];
      merged.sort((a, b) => Number(a) - Number(b));
      this._channels = merged;
    }
  }

  async _loadMessages() {
    const result = await this._wsCommand("meshtastic_ui/messages");
    if (result) {
      this._messages = result.messages || {};
      // Merge message channels with gateway-derived channels.
      const msgChannels = result.channels || [];
      const all = [...new Set([...Object.keys(this._channelNames || {}), ...msgChannels])];
      all.sort((a, b) => Number(a) - Number(b));
      this._channels = all;
      this._dms = result.dms || [];
    }
  }

  async _loadNodes() {
    const result = await this._wsCommand("meshtastic_ui/nodes");
    if (result) {
      this._nodes = result.nodes || {};
      this._favoriteNodes = result.favorite_nodes || [];
      this._ignoredNodes = result.ignored_nodes || [];
    }
  }

  async _loadWaypoints() {
    const result = await this._wsCommand("meshtastic_ui/get_waypoints");
    if (result) this._waypoints = result.waypoints || {};
  }

  async _loadTraceroutes() {
    const result = await this._wsCommand("meshtastic_ui/get_traceroutes");
    if (result) this._traceroutes = result.traceroutes || {};
  }

  async _loadNotificationPrefs() {
    const result = await this._wsCommand("meshtastic_ui/get_notification_prefs");
    if (result) this._notificationPrefs = result;
  }

  async _loadTimeSeries() {
    const result = await this._wsCommand("meshtastic_ui/get_timeseries", { window: this._chartWindow });
    if (result?.timeseries) {
      this._timeSeries = result.timeseries;
      this._tsBucketInterval = result.bucketInterval || 10;
    }
    if (result?.packetTypes) {
      this._packetTypes = result.packetTypes;
    }
  }

  _subscribe() {
    if (!this.hass || this._subscribing) return;
    this._subscribing = true;

    const conn = this.hass.connection;

    if (!this._unsubscribeFn) {
      conn.subscribeMessage(
        (event) => this._handleRealtimeMessage(event),
        { type: "meshtastic_ui/subscribe" }
      )
      .then((unsub) => { this._unsubscribeFn = unsub; })
      .catch((err) => console.error("Failed to subscribe:", err));
    }

    if (!this._unsubNodesFn) {
      conn.subscribeMessage(
        (event) => this._handleNodeUpdate(event),
        { type: "meshtastic_ui/subscribe_nodes" }
      )
      .then((unsub) => { this._unsubNodesFn = unsub; })
      .catch((err) => console.error("Failed to subscribe nodes:", err));
    }

    if (!this._unsubDeliveryFn) {
      conn.subscribeMessage(
        (event) => this._handleDeliveryStatus(event),
        { type: "meshtastic_ui/subscribe_delivery" }
      )
      .then((unsub) => { this._unsubDeliveryFn = unsub; })
      .catch((err) => console.error("Failed to subscribe delivery:", err));
    }

    if (!this._unsubWaypointsFn) {
      conn.subscribeMessage(
        (event) => this._handleWaypointUpdate(event),
        { type: "meshtastic_ui/subscribe_waypoints" }
      )
      .then((unsub) => { this._unsubWaypointsFn = unsub; })
      .catch((err) => console.error("Failed to subscribe waypoints:", err));
    }

    if (!this._unsubTraceroutesFn) {
      conn.subscribeMessage(
        (event) => this._handleTracerouteResult(event),
        { type: "meshtastic_ui/subscribe_traceroutes" }
      )
      .then((unsub) => { this._unsubTraceroutesFn = unsub; })
      .catch((err) => console.error("Failed to subscribe traceroutes:", err));
    }
  }

  _unsubscribe() {
    const fns = [
      "_unsubscribeFn", "_unsubNodesFn", "_unsubDeliveryFn",
      "_unsubWaypointsFn", "_unsubTraceroutesFn",
    ];
    for (const key of fns) {
      if (this[key]) {
        try { const r = this[key](); if (r && r.catch) r.catch(() => {}); } catch (_) {}
        this[key] = null;
      }
    }
    this._subscribing = false;
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

    // Increment unread unless user is viewing this exact conversation
    if (!data._outgoing) {
      const isViewing = this._activeTab === "messages" && this._selectedConversation === key;
      if (!isViewing) {
        this._unreadCounts = {
          ...this._unreadCounts,
          [key]: (this._unreadCounts[key] || 0) + 1,
        };
        localStorage.setItem("meshtastic_unread", JSON.stringify(this._unreadCounts));
      }
    }
  }

  _handleNodeUpdate(event) {
    const { node_id, data } = event;
    if (!node_id) return;
    this._nodes = {
      ...this._nodes,
      [node_id]: { ...(this._nodes[node_id] || {}), ...data },
    };
  }

  _handleDeliveryStatus(event) {
    const { packet_id, status, error } = event;
    if (!packet_id) return;
    this._deliveryStatuses = {
      ...this._deliveryStatuses,
      [packet_id]: { status, error },
    };
  }

  _handleWaypointUpdate(event) {
    const { action, waypoint_id, ...wpData } = event;
    if (action === "delete") {
      const { [waypoint_id]: _, ...rest } = this._waypoints;
      this._waypoints = rest;
    } else {
      this._waypoints = { ...this._waypoints, [waypoint_id]: wpData };
    }
  }

  _handleTracerouteResult(event) {
    const { from: fromId } = event;
    if (!fromId) return;
    this._traceroutes = { ...this._traceroutes, [fromId]: event };
    // Auto-open dialog if this matches pending traceroute
    if (this._pendingTraceroute === fromId) {
      clearTimeout(this._tracerouteTimeoutId);
      this._pendingTraceroute = null;
      this._tracerouteDialog = event;
    }
  }

  /* ── Tab switching ── */

  _setTab(tab) {
    this._activeTab = tab;
    if (tab === "radio") { this._loadGateways(); this._loadTimeSeries(); }
    if (tab === "nodes") this._loadNodes();
    if (tab === "map") { this._loadNodes(); this._loadWaypoints(); this._loadTraceroutes(); }
  }

  /* ── Event handlers from child components ── */

  _onChartWindowChange(e) {
    const w = parseInt(e.detail.window, 10);
    if (w && w !== this._chartWindow) {
      this._chartWindow = w;
      localStorage.setItem("meshtastic_chart_window", String(w));
      this._loadTimeSeries();
    }
  }

  _onSelectConversation(e) {
    const conv = e.detail.conversation;
    this._selectedConversation = conv;
    if (this._unreadCounts[conv]) {
      const { [conv]: _, ...rest } = this._unreadCounts;
      this._unreadCounts = rest;
      localStorage.setItem("meshtastic_unread", JSON.stringify(this._unreadCounts));
    }
  }

  async _onSendMessage(e) {
    const { text, conversation, reply_id } = e.detail;
    const data = { text };
    if (this._dms.includes(conversation)) {
      data.to = conversation;
    } else {
      data.channel = parseInt(conversation, 10) || 0;
    }
    if (reply_id != null) data.reply_id = reply_id;
    const result = await this._wsCommand("meshtastic_ui/send_message", data);
    if (result?.packet_id && !this._deliveryStatuses[result.packet_id]) {
      this._deliveryStatuses = {
        ...this._deliveryStatuses,
        [result.packet_id]: { status: "pending" },
      };
    }
  }

  async _onNodeAction(e) {
    const { action, nodeId } = e.detail;
    const nodesTab = this.shadowRoot.querySelector("mesh-nodes-tab");

    if (action === "view-node") {
      this._nodeDialogId = nodeId;
      this._nodeDialogFeedback = "";
      return;
    } else if (action === "send-message") {
      if (!this._dms.includes(nodeId)) {
        this._dms = [...this._dms, nodeId];
      }
      this._selectedConversation = nodeId;
      this._activeTab = "messages";
      this._nodeDialogId = null;
      if (nodesTab) nodesTab.closeDialog();
    } else if (action === "trace-route") {
      // Set pending state before sending
      this._pendingTraceroute = nodeId;
      this._tracerouteDialog = null;
      if (this._tracerouteTimeoutId) clearTimeout(this._tracerouteTimeoutId);
      // Start 30s timeout
      this._tracerouteTimeoutId = setTimeout(() => {
        if (this._pendingTraceroute === nodeId) {
          this._pendingTraceroute = null;
          this._tracerouteDialog = { error: true, nodeId };
        }
      }, 30000);

      const result = await this._wsCommand("meshtastic_ui/call_service", {
        service: "trace_route",
        service_data: { destination: nodeId },
      });
      if (!result?.success) {
        this._pendingTraceroute = null;
        clearTimeout(this._tracerouteTimeoutId);
        if (nodesTab) nodesTab.showFeedback("Trace route unavailable");
      }
    } else if (action === "request-position") {
      this._pendingPosition = nodeId;
      const result = await this._wsCommand("meshtastic_ui/call_service", {
        service: "request_position",
        service_data: { destination: nodeId },
      });
      const msg = result?.success ? "Position request sent" : "Position request unavailable";
      this._pendingPosition = null;
      if (nodesTab) nodesTab.showFeedback(msg);
      if (this._nodeDialogId) this._showNodeDialogFeedback(msg);
    } else if (action === "favorite" || action === "unfavorite") {
      const result = await this._wsCommand("meshtastic_ui/node_admin", {
        node_id: nodeId, action,
      });
      if (result?.success) {
        if (action === "favorite") {
          this._favoriteNodes = [...this._favoriteNodes.filter((id) => id !== nodeId), nodeId];
        } else {
          this._favoriteNodes = this._favoriteNodes.filter((id) => id !== nodeId);
        }
      }
      if (nodesTab) nodesTab.showFeedback(result?.success ? (action === "favorite" ? "Added to favorites" : "Removed from favorites") : "Action failed");
    } else if (action === "ignore" || action === "unignore") {
      const result = await this._wsCommand("meshtastic_ui/node_admin", {
        node_id: nodeId, action,
      });
      if (result?.success) {
        if (action === "ignore") {
          this._ignoredNodes = [...this._ignoredNodes.filter((id) => id !== nodeId), nodeId];
        } else {
          this._ignoredNodes = this._ignoredNodes.filter((id) => id !== nodeId);
        }
      }
      if (nodesTab) nodesTab.showFeedback(result?.success ? (action === "ignore" ? "Node ignored" : "Node unignored") : "Action failed");
    } else if (action === "remove") {
      const result = await this._wsCommand("meshtastic_ui/node_admin", {
        node_id: nodeId, action: "remove",
      });
      if (result?.success) {
        const { [nodeId]: _, ...rest } = this._nodes;
        this._nodes = rest;
        this._favoriteNodes = this._favoriteNodes.filter((id) => id !== nodeId);
        this._ignoredNodes = this._ignoredNodes.filter((id) => id !== nodeId);
        this._nodeDialogId = null;
        if (nodesTab) nodesTab.closeDialog();
      }
      if (nodesTab) nodesTab.showFeedback(result?.success ? "Node removed" : "Remove failed");
    }
  }

  async _onWaypointCreate(e) {
    const { latitude, longitude, name, description, expire } = e.detail;
    await this._wsCommand("meshtastic_ui/send_waypoint", {
      latitude, longitude, name, description, expire,
    });
  }

  /* ── Styles ── */

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
        padding: 16px 16px 0;
        height: calc(100% - 49px);
        overflow-y: auto;
        box-sizing: border-box;
      }

      .tab-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 9px; background: #f44336; color: white;
        font-size: 10px; font-weight: 700; margin-left: 6px;
        line-height: 1; box-sizing: border-box;
      }

      .bell-icon {
        display: flex; align-items: center; padding: 12px;
        cursor: pointer; color: var(--secondary-text-color);
        border-bottom: 2px solid transparent;
      }
      .bell-icon:hover { color: var(--primary-text-color); }

      .notification-modal {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
      }
      .notification-card {
        background: var(--card-background-color); border-radius: 12px;
        width: 90%; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .notification-header {
        display: flex; align-items: center; padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
      }
      .notification-header .title { flex: 1; font-size: 16px; font-weight: 600; }
      .notification-header .close {
        background: none; border: none; font-size: 22px;
        cursor: pointer; color: var(--secondary-text-color);
      }
      .notification-body { padding: 16px 20px; }
      .notification-field { margin-bottom: 16px; }
      .notification-field label {
        display: block; font-size: 13px; font-weight: 500;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .notification-field input[type="text"],
      .notification-field select {
        width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; box-sizing: border-box;
      }
      .notification-toggle {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 0;
      }
      .notification-toggle label { margin-bottom: 0; }
      .toggle-switch {
        position: relative; width: 44px; height: 24px; cursor: pointer;
      }
      .toggle-switch input { opacity: 0; width: 0; height: 0; }
      .toggle-slider {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: var(--divider-color); border-radius: 12px; transition: 0.2s;
      }
      .toggle-slider::before {
        content: ""; position: absolute; width: 18px; height: 18px;
        left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s;
      }
      .toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
      .toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
      .notification-save {
        width: 100%; padding: 10px; border: none; border-radius: 8px;
        background: var(--primary-color); color: var(--text-primary-color);
        font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;
      }
      .notification-save:hover { opacity: 0.9; }

      .node-dialog-backdrop {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
      }
      .node-dialog-card {
        background: var(--card-background-color); border-radius: 12px;
        width: 90%; max-width: 520px; max-height: 85vh; overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .node-dialog-header {
        display: flex; align-items: center; padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
      }
      .node-dialog-header .title { flex: 1; font-size: 16px; font-weight: 600; }
      .node-dialog-header .close {
        background: none; border: none; font-size: 22px;
        cursor: pointer; color: var(--secondary-text-color);
      }
      .node-dialog-body { padding: 16px 20px; }
      .node-dialog-section { margin-bottom: 16px; }
      .nd-section-title {
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 8px;
      }
      .nd-metrics {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;
      }
      .nd-metric-label { font-size: 12px; color: var(--secondary-text-color); }
      .nd-metric-value { font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .node-dialog-actions {
        display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px 16px;
        border-top: 1px solid var(--divider-color);
      }
      .nd-btn {
        padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid var(--divider-color);
        background: var(--card-background-color); color: var(--primary-text-color);
        display: flex; align-items: center; gap: 6px;
      }
      .nd-btn:hover { opacity: 0.85; }
      .nd-btn.primary { background: var(--primary-color); color: var(--text-primary-color); border-color: var(--primary-color); }
      .nd-btn.danger { background: var(--error-color, #f44336); color: #fff; border-color: transparent; }
      .nd-fav {
        cursor: pointer; font-size: 22px; margin-right: 8px;
        color: var(--secondary-text-color); transition: color 0.15s;
      }
      .nd-fav.active { color: #ffc107; }
      .nd-fav:hover { color: #ffb300; }
      .nd-ign-badge {
        display: inline-block; padding: 1px 6px; border-radius: 8px;
        font-size: 10px; font-weight: 600; background: var(--error-color, #f44336);
        color: #fff; margin-left: 8px; vertical-align: middle;
      }
      .nd-feedback {
        padding: 8px 16px; font-size: 13px; color: var(--primary-color); font-weight: 500;
      }
      .spinner {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid var(--divider-color);
        border-top-color: var(--primary-color);
        border-radius: 50%; animation: spin 0.8s linear infinite;
        vertical-align: middle;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      .traceroute-dialog {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
      }
      .traceroute-card {
        background: var(--card-background-color); border-radius: 12px;
        width: 90%; max-width: 480px; max-height: 80vh; overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .traceroute-header {
        display: flex; align-items: center; padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
      }
      .traceroute-header .title { flex: 1; font-size: 16px; font-weight: 600; }
      .traceroute-header .close {
        background: none; border: none; font-size: 22px;
        cursor: pointer; color: var(--secondary-text-color);
      }
      .traceroute-body { padding: 16px 20px; }
      .route-summary {
        font-size: 13px; color: var(--secondary-text-color);
        margin-bottom: 12px; padding-bottom: 12px;
        border-bottom: 1px solid var(--divider-color);
      }
      .route-hop {
        display: flex; align-items: center; gap: 12px; padding: 10px 0;
      }
      .hop-badge {
        padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;
        white-space: nowrap; flex-shrink: 0;
      }
      .hop-badge.source { background: #4caf50; color: white; }
      .hop-badge.dest { background: var(--primary-color); color: var(--text-primary-color); }
      .hop-badge.hop { background: var(--divider-color); color: var(--primary-text-color); }
      .hop-name { flex: 1; font-size: 14px; font-weight: 500; }
      .route-link {
        display: flex; align-items: center; gap: 10px;
        padding: 2px 0 2px 8px;
      }
      .link-arrow {
        color: var(--secondary-text-color); font-size: 16px;
        width: 24px; text-align: center; flex-shrink: 0;
      }
      .link-snr-values {
        display: flex; gap: 12px; font-size: 12px;
      }
      .snr-fwd { color: #4caf50; }
      .snr-ret { color: #2196f3; }
      .traceroute-error {
        text-align: center; padding: 24px 16px; color: var(--secondary-text-color);
      }
      .traceroute-error ha-icon { --mdc-icon-size: 36px; margin-bottom: 12px; opacity: 0.5; display: block; }

      @media (max-width: 600px) {
        .tabs { padding: 0 4px; }
        .tab { padding: 10px 12px; font-size: 13px; }
        .content { padding: 8px 8px 0; }
      }
    `;
  }

  /* ── Render ── */

  render() {
    return html`
      <div class="tabs">
        ${TABS.map((tab) => {
          const unread = tab === "messages"
            ? Object.values(this._unreadCounts).reduce((a, b) => a + b, 0) : 0;
          return html`
            <div
              class="tab ${this._activeTab === tab ? "active" : ""}"
              @click=${() => this._setTab(tab)}
            >
              ${TAB_LABELS[tab]}
              ${unread > 0 ? html`<span class="tab-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
            </div>
          `;
        })}
        <div style="flex:1;"></div>
        <div class="tab bell-icon" @click=${() => { this._showNotificationModal = true; }}>
          <ha-icon icon="mdi:${this._notificationPrefs.enabled ? "bell" : "bell-outline"}"
            style="--mdc-icon-size: 20px;"></ha-icon>
        </div>
      </div>
      <div class="content">
        ${this._renderActiveTab()}
      </div>
      ${this._nodeDialogId ? this._renderNodeDetailDialog() : ""}
      ${this._tracerouteDialog ? this._renderTracerouteDialog() : ""}
      ${this._showNotificationModal ? this._renderNotificationModal() : ""}
    `;
  }

  _renderActiveTab() {
    switch (this._activeTab) {
      case "radio":
        return html`<mesh-radio-tab
          .gateways=${this._gateways}
          .timeSeries=${this._timeSeries}
          .packetTypes=${this._packetTypes}
          .chartWindow=${this._chartWindow}
          .bucketInterval=${this._tsBucketInterval || 10}
          @chart-window-change=${this._onChartWindowChange}
        ></mesh-radio-tab>`;
      case "messages":
        return html`
          <mesh-messages-tab
            .messages=${this._messages}
            .channels=${this._channels}
            .dms=${this._dms}
            .channelNames=${this._channelNames}
            .selectedConversation=${this._selectedConversation}
            .deliveryStatuses=${this._deliveryStatuses}
            .nodes=${this._nodes}
            .unreadCounts=${this._unreadCounts}
            @select-conversation=${this._onSelectConversation}
            @send-message=${this._onSendMessage}
          ></mesh-messages-tab>
        `;
      case "nodes":
        return html`
          <mesh-nodes-tab
            .nodes=${this._nodes}
            .favoriteNodes=${this._favoriteNodes}
            .ignoredNodes=${this._ignoredNodes}
            .pendingTraceroute=${this._pendingTraceroute}
            .pendingPosition=${this._pendingPosition}
            @node-action=${this._onNodeAction}
          ></mesh-nodes-tab>
        `;
      case "map":
        return html`<mesh-map-tab .nodes=${this._nodes} .waypoints=${this._waypoints} .traceroutes=${this._traceroutes} .localNodeId=${this._localNodeId} @node-action=${this._onNodeAction} @waypoint-create=${this._onWaypointCreate}></mesh-map-tab>`;
      case "settings":
        return html`
          <mesh-settings-tab
            .hass=${this.hass}
            .wsCommand=${(type, data) => this._wsCommand(type, data)}
          ></mesh-settings-tab>
        `;
      default:
        return html``;
    }
  }
  /* ── Node detail dialog (panel-level, used from map) ── */

  _closeNodeDialog() {
    this._nodeDialogId = null;
    this._nodeDialogFeedback = "";
  }

  _showNodeDialogFeedback(text) {
    this._nodeDialogFeedback = text;
    setTimeout(() => { this._nodeDialogFeedback = ""; }, 3000);
  }

  _renderNodeDetailDialog() {
    const nodeId = this._nodeDialogId;
    const node = this._nodes[nodeId] || {};
    const isFav = (this._favoriteNodes || []).includes(nodeId);
    const isIgn = (this._ignoredNodes || []).includes(nodeId);

    const metric = (label, value, suffix = "") => {
      const display = value != null && value !== "" ? `${value}${suffix}` : "\u2014";
      return html`
      <div>
        <div class="nd-metric-label">${label}</div>
        <div class="nd-metric-value" title="${display}">${display}</div>
      </div>
    `;
    };

    const _fmtHw = (hw) => {
      if (!hw) return null;
      return hw.replace(/_/g, " ").replace(/\b\w+/g, (w) =>
        /^\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      );
    };

    const formatLastSeen = (iso) => {
      if (!iso) return "Unknown";
      try {
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60) return "Just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
      } catch { return "Unknown"; }
    };
    const formatUptime = (s) => {
      s = parseInt(s, 10);
      if (isNaN(s)) return "\u2014";
      if (s < 60) return `${s}s`;
      if (s < 3600) return `${Math.floor(s / 60)}m`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
      return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
    };

    const onAction = (action) => {
      if (action === "remove" && !confirm(`Remove node ${node.name || nodeId}?`)) return;
      this._onNodeAction({ detail: { action, nodeId } });
      if (action === "send-message" || action === "remove") return; // dialog closed by handler
      if (["favorite", "unfavorite", "ignore", "unignore"].includes(action)) {
        this._showNodeDialogFeedback(action === "favorite" ? "Added to favorites" : action === "unfavorite" ? "Removed from favorites" : action === "ignore" ? "Node ignored" : "Node unignored");
      }
    };

    return html`
      <div class="node-dialog-backdrop" @click=${(e) => { if (e.target.classList.contains("node-dialog-backdrop")) this._closeNodeDialog(); }}>
        <div class="node-dialog-card">
          <div class="node-dialog-header">
            <span class="nd-fav ${isFav ? "active" : ""}"
              @click=${() => onAction(isFav ? "unfavorite" : "favorite")}
              title="${isFav ? "Remove from favorites" : "Add to favorites"}"
            >${isFav ? "\u2605" : "\u2606"}</span>
            <div class="title">${node.name || nodeId}${isIgn ? html`<span class="nd-ign-badge">IGNORED</span>` : ""}</div>
            <button class="close" @click=${() => this._closeNodeDialog()}>\u00D7</button>
          </div>
          <div class="node-dialog-body">
            <div class="node-dialog-section">
              <div class="nd-section-title">Identity</div>
              <div class="nd-metrics">
                ${metric("Node ID", nodeId)}
                ${metric("Short Name", node.short_name)}
                ${metric("Long Name", node.name)}
                ${metric("Hardware", _fmtHw(node.hardware_model || node.model))}
                ${metric("Last Seen", formatLastSeen(node._last_seen))}
              </div>
            </div>
            <div class="node-dialog-section">
              <div class="nd-section-title">Radio</div>
              <div class="nd-metrics">
                ${metric("SNR", node.snr != null ? Math.round(node.snr * 10) / 10 : null, " dB")}
                ${metric("RSSI", node.rssi != null ? Math.round(node.rssi) : null, " dBm")}
                ${metric("Hops", node.hops)}
                ${metric("Air Util TX", node.air_util_tx != null ? Math.round(node.air_util_tx * 100) / 100 : null, "%")}
                ${metric("Ch. Util", node.channel_utilization != null ? Math.round(node.channel_utilization * 100) / 100 : null, "%")}
              </div>
            </div>
            <div class="node-dialog-section">
              <div class="nd-section-title">Power</div>
              <div class="nd-metrics">
                ${metric("Battery", node.battery != null ? Math.round(Math.min(node.battery, 100) * 100) / 100 : null, "%")}
                ${metric("Voltage", node.voltage != null ? Math.round(node.voltage * 100) / 100 : null, " V")}
                ${metric("Uptime", node.uptime ? formatUptime(node.uptime) : null)}
              </div>
            </div>
            ${node.temperature != null || node.humidity != null || node.pressure != null ? html`
              <div class="node-dialog-section">
                <div class="nd-section-title">Environment</div>
                <div class="nd-metrics">
                  ${metric("Temperature", node.temperature != null ? Math.round(node.temperature * 10) / 10 : null, "\u00B0C")}
                  ${metric("Humidity", node.humidity != null ? Math.round(node.humidity * 10) / 10 : null, "%")}
                  ${metric("Pressure", node.pressure != null ? Math.round(node.pressure * 10) / 10 : null, " hPa")}
                </div>
              </div>
            ` : ""}
            ${node.latitude != null || node.longitude != null ? html`
              <div class="node-dialog-section">
                <div class="nd-section-title">Position</div>
                <div class="nd-metrics">
                  ${metric("Latitude", node.latitude != null ? Math.round(node.latitude * 100000) / 100000 : null)}
                  ${metric("Longitude", node.longitude != null ? Math.round(node.longitude * 100000) / 100000 : null)}
                  ${metric("Altitude", node.altitude != null ? Math.round(node.altitude) : null, " m")}
                </div>
              </div>
            ` : ""}
          </div>
          <div class="node-dialog-actions">
            <button class="nd-btn primary" @click=${() => onAction("send-message")}>
              <ha-icon icon="mdi:message-text" style="--mdc-icon-size:16px;"></ha-icon> Message
            </button>
            <button class="nd-btn"
              ?disabled=${this._pendingTraceroute === nodeId}
              @click=${() => onAction("trace-route")}>
              ${this._pendingTraceroute === nodeId
                ? html`<span class="spinner"></span> Tracing...`
                : html`<ha-icon icon="mdi:routes" style="--mdc-icon-size:16px;"></ha-icon> Trace Route`}
            </button>
            <button class="nd-btn"
              ?disabled=${this._pendingPosition === nodeId}
              @click=${() => onAction("request-position")}>
              ${this._pendingPosition === nodeId
                ? html`<span class="spinner"></span> Requesting...`
                : html`<ha-icon icon="mdi:crosshairs-gps" style="--mdc-icon-size:16px;"></ha-icon> Request Position`}
            </button>
            <button class="nd-btn" @click=${() => onAction(isIgn ? "unignore" : "ignore")}>
              <ha-icon icon="mdi:${isIgn ? "eye" : "eye-off"}" style="--mdc-icon-size:16px;"></ha-icon> ${isIgn ? "Unignore" : "Ignore"}
            </button>
            <button class="nd-btn danger" @click=${() => onAction("remove")}>
              <ha-icon icon="mdi:delete" style="--mdc-icon-size:16px;"></ha-icon> Remove
            </button>
            ${this._nodeDialogFeedback ? html`<span class="nd-feedback">${this._nodeDialogFeedback}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  /* ── Traceroute dialog ── */

  _getNodeName(nodeId) {
    if (!nodeId) return "Unknown";
    const node = this._nodes?.[nodeId];
    return node?.name || node?.short_name || nodeId;
  }

  _renderTracerouteDialog() {
    const data = this._tracerouteDialog;
    if (data.error) {
      const nodeName = this._getNodeName(data.nodeId);
      return html`
        <div class="traceroute-dialog" @click=${(e) => { if (e.target.classList.contains("traceroute-dialog")) { this._tracerouteDialog = null; } }}>
          <div class="traceroute-card">
            <div class="traceroute-header">
              <div class="title">Traceroute Timed Out</div>
              <button class="close" @click=${() => { this._tracerouteDialog = null; }}>\u00D7</button>
            </div>
            <div class="traceroute-body">
              <div class="traceroute-error">
                <ha-icon icon="mdi:timer-sand-empty"></ha-icon>
                <div>No response from <strong>${nodeName}</strong> after 30 seconds.</div>
                <div style="margin-top:8px;font-size:13px;">The node may be out of range or powered off.</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const hops = [data.to, ...(data.route || []), data.from];
    const snrFwd = data.snr_towards || [];
    const snrRet = data.snr_back || [];
    const nLinks = hops.length - 1;
    const hasReturnRoute = data.route_back?.length > 0;

    return html`
      <div class="traceroute-dialog" @click=${(e) => { if (e.target.classList.contains("traceroute-dialog")) { this._tracerouteDialog = null; } }}>
        <div class="traceroute-card">
          <div class="traceroute-header">
            <div class="title">Traceroute: ${this._getNodeName(data.to)} \u2192 ${this._getNodeName(data.from)}</div>
            <button class="close" @click=${() => { this._tracerouteDialog = null; }}>\u00D7</button>
          </div>
          <div class="traceroute-body">
            <div class="route-summary">${nLinks === 1 ? "Direct connection" : `${nLinks - 1} intermediate hop${nLinks > 2 ? "s" : ""}`}</div>
            ${hops.map((hopId, i) => {
              const label = i === 0 ? "Source" : i === hops.length - 1 ? "Destination" : `Hop ${i}`;
              const badgeClass = i === 0 ? "source" : i === hops.length - 1 ? "dest" : "hop";
              const fwd = i > 0 ? snrFwd[i - 1] : null;
              const ret = (i > 0 && !hasReturnRoute) ? snrRet[nLinks - i] : null;
              return html`
                ${i > 0 ? html`
                  <div class="route-link">
                    <div class="link-arrow">\u2193</div>
                    <div class="link-snr-values">
                      ${fwd != null ? html`<span class="snr-fwd">\u2192 TX ${fwd} dB</span>` : ""}
                      ${ret != null ? html`<span class="snr-ret">\u2190 RX ${ret} dB</span>` : ""}
                    </div>
                  </div>
                ` : ""}
                <div class="route-hop">
                  <div class="hop-badge ${badgeClass}">${label}</div>
                  <div class="hop-name">${this._getNodeName(hopId)}</div>
                </div>
              `;
            })}
            ${hasReturnRoute ? html`
              <div style="margin-top:16px;font-size:12px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;">Return Route (different path)</div>
              ${[data.from, ...(data.route_back || []), data.to].map((hopId, i) => {
                const rhops = [data.from, ...(data.route_back || []), data.to];
                const label = i === 0 ? "Source" : i === rhops.length - 1 ? "Destination" : `Hop ${i}`;
                const badgeClass = i === 0 ? "source" : i === rhops.length - 1 ? "dest" : "hop";
                const snr = i > 0 ? snrRet[i - 1] : null;
                return html`
                  ${i > 0 ? html`
                    <div class="route-link">
                      <div class="link-arrow">\u2193</div>
                      <div class="link-snr-values">
                        ${snr != null ? html`<span class="snr-ret">${snr} dB</span>` : ""}
                      </div>
                    </div>
                  ` : ""}
                  <div class="route-hop">
                    <div class="hop-badge ${badgeClass}">${label}</div>
                    <div class="hop-name">${this._getNodeName(hopId)}</div>
                  </div>
                `;
              })}
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }

  /* ── Notification modal ── */

  _renderNotificationModal() {
    const p = this._notificationPrefs;
    return html`
      <div class="notification-modal" @click=${(e) => { if (e.target.classList.contains("notification-modal")) { this._showNotificationModal = false; } }}>
        <div class="notification-card">
          <div class="notification-header">
            <div class="title">Notification Settings</div>
            <button class="close" @click=${() => { this._showNotificationModal = false; }}>\u00D7</button>
          </div>
          <div class="notification-body">
            <div class="notification-field">
              <div class="notification-toggle">
                <label>Enable Notifications</label>
                <label class="toggle-switch">
                  <input type="checkbox" .checked=${p.enabled}
                    @change=${(e) => { this._notificationPrefs = { ...this._notificationPrefs, enabled: e.target.checked }; }} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="notification-field">
              <label>Notify Service</label>
              <select .value=${p.service || "notify.notify"}
                @change=${(e) => { this._notificationPrefs = { ...this._notificationPrefs, service: e.target.value }; }}>
                ${Object.keys(this.hass?.services?.notify || {}).map((svc) => {
                  const val = `notify.${svc}`;
                  return html`<option value=${val} ?selected=${p.service === val}>${val}</option>`;
                })}
              </select>
            </div>
            <div class="notification-field">
              <label>Message Filter</label>
              <select .value=${p.filter || "all"}
                @change=${(e) => { this._notificationPrefs = { ...this._notificationPrefs, filter: e.target.value }; }}>
                <option value="all">All Messages</option>
                <option value="channel">Channels Only</option>
                <option value="dm">Direct Messages Only</option>
              </select>
            </div>
            <button class="notification-save" @click=${this._saveNotificationPrefs}>Save</button>
          </div>
        </div>
      </div>
    `;
  }

  async _saveNotificationPrefs() {
    await this._wsCommand("meshtastic_ui/set_notification_prefs", this._notificationPrefs);
    this._showNotificationModal = false;
  }
}

customElements.define("meshtastic-ui-panel", MeshtasticUiPanel);

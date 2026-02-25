import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@4.1.1/lit-element.js?module";

/* ── Import tab components ── */
import "./views.js";
import "./settings.js";

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
      _pendingTraceroute: { type: String },
      _tracerouteDialog: { type: Object },
      _unreadCounts: { type: Object },
      _notificationPrefs: { type: Object },
      _showNotificationModal: { type: Boolean },
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
    this._tracerouteDialog = null;
    this._tracerouteTimeoutId = null;
    this._unreadCounts = JSON.parse(localStorage.getItem("meshtastic_unread") || "{}");
    this._notificationPrefs = { enabled: false, service: "notify.notify", filter: "all" };
    this._showNotificationModal = false;
    this._timeSeries = {
      channelUtil: new Float64Array(150),
      airtimeTx: new Float64Array(150),
      battery: new Float64Array(150),
      packetTx: new Float64Array(150),
      packetRx: new Float64Array(150),
    };
    this._tsAccumulators = { packetRx: 0, packetTx: 0 };
    this._tsSnapshots = { channelUtil: 0, airtimeTx: 0, battery: 0 };
    this._tsIntervalId = null;
    this._unsubscribeFn = null;
    this._unsubNodesFn = null;
    this._unsubDeliveryFn = null;
    this._unsubWaypointsFn = null;
    this._unsubTraceroutesFn = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
    this._tsIntervalId = setInterval(() => this._flushTimeSeries(), 2000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe();
    if (this._tsIntervalId) {
      clearInterval(this._tsIntervalId);
      this._tsIntervalId = null;
    }
    if (this._tracerouteTimeoutId) {
      clearTimeout(this._tracerouteTimeoutId);
      this._tracerouteTimeoutId = null;
    }
  }

  /* ── Data loading ── */

  async _loadData() {
    await this._loadGateways();
    await this._loadMessages();
    await this._loadNodes();
    await this._loadWaypoints();
    await this._loadTraceroutes();
    await this._loadNotificationPrefs();
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
        // Seed time-series snapshots from gateway sensors so charts show data immediately
        const s = gw.sensors || {};
        if (s.channel_utilization != null) this._tsSnapshots.channelUtil = s.channel_utilization;
        if (s.air_util_tx != null) this._tsSnapshots.airtimeTx = s.air_util_tx;
        if (s.battery != null) this._tsSnapshots.battery = Math.min(s.battery, 100);
      }
    }
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

  _flushTimeSeries() {
    const ts = this._timeSeries;
    const acc = this._tsAccumulators;
    const snap = this._tsSnapshots;
    for (const key of Object.keys(ts)) {
      ts[key].copyWithin(0, 1);
    }
    // Snapshot values (latest telemetry, not reset)
    ts.channelUtil[149] = snap.channelUtil;
    ts.airtimeTx[149] = snap.airtimeTx;
    ts.battery[149] = snap.battery;
    // Counter values (reset each flush)
    ts.packetTx[149] = acc.packetTx;
    ts.packetRx[149] = acc.packetRx;
    this._tsAccumulators = { packetRx: 0, packetTx: 0 };
    // Create new typed-array copies so Lit detects reference changes in child charts
    this._timeSeries = {
      channelUtil: new Float64Array(ts.channelUtil),
      airtimeTx: new Float64Array(ts.airtimeTx),
      battery: new Float64Array(ts.battery),
      packetTx: new Float64Array(ts.packetTx),
      packetRx: new Float64Array(ts.packetRx),
    };
  }

  _subscribe() {
    if (!this.hass) return;

    if (!this._unsubscribeFn) {
      this.hass.connection
        .subscribeMessage(
          (event) => this._handleRealtimeMessage(event),
          { type: "meshtastic_ui/subscribe" }
        )
        .then((unsub) => { this._unsubscribeFn = unsub; })
        .catch((err) => console.error("Failed to subscribe:", err));
    }

    if (!this._unsubNodesFn) {
      this.hass.connection
        .subscribeMessage(
          (event) => this._handleNodeUpdate(event),
          { type: "meshtastic_ui/subscribe_nodes" }
        )
        .then((unsub) => { this._unsubNodesFn = unsub; })
        .catch((err) => console.error("Failed to subscribe nodes:", err));
    }

    if (!this._unsubDeliveryFn) {
      this.hass.connection
        .subscribeMessage(
          (event) => this._handleDeliveryStatus(event),
          { type: "meshtastic_ui/subscribe_delivery" }
        )
        .then((unsub) => { this._unsubDeliveryFn = unsub; })
        .catch((err) => console.error("Failed to subscribe delivery:", err));
    }

    if (!this._unsubWaypointsFn) {
      this.hass.connection
        .subscribeMessage(
          (event) => this._handleWaypointUpdate(event),
          { type: "meshtastic_ui/subscribe_waypoints" }
        )
        .then((unsub) => { this._unsubWaypointsFn = unsub; })
        .catch((err) => console.error("Failed to subscribe waypoints:", err));
    }

    if (!this._unsubTraceroutesFn) {
      this.hass.connection
        .subscribeMessage(
          (event) => this._handleTracerouteResult(event),
          { type: "meshtastic_ui/subscribe_traceroutes" }
        )
        .then((unsub) => { this._unsubTraceroutesFn = unsub; })
        .catch((err) => console.error("Failed to subscribe traceroutes:", err));
    }
  }

  _unsubscribe() {
    if (this._unsubscribeFn) { this._unsubscribeFn(); this._unsubscribeFn = null; }
    if (this._unsubNodesFn) { this._unsubNodesFn(); this._unsubNodesFn = null; }
    if (this._unsubDeliveryFn) { this._unsubDeliveryFn(); this._unsubDeliveryFn = null; }
    if (this._unsubWaypointsFn) { this._unsubWaypointsFn(); this._unsubWaypointsFn = null; }
    if (this._unsubTraceroutesFn) { this._unsubTraceroutesFn(); this._unsubTraceroutesFn = null; }
  }

  _handleRealtimeMessage(data) {
    if (!data._outgoing) this._tsAccumulators.packetRx++;

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
    // Capture telemetry snapshots from the local (gateway) node
    if (node_id === this._localNodeId && data) {
      if (data.channel_utilization != null) this._tsSnapshots.channelUtil = data.channel_utilization;
      if (data.air_util_tx != null) this._tsSnapshots.airtimeTx = data.air_util_tx;
      if (data.battery != null) this._tsSnapshots.battery = data.battery;
    }
    this._nodes = {
      ...this._nodes,
      [node_id]: { ...(this._nodes[node_id] || {}), ...data },
    };
  }

  _handleDeliveryStatus(event) {
    const { packet_id, status, error } = event;
    if (!packet_id) return;
    this._tsAccumulators.packetTx++;
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
    if (tab === "radio") this._loadGateways();
    if (tab === "nodes") this._loadNodes();
    if (tab === "map") { this._loadNodes(); this._loadWaypoints(); this._loadTraceroutes(); }
  }

  /* ── Event handlers from child components ── */

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
    const { text, conversation } = e.detail;
    const data = { text };
    if (this._dms.includes(conversation)) {
      data.to = conversation;
    } else {
      data.channel = parseInt(conversation, 10) || 0;
    }
    const result = await this._wsCommand("meshtastic_ui/send_message", data);
    if (result?.packet_id) {
      this._deliveryStatuses = {
        ...this._deliveryStatuses,
        [result.packet_id]: { status: "pending" },
      };
    }
  }

  async _onNodeAction(e) {
    const { action, nodeId } = e.detail;
    const nodesTab = this.shadowRoot.querySelector("mesh-nodes-tab");

    if (action === "send-message") {
      if (!this._dms.includes(nodeId)) {
        this._dms = [...this._dms, nodeId];
      }
      this._selectedConversation = nodeId;
      this._activeTab = "messages";
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
      const result = await this._wsCommand("meshtastic_ui/call_service", {
        service: "request_position",
        service_data: { destination: nodeId },
      });
      if (nodesTab) {
        nodesTab.showFeedback(result?.success ? "Position request sent" : "Position request unavailable");
      }
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
        if (nodesTab) nodesTab.closeDialog();
      }
      if (nodesTab) nodesTab.showFeedback(result?.success ? "Node removed" : "Remove failed");
    }
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
        padding: 16px;
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
      .route-hop {
        display: flex; align-items: center; gap: 12px;
        padding: 8px 0; border-bottom: 1px solid var(--divider-color);
      }
      .route-hop:last-child { border-bottom: none; }
      .hop-number {
        width: 24px; height: 24px; border-radius: 50%;
        background: var(--primary-color); color: var(--text-primary-color);
        font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .hop-name { flex: 1; font-size: 14px; font-weight: 500; }
      .hop-snr { font-size: 12px; color: var(--secondary-text-color); }
      .traceroute-error {
        text-align: center; padding: 24px 16px; color: var(--secondary-text-color);
      }
      .traceroute-error ha-icon { --mdc-icon-size: 36px; margin-bottom: 12px; opacity: 0.5; display: block; }

      @media (max-width: 600px) {
        .tabs { padding: 0 4px; }
        .tab { padding: 10px 12px; font-size: 13px; }
        .content { padding: 8px; }
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
      ${this._tracerouteDialog ? this._renderTracerouteDialog() : ""}
      ${this._showNotificationModal ? this._renderNotificationModal() : ""}
    `;
  }

  _renderActiveTab() {
    switch (this._activeTab) {
      case "radio":
        return html`<mesh-radio-tab .gateways=${this._gateways} .timeSeries=${this._timeSeries}></mesh-radio-tab>`;
      case "messages":
        return html`
          <mesh-messages-tab
            .messages=${this._messages}
            .channels=${this._channels}
            .dms=${this._dms}
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
            @node-action=${this._onNodeAction}
          ></mesh-nodes-tab>
        `;
      case "map":
        return html`<mesh-map-tab .nodes=${this._nodes} .waypoints=${this._waypoints} .traceroutes=${this._traceroutes} .localNodeId=${this._localNodeId}></mesh-map-tab>`;
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
    const snrs = data.snr_towards || [];
    return html`
      <div class="traceroute-dialog" @click=${(e) => { if (e.target.classList.contains("traceroute-dialog")) { this._tracerouteDialog = null; } }}>
        <div class="traceroute-card">
          <div class="traceroute-header">
            <div class="title">Traceroute: ${this._getNodeName(data.to)} \u2192 ${this._getNodeName(data.from)}</div>
            <button class="close" @click=${() => { this._tracerouteDialog = null; }}>\u00D7</button>
          </div>
          <div class="traceroute-body">
            ${hops.map((hopId, i) => html`
              <div class="route-hop">
                <div class="hop-number">${i}</div>
                <div class="hop-name">${this._getNodeName(hopId)}</div>
                ${i > 0 && snrs[i - 1] != null ? html`<div class="hop-snr">${snrs[i - 1]} dB</div>` : ""}
              </div>
            `)}
            ${data.route_back?.length ? html`
              <div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;">Return Route</div>
              ${[data.from, ...(data.route_back || []), data.to].map((hopId, i) => html`
                <div class="route-hop">
                  <div class="hop-number">${i}</div>
                  <div class="hop-name">${this._getNodeName(hopId)}</div>
                  ${i > 0 && data.snr_back?.[i - 1] != null ? html`<div class="hop-snr">${data.snr_back[i - 1]} dB</div>` : ""}
                </div>
              `)}
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
              <input type="text" .value=${p.service || ""}
                placeholder="notify.mobile_app_phone"
                @input=${(e) => { this._notificationPrefs = { ...this._notificationPrefs, service: e.target.value }; }} />
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

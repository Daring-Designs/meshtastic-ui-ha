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
  }

  /* ── Data loading ── */

  async _loadData() {
    await this._loadGateways();
    await this._loadMessages();
    await this._loadNodes();
    await this._loadWaypoints();
    await this._loadTraceroutes();
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
      if (this._gateways.length > 0 && this._gateways[0].node_id) {
        this._localNodeId = this._gateways[0].node_id;
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
    this._timeSeries = { ...ts };
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
    this._tsAccumulators.packetRx++;

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
    this._selectedConversation = e.detail.conversation;
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
      // Attach packet_id to the most recent message in this conversation
      const msgs = this._messages[conversation];
      if (msgs && msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg.packet_id) {
          lastMsg.packet_id = result.packet_id;
          this._messages = { ...this._messages };
        }
      }
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
      const result = await this._wsCommand("meshtastic_ui/call_service", {
        service: "trace_route",
        service_data: { destination: nodeId },
      });
      if (nodesTab) {
        nodesTab.showFeedback(result?.success ? "Trace route sent" : "Trace route unavailable");
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
    `;
  }

  /* ── Render ── */

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
}

customElements.define("meshtastic-ui-panel", MeshtasticUiPanel);

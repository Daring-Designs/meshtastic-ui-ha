import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@4.1.1/lit-element.js?module";

/* ══════════════════════════════════════════════════════════
   Shared helpers
   ══════════════════════════════════════════════════════════ */

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatLastSeen(iso) {
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

function formatUptime(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds || "\u2014";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function renderMetric(label, value, suffix = "") {
  return html`
    <div class="metric-item">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value != null && value !== "" ? `${value}${suffix}` : "\u2014"}</div>
    </div>
  `;
}

/* Shared CSS used across tab components */
const sharedStyles = css`
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
`;

/* ══════════════════════════════════════════════════════════
   <mesh-radio-tab>
   ══════════════════════════════════════════════════════════ */

const CHART_WINDOW_PRESETS = [
  { label: "Last Hour", value: 3600 },
  { label: "Last 6 Hours", value: 21600 },
  { label: "Last 24 Hours", value: 86400 },
  { label: "Last 7 Days", value: 604800 },
];

export class MeshRadioTab extends LitElement {
  static get properties() {
    return {
      gateways: { type: Array },
      timeSeries: { type: Object },
      packetTypes: { type: Object },
      chartWindow: { type: Number },
      bucketInterval: { type: Number },
    };
  }

  constructor() {
    super();
    this.gateways = [];
    this.timeSeries = null;
    this.packetTypes = null;
    this.chartWindow = 3600;
    this.bucketInterval = 10;
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }

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
          width: 10px; height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.connected {
          background: #4caf50;
          box-shadow: 0 0 6px rgba(76,175,80,0.4);
        }
        .status-dot.disconnected {
          background: #f44336;
          box-shadow: 0 0 6px rgba(244,67,54,0.4);
        }
        .gateway-name { font-size: 16px; font-weight: 600; flex: 1; }
        .gateway-meta {
          display: flex; gap: 16px;
          font-size: 13px; color: var(--secondary-text-color);
        }
        .gateway-meta span { white-space: nowrap; }
        .gateway-section { padding: 16px 20px; }
        .gateway-section + .gateway-section { border-top: 1px solid var(--divider-color); }

        .channels-table { width: 100%; border-collapse: collapse; }
        .channels-table th {
          text-align: left; padding: 8px 12px;
          font-size: 11px; font-weight: 600;
          text-transform: uppercase; color: var(--secondary-text-color);
          border-bottom: 1px solid var(--divider-color); letter-spacing: 0.5px;
        }
        .channels-table td {
          padding: 8px 12px; font-size: 14px;
          border-bottom: 1px solid var(--divider-color);
        }
        .channels-table tr:last-child td { border-bottom: none; }

        .charts-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }
        .charts-heading {
          font-size: 14px;
          font-weight: 500;
          color: var(--secondary-text-color);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .window-select {
          padding: 4px 8px;
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 13px;
          cursor: pointer;
        }

        .table-scroll { overflow-x: auto; }

        @media (max-width: 600px) {
          .gateway-card-header { flex-wrap: wrap; }
          .gateway-meta { flex-wrap: wrap; gap: 8px; }
          .channels-table th,
          .channels-table td { padding: 6px 8px; font-size: 12px; }
          .metrics-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
        }
      `,
    ];
  }

  render() {
    if (!this.gateways.length) {
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
    const ts = this.timeSeries;
    const bi = this.bucketInterval || 10;
    const pktUnit = bi >= 60 ? `pkts/${Math.round(bi / 60)}min` : `pkts/${bi}s`;
    const presetLabel = CHART_WINDOW_PRESETS.find((p) => p.value === this.chartWindow)?.label || "Custom";
    return html`
      ${this.gateways.map((gw) => this._renderGatewayCard(gw))}
      ${ts ? html`
        <div class="charts-heading">
          <span>${presetLabel} Activity</span>
          <select class="window-select"
            .value=${String(this.chartWindow)}
            @change=${this._onWindowChange}>
            ${CHART_WINDOW_PRESETS.map((p) => html`
              <option value=${p.value} ?selected=${p.value === this.chartWindow}>${p.label}</option>
            `)}
          </select>
        </div>
        <div class="charts-section">
          <mesh-horizon-chart
            .data=${ts.channelUtil}
            label="Channel Utilization"
            colorMode="flat"
            flatColor="#42a5f5"
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.airtimeTx}
            label="Airtime TX"
            colorMode="flat"
            flatColor="#ffa726"
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.battery}
            label="Battery"
            colorMode="value"
            .maxValue=${100}
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.packetTx}
            label="Packets TX"
            colorMode="flat"
            flatColor="#9575cd"
            unit="${pktUnit}"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.packetRx}
            label="Packets RX"
            colorMode="flat"
            flatColor="#e57373"
            unit="${pktUnit}"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
        </div>
        ${this.packetTypes ? html`
          <div class="charts-heading" style="margin-top:12px">Packets by Type</div>
          <mesh-packet-treemap .data=${this.packetTypes}></mesh-packet-treemap>
        ` : ""}
      ` : ""}
    `;
  }

  _onWindowChange(e) {
    const value = parseInt(e.target.value, 10);
    this.dispatchEvent(new CustomEvent("chart-window-change", {
      detail: { window: value },
      bubbles: true,
      composed: true,
    }));
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
            ${sensors.uptime ? html`<span>Up ${formatUptime(sensors.uptime)}</span>` : ""}
          </div>
        </div>

        <div class="gateway-section">
          <div class="section-title">Metrics</div>
          <div class="metrics-grid">
            ${renderMetric("Battery", sensors.battery != null ? Math.min(sensors.battery, 100) : null, "%")}
            ${renderMetric("Voltage", sensors.voltage, " V")}
            ${renderMetric("Ch. Utilization", sensors.channel_utilization, "%")}
            ${renderMetric("Airtime", sensors.air_util_tx || sensors.airtime, "%")}
            ${renderMetric("Packets TX", sensors.packets_tx)}
            ${renderMetric("Packets RX", sensors.packets_rx)}
            ${renderMetric("Packets Bad", sensors.packets_bad)}
            ${renderMetric("Packets Relayed", sensors.packets_relayed)}
          </div>
        </div>

        ${channels.length ? html`
          <div class="gateway-section">
            <div class="section-title">Channels</div>
            <div class="table-scroll">
              <table class="channels-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Index</th><th>Type</th><th>PSK</th><th>Uplink</th><th>Downlink</th>
                  </tr>
                </thead>
                <tbody>
                  ${channels.map((ch) => html`
                    <tr>
                      <td>${ch.name}</td>
                      <td>${ch.index}</td>
                      <td><span class="badge ${ch.primary ? "primary" : "secondary"}">${ch.primary ? "Primary" : "Secondary"}</span></td>
                      <td>${ch.psk ? "Yes" : "No"}</td>
                      <td>${ch.uplink ? "Yes" : "No"}</td>
                      <td>${ch.downlink ? "Yes" : "No"}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }
}
customElements.define("mesh-radio-tab", MeshRadioTab);

/* ══════════════════════════════════════════════════════════
   <mesh-messages-tab>
   ══════════════════════════════════════════════════════════ */

export class MeshMessagesTab extends LitElement {
  static get properties() {
    return {
      messages: { type: Object },
      channels: { type: Array },
      dms: { type: Array },
      selectedConversation: { type: String },
      deliveryStatuses: { type: Object },
      nodes: { type: Object },
      unreadCounts: { type: Object },
    };
  }

  constructor() {
    super();
    this.messages = {};
    this.channels = [];
    this.dms = [];
    this.selectedConversation = "";
    this.deliveryStatuses = {};
    this.nodes = {};
    this.unreadCounts = {};
    this._messageInput = "";
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }

        .messages-layout {
          display: flex; gap: 16px;
          height: calc(100vh - 150px);
        }
        .conversation-list {
          width: 240px; flex-shrink: 0;
          overflow-y: auto;
          border-right: 1px solid var(--divider-color);
          padding-right: 16px;
        }
        .conversation-item {
          padding: 10px 12px; cursor: pointer;
          border-radius: 8px; margin-bottom: 4px;
          transition: background 0.15s;
        }
        .conversation-item:hover { background: var(--secondary-background-color); }
        .conversation-item.active {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .conversation-header {
          font-size: 12px; font-weight: 600;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          padding: 8px 12px 4px; letter-spacing: 0.5px;
        }
        .chat-area {
          flex: 1; display: flex;
          flex-direction: column; min-width: 0; min-height: 0;
        }
        .chat-messages { flex: 1; overflow-y: auto; padding: 8px 0; }
        .chat-bubble {
          max-width: 75%; padding: 8px 14px;
          margin: 4px 0; border-radius: 16px;
          font-size: 14px; line-height: 1.4; word-break: break-word;
        }
        .chat-bubble.incoming {
          background: var(--secondary-background-color);
          border-bottom-left-radius: 4px; align-self: flex-start;
        }
        .chat-bubble .sender {
          font-size: 11px; font-weight: 600;
          color: var(--primary-color); margin-bottom: 2px;
        }
        .chat-bubble .time {
          font-size: 10px; color: var(--secondary-text-color); margin-top: 2px;
        }
        .chat-input-row {
          display: flex; gap: 8px; padding-top: 12px;
          border-top: 1px solid var(--divider-color);
          margin-top: auto; flex-shrink: 0;
        }
        .chat-input-row input {
          flex: 1; padding: 10px 14px;
          border: 1px solid var(--divider-color);
          border-radius: 20px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px; outline: none;
        }
        .chat-input-row input:focus { border-color: var(--primary-color); }
        .send-btn {
          padding: 8px 20px;
          background: var(--primary-color);
          color: var(--text-primary-color);
          border: none; border-radius: 20px;
          cursor: pointer; font-size: 14px; font-weight: 500;
        }
        .send-btn:hover { opacity: 0.9; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .chat-input-meta {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 4px 0; font-size: 11px; color: var(--secondary-text-color);
          flex-shrink: 0;
        }
        .byte-counter { font-variant-numeric: tabular-nums; }
        .byte-counter.warn { color: #f9a825; }
        .byte-counter.over { color: #f44336; }

        .delivery-icon {
          display: inline-block; margin-left: 4px;
          font-size: 11px; vertical-align: middle;
        }
        .delivery-icon.pending { color: var(--secondary-text-color); }
        .delivery-icon.delivered { color: #4caf50; }
        .delivery-icon.failed { color: #f44336; }

        .chat-bubble.outgoing {
          background: var(--primary-color);
          color: var(--text-primary-color);
          border-bottom-right-radius: 4px; align-self: flex-end;
          margin-left: auto;
        }
        .chat-bubble.outgoing .sender { color: rgba(255,255,255,0.7); }
        .chat-bubble.outgoing .time { color: rgba(255,255,255,0.6); }

        .encryption-badge {
          display: inline-block; font-size: 10px;
          margin-left: 6px; opacity: 0.6; vertical-align: middle;
        }

        .conv-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; padding: 0 5px;
          border-radius: 9px; background: #f44336; color: white;
          font-size: 10px; font-weight: 700; margin-left: auto;
          line-height: 1;
        }
        .conversation-item.active .conv-badge { background: rgba(255,255,255,0.3); }
        .conversation-item { display: flex; align-items: center; }

        @media (max-width: 600px) {
          .messages-layout { flex-direction: column; }
          .conversation-list {
            width: auto; flex-shrink: 0;
            overflow-x: auto; overflow-y: hidden;
            border-right: none;
            border-bottom: 1px solid var(--divider-color);
            padding: 0 0 8px; padding-right: 0;
            display: flex; flex-direction: row; gap: 4px;
            white-space: nowrap;
          }
          .conversation-header { display: none; }
          .conversation-item {
            display: inline-block; white-space: nowrap;
            padding: 6px 12px; flex-shrink: 0; margin-bottom: 0;
          }
        }
      `,
    ];
  }

  render() {
    // Always show at least the default channel (0) so users can send messages
    const defaultChannels = this.channels.length ? this.channels : ["0"];
    const allConversations = [...defaultChannels, ...this.dms];
    const selected = this.selectedConversation || allConversations[0] || "0";
    const currentMessages = this.messages[selected] || [];

    return html`
      <div class="messages-layout">
        <div class="conversation-list">
          <div class="conversation-header">Channels</div>
          ${defaultChannels.map((ch) => {
            const badge = this.unreadCounts?.[ch] || 0;
            return html`
              <div
                class="conversation-item ${selected === ch ? "active" : ""}"
                @click=${() => this._selectConversation(ch)}
              >${ch === "0" ? "Primary" : ch}${badge > 0 ? html`<span class="conv-badge">${badge}</span>` : ""}</div>
            `;
          })}
          ${this.dms.length ? html`
            <div class="conversation-header">Direct Messages</div>
            ${this.dms.map((dm) => {
              const name = this._getNodeName(dm) || dm;
              const badge = this.unreadCounts?.[dm] || 0;
              return html`
                <div
                  class="conversation-item ${selected === dm ? "active" : ""}"
                  @click=${() => this._selectConversation(dm)}
                >${name}${badge > 0 ? html`<span class="conv-badge">${badge}</span>` : ""}</div>
              `;
            })}
          ` : ""}
        </div>

        <div class="chat-area">
          <div class="chat-messages">
            ${currentMessages.map((msg) => {
              const isOutgoing = msg.type === "sent" || msg._outgoing;
              const senderName = this._getNodeName(msg.from) || msg.from || "Unknown";
              const delivery = msg.packet_id ? this.deliveryStatuses[msg.packet_id] : null;
              return html`
                <div class="chat-bubble ${isOutgoing ? "outgoing" : "incoming"}">
                  <div class="sender">${senderName}</div>
                  <div>${msg.text}</div>
                  <div class="time">
                    ${formatTime(msg.timestamp)}${delivery ? html`<span class="delivery-icon ${delivery.status}">${delivery.status === "delivered" ? "\u2713\u2713" : delivery.status === "failed" ? "\u2717" : "\u231B"}</span>` : ""}${msg.channel != null ? html`<span class="encryption-badge" title="Channel ${msg.channel}">\uD83D\uDD12</span>` : ""}
                  </div>
                </div>
              `;
            })}
            ${!currentMessages.length ? html`
              <div class="empty-state">
                <ha-icon icon="mdi:message-text-outline"></ha-icon>
                <div>No messages yet</div>
                <div style="font-size: 13px; margin-top: 8px;">
                  Send a message below or wait for messages from the mesh.
                </div>
              </div>
            ` : ""}
          </div>

          <div class="chat-input-row">
            <input
              type="text"
              placeholder="Type a message..."
              .value=${this._messageInput}
              @input=${(e) => { this._messageInput = e.target.value; this.requestUpdate(); }}
              @keydown=${this._onKeydown}
              maxlength="228"
            />
            <button class="send-btn" @click=${this._sendMessage} ?disabled=${!this._messageInput.trim()}>Send</button>
          </div>
          <div class="chat-input-meta">
            <span></span>
            <span class="byte-counter ${this._byteCount > 200 ? (this._byteCount > 228 ? "over" : "warn") : ""}">${this._byteCount}/228 bytes</span>
          </div>
        </div>
      </div>
    `;
  }

  _selectConversation(conv) {
    this.dispatchEvent(
      new CustomEvent("select-conversation", { detail: { conversation: conv }, bubbles: true, composed: true })
    );
  }

  _onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  _sendMessage() {
    if (!this._messageInput.trim()) return;
    const defaultChannels = this.channels.length ? this.channels : ["0"];
    const allConversations = [...defaultChannels, ...this.dms];
    const selected = this.selectedConversation || allConversations[0] || "0";
    this.dispatchEvent(
      new CustomEvent("send-message", {
        detail: { text: this._messageInput, conversation: selected },
        bubbles: true,
        composed: true,
      })
    );
    this._messageInput = "";
    this.requestUpdate();
  }

  get _byteCount() {
    return new TextEncoder().encode(this._messageInput).length;
  }

  _getNodeName(nodeId) {
    if (!nodeId || !this.nodes) return null;
    const node = this.nodes[nodeId];
    return node?.name || node?.short_name || null;
  }
}
customElements.define("mesh-messages-tab", MeshMessagesTab);

/* ══════════════════════════════════════════════════════════
   <mesh-nodes-tab>
   ══════════════════════════════════════════════════════════ */

export class MeshNodesTab extends LitElement {
  static get properties() {
    return {
      nodes: { type: Object },
      favoriteNodes: { type: Array },
      ignoredNodes: { type: Array },
      pendingTraceroute: { type: String },
    };
  }

  constructor() {
    super();
    this.nodes = {};
    this.favoriteNodes = [];
    this.ignoredNodes = [];
    this.pendingTraceroute = null;
    this._searchText = "";
    this._filterLastHeard = "all";
    this._filterBatteryMin = 0;
    this._filterHopsMax = null;
    this._filterFavorites = false;
    this._filtersExpanded = false;
    this._sortColumn = "name";
    this._sortAsc = true;
    // Node dialog
    this._selectedNodeId = null;
    this._selectedNode = null;
    this._actionFeedback = "";
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }

        .node-filters { margin-bottom: 16px; }
        .filter-row-main { display: flex; gap: 8px; align-items: center; }
        .search-input {
          flex: 1; padding: 8px 14px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px; outline: none;
        }
        .search-input:focus { border-color: var(--primary-color); }
        .filter-toggle-btn {
          padding: 8px 14px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color);
          color: var(--secondary-text-color);
          cursor: pointer; font-size: 13px; white-space: nowrap;
        }
        .filter-toggle-btn:hover {
          color: var(--primary-text-color);
          border-color: var(--primary-color);
        }
        .filter-row-advanced {
          display: flex; gap: 16px; margin-top: 8px;
          padding: 12px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px; flex-wrap: wrap;
        }
        .filter-group { display: flex; flex-direction: column; gap: 4px; }
        .filter-group label {
          font-size: 11px; font-weight: 600;
          text-transform: uppercase;
          color: var(--secondary-text-color); letter-spacing: 0.5px;
        }
        .filter-group select,
        .filter-group input {
          padding: 6px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-size: 13px; outline: none;
        }

        .nodes-table { width: 100%; border-collapse: collapse; }
        .nodes-table th {
          text-align: left; padding: 10px 12px;
          font-size: 12px; font-weight: 600;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          border-bottom: 2px solid var(--divider-color);
          cursor: pointer; user-select: none; letter-spacing: 0.5px;
        }
        .nodes-table th:hover { color: var(--primary-text-color); }
        .sort-indicator { margin-left: 4px; font-size: 10px; }
        .nodes-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--divider-color);
          font-size: 14px;
        }
        .nodes-table tr.clickable-row { cursor: pointer; }
        .nodes-table tr.clickable-row:hover td {
          background: var(--secondary-background-color);
        }

        /* Node details dialog */
        .dialog-backdrop {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); z-index: 100;
          display: flex; align-items: center; justify-content: center;
        }
        .dialog-card {
          background: var(--card-background-color);
          border-radius: 12px; width: 90%; max-width: 560px;
          max-height: 85vh; overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .dialog-header {
          display: flex; align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--divider-color);
        }
        .dialog-title { flex: 1; font-size: 18px; font-weight: 600; }
        .dialog-close {
          background: none; border: none;
          font-size: 24px; cursor: pointer;
          color: var(--secondary-text-color);
          padding: 4px 8px; line-height: 1;
        }
        .dialog-close:hover { color: var(--primary-text-color); }
        .dialog-body { padding: 0; }
        .dialog-section { padding: 16px 20px; }
        .dialog-section + .dialog-section { border-top: 1px solid var(--divider-color); }
        .dialog-actions {
          display: flex; gap: 8px; padding: 16px 20px;
          border-top: 1px solid var(--divider-color); flex-wrap: wrap;
        }
        .action-btn {
          padding: 8px 16px; border: none; border-radius: 8px;
          cursor: pointer; font-size: 13px; font-weight: 500;
          display: flex; align-items: center; gap: 6px;
        }
        .action-btn.primary {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .action-btn.secondary {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }
        .action-btn:hover { opacity: 0.85; }
        .action-feedback {
          padding: 8px 16px; font-size: 13px;
          color: var(--primary-color); font-weight: 500;
          display: flex; align-items: center;
        }

        .fav-star {
          cursor: pointer; font-size: 16px;
          color: var(--secondary-text-color); transition: color 0.15s;
        }
        .fav-star.active { color: #ffc107; }
        .fav-star:hover { color: #ffb300; }

        .ignored-badge {
          display: inline-block; padding: 1px 6px;
          border-radius: 8px; font-size: 10px; font-weight: 600;
          background: var(--error-color, #f44336); color: #fff;
          margin-left: 6px; vertical-align: middle;
        }

        .node-name-cell { display: flex; align-items: center; gap: 6px; }

        .action-btn.danger {
          background: var(--error-color, #f44336);
          color: #fff;
        }

        .dialog-section-divider {
          font-size: 10px; color: var(--secondary-text-color);
          text-transform: uppercase; letter-spacing: 1px;
          padding: 12px 20px 4px; font-weight: 600;
        }

        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid var(--divider-color);
          border-top-color: var(--primary-color);
          border-radius: 50%; animation: spin 0.8s linear infinite;
          vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .table-scroll { overflow-x: auto; }

        @media (max-width: 600px) {
          .col-rssi { display: none; }
          .nodes-table th,
          .nodes-table td { padding: 8px 6px; font-size: 13px; }
          .node-name-cell {
            max-width: 120px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
          }
        }
      `,
    ];
  }

  render() {
    return html`
      ${this._renderFilters()}
      ${this._renderTable()}
      ${this._renderNodeDialog()}
    `;
  }

  _renderFilters() {
    return html`
      <div class="node-filters">
        <div class="filter-row-main">
          <input
            class="search-input" type="text"
            placeholder="Search nodes by name or ID..."
            .value=${this._searchText}
            @input=${(e) => { this._searchText = e.target.value; this.requestUpdate(); }}
          />
          <button class="filter-toggle-btn"
            @click=${() => { this._filtersExpanded = !this._filtersExpanded; this.requestUpdate(); }}
          >Filters ${this._filtersExpanded ? "\u25B2" : "\u25BC"}</button>
        </div>
        ${this._filtersExpanded ? html`
          <div class="filter-row-advanced">
            <div class="filter-group">
              <label>Last Heard</label>
              <select .value=${this._filterLastHeard}
                @change=${(e) => { this._filterLastHeard = e.target.value; this.requestUpdate(); }}>
                <option value="all">All Time</option>
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Min Battery %</label>
              <input type="number" min="0" max="100"
                .value=${String(this._filterBatteryMin)}
                @change=${(e) => { this._filterBatteryMin = parseInt(e.target.value) || 0; this.requestUpdate(); }}
                style="width: 70px;" />
            </div>
            <div class="filter-group">
              <label>Max Hops</label>
              <input type="number" min="0" max="10"
                .value=${this._filterHopsMax != null ? String(this._filterHopsMax) : ""}
                placeholder="Any"
                @change=${(e) => { const v = e.target.value; this._filterHopsMax = v !== "" ? parseInt(v) : null; this.requestUpdate(); }}
                style="width: 70px;" />
            </div>
            <div class="filter-group">
              <label>Show</label>
              <select .value=${this._filterFavorites ? "favorites" : "all"}
                @change=${(e) => { this._filterFavorites = e.target.value === "favorites"; this.requestUpdate(); }}>
                <option value="all">All Nodes</option>
                <option value="favorites">Favorites Only</option>
              </select>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  _renderTable() {
    const sortedNodes = this._getFilteredAndSortedNodes();
    const totalCount = Object.keys(this.nodes).length;
    const favSet = new Set(this.favoriteNodes || []);
    const ignSet = new Set(this.ignoredNodes || []);
    const columns = [
      { key: "_fav", label: "\u2606" },
      { key: "name", label: "Name" },
      { key: "snr", label: "SNR" },
      { key: "rssi", label: "RSSI" },
      { key: "hops", label: "Hops" },
      { key: "battery", label: "Battery" },
      { key: "_last_seen", label: "Last Seen" },
    ];

    if (!totalCount) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:access-point-network-off"></ha-icon>
          <div>No mesh nodes discovered yet</div>
          <div style="font-size: 13px; margin-top: 8px;">Nodes will appear as they communicate on the mesh.</div>
        </div>
      `;
    }
    if (!sortedNodes.length) {
      return html`<div class="empty-state"><div>No nodes match the current filters</div></div>`;
    }

    return html`
      <ha-card>
        <div class="table-scroll">
          <table class="nodes-table">
            <thead>
              <tr>
                ${columns.map((col) => html`
                  <th class="${col.key === "rssi" ? "col-rssi" : ""}"
                    @click=${() => col.key !== "_fav" && this._sortNodes(col.key)}
                    style="${col.key === "_fav" ? "width:32px;cursor:default;" : ""}">
                    ${col.label}
                    ${this._sortColumn === col.key
                      ? html`<span class="sort-indicator">${this._sortAsc ? "\u25B2" : "\u25BC"}</span>`
                      : ""}
                  </th>
                `)}
              </tr>
            </thead>
            <tbody>
              ${sortedNodes.map(([nodeId, node]) => {
                const isFav = favSet.has(nodeId);
                const isIgn = ignSet.has(nodeId);
                return html`
                  <tr class="clickable-row" @click=${() => this._openNodeDialog(nodeId)}>
                    <td>
                      <span class="fav-star ${isFav ? "active" : ""}"
                        @click=${(e) => { e.stopPropagation(); this._fireNodeAction(isFav ? "unfavorite" : "favorite", nodeId); }}
                        title="${isFav ? "Remove from favorites" : "Add to favorites"}"
                      >${isFav ? "\u2605" : "\u2606"}</span>
                    </td>
                    <td>
                      <span class="node-name-cell">
                        ${node.name || nodeId}${isIgn ? html`<span class="ignored-badge">IGN</span>` : ""}
                      </span>
                    </td>
                    <td>${node.snr ?? "\u2014"}</td>
                    <td class="col-rssi">${node.rssi ?? "\u2014"}</td>
                    <td>${node.hops ?? "\u2014"}</td>
                    <td>${node.battery != null ? `${Math.min(node.battery, 100)}%` : "\u2014"}</td>
                    <td>${formatLastSeen(node._last_seen)}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </ha-card>
    `;
  }

  _getFilteredAndSortedNodes() {
    let entries = Object.entries(this.nodes);

    if (this._searchText) {
      const q = this._searchText.toLowerCase();
      entries = entries.filter(([nodeId, node]) => {
        const name = (node.name || "").toLowerCase();
        const id = nodeId.toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    if (this._filterFavorites) {
      const favSet = new Set(this.favoriteNodes || []);
      entries = entries.filter(([nodeId]) => favSet.has(nodeId));
    }

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

    if (this._filterBatteryMin > 0) {
      entries = entries.filter(([, node]) => {
        const bat = parseFloat(node.battery);
        return !isNaN(bat) && bat >= this._filterBatteryMin;
      });
    }

    if (this._filterHopsMax != null) {
      entries = entries.filter(([, node]) => {
        const hops = parseFloat(node.hops);
        return !isNaN(hops) && hops <= this._filterHopsMax;
      });
    }

    const col = this._sortColumn;
    const asc = this._sortAsc;
    return entries.sort(([, a], [, b]) => {
      let va = a[col] ?? "";
      let vb = b[col] ?? "";
      if (col === "battery" || col === "snr" || col === "hops" || col === "rssi") {
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

  _sortNodes(column) {
    if (this._sortColumn === column) {
      this._sortAsc = !this._sortAsc;
    } else {
      this._sortColumn = column;
      this._sortAsc = true;
    }
    this.requestUpdate();
  }

  /* ── Node dialog ── */

  _openNodeDialog(nodeId) {
    this._selectedNodeId = nodeId;
    this._selectedNode = this.nodes[nodeId] || {};
    this._actionFeedback = "";
    this.requestUpdate();
  }

  _closeNodeDialog() {
    this._selectedNodeId = null;
    this._selectedNode = null;
    this._actionFeedback = "";
    this.requestUpdate();
  }

  _onDialogBackdropClick(e) {
    if (e.target.classList.contains("dialog-backdrop")) this._closeNodeDialog();
  }

  _renderNodeDialog() {
    if (!this._selectedNodeId) return html``;
    const node = this._selectedNode || {};
    const nodeId = this._selectedNodeId;
    const isFav = (this.favoriteNodes || []).includes(nodeId);
    const isIgn = (this.ignoredNodes || []).includes(nodeId);

    return html`
      <div class="dialog-backdrop" @click=${this._onDialogBackdropClick}>
        <div class="dialog-card">
          <div class="dialog-header">
            <span class="fav-star ${isFav ? "active" : ""}" style="font-size:22px;margin-right:8px;"
              @click=${() => this._fireNodeAction(isFav ? "unfavorite" : "favorite", nodeId)}
              title="${isFav ? "Remove from favorites" : "Add to favorites"}"
            >${isFav ? "\u2605" : "\u2606"}</span>
            <div class="dialog-title">${node.name || nodeId}${isIgn ? html`<span class="ignored-badge" style="margin-left:8px;">IGNORED</span>` : ""}</div>
            <button class="dialog-close" @click=${this._closeNodeDialog}>\u00D7</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-section">
              <div class="section-title">Identity</div>
              <div class="metrics-grid">
                ${renderMetric("Node ID", nodeId)}
                ${renderMetric("Short Name", node.short_name)}
                ${renderMetric("Long Name", node.name)}
                ${renderMetric("Hardware", node.hardware_model || node.model)}
                ${renderMetric("Last Seen", formatLastSeen(node._last_seen))}
              </div>
            </div>
            <div class="dialog-section">
              <div class="section-title">Radio</div>
              <div class="metrics-grid">
                ${renderMetric("SNR", node.snr, " dB")}
                ${renderMetric("RSSI", node.rssi, " dBm")}
                ${renderMetric("Hops", node.hops)}
                ${renderMetric("Air Util TX", node.air_util_tx, "%")}
                ${renderMetric("Ch. Util", node.channel_utilization, "%")}
              </div>
            </div>
            <div class="dialog-section">
              <div class="section-title">Power</div>
              <div class="metrics-grid">
                ${renderMetric("Battery", node.battery != null ? Math.min(node.battery, 100) : null, "%")}
                ${renderMetric("Voltage", node.voltage, " V")}
                ${renderMetric("Uptime", node.uptime ? formatUptime(node.uptime) : null)}
              </div>
            </div>
            ${node.temperature != null || node.humidity != null || node.pressure != null ? html`
              <div class="dialog-section">
                <div class="section-title">Environment</div>
                <div class="metrics-grid">
                  ${renderMetric("Temperature", node.temperature, "\u00B0C")}
                  ${renderMetric("Humidity", node.humidity, "%")}
                  ${renderMetric("Pressure", node.pressure, " hPa")}
                </div>
              </div>
            ` : ""}
            ${node.latitude != null || node.longitude != null ? html`
              <div class="dialog-section">
                <div class="section-title">Position</div>
                <div class="metrics-grid">
                  ${renderMetric("Latitude", node.latitude)}
                  ${renderMetric("Longitude", node.longitude)}
                  ${renderMetric("Altitude", node.altitude, " m")}
                </div>
              </div>
            ` : ""}
          </div>

          <div class="dialog-actions">
            <button class="action-btn primary" @click=${() => this._fireNodeAction("send-message", nodeId)}>
              <ha-icon icon="mdi:message-text" style="--mdc-icon-size: 16px;"></ha-icon> Message
            </button>
            <button class="action-btn secondary"
              ?disabled=${this.pendingTraceroute === nodeId}
              @click=${() => this._fireNodeAction("trace-route", nodeId)}>
              ${this.pendingTraceroute === nodeId
                ? html`<span class="spinner"></span> Tracing...`
                : html`<ha-icon icon="mdi:routes" style="--mdc-icon-size: 16px;"></ha-icon> Trace Route`}
            </button>
            <button class="action-btn secondary" @click=${() => this._fireNodeAction("request-position", nodeId)}>
              <ha-icon icon="mdi:crosshairs-gps" style="--mdc-icon-size: 16px;"></ha-icon> Request Position
            </button>
            <button class="action-btn secondary" @click=${() => this._fireNodeAction(isIgn ? "unignore" : "ignore", nodeId)}>
              <ha-icon icon="mdi:${isIgn ? "eye" : "eye-off"}" style="--mdc-icon-size: 16px;"></ha-icon> ${isIgn ? "Unignore" : "Ignore"}
            </button>
            <button class="action-btn danger" @click=${() => this._confirmRemove(nodeId)}>
              <ha-icon icon="mdi:delete" style="--mdc-icon-size: 16px;"></ha-icon> Remove
            </button>
            ${this._actionFeedback
              ? html`<span class="action-feedback">${this._actionFeedback}</span>`
              : ""}
          </div>
        </div>
      </div>
    `;
  }

  _confirmRemove(nodeId) {
    if (confirm(`Remove node ${this._selectedNode?.name || nodeId} from the mesh database?`)) {
      this._fireNodeAction("remove", nodeId);
    }
  }

  _fireNodeAction(action, nodeId) {
    this.dispatchEvent(
      new CustomEvent("node-action", {
        detail: { action, nodeId },
        bubbles: true,
        composed: true,
      })
    );
  }

  showFeedback(text) {
    this._actionFeedback = text;
    this.requestUpdate();
    setTimeout(() => {
      this._actionFeedback = "";
      this.requestUpdate();
    }, 3000);
  }

  closeDialog() {
    this._closeNodeDialog();
  }
}
customElements.define("mesh-nodes-tab", MeshNodesTab);

/* ══════════════════════════════════════════════════════════
   <mesh-map-tab>
   ══════════════════════════════════════════════════════════ */

export class MeshMapTab extends LitElement {
  static get properties() {
    return {
      nodes: { type: Object },
      waypoints: { type: Object },
      traceroutes: { type: Object },
      localNodeId: { type: String },
    };
  }

  constructor() {
    super();
    this.nodes = {};
    this.waypoints = {};
    this.traceroutes = {};
    this.localNodeId = "";
    this._leafletLoaded = false;
    this._leafletError = false;
    this._mapInstance = null;
    this._nodeLayer = null;
    this._waypointLayer = null;
    this._snrLineLayer = null;
    this._tracerouteLayer = null;
    this._showNodes = true;
    this._showWaypoints = true;
    this._showSnrLines = false;
    this._showTraceroutes = false;
    this._tracerouteDialogData = null;
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }
        .map-container {
          position: relative;
          height: calc(100vh - 150px);
          border-radius: 12px; overflow: hidden;
          border: 1px solid var(--divider-color);
        }
        .map-element { width: 100%; height: 100%; }
        .map-info-badge {
          position: absolute; top: 10px; right: 10px; z-index: 1000;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px; padding: 6px 12px;
          font-size: 12px; color: var(--secondary-text-color);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .map-controls {
          position: absolute; top: 10px; left: 50px; z-index: 1000;
          display: flex; gap: 4px; flex-wrap: wrap;
          max-width: calc(100% - 60px);
        }
        .layer-btn {
          padding: 5px 10px; border-radius: 6px; font-size: 11px;
          font-weight: 600; cursor: pointer; border: 1px solid var(--divider-color);
          background: var(--card-background-color); color: var(--secondary-text-color);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.15s;
        }
        .layer-btn.active {
          background: var(--primary-color); color: var(--text-primary-color);
          border-color: var(--primary-color);
        }
        .layer-btn:hover { opacity: 0.85; }

        @media (max-width: 600px) {
          .map-controls {
            top: auto; bottom: 10px; left: 10px;
            max-width: calc(100% - 20px);
          }
          .map-info-badge {
            top: 10px; right: 10px; left: auto;
            font-size: 11px; padding: 4px 8px;
          }
        }

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
        .route-hop { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
        .hop-badge {
          padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;
          white-space: nowrap; flex-shrink: 0;
        }
        .hop-badge.source { background: #4caf50; color: white; }
        .hop-badge.dest { background: var(--primary-color); color: var(--text-primary-color); }
        .hop-badge.hop { background: var(--divider-color); color: var(--primary-text-color); }
        .hop-name { flex: 1; font-size: 14px; font-weight: 500; }
        .route-link {
          display: flex; align-items: center; gap: 10px; padding: 2px 0 2px 8px;
        }
        .link-arrow { color: var(--secondary-text-color); font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
        .link-snr-values { display: flex; gap: 12px; font-size: 12px; }
        .snr-fwd { color: #4caf50; }
        .snr-ret { color: #2196f3; }
      `,
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this._leafletLoaded && !this._leafletError) {
      this._loadLeaflet();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyMap();
  }

  updated(changedProps) {
    if (!this._mapInstance) return;
    if (changedProps.has("nodes") || changedProps.has("localNodeId")) {
      this._updateNodeLayer();
      this._updateSnrLines();
    }
    if (changedProps.has("waypoints")) this._updateWaypointLayer();
    if (changedProps.has("traceroutes")) {
      this._updateTracerouteLayer();
      this._updateSnrLines();
    }
  }

  render() {
    if (this._leafletError) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:map-marker-off"></ha-icon>
          <div>Failed to load map</div>
          <div style="font-size: 13px; margin-top: 8px;">Could not load Leaflet mapping library.</div>
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

    const nodesWithPosition = Object.values(this.nodes).filter((n) => {
      const lat = parseFloat(n.latitude);
      const lon = parseFloat(n.longitude);
      return !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);
    });
    const nodesWithout = Object.keys(this.nodes).length - nodesWithPosition.length;
    const wpCount = Object.keys(this.waypoints || {}).length;

    // Count nodes with SNR data + position (for SNR lines label)
    const snrCount = this.localNodeId && nodesWithPosition.length > 0
      ? Object.entries(this.nodes).filter(([id, n]) =>
          id !== this.localNodeId && n.snr != null &&
          !isNaN(parseFloat(n.latitude)) && !isNaN(parseFloat(n.longitude)) &&
          !(parseFloat(n.latitude) === 0 && parseFloat(n.longitude) === 0)
        ).length
      : 0;
    const routeCount = Object.keys(this.traceroutes || {}).length;

    return html`
      <div class="map-container">
        <div id="mesh-map" class="map-element"></div>
        <div class="map-controls">
          <button class="layer-btn ${this._showNodes ? "active" : ""}"
            @click=${() => this._toggleLayer("nodes")}>Nodes (${nodesWithPosition.length})</button>
          <button class="layer-btn ${this._showWaypoints ? "active" : ""}"
            @click=${() => this._toggleLayer("waypoints")}>Waypoints (${wpCount})</button>
          <button class="layer-btn ${this._showSnrLines ? "active" : ""}"
            @click=${() => this._toggleLayer("snr")}>SNR Lines${snrCount > 0 ? ` (${snrCount})` : ""}</button>
          <button class="layer-btn ${this._showTraceroutes ? "active" : ""}"
            @click=${() => this._toggleLayer("traceroutes")}>Routes${routeCount > 0 ? ` (${routeCount})` : ""}</button>
        </div>
        ${nodesWithout > 0 ? html`
          <div class="map-info-badge">${nodesWithout} node${nodesWithout !== 1 ? "s" : ""} without position</div>
        ` : ""}
      </div>
      ${this._tracerouteDialogData ? this._renderTracerouteDialog() : ""}
    `;
  }

  _renderTracerouteDialog() {
    const data = this._tracerouteDialogData;
    // data.to = source (local), data.route = forward hops, data.from = destination
    const hops = [data.to, ...(data.route || []), data.from];
    const snrFwd = data.snr_towards || [];
    const snrRet = data.snr_back || [];
    const nLinks = hops.length - 1;
    const hasReturnRoute = data.route_back?.length > 0;

    return html`
      <div class="traceroute-dialog" @click=${(e) => { if (e.target.classList.contains("traceroute-dialog")) this._tracerouteDialogData = null; this.requestUpdate(); }}>
        <div class="traceroute-card">
          <div class="traceroute-header">
            <div class="title">Traceroute: ${this._getNodeName(data.to)} \u2192 ${this._getNodeName(data.from)}</div>
            <button class="close" @click=${() => { this._tracerouteDialogData = null; this.requestUpdate(); }}>\u00D7</button>
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

  _getNodeName(nodeId) {
    if (!nodeId) return "Unknown";
    const node = this.nodes?.[nodeId];
    return node?.name || node?.short_name || nodeId;
  }

  _toggleLayer(layer) {
    if (layer === "nodes") {
      this._showNodes = !this._showNodes;
      if (this._nodeLayer) {
        this._showNodes ? this._mapInstance.addLayer(this._nodeLayer) : this._mapInstance.removeLayer(this._nodeLayer);
      }
    } else if (layer === "waypoints") {
      this._showWaypoints = !this._showWaypoints;
      if (this._waypointLayer) {
        this._showWaypoints ? this._mapInstance.addLayer(this._waypointLayer) : this._mapInstance.removeLayer(this._waypointLayer);
      }
    } else if (layer === "snr") {
      this._showSnrLines = !this._showSnrLines;
      if (this._snrLineLayer) {
        if (this._showSnrLines) {
          this._updateSnrLines();
          this._mapInstance.addLayer(this._snrLineLayer);
        } else {
          this._mapInstance.removeLayer(this._snrLineLayer);
        }
      }
    } else if (layer === "traceroutes") {
      this._showTraceroutes = !this._showTraceroutes;
      if (this._tracerouteLayer) {
        if (this._showTraceroutes) {
          this._updateTracerouteLayer();
          this._mapInstance.addLayer(this._tracerouteLayer);
        } else {
          this._mapInstance.removeLayer(this._tracerouteLayer);
        }
      }
      this._updateSnrLines();
    }
    this.requestUpdate();
  }

  async _loadLeaflet() {
    if (this._leafletLoaded) return;
    try {
      const linkEl = document.createElement("link");
      linkEl.rel = "stylesheet";
      linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      this.shadowRoot.appendChild(linkEl);

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
      this.requestUpdate();
      await this.updateComplete;
      this._initMap();
    } catch (err) {
      console.error("Failed to load Leaflet:", err);
      this._leafletError = true;
      this.requestUpdate();
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
    this._nodeLayer = L.layerGroup().addTo(map);
    this._waypointLayer = L.layerGroup().addTo(map);
    this._snrLineLayer = L.layerGroup();
    this._tracerouteLayer = L.layerGroup();

    this._updateNodeLayer();
    this._updateWaypointLayer();
    this._updateSnrLines();
    this._updateTracerouteLayer();
  }

  _snrToColor(snr) {
    if (snr == null) return "#888";
    if (snr >= 10) return "#4caf50";  // excellent
    if (snr >= 5) return "#8bc34a";   // good
    if (snr >= 0) return "#ffc107";   // fair
    if (snr >= -5) return "#ff9800";  // poor
    return "#f44336";                 // bad
  }

  _updateNodeLayer() {
    if (!this._nodeLayer) return;
    this._nodeLayer.clearLayers();
    const bounds = [];

    for (const [nodeId, node] of Object.entries(this.nodes)) {
      const lat = parseFloat(node.latitude);
      const lon = parseFloat(node.longitude);
      if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

      const name = node.name || nodeId;

      // Use colored circle markers based on last-seen freshness
      const isRecent = node._last_seen && (Date.now() - new Date(node._last_seen).getTime()) < 3600000;
      const marker = L.circleMarker([lat, lon], {
        radius: 7,
        fillColor: isRecent ? "#4caf50" : "#ff9800",
        fillOpacity: 0.8,
        color: "#fff",
        weight: 2,
      });
      marker.on("click", () => this._fireNodeAction("view-node", nodeId));
      marker.bindTooltip(name, { permanent: false, direction: "top", offset: [0, -8] });
      this._nodeLayer.addLayer(marker);
      bounds.push([lat, lon]);
    }

    if (bounds.length > 0 && this._mapInstance) {
      this._mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }

  _updateWaypointLayer() {
    if (!this._waypointLayer) return;
    this._waypointLayer.clearLayers();

    for (const [wpId, wp] of Object.entries(this.waypoints || {})) {
      const lat = parseFloat(wp.latitude);
      const lon = parseFloat(wp.longitude);
      if (isNaN(lat) || isNaN(lon)) continue;

      const name = wp.name || `Waypoint ${wpId}`;
      const popup = `
        <div style="min-width:140px;">
          <strong>${name}</strong>
          ${wp.description ? `<div style="font-size:12px;margin-top:4px;">${wp.description}</div>` : ""}
          ${wp.from ? `<div style="font-size:11px;color:#888;margin-top:4px;">From: ${wp.from}</div>` : ""}
        </div>
      `;

      // Diamond-shaped marker for waypoints
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: "#2196f3",
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });
      marker.bindPopup(popup);
      marker.bindTooltip(name, { permanent: false, direction: "top", offset: [0, -10] });
      this._waypointLayer.addLayer(marker);
    }
  }

  _updateSnrLines() {
    if (!this._snrLineLayer) return;
    this._snrLineLayer.clearLayers();

    // Get positions for all nodes
    const nodePositions = {};
    for (const [nodeId, node] of Object.entries(this.nodes)) {
      const lat = parseFloat(node.latitude);
      const lon = parseFloat(node.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        nodePositions[nodeId] = [lat, lon];
      }
    }

    const drawn = new Set();

    // Draw lines from our local/gateway node to each node with SNR data
    const localPos = this.localNodeId ? nodePositions[this.localNodeId] : null;
    if (localPos) {
      for (const [nodeId, node] of Object.entries(this.nodes)) {
        if (nodeId === this.localNodeId) continue;
        if (!nodePositions[nodeId] || node.snr == null) continue;
        const key = [this.localNodeId, nodeId].sort().join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);

        const color = this._snrToColor(node.snr);
        const line = L.polyline([localPos, nodePositions[nodeId]], {
          color,
          weight: 2.5,
          opacity: 0.7,
        });
        const name = node.name || node.short_name || nodeId;
        line.bindTooltip(`${name}: ${node.snr} dB SNR`, { sticky: true });
        this._snrLineLayer.addLayer(line);
      }
    }

    // Also draw links from traceroute data (hop-by-hop with per-hop SNR)
    for (const [, tr] of Object.entries(this.traceroutes || {})) {
      const allHops = [tr.to, ...(tr.route || []), tr.from];
      const snrs = tr.snr_towards || [];
      for (let i = 0; i < allHops.length - 1; i++) {
        const a = nodePositions[allHops[i]];
        const b = nodePositions[allHops[i + 1]];
        if (!a || !b) continue;
        const key = [allHops[i], allHops[i + 1]].sort().join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);

        const snr = snrs[i] ?? null;
        const color = this._snrToColor(snr);
        const line = L.polyline([a, b], {
          color,
          weight: 2.5,
          opacity: 0.7,
          dashArray: snr == null ? "5,5" : null,
        });
        if (snr != null) {
          line.bindTooltip(`SNR: ${snr} dB`, { sticky: true });
        }
        this._snrLineLayer.addLayer(line);
      }
    }
  }

  _updateTracerouteLayer() {
    if (!this._tracerouteLayer) return;
    this._tracerouteLayer.clearLayers();

    const nodePositions = {};
    for (const [nodeId, node] of Object.entries(this.nodes)) {
      const lat = parseFloat(node.latitude);
      const lon = parseFloat(node.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        nodePositions[nodeId] = [lat, lon];
      }
    }

    for (const [destId, tr] of Object.entries(this.traceroutes || {})) {
      // tr.to = source (local node), tr.route = forward hops, tr.from = destination
      const allHops = [tr.to, ...(tr.route || []), tr.from];
      const positions = allHops.map((id) => nodePositions[id]).filter(Boolean);
      if (positions.length < 2) continue;

      const line = L.polyline(positions, {
        color: "#9c27b0",
        weight: 3,
        opacity: 0.6,
        dashArray: "8,4",
      });
      line.bindTooltip(
        `Route to ${this._getNodeName(destId)} (${allHops.length - 2} hops)`,
        { sticky: true }
      );
      line.on("click", () => {
        this._tracerouteDialogData = tr;
        this.requestUpdate();
      });
      this._tracerouteLayer.addLayer(line);
    }
  }

  _destroyMap() {
    if (this._mapInstance) {
      this._mapInstance.remove();
      this._mapInstance = null;
      this._nodeLayer = null;
      this._waypointLayer = null;
      this._snrLineLayer = null;
      this._tracerouteLayer = null;
    }
  }

  _fireNodeAction(action, nodeId) {
    this.dispatchEvent(
      new CustomEvent("node-action", { detail: { action, nodeId }, bubbles: true, composed: true })
    );
  }
}
customElements.define("mesh-map-tab", MeshMapTab);

/* ══════════════════════════════════════════════════════════
   <mesh-horizon-chart>  –  D3 canvas-based horizon chart
   ══════════════════════════════════════════════════════════ */

let _d3Promise = null;
function loadD3() {
  if (window.d3) return Promise.resolve();
  if (_d3Promise) return _d3Promise;
  _d3Promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/d3@7/dist/d3.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _d3Promise;
}

class MeshHorizonChart extends LitElement {
  static get properties() {
    return {
      data: { type: Object },
      label: { type: String },
      colorScheme: { type: String },
      colorMode: { type: String },  // "bands" (default), "value" (red→green), or "flat" (single color)
      flatColor: { type: String },
      bands: { type: Number },
      height: { type: Number },
      maxValue: { type: Number },
      unit: { type: String },
      bucketInterval: { type: Number },
      _d3Ready: { type: Boolean },
      _tooltip: { type: Object },
    };
  }

  constructor() {
    super();
    this.data = null;
    this.label = "";
    this.colorScheme = "Blues";
    this.colorMode = "bands";
    this.flatColor = "#90caf9";
    this.bands = 4;
    this.height = 64;
    this.maxValue = 0;
    this.unit = "";
    this.bucketInterval = 2;
    this._d3Ready = false;
    this._resizeObserver = null;
    this._canvasWidth = 0;
    this._tooltip = null;
  }

  connectedCallback() {
    super.connectedCallback();
    loadD3().then(() => {
      this._d3Ready = true;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  firstUpdated() {
    const container = this.shadowRoot.querySelector(".chart-wrap");
    if (container) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width;
        if (w > 0 && w !== this._canvasWidth) {
          this._canvasWidth = w;
          this._drawHorizon();
        }
      });
      this._resizeObserver.observe(container);
    }
  }

  updated(changed) {
    if (changed.has("data") || changed.has("_d3Ready")) {
      this._drawHorizon();
    }
  }

  _onMouseMove(e) {
    if (!this.data) return;
    const canvas = this.shadowRoot.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const len = this.data.length;
    const rawColW = w / len;
    const colW = Math.max(2, Math.min(50, rawColW));
    const visible = Math.min(len, Math.floor(w / colW));
    const startIdx = len - visible;
    const idx = Math.floor(x / colW);
    if (idx < 0 || idx >= visible) { this._tooltip = null; return; }
    const value = this.data[startIdx + idx];
    const secsAgo = (visible - 1 - idx) * this.bucketInterval;
    let timeLabel;
    if (secsAgo === 0) timeLabel = "now";
    else if (secsAgo < 120) timeLabel = `-${secsAgo}s ago`;
    else if (secsAgo < 7200) timeLabel = `-${Math.round(secsAgo / 60)}m ago`;
    else if (secsAgo < 172800) timeLabel = `-${(secsAgo / 3600).toFixed(1)}h ago`;
    else timeLabel = `-${(secsAgo / 86400).toFixed(1)}d ago`;
    this._tooltip = { x, value: Math.round(value * 100) / 100, timeLabel };
  }

  _onMouseLeave() {
    this._tooltip = null;
  }

  _drawHorizon() {
    if (!this._d3Ready || !this.data || !window.d3) return;
    const canvas = this.shadowRoot.querySelector("canvas");
    if (!canvas) return;

    const w = this._canvasWidth || canvas.parentElement?.clientWidth || 300;
    const h = this.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const d3 = window.d3;
    const arr = this.data;
    const len = arr.length;
    let max;
    if (this.maxValue > 0) {
      max = this.maxValue;
    } else {
      // Auto-scale: round up to a nice value for readable Y-axis ticks
      const dataMax = d3.max(arr) || 1;
      const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
      max = niceSteps.find((s) => s >= dataMax * 1.15) || Math.ceil(dataMax * 1.15);
    }
    const bandH = h / this.bands;
    // Bar width: fill available space but clamp between 2–50px
    const rawColW = w / len;
    const colW = Math.max(2, Math.min(50, rawColW));
    // How many bars actually fit on the canvas
    const visible = Math.min(len, Math.floor(w / colW));
    const startIdx = len - visible;

    const mode = this.colorMode;
    let colors;
    if (mode === "bands") {
      const scheme = d3[`scheme${this.colorScheme}`];
      colors = scheme && scheme[Math.max(3, this.bands + 1)]
        ? scheme[Math.max(3, this.bands + 1)].slice(1, this.bands + 1)
        : d3.schemeBlues[Math.max(3, this.bands + 1)].slice(1, this.bands + 1);
    }

    for (let i = 0; i < visible; i++) {
      const val = Math.min(arr[startIdx + i], max);
      if (val <= 0) continue;
      const totalH = (val / max) * h;

      if (mode === "value") {
        const pct = val / max;
        const r = pct < 0.5 ? 220 : Math.round(220 - (pct - 0.5) * 2 * 180);
        const g = pct < 0.5 ? Math.round(60 + pct * 2 * 140) : 200;
        ctx.fillStyle = `rgb(${r},${g},40)`;
        ctx.fillRect(i * colW, h - totalH, colW + 0.5, totalH);
      } else if (mode === "flat") {
        ctx.fillStyle = this.flatColor;
        ctx.fillRect(i * colW, h - totalH, colW + 0.5, totalH);
      } else {
        let drawn = 0;
        for (let b = 0; b < this.bands && drawn < totalH; b++) {
          const layerH = Math.min(totalH - drawn, bandH);
          ctx.fillStyle = colors[b];
          ctx.fillRect(i * colW, h - drawn - layerH, colW + 0.5, layerH);
          drawn += layerH;
        }
      }
    }

    // Y-axis gridlines
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    const yTicks = max <= 10 ? 2 : max <= 50 ? 5 : max <= 100 ? 4 : 4;
    for (let t = 1; t <= yTicks; t++) {
      const val = (max / yTicks) * t;
      const y = h - (val / max) * h;
      ctx.fillStyle = "rgba(128,128,128,0.25)";
      ctx.fillRect(0, y, w, 1);
      if (t < yTicks) {
        ctx.fillStyle = "rgba(128,128,128,0.7)";
        ctx.fillText(`${Math.round(val)}`, 3, y - 2);
      }
    }

    // X-axis: adaptive gridlines (aim for ~6 lines)
    ctx.textAlign = "center";
    const bucketSec = this.bucketInterval;
    const totalVisibleSec = visible * bucketSec;
    const gridSteps = [300, 600, 1800, 3600, 7200, 14400, 28800, 86400];
    const idealStep = totalVisibleSec / 6;
    const gridStep = gridSteps.find((s) => s >= idealStep) || gridSteps[gridSteps.length - 1];
    for (let s = gridStep; s < totalVisibleSec; s += gridStep) {
      const idx = visible - s / bucketSec;
      if (idx < 0) break;
      const x = idx * colW;
      let label;
      if (s >= 86400) label = `-${s / 86400}d`;
      else if (s >= 3600) label = `-${s / 3600}h`;
      else label = `-${s / 60}m`;
      ctx.fillStyle = "rgba(128,128,128,0.4)";
      ctx.fillRect(x, 0, 1, h);
      ctx.fillStyle = "rgba(128,128,128,0.8)";
      ctx.fillText(label, x, h - 2);
    }
  }

  static get styles() {
    return css`
      :host { display: block; }
      .chart-container {
        background: var(--card-background-color);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        padding: 12px 16px;
      }
      .chart-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
      }
      .chart-wrap {
        width: 100%;
        position: relative;
      }
      canvas {
        display: block;
        width: 100%;
        border-radius: 4px;
        cursor: crosshair;
      }
      .loading {
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--secondary-text-color);
        font-size: 13px;
      }
      .crosshair {
        position: absolute;
        top: 0;
        width: 1px;
        height: 100%;
        background: var(--primary-color, #03a9f4);
        pointer-events: none;
        opacity: 0.7;
      }
      .tooltip {
        position: absolute;
        top: -32px;
        transform: translateX(-50%);
        background: var(--card-background-color, #333);
        color: var(--primary-text-color, #fff);
        border: 1px solid var(--divider-color, #555);
        border-radius: 8px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        z-index: 10;
      }
    `;
  }

  render() {
    const tt = this._tooltip;
    return html`
      <div class="chart-container">
        <div class="chart-label">${this.label}${this.unit ? html` <span style="opacity:0.6">(${this.unit})</span>` : ""}</div>
        <div class="chart-wrap"
          @mousemove=${this._onMouseMove}
          @mouseleave=${this._onMouseLeave}
        >
          ${this._d3Ready
            ? html`<canvas height="${this.height}"></canvas>`
            : html`<div class="loading">Loading D3...</div>`}
          ${tt ? html`
            <div class="crosshair" style="left:${tt.x}px"></div>
            <div class="tooltip" style="left:${tt.x}px">${tt.value}${this.unit ? ` ${this.unit}` : ""} @ ${tt.timeLabel}</div>
          ` : ""}
        </div>
      </div>
    `;
  }
}
customElements.define("mesh-horizon-chart", MeshHorizonChart);


/* ── Packet Type Treemap ── */

const PACKET_TYPE_COLORS = {
  text: "#42a5f5",
  position: "#66bb6a",
  telemetry: "#ffa726",
  nodeinfo: "#ab47bc",
  routing: "#78909c",
  other: "#8d6e63",
};
const PACKET_TYPE_LABELS = {
  text: "Text",
  position: "Position",
  telemetry: "Telemetry",
  nodeinfo: "Node Info",
  routing: "Routing",
  other: "Other",
};

class MeshPacketTreemap extends LitElement {
  static get properties() {
    return {
      data: { type: Object },
      _d3Ready: { type: Boolean },
      _tooltip: { type: Object },
    };
  }

  constructor() {
    super();
    this.data = null;
    this._d3Ready = false;
    this._resizeObserver = null;
    this._containerWidth = 0;
    this._tooltip = null;
  }

  connectedCallback() {
    super.connectedCallback();
    loadD3().then(() => { this._d3Ready = true; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  firstUpdated() {
    const container = this.shadowRoot.querySelector(".treemap-wrap");
    if (container) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width;
        if (w > 0 && w !== this._containerWidth) {
          this._containerWidth = w;
          this.requestUpdate();
        }
      });
      this._resizeObserver.observe(container);
    }
  }

  updated(changed) {
    if (changed.has("data") || changed.has("_d3Ready")) {
      this._drawTreemap();
    }
  }

  _drawTreemap() {
    if (!this._d3Ready || !this.data || !window.d3) return;
    const container = this.shadowRoot.querySelector(".treemap-wrap");
    if (!container) return;

    const w = this._containerWidth || container.clientWidth || 300;
    const h = 140;
    const d3 = window.d3;

    // Sum each type across the entire time window
    const children = [];
    for (const [key, arr] of Object.entries(this.data)) {
      const total = arr.reduce((s, v) => s + v, 0);
      if (total > 0) {
        children.push({ key, total, label: PACKET_TYPE_LABELS[key] || key, color: PACKET_TYPE_COLORS[key] || "#888" });
      }
    }

    // Clear previous
    container.innerHTML = "";

    if (children.length === 0) {
      container.style.height = `${h}px`;
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--secondary-text-color);font-size:13px;">No packets received yet</div>`;
      return;
    }

    const grandTotal = children.reduce((s, c) => s + c.total, 0);

    // Build hierarchy for d3.treemap
    const root = d3.hierarchy({ children })
      .sum((d) => d.total)
      .sort((a, b) => b.value - a.value);

    d3.treemap()
      .size([w, h])
      .padding(2)
      .round(true)(root);

    container.style.height = `${h}px`;
    container.style.position = "relative";

    for (const leaf of root.leaves()) {
      const d = leaf.data;
      const lw = leaf.x1 - leaf.x0;
      const lh = leaf.y1 - leaf.y0;
      const pct = ((d.total / grandTotal) * 100).toFixed(1);

      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;
        left:${leaf.x0}px;top:${leaf.y0}px;
        width:${lw}px;height:${lh}px;
        background:${d.color};
        border-radius:4px;
        overflow:hidden;
        display:flex;flex-direction:column;
        justify-content:center;align-items:center;
        color:#fff;font-size:${lw < 60 ? 9 : 12}px;
        text-shadow:0 1px 2px rgba(0,0,0,0.5);
        line-height:1.3;cursor:default;
      `;

      const tipText = `${d.label}: ${d.total} (${pct}%)`;
      el.addEventListener("mouseenter", () => {
        this._tooltip = { x: leaf.x0 + lw / 2, y: leaf.y0, text: tipText };
      });
      el.addEventListener("mouseleave", () => { this._tooltip = null; });

      if (lw > 50 && lh > 24) {
        el.innerHTML = `<strong>${d.label}</strong>`;
        if (lh > 40) el.innerHTML += `<span style="font-size:${lw < 60 ? 8 : 10}px;opacity:0.9">${d.total} (${pct}%)</span>`;
      }

      container.appendChild(el);
    }
  }

  static get styles() {
    return css`
      :host { display: block; }
      .chart-container {
        background: var(--card-background-color);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        padding: 12px 16px;
      }
      .treemap-outer {
        position: relative;
      }
      .treemap-wrap {
        width: 100%;
        position: relative;
        min-height: 140px;
      }
      .treemap-tooltip {
        position: absolute;
        transform: translate(-50%, -100%);
        margin-top: -6px;
        background: var(--card-background-color, #333);
        color: var(--primary-text-color, #fff);
        border: 1px solid var(--divider-color, #555);
        border-radius: 8px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        z-index: 10;
      }
    `;
  }

  render() {
    const tt = this._tooltip;
    return html`
      <div class="chart-container">
        <div class="treemap-outer">
          <div class="treemap-wrap"></div>
          ${tt ? html`
            <div class="treemap-tooltip" style="left:${tt.x}px;top:${tt.y}px">${tt.text}</div>
          ` : ""}
        </div>
      </div>
    `;
  }
}
customElements.define("mesh-packet-treemap", MeshPacketTreemap);

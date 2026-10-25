import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";
import { t } from "./i18n.js";

/* ══════════════════════════════════════════════════════════
   Shared helpers
   ══════════════════════════════════════════════════════════ */

// localStorage is shared across the whole HA origin — another dashboard/
// card filling the quota shouldn't be able to break map interactions here.
// A thrown QuotaExceededError (or storage disabled entirely) just means the
// preference silently doesn't persist for this load.
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore — see lsGet comment.
  }
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDateLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime()) return t("views.date.today");
    if (msgDay.getTime() === yesterday.getTime()) return t("views.date.yesterday");
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function isSameDay(iso1, iso2) {
  if (!iso1 || !iso2) return false;
  const a = new Date(iso1), b = new Date(iso2);
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatLastSeen(iso) {
  if (!iso) return t("common.unknown");
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return t("views.time.just_now");
    if (diff < 3600) return t("views.time.minutes_ago", { minutes: Math.floor(diff / 60) });
    if (diff < 86400) return t("views.time.hours_ago", { hours: Math.floor(diff / 3600) });
    return t("views.time.days_ago", { days: Math.floor(diff / 86400) });
  } catch {
    return t("common.unknown");
  }
}

function formatUptime(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds || "\u2014";
  if (s < 60) return t("views.duration.seconds", { seconds: s });
  if (s < 3600) return t("views.duration.minutes", { minutes: Math.floor(s / 60) });
  if (s < 86400) return t("views.duration.hours_minutes", { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) });
  return t("views.duration.days_hours", { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600) });
}

function formatHardware(hw) {
  if (!hw) return null;
  return hw.replace(/_/g, " ").replace(/\b\w+/g, (w) =>
    /^\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}

export function formatRadioDisplayName(longName, shortName, fallbackTitle, last4 = null) {
  const base = (longName && longName.trim()) || "";
  const short = (shortName && shortName.trim()) || "";
  if (base) {
    if (short && !base.includes(`(${short})`) && base !== short) {
      return `${base} (${short})`;
    }
    return base;
  }
  const fallback = (fallbackTitle && fallbackTitle.trim()) || t("radio.default_name");
  if (short && !fallback.includes(`(${short})`) && fallback !== short) {
    return `${fallback} (${short})`;
  }
  if (!short && last4 && !fallback.includes(last4)) {
    return `${fallback} (${last4})`;
  }
  return fallback;
}

function renderMetric(label, value, suffix = "") {
  const display = value != null && value !== "" ? `${value}${suffix}` : "\u2014";
  return html`
    <div class="metric-item">
      <div class="metric-label">${label}</div>
      <div class="metric-value" title="${display}">${display}</div>
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

// Labels are translation keys, resolved at render time (the language is set
// after this module is imported).
const CHART_WINDOW_PRESETS = [
  { labelKey: "views.window.1h", value: 3600 },
  { labelKey: "views.window.6h", value: 21600 },
  { labelKey: "views.window.24h", value: 86400 },
  { labelKey: "views.window.7d", value: 604800 },
];

export class MeshRadioTab extends LitElement {
  static get properties() {
    return {
      gateways: { type: Array },
      timeSeries: { type: Object },
      packetTypes: { type: Object },
      chartWindow: { type: Number },
      bucketInterval: { type: Number },
      reconnecting: { type: Boolean },
      radios: { type: Array },
      selectedRadioId: { type: String },
      radioUnread: { type: Object },
    };
  }

  constructor() {
    super();
    this.gateways = [];
    this.timeSeries = null;
    this.packetTypes = null;
    this.chartWindow = 3600;
    this.bucketInterval = 10;
    this.reconnecting = false;
    this.radios = [];
    this.selectedRadioId = null;
    this.radioUnread = {};
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
        .gateway-name { font-size: 16px; font-weight: 600; flex: 0 1 auto; min-width: 0; }
        .gateway-name-switcher {
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: none;
          color: var(--primary-text-color);
          font-size: 16px;
          font-weight: 600;
          font-family: inherit;
          padding: 4px 24px 4px 0;
          margin: 0;
          cursor: pointer;
          outline: none;
          background-image: linear-gradient(45deg, transparent 50%, var(--secondary-text-color) 50%),
                            linear-gradient(135deg, var(--secondary-text-color) 50%, transparent 50%);
          background-position: calc(100% - 10px) center, calc(100% - 5px) center;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          max-width: 100%;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .gateway-name-switcher:hover { color: var(--primary-color); }
        .gateway-name-switcher:focus { outline: none; }
        .gateway-name-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex: 0 1 auto;
          min-width: 0;
        }
        .gateway-unread-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: #f44336;
          color: white;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          box-sizing: border-box;
          flex-shrink: 0;
          margin-left: 6px;
        }
        .gateway-meta {
          display: flex; gap: 16px;
          font-size: 13px; color: var(--secondary-text-color);
          margin-left: auto;
          flex-shrink: 1;
          min-width: 0;
          overflow: hidden;
        }
        .gateway-meta span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .charts-heading-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .refresh-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 12px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          font-size: 11px;
          font-weight: 600;
          color: var(--secondary-text-color);
          cursor: help;
          white-space: nowrap;
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
          .gateway-meta { flex-wrap: wrap; gap: 8px; margin-left: 0; width: 100%; }
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
          <div>${t("radio.empty.title")}</div>
          <div style="font-size: 13px; margin-top: 8px;">
            ${t("radio.empty.hint")}
          </div>
        </div>
      `;
    }
    const ts = this.timeSeries;
    const bi = this.bucketInterval || 10;
    const pktUnit = bi >= 60
      ? t("radio.charts.packets_per_minutes", { minutes: Math.round(bi / 60) })
      : t("radio.charts.packets_per_seconds", { seconds: bi });
    const presetKey = CHART_WINDOW_PRESETS.find((p) => p.value === this.chartWindow)?.labelKey;
    const presetLabel = t(presetKey || "views.window.custom");
    // Use telemetry interval from the first connected gateway.
    const tlmInterval = this.gateways.find((g) => g.telemetry_interval != null)?.telemetry_interval;
    return html`
      ${this.gateways.map((gw) => this._renderGatewayCard(gw))}
      ${ts ? html`
        <div class="charts-heading">
          <span>${t("radio.charts.activity_heading", { window: presetLabel })}</span>
          <div class="charts-heading-meta">
            ${tlmInterval != null ? html`
              <span class="refresh-pill" title=${t("radio.charts.telemetry_interval_hint")}>
                ↻ ${this._formatInterval(tlmInterval)}
              </span>
            ` : ""}
            <select class="window-select"
              .value=${String(this.chartWindow)}
              @change=${this._onWindowChange}>
              ${CHART_WINDOW_PRESETS.map((p) => html`
                <option value=${p.value} ?selected=${p.value === this.chartWindow}>${t(p.labelKey)}</option>
              `)}
            </select>
          </div>
        </div>
        <div class="charts-section">
          <mesh-horizon-chart
            .data=${ts.channelUtil}
            label=${t("radio.charts.channel_utilization")}
            colorMode="flat"
            flatColor="#42a5f5"
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.airtimeTx}
            label=${t("radio.charts.airtime_tx")}
            colorMode="flat"
            flatColor="#ffa726"
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.battery}
            label=${t("radio.charts.battery")}
            colorMode="value"
            .maxValue=${100}
            unit="%"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.packetTx}
            label=${t("radio.charts.packets_tx")}
            colorMode="flat"
            flatColor="#9575cd"
            unit="${pktUnit}"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
          <mesh-horizon-chart
            .data=${ts.packetRx}
            label=${t("radio.charts.packets_rx")}
            colorMode="flat"
            flatColor="#e57373"
            unit="${pktUnit}"
            .bucketInterval=${bi}
          ></mesh-horizon-chart>
        </div>
        ${this.packetTypes ? html`
          <div class="charts-heading" style="margin-top:12px">${t("radio.charts.packets_by_type")}</div>
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

  _formatInterval(secs) {
    // 0 means "firmware default" — fw 2.7.x uses 3600s.
    if (secs === 0) return t("radio.interval.firmware_default");
    if (secs < 60) return t("radio.interval.seconds", { seconds: secs });
    if (secs < 3600) {
      const minutes = Math.round(secs / 60);
      return t("radio.interval.minutes", { minutes });
    }
    const hours = secs / 3600;
    return t("radio.interval.hours", {
      hours: hours === Math.floor(hours) ? hours : hours.toFixed(1),
    });
  }

  _handleReconnect() {
    this.dispatchEvent(new CustomEvent("reconnect", { bubbles: true, composed: true, detail: { radio_id: this.selectedRadioId } }));
  }

  _renderGatewayCard(gw) {
    const isConnected = gw.state?.toLowerCase() === "connected" || gw.state?.toLowerCase() === "on";
    const sensors = gw.sensors || {};
    const channels = gw.channels || [];

    const currentRadio = (this.radios || []).find((r) => r.radio_id === (this.selectedRadioId || gw.radio_id));
    const displayName = formatRadioDisplayName(
      gw.name || currentRadio?.name,
      gw.short_name || currentRadio?.short_name,
      currentRadio?.title || gw.title || null
    );

    return html`
      <div class="gateway-card">
        <div class="gateway-card-header">
          <div class="status-dot ${isConnected ? "connected" : "disconnected"}"></div>
          <div class="gateway-name">${displayName}</div>
          <div class="gateway-meta">
            ${gw.model ? html`<span>${gw.model}</span>` : ""}
            ${gw.firmware ? html`<span>v${gw.firmware}</span>` : ""}
            ${sensors.uptime ? html`<span>${t("radio.uptime", { uptime: formatUptime(sensors.uptime) })}</span>` : ""}
          </div>
        </div>

        <div class="gateway-section">
          <div class="section-title">${t("radio.metrics.title")}</div>
          <div class="metrics-grid">
            ${renderMetric(t("radio.metrics.battery"), sensors.battery != null ? Math.round(Math.min(sensors.battery, 100) * 100) / 100 : null, "%")}
            ${renderMetric(t("radio.metrics.voltage"), sensors.voltage != null ? Math.round(sensors.voltage * 100) / 100 : null, " V")}
            ${renderMetric(t("radio.metrics.channel_utilization"), sensors.channel_utilization != null ? Math.round(sensors.channel_utilization * 100) / 100 : null, "%")}
            ${renderMetric(t("radio.metrics.airtime"), (sensors.air_util_tx || sensors.airtime) != null ? Math.round((sensors.air_util_tx || sensors.airtime) * 100) / 100 : null, "%")}
            ${renderMetric(t("radio.metrics.packets_tx"), sensors.packets_tx)}
            ${renderMetric(t("radio.metrics.packets_rx"), sensors.packets_rx)}
            ${renderMetric(t("radio.metrics.packets_bad"), sensors.packets_bad)}
            ${renderMetric(t("radio.metrics.packets_relayed"), sensors.packets_relayed)}
          </div>
        </div>

        ${channels.length ? html`
          <div class="gateway-section">
            <div class="section-title">${t("radio.channels.title")}</div>
            <div class="table-scroll">
              <table class="channels-table">
                <thead>
                  <tr>
                    <th>${t("radio.channels.name")}</th><th>${t("radio.channels.index")}</th><th>${t("radio.channels.type")}</th><th>PSK</th><th>${t("radio.channels.uplink")}</th><th>${t("radio.channels.downlink")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${channels.map((ch) => html`
                    <tr>
                      <td>${ch.name}</td>
                      <td>${ch.index}</td>
                      <td><span class="badge ${ch.primary ? "primary" : "secondary"}">${ch.primary ? t("radio.channels.primary") : t("radio.channels.secondary")}</span></td>
                      <td>${ch.psk ? t("common.yes") : t("common.no")}</td>
                      <td>${ch.uplink ? t("common.yes") : t("common.no")}</td>
                      <td>${ch.downlink ? t("common.yes") : t("common.no")}</td>
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
      channelNames: { type: Object },
      selectedConversation: { type: String },
      deliveryStatuses: { type: Object },
      nodes: { type: Object },
      unreadCounts: { type: Object },
      radios: { type: Array },
      selectedRadioId: { type: String },
      radioUnread: { type: Object },
      _replyTo: { type: Object },
      _pendingClear: { type: Object, state: true },
    };
  }

  constructor() {
    super();
    this.messages = {};
    this.channels = [];
    this.dms = [];
    this.channelNames = {};
    this.selectedConversation = "";
    this.deliveryStatuses = {};
    this.nodes = {};
    this.unreadCounts = {};
    this.radios = [];
    this.selectedRadioId = null;
    this.radioUnread = {};
    this._messageInput = "";
    this._replyTo = null;
    this._touchMoved = false;
    this._touchWrapper = null;
    this._longPressTarget = null;
    this._pendingClear = null;
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }

        .messages-layout {
          display: flex; gap: 16px;
          height: calc(100vh - 125px);
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
        .chat-messages {
          flex: 1; overflow-y: auto; padding: 8px 0;
          display: flex; flex-direction: column;
        }
        .chat-bubble {
          padding: 8px 14px;
          border-radius: 16px;
          font-size: 14px; line-height: 1.4; word-break: break-word;
          min-width: 0;
        }
        .chat-bubble.incoming {
          background: var(--secondary-background-color);
          border-bottom-left-radius: 4px;
        }
        .chat-bubble .sender {
          font-size: 11px; font-weight: 600;
          color: var(--primary-color); margin-bottom: 2px;
        }
        .chat-bubble .time {
          font-size: 10px; color: var(--secondary-text-color); margin-top: 2px;
          display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
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
        .delivery-icon.timeout { color: var(--secondary-text-color); }

        .chat-bubble.outgoing {
          background: var(--primary-color);
          color: var(--text-primary-color);
          border-bottom-right-radius: 4px;
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
        .conversation-item { display: flex; align-items: center; gap: 6px; }
        .conv-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .conv-clear {
          flex-shrink: 0;
          opacity: 0;
          background: transparent;
          border: none;
          padding: 2px;
          color: inherit;
          cursor: pointer;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .conv-clear ha-icon { --mdc-icon-size: 16px; }
        .conversation-item:hover .conv-clear { opacity: 0.6; }
        .conv-clear:hover { opacity: 1 !important; background: rgba(244,67,54,0.15); color: #f44336; }
        @media (hover: none) {
          .conv-clear { opacity: 0.5; }
        }

        /* Reply UI */
        .chat-bubble-wrapper {
          display: flex;
          flex-direction: column;
          max-width: 80%;
          margin: 2px 0;
        }
        .chat-bubble-wrapper.outgoing { align-self: flex-end; align-items: flex-end; }
        .chat-bubble-wrapper.incoming { align-self: flex-start; align-items: flex-start; }

        .bubble-row {
          display: flex;
          align-items: flex-start;
          gap: 4px;
        }
        .chat-bubble-wrapper.outgoing .bubble-row { flex-direction: row-reverse; }

        .bubble-actions {
          display: none;
          flex-direction: column;
          gap: 2px;
          flex-shrink: 0;
          padding-top: 4px;
        }
        .bubble-row:hover .bubble-actions,
        .chat-bubble-wrapper.actions-open .bubble-actions { display: flex; }

        .bubble-action-btn {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; line-height: 1;
          color: var(--secondary-text-color);
          padding: 0;
        }
        .bubble-action-btn:hover {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }

        .reply-banner {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          background: var(--secondary-background-color);
          border-left: 3px solid var(--primary-color);
          border-radius: 8px;
          margin-bottom: 8px; flex-shrink: 0;
          font-size: 13px;
        }
        .reply-banner .reply-text {
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: var(--primary-text-color);
        }
        .reply-banner .reply-sender {
          font-weight: 600; color: var(--primary-color); margin-right: 6px;
        }
        .reply-banner .reply-cancel {
          background: none; border: none; cursor: pointer;
          font-size: 18px; color: var(--secondary-text-color);
          padding: 0 4px; line-height: 1;
        }
        .reply-banner .reply-cancel:hover { color: var(--primary-text-color); }

        .quoted-reply {
          border-left: 2px solid var(--primary-color);
          padding: 2px 8px; margin-bottom: 4px;
          font-size: 12px; opacity: 0.8;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          max-width: 250px;
        }
        .chat-bubble.outgoing .quoted-reply {
          border-left-color: rgba(255,255,255,0.5);
        }
        .quoted-reply .quoted-sender { font-weight: 600; }

        .date-separator {
          display: flex; align-items: center; gap: 10px;
          margin: 12px 0 8px; color: var(--secondary-text-color);
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.5px; align-self: stretch;
        }
        .date-separator::before, .date-separator::after {
          content: ""; flex: 1;
          border-top: 1px solid var(--divider-color);
        }

        .hops-badge {
          font-size: 11px; margin-left: 5px; opacity: 0.75;
          cursor: default; display: inline-flex; align-items: center; gap: 1px;
        }
        .hops-badge svg { width: 14px; height: 11px; vertical-align: middle; }

        .chat-bubble-wrapper.unread .chat-bubble.incoming {
          border-left: 3px solid var(--primary-color);
        }
        .unread-divider {
          display: flex; align-items: center; gap: 10px;
          margin: 12px 0 8px; align-self: stretch;
        }
        .unread-divider::before, .unread-divider::after {
          content: ""; flex: 1;
          border-top: 1px solid var(--primary-color);
          opacity: 0.5;
        }
        .unread-divider span {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.5px; color: var(--primary-color);
        }

        @media (hover: none) {
          .bubble-actions { display: none !important; }
          .chat-bubble-wrapper.actions-open .bubble-actions { display: flex !important; }
        }

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

  updated(changedProps) {
    if (changedProps.has("messages") || changedProps.has("selectedConversation")) {
      this.updateComplete.then(() => {
        const el = this.shadowRoot?.querySelector(".chat-messages");
        if (!el) return;
        // When switching conversations, jump to the first unread bubble so
        // users land on the boundary between read and unread, not at the
        // bottom (#28). Falls back to bottom if there's nothing unread.
        if (changedProps.has("selectedConversation")) {
          const firstUnread = el.querySelector(".chat-bubble-wrapper.unread");
          if (firstUnread) {
            firstUnread.scrollIntoView({ block: "start" });
            return;
          }
        }
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  render() {
    // Always show at least the default channel (0) so users can send messages
    const defaultChannels = this.channels.length ? this.channels : ["0"];
    const allConversations = [...defaultChannels, ...this.dms];
    const selected = this.selectedConversation || allConversations[0] || "0";
    const currentMessages = this.messages[selected] || [];
    const unreadCount = this.unreadCounts?.[selected] || 0;
    const unreadStartIdx = unreadCount > 0 ? Math.max(0, currentMessages.length - unreadCount) : -1;

    return html`
      <div class="messages-layout">
        <div class="conversation-list">
          <div class="conversation-header">${t("messages.channels_header")}</div>
          ${defaultChannels.map((ch) => {
            const badge = this.unreadCounts?.[ch] || 0;
            const label = this.channelNames?.[ch] || (ch === "0" ? t("messages.channel_primary") : t("messages.channel_name", { index: ch }));
            const hasMessages = (this.messages[ch]?.length || 0) > 0;
            return html`
              <div
                class="conversation-item ${selected === ch ? "active" : ""}"
                @click=${() => this._selectConversation(ch)}
              >
                <span class="conv-name">${label}</span>
                ${badge > 0 ? html`<span class="conv-badge">${badge}</span>` : ""}
                ${hasMessages ? html`
                  <button class="conv-clear" title=${t("messages.clear_channel")}
                    @click=${(e) => this._requestClear(e, ch, label)}>
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                ` : ""}
              </div>
            `;
          })}
          ${this.dms.length ? html`
            <div class="conversation-header">${t("messages.dms_header")}</div>
            ${this.dms.map((dm) => {
              const name = this._getNodeName(dm) || dm;
              const badge = this.unreadCounts?.[dm] || 0;
              return html`
                <div
                  class="conversation-item ${selected === dm ? "active" : ""}"
                  @click=${() => this._selectConversation(dm)}
                >
                  <span class="conv-name">${name}</span>
                  ${badge > 0 ? html`<span class="conv-badge">${badge}</span>` : ""}
                  <button class="conv-clear" title=${t("messages.delete_conversation")}
                    @click=${(e) => this._requestClear(e, dm, name)}>
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                </div>
              `;
            })}
          ` : ""}
        </div>

        <div class="chat-area">
          <div class="chat-messages">
            ${currentMessages.map((msg, i) => {
              const isOutgoing = msg.type === "sent" || msg._outgoing;
              const senderName = this._getNodeName(msg.from) || msg.from || t("common.unknown");
              const delivery = msg.packet_id
                ? this.deliveryStatuses[msg.packet_id] ||
                  (msg.status ? { status: msg.status, error: msg.error } : null)
                : null;
              const msgId = msg.message_id;
              const hasActions = msgId != null;
              const isUnread = !isOutgoing && unreadStartIdx >= 0 && i >= unreadStartIdx;
              const showUnreadDivider = unreadStartIdx >= 0 && i === unreadStartIdx;
              const showDateSep = i === 0 || !isSameDay(currentMessages[i - 1].timestamp, msg.timestamp);
              // Look up quoted reply
              let quotedMsg = null;
              if (msg.reply_id) {
                quotedMsg = currentMessages.find((m) => m.message_id === msg.reply_id);
              }
              return html`
                ${showDateSep ? html`<div class="date-separator">${formatDateLabel(msg.timestamp)}</div>` : ""}
                ${showUnreadDivider ? html`
                  <div class="unread-divider"><span>${t("messages.new_messages", { count: unreadCount })}</span></div>
                ` : ""}
                <div class="chat-bubble-wrapper ${isOutgoing ? "outgoing" : "incoming"} ${isUnread ? "unread" : ""}"
                  @touchstart=${hasActions ? (e) => this._onTouchStart(e) : null}
                  @touchmove=${hasActions ? (e) => this._onTouchMove(e) : null}
                  @touchend=${hasActions ? (e) => this._onTouchEnd(e) : null}
                  @touchcancel=${hasActions ? () => this._onTouchCancel() : null}
                >
                  <div class="bubble-row">
                    <div class="chat-bubble ${isOutgoing ? "outgoing" : "incoming"}">
                      <div class="sender">${senderName}</div>
                      ${quotedMsg ? html`
                        <div class="quoted-reply">
                          <span class="quoted-sender">${this._getNodeName(quotedMsg.from) || quotedMsg.from || t("common.unknown")}</span>
                          ${(quotedMsg.text || "").slice(0, 60)}${(quotedMsg.text || "").length > 60 ? "\u2026" : ""}
                        </div>
                      ` : ""}
                      <div>${msg.text}</div>
                      <div class="time">
                        ${formatTime(msg.timestamp)}${msg.hops_away != null ? html`<span class="hops-badge" title="${msg.hops_away === 0 ? t("messages.hops.direct") : t("messages.hops.count", { count: msg.hops_away })}"><svg viewBox="0 0 255.55 196.22" fill="var(--secondary-text-color)"><path d="M229.68,195.41c1.62-1.37,1.32-4.91.91-6.72-.6-2.72-1.79-5.01-3.06-7.56-3.33-6.66-5.8-13.44-6.67-20.94,4.99.71,9.32,11.55,11.07,15.47,3.31,7.4,8.68,17.78,17.4,19.66,2.05.44,4.52.14,5.66-1.67,2.13-3.41-2.27-10.5-4.47-13.57-5.81-8.09-9.78-16.67-13.02-26.04-1.25-3.6-2.07-7.37-5.06-10.04-.75-.67-2.16-1.4-3.16-1.47l-3.81-.23c-7.54-.47-15.84-2.22-18.71-10.53-2.61-7.56.88-13.47-.64-22.58-.28-1.68-.33-3.33-.15-5.05,9.55-4.94,11.19-14.58,7.06-23.61-.84-1.84-1.71-3.55-3.01-5.08-4.1-4.83-10.38,6.56-14.15,8.72-20.83-24.43-57.51-33.07-87.56-32.87-5.23.04-9.96.09-15.13.7-7.99.95-17.35,1.07-23.63-4.74-1.23-1.14-2.59-2.98-2.15-4.55.77-2.75,17.44-1.94,20.6-2.15,13.7-.92,26.37-5.31,37.99-12.74,3.9-2.5,7.72-4.73,10-8.81,3.05-5.46-10.01-4.71-12.87-4.96-2.49-.22-4.83-.14-7.23-.52,3.4-3.3,8.57-7.05,9.09-11.29.44-3.55-11.02-1.85-13.51-1.55-5.94.71-11.63.94-17.58,2.08-9.61,1.84-18.26,5.95-26.34,11.32l-15.29,10.15c-3.16,2.1-6.44,2.64-10.28,2.59-19.77-.26-28.71,12.78-38.77,26.95-3.76,5.3,2.44,13.5,8.25,16.48,13.33,6.85,28.74-.82,35.52,18.08-1.49,1.16-2.85,1.32-4.35,1.67l-19.3,4.53C17.98,95.78-.5,103.25.01,109.91c.19,2.45,2.67,3.74,4.96,3.98,4.26.44,8.39-.98,12.24-3.06,6.37-3.44,13.12-5.53,20.55-5.56-6.57,3.22-12.79,6.85-18.27,11.81-3.36,3.04-7.47,9.88-4.16,13.18,1.09,1.09,2.71,1.52,4.51,1.3,8.26-1,13.77-8.84,23.34-12.54,7.83-3.02,15.89-4.51,24.23-5.42,3.66-.4,7.71-.41,10.26-.67,5.28-.53,10.64-.33,15.96,0l4.77.29,4.11.44c12.5,1.35,24.74,4.23,36.47,9.39l12.36,5.43c7.46,15.79,19.77,28.05,37.33,30.16l7.16.86c2.98.36,6.24-.57,9.19.77,3.24,1.47,5.02,10.98,5.95,14.55,1.95,7.52,6.51,19.39,15.05,21.25,1.44.31,2.77.08,3.65-.68Z"/></svg>${msg.hops_away > 0 ? `×${msg.hops_away}` : ""}</span>` : ""}${delivery ? html`<span class="delivery-icon ${delivery.status}" title="${delivery.status === "delivered" ? t("messages.delivery.delivered") : delivery.status === "failed" ? (delivery.error ? t("messages.delivery.failed_with_error", { error: delivery.error }) : t("messages.delivery.failed")) : delivery.status === "timeout" ? t("messages.delivery.timeout") : t("messages.delivery.sending")}">${delivery.status === "delivered" ? "\u2713\u2713" : delivery.status === "failed" ? "\u2717" : delivery.status === "timeout" ? "?" : "\u231B"}</span>` : ""}${msg.channel != null ? html`<span class="encryption-badge" title="${t("messages.channel_name", { index: msg.channel })}">\uD83D\uDD12</span>` : ""}
                      </div>
                    </div>
                    ${hasActions ? html`
                      <div class="bubble-actions">
                        <button class="bubble-action-btn" @click=${() => this._startReply(msg)} title=${t("messages.reply")}>\u21A9</button>
                      </div>
                    ` : ""}
                  </div>
                </div>
              `;
            })}
            ${!currentMessages.length ? html`
              <div class="empty-state">
                <ha-icon icon="mdi:message-text-outline"></ha-icon>
                <div>${t("messages.empty.title")}</div>
                <div style="font-size: 13px; margin-top: 8px;">
                  ${t("messages.empty.hint")}
                </div>
              </div>
            ` : ""}
          </div>

          ${this._replyTo ? html`
            <div class="reply-banner">
              <span class="reply-sender">${this._getNodeName(this._replyTo.from) || this._replyTo.from || t("common.unknown")}</span>
              <span class="reply-text">${(this._replyTo.text || "").slice(0, 80)}${(this._replyTo.text || "").length > 80 ? "\u2026" : ""}</span>
              <button class="reply-cancel" title=${t("messages.cancel_reply")} @click=${() => { this._replyTo = null; }}>\u00D7</button>
            </div>
          ` : ""}

          <div class="chat-input-row">
            <input
              type="text"
              placeholder="${this._replyTo ? t("messages.compose.reply_placeholder") : t("messages.compose.placeholder")}"
              .value=${this._messageInput}
              @input=${(e) => { this._messageInput = e.target.value; this.requestUpdate(); }}
              @keydown=${this._onKeydown}
              maxlength="228"
            />
            <button class="send-btn" @click=${this._sendMessage} ?disabled=${!this._messageInput.trim()}>${t("messages.compose.send")}</button>
          </div>
          <div class="chat-input-meta">
            <span></span>
            <span class="byte-counter ${this._byteCount > 200 ? (this._byteCount > 228 ? "over" : "warn") : ""}">${t("messages.compose.byte_counter", { used: this._byteCount, max: 228 })}</span>
          </div>
        </div>
      </div>

      <mesh-confirm-dialog
        .open=${this._pendingClear != null}
        title=${t("messages.clear_dialog.title")}
        .message=${this._pendingClear ? t("messages.clear_dialog.message", { label: this._pendingClear.label }) : ""}
        confirmLabel=${t("messages.clear_dialog.confirm")}
        .danger=${true}
        @confirm=${this._confirmClear}
        @cancel=${() => { this._pendingClear = null; }}
      ></mesh-confirm-dialog>
    `;
  }

  _selectConversation(conv) {
    this.dispatchEvent(
      new CustomEvent("select-conversation", { detail: { conversation: conv }, bubbles: true, composed: true })
    );
  }

  _requestClear(e, conv, label) {
    e.stopPropagation();  // don't also select the conversation
    this._pendingClear = { conv, label };
  }

  _confirmClear() {
    const pending = this._pendingClear;
    this._pendingClear = null;
    if (!pending) return;
    this.dispatchEvent(new CustomEvent("clear-conversation", {
      detail: { conversation: pending.conv },
      bubbles: true,
      composed: true,
    }));
  }

  _onKeydown(e) {
    if (e.key === "Escape" && this._replyTo) {
      this._replyTo = null;
      return;
    }
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
    const detail = { text: this._messageInput, conversation: selected };
    if (this._replyTo?.message_id != null) {
      detail.reply_id = this._replyTo.message_id;
    }
    this.dispatchEvent(
      new CustomEvent("send-message", {
        detail,
        bubbles: true,
        composed: true,
      })
    );
    this._messageInput = "";
    this._replyTo = null;
    this.requestUpdate();
  }

  _startReply(msg) {
    this._replyTo = msg;
    // Close any long-press actions
    this._clearActionsOpen();
    // Focus the input
    this.updateComplete.then(() => {
      const input = this.shadowRoot.querySelector(".chat-input-row input");
      if (input) input.focus();
    });
  }

  _onTouchStart(e) {
    this._touchMoved = false;
    this._touchWrapper = e.currentTarget;
    this._touchStartTime = Date.now();
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
  }

  _onTouchMove(e) {
    if (this._touchMoved) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) this._touchMoved = true;
  }

  _onTouchEnd(e) {
    const wrapper = this._touchWrapper;
    this._touchWrapper = null;
    if (this._touchMoved || !wrapper) return;
    // A press held past the OS long-press threshold is the user selecting
    // text to copy it — leave that to the browser and don't toggle actions.
    if (Date.now() - this._touchStartTime > 400) return;
    if (e.target.closest(".bubble-actions")) return;
    if (wrapper.classList.contains("actions-open")) {
      wrapper.classList.remove("actions-open");
      this._longPressTarget = null;
    } else {
      this._clearActionsOpen();
      wrapper.classList.add("actions-open");
      this._longPressTarget = wrapper;
    }
  }

  _onTouchCancel() {
    this._touchMoved = false;
    this._touchWrapper = null;
  }

  _clearActionsOpen() {
    if (this._longPressTarget) {
      this._longPressTarget.classList.remove("actions-open");
      this._longPressTarget = null;
    }
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
      pendingPosition: { type: String },
      pendingNodeinfo: { type: String },
    };
  }

  constructor() {
    super();
    this.nodes = {};
    this.favoriteNodes = [];
    this.ignoredNodes = [];
    this.pendingTraceroute = null;
    this.pendingPosition = null;
    this.pendingNodeinfo = null;
    this._searchText = "";
    this._filterLastHeard = "all";
    this._filterBatteryMin = 0;
    this._filterHopsMax = null;
    this._filterFavorites = false;
    this._filterSource = "all";
    this._filtersExpanded = false;
    this._sortColumn = "name";
    this._sortAsc = true;
    this._loadFilterState();
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

        .mqtt-badge {
          display: inline-block; padding: 1px 6px;
          border-radius: 8px; font-size: 10px; font-weight: 600;
          background: var(--secondary-text-color, #888); color: var(--card-background-color, #fff);
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
            placeholder=${t("nodes.filters.search_placeholder")}
            .value=${this._searchText}
            @input=${(e) => { this._searchText = e.target.value; this.requestUpdate(); }}
          />
          <button class="filter-toggle-btn"
            @click=${() => { this._filtersExpanded = !this._filtersExpanded; this._saveFilterState(); this.requestUpdate(); }}
          >${t("nodes.filters.toggle")} ${this._filtersExpanded ? "\u25B2" : "\u25BC"}</button>
        </div>
        ${this._filtersExpanded ? html`
          <div class="filter-row-advanced">
            <div class="filter-group">
              <label>${t("nodes.filters.last_heard")}</label>
              <select .value=${this._filterLastHeard}
                @change=${(e) => { this._filterLastHeard = e.target.value; this._saveFilterState(); this.requestUpdate(); }}>
                <option value="all">${t("views.window.all_time")}</option>
                <option value="1h">${t("views.window.1h")}</option>
                <option value="6h">${t("views.window.6h")}</option>
                <option value="24h">${t("views.window.24h")}</option>
                <option value="7d">${t("views.window.7d")}</option>
              </select>
            </div>
            <div class="filter-group">
              <label>${t("nodes.filters.min_battery")}</label>
              <input type="number" min="0" max="100"
                .value=${String(this._filterBatteryMin)}
                @change=${(e) => { this._filterBatteryMin = parseInt(e.target.value) || 0; this._saveFilterState(); this.requestUpdate(); }}
                style="width: 70px;" />
            </div>
            <div class="filter-group">
              <label>${t("nodes.filters.max_hops")}</label>
              <input type="number" min="0" max="10"
                .value=${this._filterHopsMax != null ? String(this._filterHopsMax) : ""}
                placeholder=${t("nodes.filters.any")}
                @change=${(e) => { const v = e.target.value; this._filterHopsMax = v !== "" ? parseInt(v) : null; this._saveFilterState(); this.requestUpdate(); }}
                style="width: 70px;" />
            </div>
            <div class="filter-group">
              <label>${t("nodes.filters.source")}</label>
              <select .value=${this._filterSource}
                @change=${(e) => { this._filterSource = e.target.value; this._saveFilterState(); this.requestUpdate(); }}>
                <option value="all">RF + MQTT</option>
                <option value="rf">${t("nodes.filters.source_rf")}</option>
                <option value="mqtt">${t("nodes.filters.source_mqtt")}</option>
              </select>
            </div>
            <div class="filter-group">
              <label>${t("nodes.filters.show")}</label>
              <select .value=${this._filterFavorites ? "favorites" : "all"}
                @change=${(e) => { this._filterFavorites = e.target.value === "favorites"; this._saveFilterState(); this.requestUpdate(); }}>
                <option value="all">${t("nodes.filters.all_nodes")}</option>
                <option value="favorites">${t("nodes.filters.favorites_only")}</option>
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
      { key: "name", label: t("nodes.columns.name") },
      { key: "snr", label: "SNR" },
      { key: "rssi", label: "RSSI" },
      { key: "hops", label: t("nodes.columns.hops") },
      { key: "battery", label: t("nodes.columns.battery") },
      { key: "_last_seen", label: t("nodes.columns.last_seen") },
    ];

    if (!totalCount) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:access-point-network-off"></ha-icon>
          <div>${t("nodes.empty.title")}</div>
          <div style="font-size: 13px; margin-top: 8px;">${t("nodes.empty.hint")}</div>
        </div>
      `;
    }
    if (!sortedNodes.length) {
      return html`<div class="empty-state"><div>${t("nodes.empty.no_matches")}</div></div>`;
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
                        title="${isFav ? t("nodes.favorite.remove") : t("nodes.favorite.add")}"
                      >${isFav ? "\u2605" : "\u2606"}</span>
                    </td>
                    <td>
                      <span class="node-name-cell">
                        ${node.name || nodeId}${node.via_mqtt ? html`<span class="mqtt-badge">MQTT</span>` : ""}${isIgn ? html`<span class="ignored-badge">${t("nodes.badge.ignored_short")}</span>` : ""}
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

    if (this._filterSource !== "all") {
      // Nodes that predate via_mqtt tracking have no flag — treat as RF.
      entries = entries.filter(([, node]) =>
        this._filterSource === "mqtt" ? node.via_mqtt === true : node.via_mqtt !== true
      );
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
    this._saveFilterState();
    this.requestUpdate();
  }

  _loadFilterState() {
    try {
      const raw = lsGet("meshtastic-ui:node-filters");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s === "object") {
        if (s.filterLastHeard != null) this._filterLastHeard = s.filterLastHeard;
        if (s.filterBatteryMin != null) this._filterBatteryMin = s.filterBatteryMin;
        if (s.filterHopsMax !== undefined) this._filterHopsMax = s.filterHopsMax;
        if (s.filterFavorites != null) this._filterFavorites = s.filterFavorites;
        if (s.filterSource != null) this._filterSource = s.filterSource;
        if (s.filtersExpanded != null) this._filtersExpanded = s.filtersExpanded;
        if (s.sortColumn != null) this._sortColumn = s.sortColumn;
        if (s.sortAsc != null) this._sortAsc = s.sortAsc;
      }
    } catch (_) {}
  }

  _saveFilterState() {
    try {
      localStorage.setItem("meshtastic-ui:node-filters", JSON.stringify({
        filterLastHeard: this._filterLastHeard,
        filterBatteryMin: this._filterBatteryMin,
        filterHopsMax: this._filterHopsMax,
        filterFavorites: this._filterFavorites,
        filterSource: this._filterSource,
        filtersExpanded: this._filtersExpanded,
        sortColumn: this._sortColumn,
        sortAsc: this._sortAsc,
      }));
    } catch (_) {}
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
              title="${isFav ? t("nodes.favorite.remove") : t("nodes.favorite.add")}"
            >${isFav ? "\u2605" : "\u2606"}</span>
            <div class="dialog-title">${node.name || nodeId}${isIgn ? html`<span class="ignored-badge" style="margin-left:8px;">${t("nodes.badge.ignored")}</span>` : ""}</div>
            <button class="dialog-close" title=${t("common.close")} @click=${this._closeNodeDialog}>\u00D7</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-section">
              <div class="section-title">${t("nodes.dialog.identity")}</div>
              <div class="metrics-grid">
                ${renderMetric(t("nodes.dialog.node_id"), nodeId)}
                ${renderMetric(t("nodes.dialog.short_name"), node.short_name)}
                ${renderMetric(t("nodes.dialog.long_name"), node.name)}
                ${renderMetric(t("nodes.dialog.hardware"), formatHardware(node.hardware_model || node.model))}
                ${renderMetric(t("nodes.dialog.last_seen"), formatLastSeen(node._last_seen))}
              </div>
            </div>
            <div class="dialog-section">
              <div class="section-title">${t("nodes.dialog.radio")}</div>
              <div class="metrics-grid">
                ${renderMetric("SNR", node.snr != null ? Math.round(node.snr * 10) / 10 : null, " dB")}
                ${renderMetric("RSSI", node.rssi != null ? Math.round(node.rssi) : null, " dBm")}
                ${renderMetric(t("nodes.dialog.hops"), node.hops)}
                ${renderMetric(t("nodes.dialog.heard_via"), node.via_mqtt != null ? (node.via_mqtt ? "MQTT" : t("nodes.dialog.heard_via_radio")) : null)}
                ${renderMetric(t("nodes.dialog.air_util_tx"), node.air_util_tx != null ? Math.round(node.air_util_tx * 100) / 100 : null, "%")}
                ${renderMetric(t("nodes.dialog.channel_utilization"), node.channel_utilization != null ? Math.round(node.channel_utilization * 100) / 100 : null, "%")}
              </div>
            </div>
            <div class="dialog-section">
              <div class="section-title">${t("nodes.dialog.power")}</div>
              <div class="metrics-grid">
                ${renderMetric(t("nodes.dialog.battery"), node.battery != null ? Math.round(Math.min(node.battery, 100) * 100) / 100 : null, "%")}
                ${renderMetric(t("nodes.dialog.voltage"), node.voltage != null ? Math.round(node.voltage * 100) / 100 : null, " V")}
                ${renderMetric(t("nodes.dialog.uptime"), node.uptime ? formatUptime(node.uptime) : null)}
              </div>
            </div>
            ${node.temperature != null || node.humidity != null || node.pressure != null ? html`
              <div class="dialog-section">
                <div class="section-title">${t("nodes.dialog.environment")}</div>
                <div class="metrics-grid">
                  ${renderMetric(t("nodes.dialog.temperature"), node.temperature != null ? Math.round(node.temperature * 10) / 10 : null, "\u00B0C")}
                  ${renderMetric(t("nodes.dialog.humidity"), node.humidity != null ? Math.round(node.humidity * 10) / 10 : null, "%")}
                  ${renderMetric(t("nodes.dialog.pressure"), node.pressure != null ? Math.round(node.pressure * 10) / 10 : null, " hPa")}
                </div>
              </div>
            ` : ""}
            ${node.latitude != null || node.longitude != null ? html`
              <div class="dialog-section">
                <div class="section-title">${t("nodes.dialog.position")}</div>
                <div class="metrics-grid">
                  ${renderMetric(t("nodes.dialog.latitude"), node.latitude != null ? Math.round(node.latitude * 100000) / 100000 : null)}
                  ${renderMetric(t("nodes.dialog.longitude"), node.longitude != null ? Math.round(node.longitude * 100000) / 100000 : null)}
                  ${renderMetric(t("nodes.dialog.altitude"), node.altitude != null ? Math.round(node.altitude) : null, " m")}
                </div>
              </div>
            ` : ""}
          </div>

          <div class="dialog-actions">
            <button class="action-btn primary" @click=${() => this._fireNodeAction("send-message", nodeId)}>
              <ha-icon icon="mdi:message-text" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.message")}
            </button>
            <button class="action-btn secondary"
              ?disabled=${this.pendingTraceroute === nodeId}
              @click=${() => this._fireNodeAction("trace-route", nodeId)}>
              ${this.pendingTraceroute === nodeId
                ? html`<span class="spinner"></span> ${t("nodes.actions.tracing")}`
                : html`<ha-icon icon="mdi:routes" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.trace_route")}`}
            </button>
            <button class="action-btn secondary"
              ?disabled=${this.pendingPosition === nodeId}
              @click=${() => this._fireNodeAction("request-position", nodeId)}>
              ${this.pendingPosition === nodeId
                ? html`<span class="spinner"></span> ${t("nodes.actions.requesting")}`
                : html`<ha-icon icon="mdi:crosshairs-gps" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.request_position")}`}
            </button>
            ${node.latitude != null && node.longitude != null ? html`
            <button class="action-btn secondary" @click=${() => this._fireNodeAction("view-on-map", nodeId)}>
              <ha-icon icon="mdi:map-marker" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.view_on_map")}
            </button>
            ` : ""}
            ${!node.name ? html`
            <button class="action-btn secondary"
              ?disabled=${this.pendingNodeinfo === nodeId}
              @click=${() => this._fireNodeAction("request-nodeinfo", nodeId)}>
              ${this.pendingNodeinfo === nodeId
                ? html`<span class="spinner"></span> ${t("nodes.actions.requesting")}`
                : html`<ha-icon icon="mdi:card-account-details" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.request_info")}`}
            </button>
            ` : ""}
            <button class="action-btn secondary" @click=${() => this._fireNodeAction(isIgn ? "unignore" : "ignore", nodeId)}>
              <ha-icon icon="mdi:${isIgn ? "eye" : "eye-off"}" style="--mdc-icon-size: 16px;"></ha-icon> ${isIgn ? t("nodes.actions.unignore") : t("nodes.actions.ignore")}
            </button>
            <button class="action-btn danger" @click=${() => this._confirmRemove(nodeId)}>
              <ha-icon icon="mdi:delete" style="--mdc-icon-size: 16px;"></ha-icon> ${t("nodes.actions.remove")}
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
    if (confirm(t("nodes.actions.remove_confirm", { name: this._selectedNode?.name || nodeId }))) {
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
      focusNode: { type: Object },
      _waypointDialog: { type: Object },
      _addingWaypoint: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.nodes = {};
    this.waypoints = {};
    this.traceroutes = {};
    this.localNodeId = "";
    this.focusNode = null;
    this._focusedNodeSeq = null;
    this._nodeMarkers = {};
    this._leafletLoaded = false;
    this._leafletError = false;
    this._mapInstance = null;
    this._nodeLayer = null;
    this._waypointLayer = null;
    this._snrLineLayer = null;
    this._tracerouteLayer = null;
    this._showNodes = true;
    this._hideMqttNodes = lsGet("meshtastic_map_hide_mqtt") === "1";
    this._showWaypoints = true;
    this._showSnrLines = false;
    this._showTraceroutes = false;
    this._tracerouteDialogData = null;
    this._waypointDialog = null;
    this._userLocationMarker = null;
    this._userLocationCircle = null;
    this._tileLayer = null;
    // Tile style: "light" | "dark" | "satellite". Migrate legacy dark bool
    // (meshtastic_map_dark) to the new key on first load, else follow HA theme.
    const storedStyle = lsGet("meshtastic_map_style");
    if (storedStyle === "light" || storedStyle === "dark" || storedStyle === "satellite") {
      this._mapStyle = storedStyle;
    } else {
      const legacyDark = lsGet("meshtastic_map_dark");
      const dark = legacyDark != null ? legacyDark === "true" : this._detectDarkTheme();
      this._mapStyle = dark ? "dark" : "light";
    }
  }

  _detectDarkTheme() {
    const root = document.documentElement;
    // HA sets --primary-background-color; dark themes use dark values.
    const bg = getComputedStyle(root).getPropertyValue("--primary-background-color").trim();
    if (!bg) return window.matchMedia("(prefers-color-scheme: dark)").matches;
    // Parse to check luminance — rough check.
    const temp = document.createElement("div");
    temp.style.color = bg;
    document.body.appendChild(temp);
    const rgb = getComputedStyle(temp).color.match(/\d+/g);
    document.body.removeChild(temp);
    if (rgb) {
      const lum = (0.299 * +rgb[0] + 0.587 * +rgb[1] + 0.114 * +rgb[2]) / 255;
      return lum < 0.5;
    }
    return false;
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host { display: block; }
        .map-container {
          position: relative;
          height: calc(100vh - 165px);
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

        @media (max-width: 768px) {
          .map-controls {
            top: auto; bottom: 10px; left: 10px;
            max-width: calc(100% - 70px);
          }
          .map-info-badge {
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

        .wp-form { display: flex; flex-direction: column; gap: 12px; }
        .wp-coords {
          font-size: 13px; color: var(--secondary-text-color);
          padding: 8px 12px; border-radius: 8px;
          background: var(--secondary-background-color);
          font-family: monospace;
        }
        .wp-form label {
          font-size: 12px; font-weight: 600;
          color: var(--secondary-text-color);
        }
        .wp-form input {
          width: 100%; padding: 8px 12px; border-radius: 8px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px; box-sizing: border-box;
        }
        .wp-form input:focus {
          outline: none; border-color: var(--primary-color);
        }
        .wp-actions {
          display: flex; gap: 8px; justify-content: flex-end;
          margin-top: 4px;
        }
        .wp-actions button {
          padding: 8px 20px; border-radius: 8px; font-size: 14px;
          font-weight: 600; cursor: pointer; border: none;
        }
        .wp-actions .cancel {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }
        .wp-actions .submit {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .wp-actions .submit:disabled {
          opacity: 0.5; cursor: not-allowed;
        }

        .locate-btn {
          padding: 5px 10px; border-radius: 6px; font-size: 11px;
          font-weight: 600; cursor: pointer; border: 1px solid var(--divider-color);
          background: var(--card-background-color); color: var(--secondary-text-color);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.15s;
          display: flex; align-items: center; gap: 4px;
        }
        .locate-btn:hover { opacity: 0.85; }

        .wp-fab {
          position: absolute;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: var(--primary-color);
          color: var(--text-primary-color);
          font-size: 24px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .wp-fab:hover { transform: scale(1.1); }
        .wp-fab.active {
          background: var(--error-color, #f44336);
        }
        .map-container.adding-wp .map-element {
          cursor: crosshair;
        }
      `,
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this._leafletLoaded && !this._leafletError) {
      this._loadLeaflet();
    }
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._addingWaypoint) {
        this._addingWaypoint = false;
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyMap();
    if (this._onKeyDown) {
      window.removeEventListener("keydown", this._onKeyDown);
      this._onKeyDown = null;
    }
  }

  updated(changedProps) {
    if (!this._mapInstance) return;
    if (changedProps.has("localNodeId") && changedProps.get("localNodeId") !== undefined) {
      this._hasFittedBounds = false;
      const localNode = this.nodes?.[this.localNodeId];
      if (localNode && !isNaN(parseFloat(localNode.latitude)) && !isNaN(parseFloat(localNode.longitude))) {
        const lat = parseFloat(localNode.latitude);
        const lon = parseFloat(localNode.longitude);
        if (lat !== 0 || lon !== 0) {
          this._mapInstance.panTo([lat, lon]);
        }
      }
    }
    if (changedProps.has("nodes") || changedProps.has("localNodeId")) {
      this._updateNodeLayer();
      this._updateSnrLines();
    }
    if (changedProps.has("waypoints")) this._updateWaypointLayer();
    if (changedProps.has("traceroutes")) {
      this._updateTracerouteLayer();
      this._updateSnrLines();
    }
    if (changedProps.has("focusNode") && this.focusNode?.id && this._focusedNodeSeq !== this.focusNode.ts) {
      this._focusOnNode(this.focusNode.id);
    }
  }

  render() {
    if (this._leafletError) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:map-marker-off"></ha-icon>
          <div>${t("map.load_failed.title")}</div>
          <div style="font-size: 13px; margin-top: 8px;">${t("map.load_failed.hint")}</div>
        </div>
      `;
    }
    if (!this._leafletLoaded) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:map-clock"></ha-icon>
          <div>${t("map.loading")}</div>
        </div>
      `;
    }

    const nodesWithPosition = Object.values(this.nodes).filter((n) => {
      if (this._hideMqttNodes && n.via_mqtt) return false;
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
      <div class="map-container ${this._addingWaypoint ? "adding-wp" : ""}">
        <div id="mesh-map" class="map-element"></div>
        <div class="map-controls">
          <button class="layer-btn ${this._showNodes ? "active" : ""}"
            @click=${() => this._toggleLayer("nodes")}>${t("map.layers.nodes", { count: nodesWithPosition.length })}</button>
          <button class="layer-btn ${this._showWaypoints ? "active" : ""}"
            @click=${() => this._toggleLayer("waypoints")}>${t("map.layers.waypoints", { count: wpCount })}</button>
          <button class="layer-btn ${this._showSnrLines ? "active" : ""}"
            @click=${() => this._toggleLayer("snr")}>${snrCount > 0 ? t("map.layers.snr_lines_count", { count: snrCount }) : t("map.layers.snr_lines")}</button>
          <button class="layer-btn ${this._showTraceroutes ? "active" : ""}"
            @click=${() => this._toggleLayer("traceroutes")}>${routeCount > 0 ? t("map.layers.routes_count", { count: routeCount }) : t("map.layers.routes")}</button>
          <button class="layer-btn ${this._hideMqttNodes ? "active" : ""}"
            @click=${this._toggleHideMqtt}
            title=${t("map.layers.hide_mqtt_title")}>${t("map.layers.hide_mqtt")}</button>
          <button class="locate-btn" @click=${() => this._locateUser()} title=${t("map.locate_title")}>
            \u25CE ${t("map.locate")}
          </button>
          <button class="layer-btn ${this._mapStyle === "light" ? "active" : ""}"
            @click=${() => this._setMapStyle("light")} title=${t("map.style.light_title")}>
            \u2600 ${t("map.style.light")}
          </button>
          <button class="layer-btn ${this._mapStyle === "dark" ? "active" : ""}"
            @click=${() => this._setMapStyle("dark")} title=${t("map.style.dark_title")}>
            \u263D ${t("map.style.dark")}
          </button>
          <button class="layer-btn ${this._mapStyle === "satellite" ? "active" : ""}"
            @click=${() => this._setMapStyle("satellite")} title=${t("map.style.satellite_title")}>
            \u{1F30D} ${t("map.style.satellite")}
          </button>
        </div>
        ${nodesWithout > 0 ? html`
          <div class="map-info-badge">${t("map.nodes_without_position", { count: nodesWithout })}</div>
        ` : ""}
        <button class="wp-fab ${this._addingWaypoint ? "active" : ""}"
          @click=${this._toggleAddWaypoint}
          title="${this._addingWaypoint ? t("common.cancel") : t("map.waypoint.add")}">
          ${this._addingWaypoint ? "\u00D7" : "+"}
        </button>
      </div>
      ${this._tracerouteDialogData ? this._renderTracerouteDialog() : ""}
      ${this._waypointDialog ? this._renderWaypointDialog() : ""}
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
            <div class="title">${t("map.traceroute.title", { source: this._getNodeName(data.to), destination: this._getNodeName(data.from) })}</div>
            <button class="close" title=${t("common.close")} @click=${() => { this._tracerouteDialogData = null; this.requestUpdate(); }}>\u00D7</button>
          </div>
          <div class="traceroute-body">
            <div class="route-summary">${nLinks === 1 ? t("map.traceroute.direct") : t("map.traceroute.intermediate_hops", { count: nLinks - 1 })}</div>
            ${hops.map((hopId, i) => {
              const label = i === 0 ? t("map.traceroute.source") : i === hops.length - 1 ? t("map.traceroute.destination") : t("map.traceroute.hop", { index: i });
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
              <div style="margin-top:16px;font-size:12px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;">${t("map.traceroute.return_route")}</div>
              ${[data.from, ...(data.route_back || []), data.to].map((hopId, i) => {
                const rhops = [data.from, ...(data.route_back || []), data.to];
                const label = i === 0 ? t("map.traceroute.source") : i === rhops.length - 1 ? t("map.traceroute.destination") : t("map.traceroute.hop", { index: i });
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

  _renderWaypointDialog() {
    const { lat, lon } = this._waypointDialog;
    return html`
      <div class="traceroute-dialog" @click=${(e) => { if (e.target.classList.contains("traceroute-dialog")) { this._waypointDialog = null; } }}>
        <div class="traceroute-card">
          <div class="traceroute-header">
            <div class="title">${t("map.waypoint.create_title")}</div>
            <button class="close" title=${t("common.close")} @click=${() => { this._waypointDialog = null; }}>&times;</button>
          </div>
          <div class="traceroute-body">
            <div class="wp-form">
              <div class="wp-coords">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
              <div>
                <label>${t("map.waypoint.name_label")}</label>
                <input id="wp-name" type="text" placeholder=${t("map.waypoint.name_placeholder")} maxlength="30" />
              </div>
              <div>
                <label>${t("map.waypoint.description_label")}</label>
                <input id="wp-desc" type="text" placeholder=${t("map.waypoint.description_placeholder")} maxlength="100" />
              </div>
              <div>
                <label>${t("map.waypoint.expire_label")}</label>
                <input id="wp-expire" type="number" min="0" value="0" />
              </div>
              <div class="wp-actions">
                <button class="cancel" @click=${() => { this._waypointDialog = null; }}>${t("common.cancel")}</button>
                <button class="submit" @click=${() => this._submitWaypoint()}>${t("map.waypoint.broadcast")}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _submitWaypoint() {
    const nameEl = this.shadowRoot.querySelector("#wp-name");
    const descEl = this.shadowRoot.querySelector("#wp-desc");
    const expireEl = this.shadowRoot.querySelector("#wp-expire");
    const name = nameEl?.value?.trim();
    if (!name) { nameEl?.focus(); return; }
    const description = descEl?.value?.trim() || "";
    const hours = parseInt(expireEl?.value) || 0;
    const expire = hours > 0 ? Math.floor(Date.now() / 1000) + hours * 3600 : 0;
    const { lat, lon } = this._waypointDialog;
    this.dispatchEvent(new CustomEvent("waypoint-create", {
      detail: { latitude: lat, longitude: lon, name, description, expire },
      bubbles: true, composed: true,
    }));
    this._waypointDialog = null;
  }

  _createTileLayer(style) {
    if (style === "satellite") {
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxZoom: 19,
          noWrap: true,
        }
      );
    }
    // Esri's public basemap tiles: no account/key required and no
    // referer-allowlist gating, unlike CartoDB's anonymous basemap tier
    // (intermittently watermarks tiles "API key required") and plain
    // OpenStreetMap tile servers (block third-party app embedding outright
    // per osm.wiki/Blocked). Same tile domain already used for Satellite.
    const lightUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
    const darkUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
    return L.tileLayer(style === "dark" ? darkUrl : lightUrl, {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, HERE, and other contributors',
      maxZoom: 19,
      // The dark gray canvas service is only cached to level 16; let Leaflet
      // upscale those tiles instead of requesting levels that 404.
      maxNativeZoom: style === "dark" ? 16 : 19,
      noWrap: true,
    });
  }

  _setMapStyle(style) {
    if (style !== "light" && style !== "dark" && style !== "satellite") return;
    if (style === this._mapStyle) return;
    this._mapStyle = style;
    lsSet("meshtastic_map_style", style);
    if (this._mapInstance && this._tileLayer) {
      this._mapInstance.removeLayer(this._tileLayer);
      this._tileLayer = this._createTileLayer(this._mapStyle).addTo(this._mapInstance);
    }
    this.requestUpdate();
  }

  _locateUser() {
    if (!this._mapInstance) return;
    this._mapInstance.locate({ setView: true, maxZoom: 16 });
  }

  _toggleHideMqtt() {
    this._hideMqttNodes = !this._hideMqttNodes;
    lsSet("meshtastic_map_hide_mqtt", this._hideMqttNodes ? "1" : "0");
    this._updateNodeLayer();
    this._updateSnrLines();
    this.requestUpdate();
  }

  _toggleAddWaypoint() {
    this._addingWaypoint = !this._addingWaypoint;
  }

  _getNodeName(nodeId) {
    if (!nodeId) return t("common.unknown");
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
      linkEl.href = import.meta.url.replace(/\/[^/]+$/, "/vendor/leaflet/leaflet.css");
      this.shadowRoot.appendChild(linkEl);

      if (!window.L) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = import.meta.url.replace(/\/[^/]+$/, "/vendor/leaflet/leaflet.js");
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

    // Restore saved position/zoom or use defaults.
    const savedView = JSON.parse(lsGet("meshtastic_map_view") || "null");
    this._savedViewRestored = !!savedView;
    const initCenter = savedView ? [savedView.lat, savedView.lng] : [20, 0];
    const initZoom = savedView ? savedView.zoom : 3;

    const map = L.map(container, {
      minZoom: 3,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
    }).setView(initCenter, initZoom);

    this._tileLayer = this._createTileLayer(this._mapStyle).addTo(map);

    // Persist position and zoom on every move. A throwing listener here
    // (e.g. a full localStorage quota) would otherwise interrupt Leaflet's
    // own internal handling of the same "moveend" event.
    map.on("moveend", () => {
      const c = map.getCenter();
      lsSet("meshtastic_map_view", JSON.stringify({
        lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      }));
    });

    this._mapInstance = map;
    this._nodeLayer = L.layerGroup().addTo(map);
    this._waypointLayer = L.layerGroup().addTo(map);
    this._snrLineLayer = L.layerGroup();
    this._tracerouteLayer = L.layerGroup();

    // The map's container isn't always fully settled (HA's panel layout,
    // flex/grid reflow, tab-switch animation) at the instant Leaflet
    // measures it here. A stale size measurement doesn't show up until a
    // later zoom/pan, when it throws off marker scaling and tile-layer
    // redraws — force Leaflet to re-measure once the container has
    // actually stabilized, and again on any later resize.
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 250);
    if (typeof ResizeObserver !== "undefined") {
      this._mapResizeObserver = new ResizeObserver(() => map.invalidateSize());
      this._mapResizeObserver.observe(container);
    }

    map.on("click", (e) => {
      if (!this._addingWaypoint) return;
      this._addingWaypoint = false;
      this._waypointDialog = { lat: e.latlng.lat, lon: e.latlng.lng };
      this.requestUpdate();
    });

    map.on("locationfound", (e) => {
      const { lat, lng } = e.latlng;
      const radius = e.accuracy;
      if (this._userLocationMarker) {
        this._userLocationMarker.setLatLng([lat, lng]);
        this._userLocationCircle.setLatLng([lat, lng]).setRadius(radius);
      } else {
        this._userLocationMarker = L.circleMarker([lat, lng], {
          radius: 8, fillColor: "#4285f4", fillOpacity: 1,
          color: "#fff", weight: 3,
        }).addTo(map);
        this._userLocationCircle = L.circle([lat, lng], {
          radius, color: "#4285f4", fillColor: "#4285f4",
          fillOpacity: 0.15, weight: 1,
        }).addTo(map);
      }
    });

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
    this._nodeMarkers = {};
    const bounds = [];

    for (const [nodeId, node] of Object.entries(this.nodes)) {
      if (this._hideMqttNodes && node.via_mqtt) continue;
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
      this._nodeMarkers[nodeId] = marker;
      bounds.push([lat, lon]);
    }

    if (bounds.length > 0 && this._mapInstance && !this._hasFittedBounds) {
      this._hasFittedBounds = true;
      // Only auto-fit if user has no saved map position.
      if (!this._savedViewRestored) {
        this._mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }
    }

    // Re-apply a pending focus request now that markers exist again
    // (node data reloads/rebuilds this layer from scratch on every update).
    if (this.focusNode?.id && this._focusedNodeSeq !== this.focusNode.ts) {
      this._focusOnNode(this.focusNode.id);
    }
  }

  _focusOnNode(nodeId) {
    if (!this._mapInstance) return;
    const node = this.nodes[nodeId];
    if (!node) return;
    const lat = parseFloat(node.latitude);
    const lon = parseFloat(node.longitude);
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return;
    this._focusedNodeSeq = this.focusNode?.ts;
    this._mapInstance.flyTo([lat, lon], Math.max(this._mapInstance.getZoom(), 15));
    const marker = this._nodeMarkers[nodeId];
    if (marker) marker.openTooltip();
  }

  _updateWaypointLayer() {
    if (!this._waypointLayer) return;
    this._waypointLayer.clearLayers();

    for (const [wpId, wp] of Object.entries(this.waypoints || {})) {
      const lat = parseFloat(wp.latitude);
      const lon = parseFloat(wp.longitude);
      if (isNaN(lat) || isNaN(lon)) continue;

      const name = wp.name || t("map.waypoint.fallback_name", { id: wpId });

      // Build popup with DOM APIs to prevent XSS from waypoint data
      const popupDiv = document.createElement("div");
      popupDiv.style.minWidth = "140px";
      const strong = document.createElement("strong");
      strong.textContent = name;
      popupDiv.appendChild(strong);
      if (wp.description) {
        const desc = document.createElement("div");
        desc.style.cssText = "font-size:12px;margin-top:4px;";
        desc.textContent = wp.description;
        popupDiv.appendChild(desc);
      }
      if (wp.from) {
        const from = document.createElement("div");
        from.style.cssText = "font-size:11px;color:#888;margin-top:4px;";
        from.textContent = t("map.waypoint.from", { from: wp.from });
        popupDiv.appendChild(from);
      }

      // Diamond-shaped marker for waypoints
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: "#2196f3",
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });
      marker.bindPopup(popupDiv);
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
      if (this._hideMqttNodes && node.via_mqtt) continue;
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
        line.bindTooltip(t("map.snr_tooltip", { name, snr: node.snr }), { sticky: true });
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
        t("map.route_tooltip", { name: this._getNodeName(destId), count: allHops.length - 2 }),
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
    if (this._mapResizeObserver) {
      this._mapResizeObserver.disconnect();
      this._mapResizeObserver = null;
    }
    if (this._mapInstance) {
      this._mapInstance.remove();
      this._mapInstance = null;
      this._nodeLayer = null;
      this._waypointLayer = null;
      this._snrLineLayer = null;
      this._tracerouteLayer = null;
      this._userLocationMarker = null;
      this._userLocationCircle = null;
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
    script.src = import.meta.url.replace(/\/[^/]+$/, "/vendor/d3/d3.min.js");
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
    if (secsAgo === 0) timeLabel = t("views.chart.now");
    else if (secsAgo < 120) timeLabel = t("views.chart.seconds_ago", { seconds: secsAgo });
    else if (secsAgo < 7200) timeLabel = t("views.chart.minutes_ago", { minutes: Math.round(secsAgo / 60) });
    else if (secsAgo < 172800) timeLabel = t("views.chart.hours_ago", { hours: (secsAgo / 3600).toFixed(1) });
    else timeLabel = t("views.chart.days_ago", { days: (secsAgo / 86400).toFixed(1) });
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
    for (let tick = 1; tick <= yTicks; tick++) {
      const val = (max / yTicks) * tick;
      const y = h - (val / max) * h;
      ctx.fillStyle = "rgba(128,128,128,0.25)";
      ctx.fillRect(0, y, w, 1);
      if (tick < yTicks) {
        ctx.fillStyle = "rgba(128,128,128,0.7)";
        ctx.fillText(`${Math.round(val)}`, 3, y - 2);
      }
    }

    // X-axis: adaptive gridlines (aim for ~6 lines)
    ctx.textAlign = "center";
    const bucketSec = this.bucketInterval;
    const totalVisibleSec = visible * bucketSec;
    const gridSteps = [300, 600, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
    const idealStep = totalVisibleSec / 6;
    const gridStep = gridSteps.find((s) => s >= idealStep) || gridSteps[gridSteps.length - 1];
    for (let s = gridStep; s < totalVisibleSec; s += gridStep) {
      const idx = visible - s / bucketSec;
      if (idx < 0) break;
      const x = idx * colW;
      // Pick the unit from the grid step (not the offset) so labels stay
      // integer multiples — an 8h step reads -8h/-16h/-24h/-32h instead
      // of -8h/-16h/-1d/-1.3333333333333333d when it crosses a day.
      let label;
      if (gridStep >= 86400) label = t("views.chart.axis_days", { days: s / 86400 });
      else if (gridStep >= 3600) label = t("views.chart.axis_hours", { hours: s / 3600 });
      else label = t("views.chart.axis_minutes", { minutes: s / 60 });
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
            : html`<div class="loading">${t("views.chart.loading")}</div>`}
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
// Translation keys, resolved when the treemap is drawn.
const PACKET_TYPE_LABEL_KEYS = {
  text: "views.packet_types.text",
  position: "views.packet_types.position",
  telemetry: "views.packet_types.telemetry",
  nodeinfo: "views.packet_types.nodeinfo",
  routing: "views.packet_types.routing",
  other: "views.packet_types.other_type",
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
        children.push({ key, total, label: PACKET_TYPE_LABEL_KEYS[key] ? t(PACKET_TYPE_LABEL_KEYS[key]) : key, color: PACKET_TYPE_COLORS[key] || "#888" });
      }
    }

    // Clear previous
    while (container.firstChild) container.removeChild(container.firstChild);

    if (children.length === 0) {
      container.style.height = `${h}px`;
      const empty = document.createElement("div");
      empty.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;color:var(--secondary-text-color);font-size:13px;";
      empty.textContent = t("views.chart.no_packets");
      container.appendChild(empty);
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
        const labelEl = document.createElement("strong");
        labelEl.textContent = d.label;
        el.appendChild(labelEl);
        if (lh > 40) {
          const spanEl = document.createElement("span");
          spanEl.style.cssText = `font-size:${lw < 60 ? 8 : 10}px;opacity:0.9`;
          spanEl.textContent = `${d.total} (${pct}%)`;
          el.appendChild(spanEl);
        }
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

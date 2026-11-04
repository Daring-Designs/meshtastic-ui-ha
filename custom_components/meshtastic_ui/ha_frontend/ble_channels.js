import { LitElement, html, css, svg } from "./vendor/lit/lit-element.js";
import { settingsStyles, formStyles } from "./styles.js";
import { t } from "./i18n.js";

/* ══════════════════════════════════════════════════════════
   <mesh-settings-ble-channels>  —  Keep the HA host's Bluetooth
   links off 2.4 GHz channels that Wi-Fi, Zigbee or Thread use.
   ══════════════════════════════════════════════════════════ */

const BAND_LOW = 2400;
const BAND_HIGH = 2484;
const CHART_W = 840;
const CHART_LEFT = 20;
const CHART_RIGHT = 820;
const PLOT_TOP = 34;
const PLOT_BOTTOM = 150;
const BLE_ROW_Y = 166;
const BLE_ROW_H = 18;
const CHART_H = 214;
const MIN_CHANNELS = 2;
const RECOMMENDED_CHANNELS = 8;
const REFRESH_MS = 15000;

const x = (mhz) => CHART_LEFT + ((mhz - BAND_LOW) / (BAND_HIGH - BAND_LOW)) * (CHART_RIGHT - CHART_LEFT);
const wifiFreq = (ch) => (ch === 14 ? 2484 : 2407 + 5 * ch);
// Material Design "bluetooth" icon, 24x24.
const BT_ICON = "M14.88,16.29L13,18.17V14.41M13,5.83L14.88,7.71L13,9.58M17.71,7.71L12,2H11V9.58L6.41,5L5,6.41L10.59,12L5,17.58L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z";
const linkLabel = (link) => (link.name ? `${link.name} (${link.address})` : link.address);
const ssidHue = (name) => [...(name || "?")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

class MeshSettingsBleChannels extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      wsCommand: { type: Object },
      _state: { state: true },
      _draft: { state: true },
      _busy: { state: true },
      _feedback: { state: true },
      _feedbackError: { state: true },
      _newWifi: { state: true },
    };
  }

  constructor() {
    super();
    this._state = null;
    this._draft = null;
    this._busy = "";
    this._feedback = "";
    this._feedbackError = false;
    this._newWifi = { ssid: "", channel: 1, width: 20 };
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
    this._timer = setInterval(() => { if (!this._busy) this._load(); }, REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  /* Save and Scan call HA directly so the backend's error text reaches the user. */
  async _call(type, data = {}) {
    if (this.hass) return this.hass.callWS({ type, ...data });
    const res = await this.wsCommand?.(type, data);
    if (res == null) throw new Error(t("settings.ble_channels.request_failed"));
    return res;
  }

  async _load() {
    try {
      this._state = await this._call("meshtastic_ui/get_ble_channels");
      if (this._state.mode !== "manual" || this._draft == null) {
        this._draft = new Set(this._state.manual_channels);
      }
    } catch (err) {
      this._showFeedback(err.message || String(err), true);
    }
  }

  _showFeedback(text, isError = false) {
    this._feedback = text;
    this._feedbackError = isError;
    clearTimeout(this._feedbackTimer);
    if (!isError) this._feedbackTimer = setTimeout(() => { this._feedback = ""; }, 4000);
  }

  async _save(changes, okKey = "settings.ble_channels.saved") {
    this._busy = "save";
    try {
      this._state = await this._call("meshtastic_ui/set_ble_channels", changes);
      this._draft = new Set(this._state.manual_channels);
      this._showFeedback(this._state.last_error
        ? t("settings.ble_channels.apply_failed", { error: this._state.last_error })
        : t(okKey), Boolean(this._state.last_error));
    } catch (err) {
      this._showFeedback(err.message || String(err), true);
    }
    this._busy = "";
  }

  async _scan() {
    this._busy = "scan";
    this._showFeedback(t("settings.ble_channels.wifi.scanning"));
    try {
      this._state = await this._call("meshtastic_ui/scan_wifi");
      const count = this._state.wifi_scan?.networks?.length ?? 0;
      this._showFeedback(t("settings.ble_channels.wifi.scan_done", { count }));
    } catch (err) {
      this._showFeedback(t("settings.ble_channels.wifi.scan_failed", { error: err.message || String(err) }), true);
    }
    this._busy = "";
  }

  _setMode(mode) {
    if (mode === this._state.mode) return;
    if (mode === "manual") {
      // Start manual mode from what is in force now, not from all channels.
      const start = this._state.applied ?? this._state.auto_channels;
      this._save({ mode, manual_channels: start });
    } else {
      this._save({ mode });
    }
  }

  _toggleChannel(ch) {
    if (this._state?.mode !== "manual") return;
    const next = new Set(this._draft);
    if (next.has(ch)) next.delete(ch); else next.add(ch);
    this._draft = next;
  }

  _draftChanged() {
    const saved = this._state?.manual_channels ?? [];
    return this._draft && (this._draft.size !== saved.length || saved.some((ch) => !this._draft.has(ch)));
  }

  _addWifi() {
    const ssid = this._newWifi.ssid.trim();
    if (!ssid) return;
    const list = [...this._state.wifi_manual, { ssid, channel: Number(this._newWifi.channel), width: Number(this._newWifi.width) }];
    this._newWifi = { ssid: "", channel: this._newWifi.channel, width: 20 };
    this._save({ wifi_manual: list });
  }

  _removeWifi(index) {
    this._save({ wifi_manual: this._state.wifi_manual.filter((_, i) => i !== index) });
  }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      css`
        :host { display: block; }
        .chart { width: 100%; height: auto; display: block; user-select: none; }
        .chart text { font-size: 10px; fill: var(--secondary-text-color); }
        .chart .label { font-size: 10px; fill: var(--primary-text-color); }
        .chart .axis { stroke: var(--divider-color); stroke-width: 1; }
        .chart .ble { cursor: default; }
        .chart.manual .ble.data { cursor: pointer; }
        .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--secondary-text-color); margin: 8px 0 4px; }
        .legend-icon { width: 14px; height: 14px; margin-right: 4px; vertical-align: -3px; }
        .chart .in-use { cursor: help; }
        .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
        .modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
        .mode { border: 1px solid var(--divider-color); border-radius: 8px; padding: 10px 12px; cursor: pointer; background: none; text-align: left; color: inherit; font: inherit; }
        .mode.active { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); }
        .mode strong { display: block; font-size: 14px; margin-bottom: 2px; }
        .mode span { font-size: 12px; color: var(--secondary-text-color); }
        .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
        .status { font-size: 13px; line-height: 1.6; }
        .status code { font-size: 12px; }
        .warn { color: var(--warning-color, #ff9800); }
        .err { color: var(--error-color, #f44336); }
        .ok { color: var(--success-color, #4caf50); }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--divider-color); }
        th { font-weight: 500; color: var(--secondary-text-color); font-size: 12px; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .bar { display: inline-block; height: 6px; border-radius: 3px; background: var(--primary-color); vertical-align: middle; margin-left: 6px; }
        .muted { color: var(--secondary-text-color); font-size: 12px; }
        h4 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
        button.action { border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
        button.action.primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
        button.action:disabled { opacity: 0.5; cursor: default; }
        button.link { background: none; border: none; color: var(--error-color, #f44336); cursor: pointer; font: inherit; font-size: 12px; }
        input, select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); }
        .feedback { margin-top: 12px; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
        .feedback.success { background: rgba(76,175,80,0.1); color: var(--success-color, #4caf50); }
        .feedback.error { background: rgba(244,67,54,0.1); color: var(--error-color, #f44336); }
      `,
    ];
  }

  render() {
    const s = this._state;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("settings.ble_channels.title")}</h3>
          <p>${t("settings.ble_channels.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          ${s ? this._renderBody(s) : html`<div class="muted">${t("settings.ble_channels.loading")}</div>`}
          ${this._feedback ? html`<div class="feedback ${this._feedbackError ? "error" : "success"}">${this._feedback}</div>` : ""}
        </div>
      </div>
    `;
  }

  _renderBody(s) {
    return html`
      <div class="settings-section">
        ${this._renderChart(s)}
        ${this._renderLegend()}
      </div>
      <div class="settings-section">
        <h4>${t("settings.ble_channels.mode.title")}</h4>
        <div class="modes">
          ${["auto", "manual", "off"].map((mode) => html`
            <button class="mode ${s.mode === mode ? "active" : ""}" ?disabled=${!!this._busy} @click=${() => this._setMode(mode)}>
              <strong>${t(`settings.ble_channels.mode.${mode}`)}</strong>
              <span>${t(`settings.ble_channels.mode.${mode}_desc`)}</span>
            </button>
          `)}
        </div>
        ${s.mode === "manual" ? this._renderManualControls(s) : ""}
        ${s.adapters.length > 1 ? html`
          <div class="row">
            <span class="muted">${t("settings.ble_channels.adapter")}</span>
            <select @change=${(e) => this._save({ adapter: e.target.value })}>
              ${s.adapters.map((a) => html`<option value=${a} ?selected=${a === s.adapter}>${a}</option>`)}
            </select>
          </div>
        ` : ""}
      </div>
      <div class="settings-section">${this._renderStatus(s)}</div>
      <div class="settings-section">${this._renderWifi(s)}</div>
      ${this._renderOtherNeighbours(s)}
    `;
  }

  _allowedSet(s) {
    if (s.mode === "manual") return this._draft ?? new Set(s.manual_channels);
    if (s.mode === "auto") return new Set(s.auto_channels);
    return new Set(s.channels.map((c) => c.index));
  }

  _renderChart(s) {
    const allowed = this._allowedSet(s);
    // Which connected Bluetooth devices hop on each channel.
    const usedBy = new Map();
    for (const link of s.links) {
      for (const ch of link.channels) usedBy.set(ch, [...(usedBy.get(ch) || []), linkLabel(link)]);
    }
    const wifi = s.occupants.filter((o) => o.kind === "wifi");
    const ieee = s.occupants.filter((o) => o.kind !== "wifi");
    const plotH = PLOT_BOTTOM - PLOT_TOP;
    const maxScore = Math.max(1, ...s.channels.map((c) => c.score));

    // Label each busy Wi-Fi channel once, with its network count.
    const byChannel = new Map();
    for (const o of wifi) {
      const entry = byChannel.get(o.channel) || { count: 0, strongest: o };
      entry.count += 1;
      if ((o.strength ?? 60) > (entry.strongest.strength ?? 60)) entry.strongest = o;
      byChannel.set(o.channel, entry);
    }

    return html`
      <svg class="chart ${s.mode === "manual" ? "manual" : ""}" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img"
        aria-label=${t("settings.ble_channels.chart_label")}>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((ch) => svg`
          <text x=${x(wifiFreq(ch))} y="12" text-anchor="middle">${ch}</text>
          <line class="axis" x1=${x(wifiFreq(ch))} x2=${x(wifiFreq(ch))} y1="16" y2="22"></line>
        `)}
        <text x=${CHART_LEFT} y="28">${t("settings.ble_channels.wifi_channel_axis")}</text>
        <line class="axis" x1=${CHART_LEFT} x2=${CHART_RIGHT} y1=${PLOT_BOTTOM} y2=${PLOT_BOTTOM}></line>

        ${wifi.map((o) => {
          const h = plotH * (o.strength != null ? Math.max(0.15, o.strength / 100) : 0.6);
          const x0 = x(o.center - o.width / 2), x1 = x(o.center + o.width / 2), hue = ssidHue(o.label);
          const curve = (x1 - x0) * 0.18;
          return svg`<path d="M${x0},${PLOT_BOTTOM} C${x0 + curve},${PLOT_BOTTOM - h} ${x1 - curve},${PLOT_BOTTOM - h} ${x1},${PLOT_BOTTOM} Z"
            fill="hsla(${hue},70%,55%,0.22)" stroke="hsl(${hue},70%,50%)" stroke-width="1"
            stroke-dasharray=${o.source === "manual" ? "4 3" : "none"}><title>${o.label} · ${t("settings.ble_channels.wifi.channel_n", { channel: o.channel })}${o.strength != null ? ` · ${o.strength}%` : ""}</title></path>`;
        })}
        ${[...byChannel.entries()].map(([ch, e]) => {
          const h = plotH * (e.strongest.strength != null ? Math.max(0.15, e.strongest.strength / 100) : 0.6);
          return svg`<text class="label" x=${x(wifiFreq(ch))} y=${Math.max(PLOT_TOP + 8, PLOT_BOTTOM - h * 0.8 - 4)} text-anchor="middle">${e.count > 1 ? `${e.strongest.label} +${e.count - 1}` : e.strongest.label}</text>`;
        })}

        ${ieee.map((o) => svg`
          <rect x=${x(o.center - o.width / 2)} y=${PLOT_TOP + 10} width=${Math.max(2, x(o.center + o.width / 2) - x(o.center - o.width / 2))} height=${plotH - 10}
            fill=${o.kind === "thread" ? "rgba(156,39,176,0.55)" : "rgba(255,152,0,0.6)"}><title>${o.label}</title></rect>
          <text class="label" x=${x(o.center)} y=${PLOT_TOP + 6} text-anchor="middle">${o.kind === "thread" ? "Thread" : "Zigbee"} ${o.channel}</text>
        `)}

        ${s.channels.map((c) => {
          const on = allowed.has(c.index);
          const busyH = (c.score / maxScore) * 10;
          return svg`
            <rect x=${x(c.freq - 1)} y=${BLE_ROW_Y - 2 - busyH} width=${x(c.freq + 1) - x(c.freq - 1)} height=${busyH} fill="var(--error-color, #f44336)" opacity="0.6"></rect>
            <rect class="ble data" x=${x(c.freq - 0.9)} y=${BLE_ROW_Y} width=${x(c.freq + 0.9) - x(c.freq - 0.9)} height=${BLE_ROW_H} rx="2"
              fill=${on ? "var(--primary-color)" : "var(--disabled-text-color, #9e9e9e)"} opacity=${on ? 1 : 0.35}
              @click=${() => this._toggleChannel(c.index)}>
              <title>${t("settings.ble_channels.ble_channel", { channel: c.index, freq: c.freq })} · ${on ? t("settings.ble_channels.allowed") : t("settings.ble_channels.blocked")}</title>
            </rect>
            ${usedBy.has(c.index) ? svg`
              <g class="in-use" transform="translate(${x(c.freq) - 5}, ${BLE_ROW_Y + BLE_ROW_H + 1}) scale(0.42)">
                <title>${t("settings.ble_channels.in_use_by", { channel: c.index, freq: c.freq, devices: usedBy.get(c.index).join(", ") })}</title>
                <rect width="24" height="24" fill="transparent"></rect>
                <path d=${BT_ICON} fill="var(--info-color, #039be5)"></path>
              </g>` : ""}
          `;
        })}
        ${s.advertising.map((a) => svg`
          <rect class="ble" x=${x(a.freq - 0.9)} y=${BLE_ROW_Y} width=${x(a.freq + 0.9) - x(a.freq - 0.9)} height=${BLE_ROW_H} rx="2"
            fill="none" stroke="var(--primary-text-color)" stroke-width="1.2">
            <title>${t("settings.ble_channels.adv_channel", { channel: a.index, freq: a.freq })}</title>
          </rect>
        `)}
        ${[0, 10, 11, 20, 30, 36].map((ch) => {
          const c = s.channels[ch];
          return svg`<text x=${x(c.freq)} y=${BLE_ROW_Y + BLE_ROW_H + 18} text-anchor="middle">${ch}</text>`;
        })}
        ${[2400, 2420, 2440, 2460, 2480].map((f) => svg`<text x=${x(f)} y=${CHART_H - 2} text-anchor="middle">${f}</text>`)}
      </svg>
    `;
  }

  _renderLegend() {
    return html`
      <div class="legend">
        <span><span class="swatch" style="background:var(--primary-color)"></span>${t("settings.ble_channels.legend.allowed")}</span>
        <span><span class="swatch" style="background:var(--disabled-text-color,#9e9e9e);opacity:.35"></span>${t("settings.ble_channels.legend.blocked")}</span>
        <span><span class="swatch" style="border:1.2px solid var(--primary-text-color)"></span>${t("settings.ble_channels.legend.advertising")}</span>
        <span><span class="swatch" style="background:var(--error-color,#f44336);opacity:.6"></span>${t("settings.ble_channels.legend.busy")}</span>
        <span><svg class="legend-icon" viewBox="0 0 24 24"><path d=${BT_ICON} fill="var(--info-color, #039be5)"></path></svg>${t("settings.ble_channels.legend.in_use")}</span>
      </div>
      <div class="muted">${t("settings.ble_channels.chart_note")}</div>
    `;
  }

  _renderManualControls(s) {
    const n = this._draft?.size ?? 0;
    return html`
      <div class="row">
        <span class=${n < MIN_CHANNELS ? "err" : n < RECOMMENDED_CHANNELS ? "warn" : "muted"}>
          ${n < MIN_CHANNELS ? t("settings.ble_channels.too_few", { min: MIN_CHANNELS })
            : n < RECOMMENDED_CHANNELS ? t("settings.ble_channels.few", { count: n, recommended: RECOMMENDED_CHANNELS })
            : t("settings.ble_channels.manual_hint", { count: n })}
        </span>
      </div>
      <div class="row">
        <button class="action primary" ?disabled=${!this._draftChanged() || n < MIN_CHANNELS || !!this._busy}
          @click=${() => this._save({ manual_channels: [...this._draft].sort((a, b) => a - b) })}>${t("settings.ble_channels.apply")}</button>
        <button class="action" ?disabled=${!!this._busy} @click=${() => { this._draft = new Set(s.auto_channels); }}>${t("settings.ble_channels.use_auto")}</button>
        <button class="action" ?disabled=${!!this._busy} @click=${() => { this._draft = new Set(s.channels.map((c) => c.index)); }}>${t("settings.ble_channels.allow_all")}</button>
        ${this._draftChanged() ? html`<button class="action" @click=${() => { this._draft = new Set(s.manual_channels); }}>${t("common.cancel")}</button>` : ""}
      </div>
    `;
  }

  _renderStatus(s) {
    const applied = s.applied;
    const when = s.last_applied_at ? new Date(s.last_applied_at * 1000).toLocaleTimeString() : null;
    return html`
      <h4>${t("settings.ble_channels.status.title")}</h4>
      <div class="status">
        ${s.mode === "off" && !applied
          ? html`<div class="muted">${t("settings.ble_channels.status.off")}</div>`
          : applied
            ? html`<div class="ok">${t("settings.ble_channels.status.applied", { count: applied.length, adapter: s.adapter, time: when })}</div>`
            : ""}
        ${s.last_error ? html`<div class="err">${t("settings.ble_channels.apply_failed", { error: s.last_error })}</div>` : ""}
        ${s.links.length
          ? s.links.map((l) => html`<div>${t("settings.ble_channels.status.link", { device: linkLabel(l), count: l.channels.length })}
              <code>${l.channels.join(", ")}</code></div>`)
          : html`<div class="muted">${t("settings.ble_channels.status.no_links")}</div>`}
      </div>
    `;
  }

  _renderWifi(s) {
    const scan = s.wifi_scan;
    const networks = [...(scan?.networks ?? [])].sort((a, b) => b.strength - a.strength);
    const when = scan?.time ? new Date(scan.time * 1000).toLocaleString() : null;
    return html`
      <h4>${t("settings.ble_channels.wifi.title")}</h4>
      <div class="muted">${t("settings.ble_channels.wifi.subtitle")}</div>
      <div class="row">
        <button class="action primary" ?disabled=${!!this._busy} @click=${this._scan}>
          ${this._busy === "scan" ? t("settings.ble_channels.wifi.scanning") : t("settings.ble_channels.wifi.scan")}
        </button>
        <span class="muted">${when ? t("settings.ble_channels.wifi.last_scan", { time: when, count: networks.length }) : t("settings.ble_channels.wifi.never")}</span>
      </div>
      ${networks.length ? html`
        <table>
          <thead><tr>
            <th>${t("settings.ble_channels.wifi.network")}</th>
            <th class="num">${t("settings.ble_channels.wifi.channel")}</th>
            <th class="num">${t("settings.ble_channels.wifi.width")}</th>
            <th>${t("settings.ble_channels.wifi.signal")}</th>
          </tr></thead>
          <tbody>
            ${networks.map((n) => html`<tr>
              <td>${n.ssid || html`<span class="muted">${n.bssid}</span>`}</td>
              <td class="num">${n.channel}</td>
              <td class="num">${n.width} MHz</td>
              <td>${n.strength}%<span class="bar" style="width:${Math.round(n.strength * 0.6)}px"></span></td>
            </tr>`)}
          </tbody>
        </table>
      ` : ""}

      <h4 style="margin-top:16px">${t("settings.ble_channels.wifi.manual_title")}</h4>
      <div class="muted">${t("settings.ble_channels.wifi.manual_subtitle")}</div>
      ${s.wifi_manual.length ? html`
        <table>
          <tbody>
            ${s.wifi_manual.map((n, i) => html`<tr>
              <td>${n.ssid}</td>
              <td class="num">${t("settings.ble_channels.wifi.channel_n", { channel: n.channel })}</td>
              <td class="num">${n.width} MHz</td>
              <td class="num"><button class="link" ?disabled=${!!this._busy} @click=${() => this._removeWifi(i)}>${t("settings.ble_channels.wifi.remove")}</button></td>
            </tr>`)}
          </tbody>
        </table>
      ` : ""}
      <div class="row">
        <input type="text" maxlength="64" placeholder=${t("settings.ble_channels.wifi.name_placeholder")} .value=${this._newWifi.ssid}
          @input=${(e) => { this._newWifi = { ...this._newWifi, ssid: e.target.value }; }}
          @keydown=${(e) => { if (e.key === "Enter") this._addWifi(); }} />
        <select @change=${(e) => { this._newWifi = { ...this._newWifi, channel: Number(e.target.value) }; }}>
          ${Array.from({ length: 14 }, (_, i) => i + 1).map((ch) => html`<option value=${ch} ?selected=${ch === this._newWifi.channel}>${t("settings.ble_channels.wifi.channel_n", { channel: ch })}</option>`)}
        </select>
        <select @change=${(e) => { this._newWifi = { ...this._newWifi, width: Number(e.target.value) }; }}>
          ${[20, 40].map((w) => html`<option value=${w} ?selected=${w === this._newWifi.width}>${w} MHz</option>`)}
        </select>
        <button class="action" ?disabled=${!this._newWifi.ssid.trim() || !!this._busy} @click=${this._addWifi}>${t("settings.ble_channels.wifi.add")}</button>
      </div>
    `;
  }

  _renderOtherNeighbours(s) {
    const others = s.occupants.filter((o) => o.kind !== "wifi");
    return html`
      <div class="settings-section">
        <h4>${t("settings.ble_channels.others.title")}</h4>
        ${others.length
          ? others.map((o) => html`<div class="status">${t(`settings.ble_channels.others.${o.kind}`, { channel: o.channel, source: o.source })}</div>`)
          : html`<div class="muted">${t("settings.ble_channels.others.none")}</div>`}
      </div>
    `;
  }
}

customElements.define("mesh-settings-ble-channels", MeshSettingsBleChannels);

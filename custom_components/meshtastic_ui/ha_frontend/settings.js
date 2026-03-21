import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";
import "./components.js";
import "./modules.js";
import {
  settingsStyles,
  formStyles,
  dialogStyles,
  channelStyles,
  deviceActionStyles,
  saveBarStyles,
  emptyStateStyles,
  badgeStyles,
} from "./styles.js";

/* ── LoRa modem presets & region enum maps ── */
const MODEM_PRESETS = [
  { value: "LONG_FAST", label: "Long Range / Fast" },
  { value: "LONG_SLOW", label: "Long Range / Slow" },
  { value: "LONG_MODERATE", label: "Long Range / Moderate" },
  { value: "SHORT_FAST", label: "Short Range / Fast" },
  { value: "SHORT_SLOW", label: "Short Range / Slow" },
  { value: "MEDIUM_FAST", label: "Medium Range / Fast" },
  { value: "MEDIUM_SLOW", label: "Medium Range / Slow" },
];

const REGIONS = [
  { value: "UNSET", label: "Unset" },
  { value: "US", label: "US" },
  { value: "EU_433", label: "EU 433" },
  { value: "EU_868", label: "EU 868" },
  { value: "CN", label: "CN" },
  { value: "JP", label: "JP" },
  { value: "ANZ", label: "ANZ" },
  { value: "KR", label: "KR" },
  { value: "TW", label: "TW" },
  { value: "RU", label: "RU" },
  { value: "IN", label: "IN" },
  { value: "NZ_865", label: "NZ 865" },
  { value: "TH", label: "TH" },
  { value: "UA_433", label: "UA 433" },
  { value: "UA_868", label: "UA 868" },
  { value: "MY_433", label: "MY 433" },
  { value: "MY_919", label: "MY 919" },
  { value: "SG_923", label: "SG 923" },
  { value: "LORA_24", label: "2.4 GHz" },
];

const CHANNEL_ROLES = [
  { value: "DISABLED", label: "Disabled" },
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
];

/* ── Device role enum ── */
const DEVICE_ROLES = [
  { value: "CLIENT", label: "Client" },
  { value: "CLIENT_MUTE", label: "Client Mute" },
  { value: "ROUTER", label: "Router" },
  { value: "ROUTER_CLIENT", label: "Router Client" },
  { value: "REPEATER", label: "Repeater" },
  { value: "TRACKER", label: "Tracker" },
  { value: "SENSOR", label: "Sensor" },
  { value: "TAK", label: "TAK" },
  { value: "TAK_TRACKER", label: "TAK Tracker" },
  { value: "CLIENT_HIDDEN", label: "Client Hidden" },
  { value: "LOST_AND_FOUND", label: "Lost and Found" },
];

const REBROADCAST_MODES = [
  { value: "ALL", label: "All" },
  { value: "ALL_SKIP_DECODING", label: "All (Skip Decoding)" },
  { value: "LOCAL_ONLY", label: "Local Only" },
  { value: "KNOWN_ONLY", label: "Known Only" },
  { value: "NONE", label: "None" },
];

/* ── Position / GPS enums ── */
const GPS_MODES = [
  { value: "DISABLED", label: "Disabled" },
  { value: "ENABLED", label: "Enabled" },
  { value: "NOT_PRESENT", label: "Not Present" },
];

/* ── Display enums ── */
const DISPLAY_MODES = [
  { value: "DEFAULT", label: "Default" },
  { value: "TWOCOLOR", label: "Two Color" },
  { value: "INVERTED", label: "Inverted" },
  { value: "COLOR", label: "Color" },
];

const DISPLAY_UNITS = [
  { value: "METRIC", label: "Metric" },
  { value: "IMPERIAL", label: "Imperial" },
];

const OLED_TYPES = [
  { value: "OLED_AUTO", label: "Auto Detect" },
  { value: "OLED_SSD1306", label: "SSD1306" },
  { value: "OLED_SH1106", label: "SH1106" },
  { value: "OLED_SH1107", label: "SH1107" },
];

/* ── Bluetooth enums ── */
const BT_PAIRING_MODES = [
  { value: "RANDOM_PIN", label: "Random PIN" },
  { value: "FIXED_PIN", label: "Fixed PIN" },
  { value: "NO_PIN", label: "No PIN" },
];

/* ── Navigation items ── */
const NAV_ITEMS = [
  {
    group: "Radio Config",
    items: [
      { id: "lora", label: "LoRa", icon: "mdi:antenna" },
      { id: "channels", label: "Channels", icon: "mdi:forum" },
      { id: "user", label: "User", icon: "mdi:account" },
    ],
  },
  {
    group: "Device Config",
    items: [
      { id: "device", label: "Device", icon: "mdi:cellphone-cog" },
      { id: "position", label: "Position", icon: "mdi:crosshairs-gps" },
      { id: "power", label: "Power", icon: "mdi:battery-charging" },
      { id: "network", label: "Network", icon: "mdi:wifi" },
      { id: "display", label: "Display", icon: "mdi:monitor" },
      { id: "bluetooth", label: "Bluetooth", icon: "mdi:bluetooth" },
      { id: "security", label: "Security", icon: "mdi:shield-lock" },
    ],
  },
  {
    group: "Module Config",
    items: [
      { id: "mqtt", label: "MQTT", icon: "mdi:transit-connection-variant" },
      { id: "serial", label: "Serial", icon: "mdi:serial-port" },
      { id: "ext_notification", label: "Ext. Notification", icon: "mdi:bell-ring" },
      { id: "store_forward", label: "Store & Forward", icon: "mdi:database-arrow-right" },
      { id: "range_test", label: "Range Test", icon: "mdi:signal-distance-variant" },
      { id: "telemetry", label: "Telemetry", icon: "mdi:chart-line" },
      { id: "canned_message", label: "Canned Messages", icon: "mdi:message-reply-text" },
      { id: "audio", label: "Audio", icon: "mdi:microphone" },
      { id: "neighbor_info", label: "Neighbor Info", icon: "mdi:account-group" },
      { id: "ambient_lighting", label: "Ambient Lighting", icon: "mdi:led-on" },
      { id: "detection_sensor", label: "Detection Sensor", icon: "mdi:motion-sensor" },
      { id: "paxcounter", label: "Paxcounter", icon: "mdi:counter" },
    ],
  },
  {
    group: "Device",
    items: [
      { id: "actions", label: "Device Actions", icon: "mdi:cog" },
    ],
  },
];

/* ══════════════════════════════════════════════════════════
   <mesh-settings-tab>  —  Container with sidebar navigation
   ══════════════════════════════════════════════════════════ */

export class MeshSettingsTab extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      wsCommand: { type: Object }, // function reference
    };
  }

  constructor() {
    super();
    this._activePanel = "lora";
    this._config = null;
    this._loading = true;
    this._error = null;
  }

  static get styles() {
    return [
      settingsStyles,
      emptyStateStyles,
      css`
        :host { display: block; }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
          color: var(--secondary-text-color);
          font-size: 14px;
        }
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid rgba(244,67,54,0.3);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          color: #f44336;
          font-size: 14px;
        }
      `,
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadConfig();
  }

  async _loadConfig() {
    this._loading = true;
    this._error = null;
    this.requestUpdate();

    const result = await this._ws("meshtastic_ui/get_config");
    if (result) {
      this._config = result;
    } else {
      this._error = "Failed to load config from radio. Is the radio connected?";
    }
    this._loading = false;
    this.requestUpdate();
  }

  async _ws(type, data = {}) {
    if (this.wsCommand) return this.wsCommand(type, data);
    if (!this.hass) return null;
    try {
      return await this.hass.callWS({ type, ...data });
    } catch (err) {
      console.error(`WS command ${type} failed:`, err);
      return null;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">Loading radio configuration...</div>`;
    }

    return html`
      ${this._error ? html`<div class="error-banner">${this._error}</div>` : ""}
      <div class="settings-layout">
        <div class="settings-nav">
          ${NAV_ITEMS.map((group) => html`
            <div class="settings-nav-group">
              <div class="settings-nav-header">${group.group}</div>
              ${group.items.map((item) => html`
                <div
                  class="settings-nav-item ${this._activePanel === item.id ? "active" : ""}"
                  @click=${() => { this._activePanel = item.id; this.requestUpdate(); }}
                >${item.label}</div>
              `)}
            </div>
          `)}
        </div>
        <div class="settings-content">
          ${this._renderPanel()}
        </div>
      </div>
    `;
  }

  _renderPanel() {
    switch (this._activePanel) {
      case "lora":
        return html`<mesh-settings-lora
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-lora>`;
      case "channels":
        return html`<mesh-settings-channels
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-channels>`;
      case "user":
        return html`<mesh-settings-user
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-user>`;
      case "device":
        return html`<mesh-settings-device
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-device>`;
      case "position":
        return html`<mesh-settings-position
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-position>`;
      case "power":
        return html`<mesh-settings-power
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-power>`;
      case "network":
        return html`<mesh-settings-network
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-network>`;
      case "display":
        return html`<mesh-settings-display
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-display>`;
      case "bluetooth":
        return html`<mesh-settings-bluetooth
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-bluetooth>`;
      case "security":
        return html`<mesh-settings-security
          .config=${this._config}
          .wsCommand=${(type, data) => this._ws(type, data)}
          @config-saved=${this._loadConfig}
        ></mesh-settings-security>`;
      case "mqtt":
        return html`<mesh-settings-mqtt .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-mqtt>`;
      case "serial":
        return html`<mesh-settings-serial .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-serial>`;
      case "ext_notification":
        return html`<mesh-settings-ext-notification .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-ext-notification>`;
      case "store_forward":
        return html`<mesh-settings-store-forward .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-store-forward>`;
      case "range_test":
        return html`<mesh-settings-range-test .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-range-test>`;
      case "telemetry":
        return html`<mesh-settings-telemetry .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-telemetry>`;
      case "canned_message":
        return html`<mesh-settings-canned-message .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-canned-message>`;
      case "audio":
        return html`<mesh-settings-audio .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-audio>`;
      case "neighbor_info":
        return html`<mesh-settings-neighbor-info .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-neighbor-info>`;
      case "ambient_lighting":
        return html`<mesh-settings-ambient-lighting .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-ambient-lighting>`;
      case "detection_sensor":
        return html`<mesh-settings-detection-sensor .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-detection-sensor>`;
      case "paxcounter":
        return html`<mesh-settings-paxcounter .config=${this._config} .wsCommand=${(type, data) => this._ws(type, data)} @config-saved=${this._loadConfig}></mesh-settings-paxcounter>`;
      case "actions":
        return html`<mesh-settings-actions
          .wsCommand=${(type, data) => this._ws(type, data)}
        ></mesh-settings-actions>`;
      default:
        return html`<div class="empty-state">Select a settings panel</div>`;
    }
  }
}
customElements.define("mesh-settings-tab", MeshSettingsTab);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-lora>  —  LoRa radio configuration
   ══════════════════════════════════════════════════════════ */

class MeshSettingsLora extends LitElement {
  static get properties() {
    return {
      config: { type: Object },
      wsCommand: { type: Object },
    };
  }

  constructor() {
    super();
    this._draft = {};
    this._dirty = false;
    this._saving = false;
  }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      saveBarStyles,
      css`
        :host { display: block; }
      `,
    ];
  }

  updated(changedProps) {
    if (changedProps.has("config") && this.config && !this._dirty) {
      this._resetDraft();
    }
  }

  _resetDraft() {
    const lora = this.config?.local_config?.lora || {};
    this._draft = { ...lora };
    this._dirty = false;
    this.requestUpdate();
  }

  _updateField(field, value) {
    this._draft = { ...this._draft, [field]: value };
    this._dirty = true;
    this.requestUpdate();
  }

  async _save() {
    this._saving = true;
    this.requestUpdate();

    const result = await this.wsCommand("meshtastic_ui/set_config", {
      section: "lora",
      values: this._draft,
    });

    this._saving = false;
    if (result?.success) {
      this._dirty = false;
      this.dispatchEvent(new CustomEvent("config-saved", { bubbles: true, composed: true }));
    }
    this.requestUpdate();
  }

  render() {
    const d = this._draft;

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>LoRa Configuration</h3>
          <p>Configure radio frequency, modem preset, and transmission settings.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label="Region"
              .value=${String(d.region || "UNSET")}
              .options=${REGIONS}
              @change=${(e) => this._updateField("region", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label="Modem Preset"
              .value=${String(d.modem_preset || "LONG_FAST")}
              .options=${MODEM_PRESETS}
              @change=${(e) => this._updateField("modem_preset", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label="Hop Limit"
              description="Max number of hops (1-7)"
              .value=${d.hop_limit ?? 3}
              .min=${1}
              .max=${7}
              @change=${(e) => this._updateField("hop_limit", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="TX Power (dBm)"
              description="Transmit power in dBm (0 = max for region)"
              .value=${d.tx_power ?? 0}
              .min=${0}
              .max=${30}
              @change=${(e) => this._updateField("tx_power", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Frequency Offset (Hz)"
              description="Fine-tune frequency offset"
              .value=${d.frequency_offset ?? 0}
              .step=${100}
              @change=${(e) => this._updateField("frequency_offset", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Bandwidth (kHz)"
              description="Override bandwidth (0 = use preset)"
              .value=${d.bandwidth ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("bandwidth", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Spread Factor"
              description="Override spread factor (0 = use preset)"
              .value=${d.spread_factor ?? 0}
              .min=${0}
              .max=${12}
              @change=${(e) => this._updateField("spread_factor", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Coding Rate"
              description="Override coding rate (0 = use preset)"
              .value=${d.coding_rate ?? 0}
              .min=${0}
              .max=${8}
              @change=${(e) => this._updateField("coding_rate", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="TX Enabled"
              description="Allow radio to transmit"
              .checked=${d.tx_enabled !== false}
              @change=${(e) => this._updateField("tx_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Use Preset"
              description="Use the modem preset or custom values"
              .checked=${d.use_preset !== false}
              @change=${(e) => this._updateField("use_preset", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Override Duty Cycle"
              description="Override regional duty cycle limits (use with caution)"
              .checked=${d.override_duty_cycle === true}
              @change=${(e) => this._updateField("override_duty_cycle", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Boosted RX Gain"
              description="Enable boosted RX gain on SX1262"
              .checked=${d.sx126x_rx_boosted_gain === true}
              @change=${(e) => this._updateField("sx126x_rx_boosted_gain", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-lora", MeshSettingsLora);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-channels>  —  Channel editor for all 8 channels
   ══════════════════════════════════════════════════════════ */

class MeshSettingsChannels extends LitElement {
  static get properties() {
    return {
      config: { type: Object },
      wsCommand: { type: Object },
    };
  }

  constructor() {
    super();
    this._expandedIndex = null;
    this._drafts = {};
    this._dirtyIndexes = new Set();
    this._saving = false;
  }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      channelStyles,
      badgeStyles,
      saveBarStyles,
      css`
        :host { display: block; }
        .psk-row {
          display: flex; gap: 8px; align-items: flex-end;
        }
        .psk-row mesh-text-input { flex: 1; }
        .gen-btn {
          padding: 8px 14px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          cursor: pointer; font-size: 13px; white-space: nowrap;
        }
        .gen-btn:hover { border-color: var(--primary-color); }
      `,
    ];
  }

  updated(changedProps) {
    if (changedProps.has("config") && this.config) {
      this._resetAllDrafts();
    }
  }

  _resetAllDrafts() {
    const channels = this.config?.channels || [];
    this._drafts = {};
    channels.forEach((ch, i) => {
      this._drafts[i] = {
        role: ch.role || "DISABLED",
        name: ch.settings?.name || "",
        psk: ch.settings?.psk ? btoa(String.fromCharCode(...new Uint8Array(
          typeof ch.settings.psk === "string" ? Uint8Array.from(atob(ch.settings.psk), c => c.charCodeAt(0)) : []
        ))) : "",
        uplink_enabled: ch.settings?.uplink_enabled ?? false,
        downlink_enabled: ch.settings?.downlink_enabled ?? false,
        position_precision: ch.settings?.module_settings?.position_precision ?? 0,
      };
    });
    this._dirtyIndexes = new Set();
    this.requestUpdate();
  }

  _updateChannelField(index, field, value) {
    if (!this._drafts[index]) return;
    this._drafts[index] = { ...this._drafts[index], [field]: value };
    this._dirtyIndexes.add(index);
    this.requestUpdate();
  }

  _generatePsk(index) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const b64 = btoa(String.fromCharCode(...arr));
    this._updateChannelField(index, "psk", b64);
  }

  async _saveChannel(index) {
    this._saving = true;
    this.requestUpdate();

    const draft = this._drafts[index];
    const settings = {
      role: draft.role,
      name: draft.name,
      uplink_enabled: draft.uplink_enabled,
      downlink_enabled: draft.downlink_enabled,
    };
    if (draft.psk) {
      settings.psk = draft.psk;
    }

    const result = await this.wsCommand("meshtastic_ui/set_channel", {
      index,
      settings,
    });

    this._saving = false;
    if (result?.success) {
      this._dirtyIndexes.delete(index);
      this.dispatchEvent(new CustomEvent("config-saved", { bubbles: true, composed: true }));
    }
    this.requestUpdate();
  }

  render() {
    const channels = this.config?.channels || [];
    const maxChannels = Math.max(channels.length, 8);

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Channels</h3>
          <p>Configure up to 8 channels. Each channel can have its own name and encryption key.</p>
        </div>
        <div class="settings-panel-body">
          ${Array.from({ length: maxChannels }, (_, i) => this._renderChannel(i))}
        </div>
      </div>
    `;
  }

  _renderChannel(index) {
    const draft = this._drafts[index] || { role: "DISABLED", name: "", psk: "", uplink_enabled: false, downlink_enabled: false };
    const isExpanded = this._expandedIndex === index;
    const isDirty = this._dirtyIndexes.has(index);
    const roleName = CHANNEL_ROLES.find((r) => r.value === draft.role)?.label || "Disabled";

    return html`
      <div class="channel-card">
        <div class="channel-card-header"
          @click=${() => { this._expandedIndex = isExpanded ? null : index; this.requestUpdate(); }}>
          <span class="channel-card-title">
            Channel ${index}${draft.name ? ` — ${draft.name}` : ""}
            ${isDirty ? html` <span style="color: var(--primary-color);">*</span>` : ""}
          </span>
          <span class="badge ${draft.role === "PRIMARY" ? "primary" : draft.role === "SECONDARY" ? "secondary" : ""}">${roleName}</span>
        </div>
        ${isExpanded ? html`
          <div class="channel-card-body">
            <div class="form-grid">
              <mesh-select
                label="Role"
                .value=${String(draft.role)}
                .options=${CHANNEL_ROLES}
                @change=${(e) => this._updateChannelField(index, "role", e.detail.value)}
              ></mesh-select>

              <mesh-text-input
                label="Name"
                .value=${draft.name}
                .maxlength=${11}
                placeholder="Channel name"
                @change=${(e) => this._updateChannelField(index, "name", e.detail.value)}
              ></mesh-text-input>
            </div>

            <div style="margin-top: 16px;">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 8px;">
                Encryption Key (PSK)
              </div>
              <div class="psk-row">
                <mesh-text-input
                  .value=${draft.psk}
                  placeholder="Base64 encoded key"
                  @change=${(e) => this._updateChannelField(index, "psk", e.detail.value)}
                ></mesh-text-input>
                <button class="gen-btn" @click=${() => this._generatePsk(index)}>Generate</button>
              </div>
            </div>

            <div style="margin-top: 16px;">
              <mesh-toggle
                label="Uplink Enabled"
                description="Forward packets from this channel to MQTT"
                .checked=${draft.uplink_enabled}
                @change=${(e) => this._updateChannelField(index, "uplink_enabled", e.detail.checked)}
              ></mesh-toggle>
              <mesh-toggle
                label="Downlink Enabled"
                description="Forward packets from MQTT to this channel"
                .checked=${draft.downlink_enabled}
                @change=${(e) => this._updateChannelField(index, "downlink_enabled", e.detail.checked)}
              ></mesh-toggle>
            </div>

            ${isDirty ? html`
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button class="gen-btn" @click=${() => { this._resetAllDrafts(); }}>Discard</button>
                <button class="gen-btn" style="background: var(--primary-color); color: var(--text-primary-color); border-color: var(--primary-color);"
                  ?disabled=${this._saving}
                  @click=${() => this._saveChannel(index)}>
                  ${this._saving ? "Saving..." : "Save Channel"}
                </button>
              </div>
            ` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }
}
customElements.define("mesh-settings-channels", MeshSettingsChannels);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-user>  —  Owner / user configuration
   ══════════════════════════════════════════════════════════ */

class MeshSettingsUser extends LitElement {
  static get properties() {
    return {
      config: { type: Object },
      wsCommand: { type: Object },
    };
  }

  constructor() {
    super();
    this._draft = {};
    this._dirty = false;
    this._saving = false;
  }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      saveBarStyles,
      css`
        :host { display: block; }
      `,
    ];
  }

  updated(changedProps) {
    if (changedProps.has("config") && this.config && !this._dirty) {
      this._resetDraft();
    }
  }

  _resetDraft() {
    const owner = this.config?.owner || {};
    this._draft = {
      longName: owner.longName || "",
      shortName: owner.shortName || "",
      isLicensed: owner.isLicensed || false,
    };
    this._dirty = false;
    this.requestUpdate();
  }

  _updateField(field, value) {
    this._draft = { ...this._draft, [field]: value };
    this._dirty = true;
    this.requestUpdate();
  }

  async _save() {
    this._saving = true;
    this.requestUpdate();

    const result = await this.wsCommand("meshtastic_ui/set_owner", {
      long_name: this._draft.longName || undefined,
      short_name: this._draft.shortName || undefined,
      is_licensed: this._draft.isLicensed,
    });

    this._saving = false;
    if (result?.success) {
      this._dirty = false;
      this.dispatchEvent(new CustomEvent("config-saved", { bubbles: true, composed: true }));
    }
    this.requestUpdate();
  }

  render() {
    const d = this._draft;

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>User Configuration</h3>
          <p>Set the name and identity of your radio node on the mesh.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-text-input
              label="Long Name"
              description="Your radio's display name on the mesh (max 39 chars)"
              .value=${d.longName || ""}
              .maxlength=${39}
              placeholder="My Meshtastic Radio"
              @change=${(e) => this._updateField("longName", e.detail.value)}
            ></mesh-text-input>

            <mesh-text-input
              label="Short Name"
              description="4-character abbreviation shown on compact displays"
              .value=${d.shortName || ""}
              .maxlength=${4}
              placeholder="ABCD"
              @change=${(e) => this._updateField("shortName", e.detail.value)}
            ></mesh-text-input>
          </div>

          <div class="settings-section">
            <mesh-toggle
              label="Licensed Operator"
              description="If enabled, your node will use HAM mode with longer names and no encryption"
              .checked=${d.isLicensed === true}
              @change=${(e) => this._updateField("isLicensed", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-user", MeshSettingsUser);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-actions>  —  Device management actions
   ══════════════════════════════════════════════════════════ */

class MeshSettingsActions extends LitElement {
  static get properties() {
    return {
      wsCommand: { type: Object },
    };
  }

  constructor() {
    super();
    this._confirmAction = null;
    this._feedback = "";
  }

  static get styles() {
    return [
      settingsStyles,
      deviceActionStyles,
      dialogStyles,
      css`
        :host { display: block; }
        .feedback {
          margin-top: 16px;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
        }
        .feedback.success {
          background: rgba(76,175,80,0.1);
          color: #4caf50;
          border: 1px solid rgba(76,175,80,0.3);
        }
        .feedback.error {
          background: rgba(244,67,54,0.1);
          color: #f44336;
          border: 1px solid rgba(244,67,54,0.3);
        }
      `,
    ];
  }

  render() {
    const actions = [
      {
        id: "reboot",
        name: "Reboot",
        desc: "Restart the radio device",
        icon: "mdi:restart",
        danger: false,
      },
      {
        id: "shutdown",
        name: "Shutdown",
        desc: "Power off the radio device",
        icon: "mdi:power",
        danger: false,
      },
      {
        id: "reset_nodedb",
        name: "Reset NodeDB",
        desc: "Clear the mesh node database",
        icon: "mdi:database-remove",
        danger: true,
      },
      {
        id: "factory_reset_config",
        name: "Factory Reset Config",
        desc: "Reset all configuration to defaults",
        icon: "mdi:cog-refresh",
        danger: true,
      },
      {
        id: "factory_reset_device",
        name: "Full Factory Reset",
        desc: "Reset config and clear all data",
        icon: "mdi:delete-forever",
        danger: true,
      },
      {
        id: "reboot_ota",
        name: "Reboot to OTA",
        desc: "Reboot into OTA update mode",
        icon: "mdi:cellphone-arrow-down",
        danger: false,
      },
    ];

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Device Actions</h3>
          <p>Manage and control your Meshtastic radio device. Destructive actions require confirmation.</p>
        </div>
        <div class="settings-panel-body">
          <div class="device-actions-grid">
            ${actions.map((a) => html`
              <div
                class="device-action-card ${a.danger ? "danger" : ""}"
                @click=${() => this._requestAction(a)}
              >
                <ha-icon icon="${a.icon}"></ha-icon>
                <span class="action-name">${a.name}</span>
                <span class="action-desc">${a.desc}</span>
              </div>
            `)}
          </div>
          ${this._feedback ? html`
            <div class="feedback ${this._feedback.startsWith("Error") ? "error" : "success"}">
              ${this._feedback}
            </div>
          ` : ""}
        </div>
      </div>

      <mesh-confirm-dialog
        .open=${this._confirmAction != null}
        .title=${this._confirmAction?.name || ""}
        .message=${`Are you sure you want to ${(this._confirmAction?.name || "").toLowerCase()}? ${this._confirmAction?.danger ? "This action cannot be undone." : ""}`}
        .confirmLabel=${this._confirmAction?.name || "Confirm"}
        .danger=${this._confirmAction?.danger || false}
        @confirm=${this._executeAction}
        @cancel=${() => { this._confirmAction = null; this.requestUpdate(); }}
      ></mesh-confirm-dialog>
    `;
  }

  _requestAction(action) {
    this._confirmAction = action;
    this.requestUpdate();
  }

  async _executeAction() {
    const action = this._confirmAction;
    if (!action) return;

    this._confirmAction = null;
    this._feedback = "";
    this.requestUpdate();

    const result = await this.wsCommand("meshtastic_ui/device_action", {
      action: action.id,
    });

    if (result?.success) {
      this._feedback = `${action.name} command sent successfully`;
    } else {
      this._feedback = `Error: ${action.name} command failed`;
    }
    this.requestUpdate();

    setTimeout(() => {
      this._feedback = "";
      this.requestUpdate();
    }, 5000);
  }
}
customElements.define("mesh-settings-actions", MeshSettingsActions);

/* ══════════════════════════════════════════════════════════
   Reusable base class for simple config-section panels
   ══════════════════════════════════════════════════════════ */

class ConfigSectionPanel extends LitElement {
  static get properties() {
    return {
      config: { type: Object },
      wsCommand: { type: Object },
    };
  }

  constructor() {
    super();
    this._draft = {};
    this._dirty = false;
    this._saving = false;
  }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      saveBarStyles,
      css` :host { display: block; } `,
    ];
  }

  /** Subclasses override — return the config section name (e.g. "device") */
  get _section() { return ""; }

  /** Subclasses override — return the nested path inside local_config (e.g. "device") */
  get _configPath() { return this._section; }

  updated(changedProps) {
    if (changedProps.has("config") && this.config && !this._dirty) {
      this._resetDraft();
    }
  }

  _resetDraft() {
    const src = this.config?.local_config?.[this._configPath] || {};
    this._draft = { ...src };
    this._dirty = false;
    this.requestUpdate();
  }

  _updateField(field, value) {
    this._draft = { ...this._draft, [field]: value };
    this._dirty = true;
    this.requestUpdate();
  }

  async _save() {
    this._saving = true;
    this.requestUpdate();

    const result = await this.wsCommand("meshtastic_ui/set_config", {
      section: this._section,
      values: this._draft,
    });

    this._saving = false;
    if (result?.success) {
      this._dirty = false;
      this.dispatchEvent(new CustomEvent("config-saved", { bubbles: true, composed: true }));
    }
    this.requestUpdate();
  }
}

/* ══════════════════════════════════════════════════════════
   <mesh-settings-device>  —  Device role, rebroadcast, GPIO, etc.
   ══════════════════════════════════════════════════════════ */

class MeshSettingsDevice extends ConfigSectionPanel {
  get _section() { return "device"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Device Configuration</h3>
          <p>Configure the device role, rebroadcast mode, and hardware options.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label="Device Role"
              description="Determines how the device behaves on the mesh"
              .value=${String(d.role || "CLIENT")}
              .options=${DEVICE_ROLES}
              @change=${(e) => this._updateField("role", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label="Rebroadcast Mode"
              description="Controls which messages this node rebroadcasts"
              .value=${String(d.rebroadcast_mode || "ALL")}
              .options=${REBROADCAST_MODES}
              @change=${(e) => this._updateField("rebroadcast_mode", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label="Node Info Broadcast Secs"
              description="How often to broadcast node info (seconds, 0 = default)"
              .value=${d.node_info_broadcast_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("node_info_broadcast_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Button GPIO"
              description="GPIO pin for user button (0 = default)"
              .value=${d.button_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("button_gpio", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Buzzer GPIO"
              description="GPIO pin for buzzer (0 = default)"
              .value=${d.buzzer_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("buzzer_gpio", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="Double Tap as Button Press"
              description="Use double-tap on the device as a button press"
              .checked=${d.double_tap_as_button_press === true}
              @change=${(e) => this._updateField("double_tap_as_button_press", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="LED Heartbeat Disabled"
              description="Disable the LED heartbeat indicator"
              .checked=${d.led_heartbeat_disabled === true}
              @change=${(e) => this._updateField("led_heartbeat_disabled", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-device", MeshSettingsDevice);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-position>  —  GPS mode, fixed position, broadcast intervals
   ══════════════════════════════════════════════════════════ */

class MeshSettingsPosition extends ConfigSectionPanel {
  get _section() { return "position"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Position Configuration</h3>
          <p>Configure GPS, fixed position, and position broadcast settings.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label="GPS Mode"
              description="How the device obtains its position"
              .value=${String(d.gps_mode || "ENABLED")}
              .options=${GPS_MODES}
              @change=${(e) => this._updateField("gps_mode", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label="Position Broadcast Secs"
              description="How often to broadcast position (seconds, 0 = default)"
              .value=${d.position_broadcast_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("position_broadcast_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Broadcast Smart Min Distance (m)"
              description="Min distance to move before broadcasting (0 = disabled)"
              .value=${d.broadcast_smart_minimum_distance ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("broadcast_smart_minimum_distance", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Broadcast Smart Min Interval (secs)"
              description="Min interval between smart broadcasts"
              .value=${d.broadcast_smart_minimum_interval_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("broadcast_smart_minimum_interval_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="GPS Update Interval (secs)"
              description="How often the GPS hardware checks position"
              .value=${d.gps_update_interval ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("gps_update_interval", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="RX GPIO"
              description="GPIO pin for GPS RX (0 = default)"
              .value=${d.rx_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("rx_gpio", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="TX GPIO"
              description="GPIO pin for GPS TX (0 = default)"
              .value=${d.tx_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("tx_gpio", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Fixed Position
            </div>
            <mesh-toggle
              label="Fixed Position"
              description="Use a fixed position instead of GPS"
              .checked=${d.fixed_position === true}
              @change=${(e) => this._updateField("fixed_position", e.detail.checked)}
            ></mesh-toggle>
            ${d.fixed_position ? html`
              <div class="form-grid" style="margin-top: 12px;">
                <mesh-number-input
                  label="Latitude"
                  .value=${d.fixed_lat ?? 0}
                  .step=${0.000001}
                  @change=${(e) => this._updateField("fixed_lat", e.detail.value)}
                ></mesh-number-input>
                <mesh-number-input
                  label="Longitude"
                  .value=${d.fixed_lng ?? 0}
                  .step=${0.000001}
                  @change=${(e) => this._updateField("fixed_lng", e.detail.value)}
                ></mesh-number-input>
                <mesh-number-input
                  label="Altitude (m)"
                  .value=${d.fixed_altitude ?? 0}
                  @change=${(e) => this._updateField("fixed_altitude", e.detail.value)}
                ></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="Smart Position Broadcast"
              description="Only broadcast position when movement is detected"
              .checked=${d.position_broadcast_smart_enabled === true}
              @change=${(e) => this._updateField("position_broadcast_smart_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="GPS Enabled"
              description="Enable the onboard GPS hardware"
              .checked=${d.gps_enabled === true}
              @change=${(e) => this._updateField("gps_enabled", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-position", MeshSettingsPosition);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-power>  —  Power saving, sleep, ADC
   ══════════════════════════════════════════════════════════ */

class MeshSettingsPower extends ConfigSectionPanel {
  get _section() { return "power"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Power Configuration</h3>
          <p>Configure power saving, sleep behavior, and battery management.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-number-input
              label="On Battery Shutdown After (secs)"
              description="Auto-shutdown after this many seconds on battery (0 = disabled)"
              .value=${d.on_battery_shutdown_after_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("on_battery_shutdown_after_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Min Wake Secs"
              description="Minimum time to stay awake (seconds)"
              .value=${d.min_wake_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("min_wake_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Light Sleep Interval (secs)"
              description="Light sleep interval for power saving"
              .value=${d.ls_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("ls_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Wait Bluetooth Secs"
              description="Seconds to wait for Bluetooth before sleeping"
              .value=${d.wait_bluetooth_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("wait_bluetooth_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="ADC Multiplier Override"
              description="Override voltage divider ratio for battery reading (0 = auto)"
              .value=${d.adc_multiplier_override ?? 0}
              .min=${0}
              .step=${0.01}
              @change=${(e) => this._updateField("adc_multiplier_override", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="Power Saving"
              description="Enable power saving mode (light sleep between operations)"
              .checked=${d.is_power_saving === true}
              @change=${(e) => this._updateField("is_power_saving", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-power", MeshSettingsPower);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-network>  —  WiFi, Ethernet, NTP, Syslog
   ══════════════════════════════════════════════════════════ */

class MeshSettingsNetwork extends ConfigSectionPanel {
  get _section() { return "network"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Network Configuration</h3>
          <p>Configure WiFi, Ethernet, NTP server, and syslog settings.</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              WiFi
            </div>
            <mesh-toggle
              label="WiFi Enabled"
              description="Enable WiFi connectivity"
              .checked=${d.wifi_enabled === true}
              @change=${(e) => this._updateField("wifi_enabled", e.detail.checked)}
            ></mesh-toggle>
            ${d.wifi_enabled ? html`
              <div class="form-grid" style="margin-top: 12px;">
                <mesh-text-input
                  label="WiFi SSID"
                  .value=${d.wifi_ssid || ""}
                  placeholder="Network name"
                  @change=${(e) => this._updateField("wifi_ssid", e.detail.value)}
                ></mesh-text-input>
                <mesh-text-input
                  label="WiFi Password"
                  .value=${d.wifi_psk || ""}
                  placeholder="Password"
                  @change=${(e) => this._updateField("wifi_psk", e.detail.value)}
                ></mesh-text-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Ethernet
            </div>
            <mesh-toggle
              label="Ethernet Enabled"
              description="Enable Ethernet connectivity"
              .checked=${d.eth_enabled === true}
              @change=${(e) => this._updateField("eth_enabled", e.detail.checked)}
            ></mesh-toggle>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              IP Configuration
            </div>
            <div class="form-grid">
              <mesh-text-input
                label="IPv4 Address"
                description="Static IPv4 address (leave empty for DHCP)"
                .value=${d.ipv4_config?.ip ? this._intToIp(d.ipv4_config.ip) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, ip: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label="Gateway"
                .value=${d.ipv4_config?.gateway ? this._intToIp(d.ipv4_config.gateway) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, gateway: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label="Subnet Mask"
                .value=${d.ipv4_config?.subnet ? this._intToIp(d.ipv4_config.subnet) : ""}
                placeholder="255.255.255.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, subnet: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label="DNS Server"
                .value=${d.ipv4_config?.dns ? this._intToIp(d.ipv4_config.dns) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, dns: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
            </div>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Services
            </div>
            <div class="form-grid">
              <mesh-text-input
                label="NTP Server"
                description="Custom NTP server address"
                .value=${d.ntp_server || ""}
                placeholder="0.pool.ntp.org"
                @change=${(e) => this._updateField("ntp_server", e.detail.value)}
              ></mesh-text-input>
              <mesh-text-input
                label="Syslog Server"
                description="Remote syslog server (host:port)"
                .value=${d.rsyslog_server || ""}
                placeholder="192.168.1.100:514"
                @change=${(e) => this._updateField("rsyslog_server", e.detail.value)}
              ></mesh-text-input>
            </div>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }

  _intToIp(n) {
    if (!n) return "";
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join(".");
  }

  _ipToInt(ip) {
    if (!ip) return 0;
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return 0;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }
}
customElements.define("mesh-settings-network", MeshSettingsNetwork);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-display>  —  Screen, units, OLED, flip
   ══════════════════════════════════════════════════════════ */

class MeshSettingsDisplay extends ConfigSectionPanel {
  get _section() { return "display"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Display Configuration</h3>
          <p>Configure screen timeout, units, OLED type, and display options.</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-number-input
              label="Screen On Secs"
              description="How long the screen stays on (0 = always on)"
              .value=${d.screen_on_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("screen_on_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label="Auto Carousel Secs"
              description="Seconds between auto-cycling pages (0 = disabled)"
              .value=${d.auto_screen_carousel_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("auto_screen_carousel_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-select
              label="Display Units"
              .value=${String(d.units || "METRIC")}
              .options=${DISPLAY_UNITS}
              @change=${(e) => this._updateField("units", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label="Display Mode"
              description="Color mode for the display"
              .value=${String(d.displaymode || "DEFAULT")}
              .options=${DISPLAY_MODES}
              @change=${(e) => this._updateField("displaymode", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label="OLED Type"
              description="OLED display hardware type"
              .value=${String(d.oled || "OLED_AUTO")}
              .options=${OLED_TYPES}
              @change=${(e) => this._updateField("oled", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label="Heading Bold"
              description="Use bold for heading text (0 = no, 1 = yes)"
              .value=${d.heading_bold ? 1 : 0}
              .min=${0}
              .max=${1}
              @change=${(e) => this._updateField("heading_bold", e.detail.value === 1)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="Flip Screen"
              description="Rotate the display 180 degrees"
              .checked=${d.flip_screen === true}
              @change=${(e) => this._updateField("flip_screen", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Wake on Tap or Motion"
              description="Wake the screen when motion is detected"
              .checked=${d.wake_on_tap_or_motion === true}
              @change=${(e) => this._updateField("wake_on_tap_or_motion", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Compass North Top"
              description="Always orient compass with north at top"
              .checked=${d.compass_north_top === true}
              @change=${(e) => this._updateField("compass_north_top", e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-display", MeshSettingsDisplay);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-bluetooth>  —  Enable, pairing, PIN
   ══════════════════════════════════════════════════════════ */

class MeshSettingsBluetooth extends ConfigSectionPanel {
  get _section() { return "bluetooth"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Bluetooth Configuration</h3>
          <p>Configure Bluetooth connectivity, pairing mode, and PIN.</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <mesh-toggle
              label="Bluetooth Enabled"
              description="Enable Bluetooth radio"
              .checked=${d.enabled !== false}
              @change=${(e) => this._updateField("enabled", e.detail.checked)}
            ></mesh-toggle>
          </div>

          ${d.enabled !== false ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select
                  label="Pairing Mode"
                  description="How the device pairs with Bluetooth clients"
                  .value=${String(d.mode || "RANDOM_PIN")}
                  .options=${BT_PAIRING_MODES}
                  @change=${(e) => this._updateField("mode", e.detail.value)}
                ></mesh-select>

                ${String(d.mode) === "FIXED_PIN" ? html`
                  <mesh-number-input
                    label="Fixed PIN"
                    description="6-digit pairing PIN"
                    .value=${d.fixed_pin ?? 123456}
                    .min=${100000}
                    .max=${999999}
                    @change=${(e) => this._updateField("fixed_pin", e.detail.value)}
                  ></mesh-number-input>
                ` : ""}
              </div>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-bluetooth", MeshSettingsBluetooth);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-security>  —  PKI keys (display), admin channel, debug
   ══════════════════════════════════════════════════════════ */

class MeshSettingsSecurity extends ConfigSectionPanel {
  get _section() { return "security"; }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      saveBarStyles,
      css`
        :host { display: block; }
        .key-display {
          font-family: monospace;
          font-size: 12px;
          word-break: break-all;
          background: var(--primary-background-color);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid var(--divider-color);
          color: var(--secondary-text-color);
        }
        .key-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .key-section { margin-bottom: 16px; }
      `,
    ];
  }

  render() {
    const d = this._draft;

    // Try to display public key from config
    const pubKey = this.config?.owner?.publicKey || d.public_key || "";
    const privKey = d.private_key ? "(set)" : "(not set)";

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>Security Configuration</h3>
          <p>View PKI keys, configure admin channel, and debug logging settings.</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              PKI Keys (Read Only)
            </div>
            <div class="key-section">
              <div class="key-label">Public Key</div>
              <div class="key-display">${pubKey || "Not available"}</div>
            </div>
            <div class="key-section">
              <div class="key-label">Private Key</div>
              <div class="key-display">${privKey}</div>
            </div>
          </div>

          <div class="settings-section">
            <div class="form-grid">
              <mesh-number-input
                label="Admin Channel Index"
                description="Channel index used for admin messages (0 = primary)"
                .value=${d.admin_channel_enabled ?? 0}
                .min=${0}
                .max=${7}
                @change=${(e) => this._updateField("admin_channel_enabled", e.detail.value)}
              ></mesh-number-input>
            </div>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              Options
            </div>
            <mesh-toggle
              label="Debug Log Enabled"
              description="Enable verbose debug logging on the device"
              .checked=${d.debug_log_api_enabled === true}
              @change=${(e) => this._updateField("debug_log_api_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Admin Key Required"
              description="Require admin key for remote administration"
              .checked=${d.is_managed === true}
              @change=${(e) => this._updateField("is_managed", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label="Serial Console Disabled"
              description="Disable serial console access for security"
              .checked=${d.serial_enabled === false}
              @change=${(e) => this._updateField("serial_enabled", !e.detail.checked)}
            ></mesh-toggle>
          </div>
        </div>
        <mesh-save-bar
          .dirty=${this._dirty}
          .saving=${this._saving}
          @save=${this._save}
          @discard=${this._resetDraft}
        ></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-security", MeshSettingsSecurity);

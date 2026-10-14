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
import { t } from "./i18n.js";

/* Option lists keep translation keys, not text, because they are built at
   import time, before the panel has picked a language. Codes that are not
   words (region bands, OLED chip names) keep a literal label. */
function translateOptions(options) {
  return options.map((option) => ({
    value: option.value,
    label: option.labelKey ? t(option.labelKey) : option.label,
  }));
}

/* ── LoRa modem presets & region enum maps ── */
const MODEM_PRESETS = [
  { value: "LONG_FAST", labelKey: "settings.lora.presets.long_fast" },
  { value: "LONG_SLOW", labelKey: "settings.lora.presets.long_slow" },
  { value: "LONG_MODERATE", labelKey: "settings.lora.presets.long_moderate" },
  { value: "SHORT_FAST", labelKey: "settings.lora.presets.short_fast" },
  { value: "SHORT_SLOW", labelKey: "settings.lora.presets.short_slow" },
  { value: "MEDIUM_FAST", labelKey: "settings.lora.presets.medium_fast" },
  { value: "MEDIUM_SLOW", labelKey: "settings.lora.presets.medium_slow" },
];

const REGIONS = [
  { value: "UNSET", labelKey: "settings.lora.regions.unset" },
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
  { value: "LORA_24", labelKey: "settings.lora.regions.lora_24" },
];

const CHANNEL_ROLES = [
  { value: "DISABLED", labelKey: "settings.channels.roles.disabled" },
  { value: "PRIMARY", labelKey: "settings.channels.roles.primary" },
  { value: "SECONDARY", labelKey: "settings.channels.roles.secondary" },
];

/* ── Device role enum ── */
const DEVICE_ROLES = [
  { value: "CLIENT", labelKey: "settings.device.roles.client" },
  { value: "CLIENT_MUTE", labelKey: "settings.device.roles.client_mute" },
  { value: "CLIENT_HIDDEN", labelKey: "settings.device.roles.client_hidden" },
  { value: "CLIENT_BASE", labelKey: "settings.device.roles.client_base" },
  { value: "ROUTER", labelKey: "settings.device.roles.router" },
  { value: "ROUTER_LATE", labelKey: "settings.device.roles.router_late" },
  { value: "ROUTER_CLIENT", labelKey: "settings.device.roles.router_client" },
  { value: "REPEATER", labelKey: "settings.device.roles.repeater" },
  { value: "TRACKER", labelKey: "settings.device.roles.tracker" },
  { value: "SENSOR", labelKey: "settings.device.roles.sensor" },
  { value: "TAK", labelKey: "settings.device.roles.tak" },
  { value: "TAK_TRACKER", labelKey: "settings.device.roles.tak_tracker" },
  { value: "LOST_AND_FOUND", labelKey: "settings.device.roles.lost_and_found" },
];

const REBROADCAST_MODES = [
  { value: "ALL", labelKey: "settings.device.rebroadcast_modes.all" },
  { value: "ALL_SKIP_DECODING", labelKey: "settings.device.rebroadcast_modes.all_skip_decoding" },
  { value: "LOCAL_ONLY", labelKey: "settings.device.rebroadcast_modes.local_only" },
  { value: "KNOWN_ONLY", labelKey: "settings.device.rebroadcast_modes.known_only" },
  { value: "NONE", labelKey: "settings.device.rebroadcast_modes.none" },
];

/* ── Position / GPS enums ── */
const GPS_MODES = [
  { value: "DISABLED", labelKey: "settings.position.gps_modes.disabled" },
  { value: "ENABLED", labelKey: "settings.position.gps_modes.enabled" },
  { value: "NOT_PRESENT", labelKey: "settings.position.gps_modes.not_present" },
];

/* ── Display enums ── */
const DISPLAY_MODES = [
  { value: "DEFAULT", labelKey: "settings.display.modes.default" },
  { value: "TWOCOLOR", labelKey: "settings.display.modes.twocolor" },
  { value: "INVERTED", labelKey: "settings.display.modes.inverted" },
  { value: "COLOR", labelKey: "settings.display.modes.color" },
];

const DISPLAY_UNITS = [
  { value: "METRIC", labelKey: "settings.display.units.metric" },
  { value: "IMPERIAL", labelKey: "settings.display.units.imperial" },
];

const OLED_TYPES = [
  { value: "OLED_AUTO", labelKey: "settings.display.oled_types.auto" },
  { value: "OLED_SSD1306", label: "SSD1306" },
  { value: "OLED_SH1106", label: "SH1106" },
  { value: "OLED_SH1107", label: "SH1107" },
];

/* ── Bluetooth enums ── */
const BT_PAIRING_MODES = [
  { value: "RANDOM_PIN", labelKey: "settings.bluetooth.pairing_modes.random_pin" },
  { value: "FIXED_PIN", labelKey: "settings.bluetooth.pairing_modes.fixed_pin" },
  { value: "NO_PIN", labelKey: "settings.bluetooth.pairing_modes.no_pin" },
];

/* ── Navigation items ── */
const NAV_ITEMS = [
  {
    groupKey: "settings.nav.groups.radio_config",
    items: [
      { id: "lora", labelKey: "settings.nav.lora", icon: "mdi:antenna" },
      { id: "channels", labelKey: "settings.nav.channels", icon: "mdi:forum" },
      { id: "user", labelKey: "settings.nav.user", icon: "mdi:account" },
    ],
  },
  {
    groupKey: "settings.nav.groups.device_config",
    items: [
      { id: "device", labelKey: "settings.nav.device", icon: "mdi:cellphone-cog" },
      { id: "position", labelKey: "settings.nav.position", icon: "mdi:crosshairs-gps" },
      { id: "power", labelKey: "settings.nav.power", icon: "mdi:battery-charging" },
      { id: "network", labelKey: "settings.nav.network", icon: "mdi:wifi" },
      { id: "display", labelKey: "settings.nav.display", icon: "mdi:monitor" },
      { id: "bluetooth", labelKey: "settings.nav.bluetooth", icon: "mdi:bluetooth" },
      { id: "security", labelKey: "settings.nav.security", icon: "mdi:shield-lock" },
    ],
  },
  {
    groupKey: "settings.nav.groups.module_config",
    items: [
      { id: "mqtt", labelKey: "settings.nav.mqtt", icon: "mdi:transit-connection-variant" },
      { id: "serial", labelKey: "settings.nav.serial", icon: "mdi:serial-port" },
      { id: "ext_notification", labelKey: "settings.nav.ext_notification", icon: "mdi:bell-ring" },
      { id: "store_forward", labelKey: "settings.nav.store_forward", icon: "mdi:database-arrow-right" },
      { id: "range_test", labelKey: "settings.nav.range_test", icon: "mdi:signal-distance-variant" },
      { id: "telemetry", labelKey: "settings.nav.telemetry", icon: "mdi:chart-line" },
      { id: "canned_message", labelKey: "settings.nav.canned_message", icon: "mdi:message-reply-text" },
      { id: "audio", labelKey: "settings.nav.audio", icon: "mdi:microphone" },
      { id: "neighbor_info", labelKey: "settings.nav.neighbor_info", icon: "mdi:account-group" },
      { id: "ambient_lighting", labelKey: "settings.nav.ambient_lighting", icon: "mdi:led-on" },
      { id: "detection_sensor", labelKey: "settings.nav.detection_sensor", icon: "mdi:motion-sensor" },
      { id: "paxcounter", labelKey: "settings.nav.paxcounter", icon: "mdi:counter" },
    ],
  },
  {
    groupKey: "settings.nav.groups.device",
    items: [
      { id: "actions", labelKey: "settings.nav.actions", icon: "mdi:cog" },
    ],
  },
  {
    groupKey: "settings.nav.groups.local_data",
    items: [
      { id: "storage", labelKey: "settings.nav.storage", icon: "mdi:database" },
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
      this._error = t("settings.load_error");
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
      return html`<div class="loading">${t("settings.loading_config")}</div>`;
    }

    return html`
      ${this._error ? html`<div class="error-banner">${this._error}</div>` : ""}
      <div class="settings-layout">
        <div class="settings-nav">
          ${NAV_ITEMS.map((group) => html`
            <div class="settings-nav-group">
              <div class="settings-nav-header">${t(group.groupKey)}</div>
              ${group.items.map((item) => html`
                <div
                  class="settings-nav-item ${this._activePanel === item.id ? "active" : ""}"
                  @click=${() => { this._activePanel = item.id; this.requestUpdate(); }}
                >${t(item.labelKey)}</div>
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
      case "storage":
        return html`<mesh-settings-storage
          .wsCommand=${(type, data) => this._ws(type, data)}
        ></mesh-settings-storage>`;
      default:
        return html`<div class="empty-state">${t("settings.select_panel")}</div>`;
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
          <h3>${t("settings.lora.title")}</h3>
          <p>${t("settings.lora.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label=${t("settings.lora.region")}
              .value=${String(d.region || "UNSET")}
              .options=${translateOptions(REGIONS)}
              @change=${(e) => this._updateField("region", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label=${t("settings.lora.modem_preset")}
              .value=${String(d.modem_preset || "LONG_FAST")}
              .options=${translateOptions(MODEM_PRESETS)}
              @change=${(e) => this._updateField("modem_preset", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label=${t("settings.lora.hop_limit")}
              description=${t("settings.lora.hop_limit_desc")}
              .value=${d.hop_limit ?? 3}
              .min=${1}
              .max=${7}
              @change=${(e) => this._updateField("hop_limit", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.lora.tx_power")}
              description=${t("settings.lora.tx_power_desc")}
              .value=${d.tx_power ?? 0}
              .min=${0}
              .max=${30}
              @change=${(e) => this._updateField("tx_power", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.lora.frequency_offset")}
              description=${t("settings.lora.frequency_offset_desc")}
              .value=${d.frequency_offset ?? 0}
              .step=${100}
              @change=${(e) => this._updateField("frequency_offset", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.lora.bandwidth")}
              description=${t("settings.lora.bandwidth_desc")}
              .value=${d.bandwidth ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("bandwidth", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.lora.spread_factor")}
              description=${t("settings.lora.spread_factor_desc")}
              .value=${d.spread_factor ?? 0}
              .min=${0}
              .max=${12}
              @change=${(e) => this._updateField("spread_factor", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.lora.coding_rate")}
              description=${t("settings.lora.coding_rate_desc")}
              .value=${d.coding_rate ?? 0}
              .min=${0}
              .max=${8}
              @change=${(e) => this._updateField("coding_rate", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.lora.tx_enabled")}
              description=${t("settings.lora.tx_enabled_desc")}
              .checked=${d.tx_enabled !== false}
              @change=${(e) => this._updateField("tx_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.lora.use_preset")}
              description=${t("settings.lora.use_preset_desc")}
              .checked=${d.use_preset !== false}
              @change=${(e) => this._updateField("use_preset", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.lora.override_duty_cycle")}
              description=${t("settings.lora.override_duty_cycle_desc")}
              .checked=${d.override_duty_cycle === true}
              @change=${(e) => this._updateField("override_duty_cycle", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.lora.boosted_rx_gain")}
              description=${t("settings.lora.boosted_rx_gain_desc")}
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
          <h3>${t("settings.channels.title")}</h3>
          <p>${t("settings.channels.subtitle")}</p>
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
    const roleKey = CHANNEL_ROLES.find((role) => role.value === draft.role)?.labelKey || "settings.channels.roles.disabled";
    const roleName = t(roleKey);

    return html`
      <div class="channel-card">
        <div class="channel-card-header"
          @click=${() => { this._expandedIndex = isExpanded ? null : index; this.requestUpdate(); }}>
          <span class="channel-card-title">
            ${draft.name
              ? t("settings.channels.channel_title_named", { index, name: draft.name })
              : t("settings.channels.channel_title", { index })}
            ${isDirty ? html` <span style="color: var(--primary-color);">*</span>` : ""}
          </span>
          <span class="badge ${draft.role === "PRIMARY" ? "primary" : draft.role === "SECONDARY" ? "secondary" : ""}">${roleName}</span>
        </div>
        ${isExpanded ? html`
          <div class="channel-card-body">
            <div class="form-grid">
              <mesh-select
                label=${t("settings.channels.role")}
                .value=${String(draft.role)}
                .options=${translateOptions(CHANNEL_ROLES)}
                @change=${(e) => this._updateChannelField(index, "role", e.detail.value)}
              ></mesh-select>

              <mesh-text-input
                label=${t("settings.channels.name")}
                .value=${draft.name}
                .maxlength=${11}
                placeholder=${t("settings.channels.name_placeholder")}
                @change=${(e) => this._updateChannelField(index, "name", e.detail.value)}
              ></mesh-text-input>
            </div>

            <div style="margin-top: 16px;">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 8px;">
                ${t("settings.channels.psk_heading")}
              </div>
              <div class="psk-row">
                <mesh-text-input
                  type="password"
                  .value=${draft.psk}
                  placeholder=${t("settings.channels.psk_placeholder")}
                  @change=${(e) => this._updateChannelField(index, "psk", e.detail.value)}
                ></mesh-text-input>
                <button class="gen-btn" @click=${() => this._generatePsk(index)}>${t("settings.channels.generate_psk")}</button>
              </div>
            </div>

            <div style="margin-top: 16px;">
              <mesh-toggle
                label=${t("settings.channels.uplink_enabled")}
                description=${t("settings.channels.uplink_enabled_desc")}
                .checked=${draft.uplink_enabled}
                @change=${(e) => this._updateChannelField(index, "uplink_enabled", e.detail.checked)}
              ></mesh-toggle>
              <mesh-toggle
                label=${t("settings.channels.downlink_enabled")}
                description=${t("settings.channels.downlink_enabled_desc")}
                .checked=${draft.downlink_enabled}
                @change=${(e) => this._updateChannelField(index, "downlink_enabled", e.detail.checked)}
              ></mesh-toggle>
            </div>

            ${isDirty ? html`
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button class="gen-btn" @click=${() => { this._resetAllDrafts(); }}>${t("settings.channels.discard")}</button>
                <button class="gen-btn" style="background: var(--primary-color); color: var(--text-primary-color); border-color: var(--primary-color);"
                  ?disabled=${this._saving}
                  @click=${() => this._saveChannel(index)}>
                  ${this._saving ? t("settings.channels.saving") : t("settings.channels.save_channel")}
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
          <h3>${t("settings.user.title")}</h3>
          <p>${t("settings.user.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-text-input
              label=${t("settings.user.long_name")}
              description=${t("settings.user.long_name_desc")}
              .value=${d.longName || ""}
              .maxlength=${39}
              placeholder=${t("settings.user.long_name_placeholder")}
              @change=${(e) => this._updateField("longName", e.detail.value)}
            ></mesh-text-input>

            <mesh-text-input
              label=${t("settings.user.short_name")}
              description=${t("settings.user.short_name_desc")}
              .value=${d.shortName || ""}
              .maxlength=${4}
              placeholder="ABCD"
              @change=${(e) => this._updateField("shortName", e.detail.value)}
            ></mesh-text-input>
          </div>

          <div class="settings-section">
            <mesh-toggle
              label=${t("settings.user.licensed_operator")}
              description=${t("settings.user.licensed_operator_desc")}
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
    this._feedbackError = false;
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
        name: t("settings.actions.reboot.name"),
        desc: t("settings.actions.reboot.desc"),
        icon: "mdi:restart",
        danger: false,
      },
      {
        id: "shutdown",
        name: t("settings.actions.shutdown.name"),
        desc: t("settings.actions.shutdown.desc"),
        icon: "mdi:power",
        danger: false,
      },
      {
        id: "reset_nodedb",
        name: t("settings.actions.reset_nodedb.name"),
        desc: t("settings.actions.reset_nodedb.desc"),
        icon: "mdi:database-remove",
        danger: true,
      },
      {
        id: "factory_reset_config",
        name: t("settings.actions.factory_reset_config.name"),
        desc: t("settings.actions.factory_reset_config.desc"),
        icon: "mdi:cog-refresh",
        danger: true,
      },
      {
        id: "factory_reset_device",
        name: t("settings.actions.factory_reset_device.name"),
        desc: t("settings.actions.factory_reset_device.desc"),
        icon: "mdi:delete-forever",
        danger: true,
      },
      {
        id: "reboot_ota",
        name: t("settings.actions.reboot_ota.name"),
        desc: t("settings.actions.reboot_ota.desc"),
        icon: "mdi:cellphone-arrow-down",
        danger: false,
      },
    ];

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("settings.actions.title")}</h3>
          <p>${t("settings.actions.subtitle")}</p>
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
            <div class="feedback ${this._feedbackError ? "error" : "success"}">
              ${this._feedback}
            </div>
          ` : ""}
        </div>
      </div>

      <mesh-confirm-dialog
        .open=${this._confirmAction != null}
        .title=${this._confirmAction?.name || ""}
        .message=${t(
          this._confirmAction?.danger ? "settings.actions.confirm_message_danger" : "settings.actions.confirm_message",
          { action: (this._confirmAction?.name || "").toLowerCase() }
        )}
        .confirmLabel=${this._confirmAction?.name || t("common.confirm")}
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

    this._feedbackError = !result?.success;
    this._feedback = this._feedbackError
      ? t("settings.actions.command_failed", { action: action.name })
      : t("settings.actions.command_sent", { action: action.name });
    this.requestUpdate();

    setTimeout(() => {
      this._feedback = "";
      this.requestUpdate();
    }, 5000);
  }
}
customElements.define("mesh-settings-actions", MeshSettingsActions);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-storage> — Local data management (#37)
   ══════════════════════════════════════════════════════════ */

class MeshSettingsStorage extends LitElement {
  static get properties() {
    return {
      wsCommand: { type: Object },
      _stats: { type: Object, state: true },
      _confirmAction: { type: Object, state: true },
      _feedback: { type: String, state: true },
      _feedbackError: { type: Boolean, state: true },
    };
  }

  constructor() {
    super();
    this._stats = null;
    this._confirmAction = null;
    this._feedback = "";
    this._feedbackError = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadStats();
  }

  static get styles() {
    return [
      settingsStyles,
      deviceActionStyles,
      dialogStyles,
      css`
        :host { display: block; }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
          margin-bottom: 16px;
        }
        .stat-card {
          background: var(--secondary-background-color);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .stat-num {
          font-size: 22px;
          font-weight: 600;
          color: var(--primary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .stat-label {
          font-size: 11px;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 2px;
        }
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

  async _loadStats() {
    const res = await this.wsCommand("meshtastic_ui/storage_stats");
    if (res) {
      this._stats = res;
      this.requestUpdate();
    }
  }

  render() {
    const s = this._stats || {};
    const actions = [
      {
        id: "clear_messages",
        name: t("settings.storage.clear_messages.name"),
        desc: t("settings.storage.clear_messages.desc"),
        icon: "mdi:message-off",
        danger: true,
        wsType: "meshtastic_ui/clear_messages",
      },
      {
        id: "clear_nodes",
        name: t("settings.storage.clear_nodes.name"),
        desc: t("settings.storage.clear_nodes.desc"),
        icon: "mdi:database-remove",
        danger: true,
        wsType: "meshtastic_ui/clear_nodes",
      },
      {
        id: "clear_all",
        name: t("settings.storage.clear_all.name"),
        desc: t("settings.storage.clear_all.desc"),
        icon: "mdi:delete-sweep",
        danger: true,
        wsType: "meshtastic_ui/clear_all",
      },
    ];

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("settings.storage.title")}</h3>
          <p>${t("settings.storage.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-num">${s.messages ?? "—"}</div>
              <div class="stat-label">${t("settings.storage.stats.messages")}</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${s.conversations ?? "—"}</div>
              <div class="stat-label">${t("settings.storage.stats.conversations")}</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${s.nodes ?? "—"}</div>
              <div class="stat-label">${t("settings.storage.stats.nodes")}</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${s.traceroutes ?? "—"}</div>
              <div class="stat-label">${t("settings.storage.stats.traceroutes")}</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${s.waypoints ?? "—"}</div>
              <div class="stat-label">${t("settings.storage.stats.waypoints")}</div>
            </div>
          </div>

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
            <div class="feedback ${this._feedbackError ? "error" : "success"}">
              ${this._feedback}
            </div>
          ` : ""}
        </div>
      </div>

      <mesh-confirm-dialog
        .open=${this._confirmAction != null}
        .title=${this._confirmAction?.name || ""}
        .message=${t("settings.storage.confirm_message", { action: (this._confirmAction?.name || "").toLowerCase() })}
        .confirmLabel=${this._confirmAction?.name || t("common.confirm")}
        .danger=${true}
        @confirm=${this._executeAction}
        @cancel=${() => { this._confirmAction = null; }}
      ></mesh-confirm-dialog>
    `;
  }

  _requestAction(action) {
    this._confirmAction = action;
  }

  async _executeAction() {
    const action = this._confirmAction;
    if (!action) return;
    this._confirmAction = null;
    this._feedback = "";

    const result = await this.wsCommand(action.wsType);
    if (result != null) {
      this._feedbackError = false;
      this._feedback = t("settings.storage.done", { action: action.name });
      await this._loadStats();
      // Tell the panel to refresh its in-memory caches.
      this.dispatchEvent(new CustomEvent("storage-cleared", {
        detail: { kind: action.id }, bubbles: true, composed: true,
      }));
    } else {
      this._feedbackError = true;
      this._feedback = t("settings.storage.failed", { action: action.name });
    }
    setTimeout(() => { this._feedback = ""; }, 5000);
  }
}
customElements.define("mesh-settings-storage", MeshSettingsStorage);

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
          <h3>${t("settings.device.title")}</h3>
          <p>${t("settings.device.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label=${t("settings.device.device_role")}
              description=${t("settings.device.device_role_desc")}
              .value=${String(d.role || "CLIENT")}
              .options=${translateOptions(DEVICE_ROLES)}
              @change=${(e) => this._updateField("role", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label=${t("settings.device.rebroadcast_mode")}
              description=${t("settings.device.rebroadcast_mode_desc")}
              .value=${String(d.rebroadcast_mode || "ALL")}
              .options=${translateOptions(REBROADCAST_MODES)}
              @change=${(e) => this._updateField("rebroadcast_mode", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label=${t("settings.device.node_info_broadcast_secs")}
              description=${t("settings.device.node_info_broadcast_secs_desc")}
              .value=${d.node_info_broadcast_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("node_info_broadcast_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.device.button_gpio")}
              description=${t("settings.device.button_gpio_desc")}
              .value=${d.button_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("button_gpio", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.device.buzzer_gpio")}
              description=${t("settings.device.buzzer_gpio_desc")}
              .value=${d.buzzer_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("buzzer_gpio", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.device.double_tap_as_button_press")}
              description=${t("settings.device.double_tap_as_button_press_desc")}
              .checked=${d.double_tap_as_button_press === true}
              @change=${(e) => this._updateField("double_tap_as_button_press", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.device.led_heartbeat_disabled")}
              description=${t("settings.device.led_heartbeat_disabled_desc")}
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
          <h3>${t("settings.position.title")}</h3>
          <p>${t("settings.position.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-select
              label=${t("settings.position.gps_mode")}
              description=${t("settings.position.gps_mode_desc")}
              .value=${String(d.gps_mode || "ENABLED")}
              .options=${translateOptions(GPS_MODES)}
              @change=${(e) => this._updateField("gps_mode", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label=${t("settings.position.position_broadcast_secs")}
              description=${t("settings.position.position_broadcast_secs_desc")}
              .value=${d.position_broadcast_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("position_broadcast_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.position.broadcast_smart_min_distance")}
              description=${t("settings.position.broadcast_smart_min_distance_desc")}
              .value=${d.broadcast_smart_minimum_distance ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("broadcast_smart_minimum_distance", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.position.broadcast_smart_min_interval")}
              description=${t("settings.position.broadcast_smart_min_interval_desc")}
              .value=${d.broadcast_smart_minimum_interval_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("broadcast_smart_minimum_interval_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.position.gps_update_interval")}
              description=${t("settings.position.gps_update_interval_desc")}
              .value=${d.gps_update_interval ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("gps_update_interval", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.position.rx_gpio")}
              description=${t("settings.position.rx_gpio_desc")}
              .value=${d.rx_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("rx_gpio", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.position.tx_gpio")}
              description=${t("settings.position.tx_gpio_desc")}
              .value=${d.tx_gpio ?? 0}
              .min=${0}
              .max=${48}
              @change=${(e) => this._updateField("tx_gpio", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.position.fixed_position_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.position.fixed_position")}
              description=${t("settings.position.fixed_position_desc")}
              .checked=${d.fixed_position === true}
              @change=${(e) => this._updateField("fixed_position", e.detail.checked)}
            ></mesh-toggle>
            ${d.fixed_position ? html`
              <div class="form-grid" style="margin-top: 12px;">
                <mesh-number-input
                  label=${t("settings.position.latitude")}
                  .value=${d.fixed_lat ?? 0}
                  .step=${0.000001}
                  @change=${(e) => this._updateField("fixed_lat", e.detail.value)}
                ></mesh-number-input>
                <mesh-number-input
                  label=${t("settings.position.longitude")}
                  .value=${d.fixed_lng ?? 0}
                  .step=${0.000001}
                  @change=${(e) => this._updateField("fixed_lng", e.detail.value)}
                ></mesh-number-input>
                <mesh-number-input
                  label=${t("settings.position.altitude")}
                  .value=${d.fixed_altitude ?? 0}
                  @change=${(e) => this._updateField("fixed_altitude", e.detail.value)}
                ></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.position.smart_position_broadcast")}
              description=${t("settings.position.smart_position_broadcast_desc")}
              .checked=${d.position_broadcast_smart_enabled === true}
              @change=${(e) => this._updateField("position_broadcast_smart_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.position.gps_enabled")}
              description=${t("settings.position.gps_enabled_desc")}
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
          <h3>${t("settings.power.title")}</h3>
          <p>${t("settings.power.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-number-input
              label=${t("settings.power.on_battery_shutdown_after")}
              description=${t("settings.power.on_battery_shutdown_after_desc")}
              .value=${d.on_battery_shutdown_after_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("on_battery_shutdown_after_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.power.min_wake_secs")}
              description=${t("settings.power.min_wake_secs_desc")}
              .value=${d.min_wake_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("min_wake_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.power.light_sleep_interval")}
              description=${t("settings.power.light_sleep_interval_desc")}
              .value=${d.ls_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("ls_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.power.wait_bluetooth_secs")}
              description=${t("settings.power.wait_bluetooth_secs_desc")}
              .value=${d.wait_bluetooth_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("wait_bluetooth_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.power.adc_multiplier_override")}
              description=${t("settings.power.adc_multiplier_override_desc")}
              .value=${d.adc_multiplier_override ?? 0}
              .min=${0}
              .step=${0.01}
              @change=${(e) => this._updateField("adc_multiplier_override", e.detail.value)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.power.power_saving")}
              description=${t("settings.power.power_saving_desc")}
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
          <h3>${t("settings.network.title")}</h3>
          <p>${t("settings.network.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              WiFi
            </div>
            <mesh-toggle
              label=${t("settings.network.wifi_enabled")}
              description=${t("settings.network.wifi_enabled_desc")}
              .checked=${d.wifi_enabled === true}
              @change=${(e) => this._updateField("wifi_enabled", e.detail.checked)}
            ></mesh-toggle>
            ${d.wifi_enabled ? html`
              <div class="form-grid" style="margin-top: 12px;">
                <mesh-text-input
                  label=${t("settings.network.wifi_ssid")}
                  .value=${d.wifi_ssid || ""}
                  placeholder=${t("settings.network.wifi_ssid_placeholder")}
                  @change=${(e) => this._updateField("wifi_ssid", e.detail.value)}
                ></mesh-text-input>
                <mesh-text-input
                  label=${t("settings.network.wifi_password")}
                  type="password"
                  .value=${d.wifi_psk || ""}
                  placeholder=${t("settings.network.wifi_password_placeholder")}
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
              label=${t("settings.network.ethernet_enabled")}
              description=${t("settings.network.ethernet_enabled_desc")}
              .checked=${d.eth_enabled === true}
              @change=${(e) => this._updateField("eth_enabled", e.detail.checked)}
            ></mesh-toggle>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.network.ip_heading")}
            </div>
            <div class="form-grid">
              <mesh-text-input
                label=${t("settings.network.ipv4_address")}
                description=${t("settings.network.ipv4_address_desc")}
                .value=${d.ipv4_config?.ip ? this._intToIp(d.ipv4_config.ip) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, ip: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label=${t("settings.network.gateway")}
                .value=${d.ipv4_config?.gateway ? this._intToIp(d.ipv4_config.gateway) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, gateway: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label=${t("settings.network.subnet_mask")}
                .value=${d.ipv4_config?.subnet ? this._intToIp(d.ipv4_config.subnet) : ""}
                placeholder="255.255.255.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, subnet: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
              <mesh-text-input
                label=${t("settings.network.dns_server")}
                .value=${d.ipv4_config?.dns ? this._intToIp(d.ipv4_config.dns) : ""}
                placeholder="0.0.0.0"
                @change=${(e) => this._updateField("ipv4_config", { ...d.ipv4_config, dns: this._ipToInt(e.detail.value) })}
              ></mesh-text-input>
            </div>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.network.services_heading")}
            </div>
            <div class="form-grid">
              <mesh-text-input
                label=${t("settings.network.ntp_server")}
                description=${t("settings.network.ntp_server_desc")}
                .value=${d.ntp_server || ""}
                placeholder="0.pool.ntp.org"
                @change=${(e) => this._updateField("ntp_server", e.detail.value)}
              ></mesh-text-input>
              <mesh-text-input
                label=${t("settings.network.syslog_server")}
                description=${t("settings.network.syslog_server_desc")}
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
          <h3>${t("settings.display.title")}</h3>
          <p>${t("settings.display.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="form-grid">
            <mesh-number-input
              label=${t("settings.display.screen_on_secs")}
              description=${t("settings.display.screen_on_secs_desc")}
              .value=${d.screen_on_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("screen_on_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-number-input
              label=${t("settings.display.auto_carousel_secs")}
              description=${t("settings.display.auto_carousel_secs_desc")}
              .value=${d.auto_screen_carousel_secs ?? 0}
              .min=${0}
              @change=${(e) => this._updateField("auto_screen_carousel_secs", e.detail.value)}
            ></mesh-number-input>

            <mesh-select
              label=${t("settings.display.display_units")}
              .value=${String(d.units || "METRIC")}
              .options=${translateOptions(DISPLAY_UNITS)}
              @change=${(e) => this._updateField("units", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label=${t("settings.display.display_mode")}
              description=${t("settings.display.display_mode_desc")}
              .value=${String(d.displaymode || "DEFAULT")}
              .options=${translateOptions(DISPLAY_MODES)}
              @change=${(e) => this._updateField("displaymode", e.detail.value)}
            ></mesh-select>

            <mesh-select
              label=${t("settings.display.oled_type")}
              description=${t("settings.display.oled_type_desc")}
              .value=${String(d.oled || "OLED_AUTO")}
              .options=${translateOptions(OLED_TYPES)}
              @change=${(e) => this._updateField("oled", e.detail.value)}
            ></mesh-select>

            <mesh-number-input
              label=${t("settings.display.heading_bold")}
              description=${t("settings.display.heading_bold_desc")}
              .value=${d.heading_bold ? 1 : 0}
              .min=${0}
              .max=${1}
              @change=${(e) => this._updateField("heading_bold", e.detail.value === 1)}
            ></mesh-number-input>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.display.flip_screen")}
              description=${t("settings.display.flip_screen_desc")}
              .checked=${d.flip_screen === true}
              @change=${(e) => this._updateField("flip_screen", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.display.wake_on_tap_or_motion")}
              description=${t("settings.display.wake_on_tap_or_motion_desc")}
              .checked=${d.wake_on_tap_or_motion === true}
              @change=${(e) => this._updateField("wake_on_tap_or_motion", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.display.compass_north_top")}
              description=${t("settings.display.compass_north_top_desc")}
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
          <h3>${t("settings.bluetooth.title")}</h3>
          <p>${t("settings.bluetooth.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <mesh-toggle
              label=${t("settings.bluetooth.bluetooth_enabled")}
              description=${t("settings.bluetooth.bluetooth_enabled_desc")}
              .checked=${d.enabled !== false}
              @change=${(e) => this._updateField("enabled", e.detail.checked)}
            ></mesh-toggle>
          </div>

          ${d.enabled !== false ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select
                  label=${t("settings.bluetooth.pairing_mode")}
                  description=${t("settings.bluetooth.pairing_mode_desc")}
                  .value=${String(d.mode || "RANDOM_PIN")}
                  .options=${translateOptions(BT_PAIRING_MODES)}
                  @change=${(e) => this._updateField("mode", e.detail.value)}
                ></mesh-select>

                ${String(d.mode) === "FIXED_PIN" ? html`
                  <mesh-number-input
                    label=${t("settings.bluetooth.fixed_pin")}
                    description=${t("settings.bluetooth.fixed_pin_desc")}
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

  async _save() {
    // Exclude read-only PKI key fields — sending bytes back causes writeConfig to fail
    const { public_key, private_key, admin_key, ...values } = this._draft;
    this._saving = true;
    this.requestUpdate();
    const result = await this.wsCommand("meshtastic_ui/set_config", {
      section: this._section,
      values,
    });
    this._saving = false;
    if (result?.success) {
      this._dirty = false;
      this.dispatchEvent(new CustomEvent("config-saved", { bubbles: true, composed: true }));
    }
    this.requestUpdate();
  }

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
    const privKey = d.private_key ? t("settings.security.key_set") : t("settings.security.key_not_set");

    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("settings.security.title")}</h3>
          <p>${t("settings.security.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.security.pki_heading")}
            </div>
            <div class="key-section">
              <div class="key-label">${t("settings.security.public_key")}</div>
              <div class="key-display">${pubKey || t("settings.security.key_unavailable")}</div>
            </div>
            <div class="key-section">
              <div class="key-label">${t("settings.security.private_key")}</div>
              <div class="key-display">${privKey}</div>
            </div>
          </div>

          <div class="settings-section">
            <div class="form-grid">
              <mesh-number-input
                label=${t("settings.security.admin_channel_index")}
                description=${t("settings.security.admin_channel_index_desc")}
                .value=${d.admin_channel_enabled ?? 0}
                .min=${0}
                .max=${7}
                @change=${(e) => this._updateField("admin_channel_enabled", e.detail.value)}
              ></mesh-number-input>
            </div>
          </div>

          <div class="settings-section">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">
              ${t("settings.options_heading")}
            </div>
            <mesh-toggle
              label=${t("settings.security.debug_log_enabled")}
              description=${t("settings.security.debug_log_enabled_desc")}
              .checked=${d.debug_log_api_enabled === true}
              @change=${(e) => this._updateField("debug_log_api_enabled", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.security.admin_key_required")}
              description=${t("settings.security.admin_key_required_desc")}
              .checked=${d.is_managed === true}
              @change=${(e) => this._updateField("is_managed", e.detail.checked)}
            ></mesh-toggle>
            <mesh-toggle
              label=${t("settings.security.serial_console_disabled")}
              description=${t("settings.security.serial_console_disabled_desc")}
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

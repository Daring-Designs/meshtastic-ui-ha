import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";
import "./components.js";
import { t } from "./i18n.js";
import {
  settingsStyles,
  formStyles,
  saveBarStyles,
} from "./styles.js";

/* ── Enum maps ── */

const SERIAL_BAUD_RATES = [
  { value: "BAUD_DEFAULT", labelKey: "modules.options.default" },
  { value: "BAUD_110", label: "110" },
  { value: "BAUD_300", label: "300" },
  { value: "BAUD_600", label: "600" },
  { value: "BAUD_1200", label: "1200" },
  { value: "BAUD_2400", label: "2400" },
  { value: "BAUD_4800", label: "4800" },
  { value: "BAUD_9600", label: "9600" },
  { value: "BAUD_19200", label: "19200" },
  { value: "BAUD_38400", label: "38400" },
  { value: "BAUD_57600", label: "57600" },
  { value: "BAUD_115200", label: "115200" },
  { value: "BAUD_230400", label: "230400" },
  { value: "BAUD_460800", label: "460800" },
  { value: "BAUD_576000", label: "576000" },
  { value: "BAUD_921600", label: "921600" },
];

const SERIAL_MODES = [
  { value: "DEFAULT", labelKey: "modules.options.default" },
  { value: "SIMPLE", labelKey: "modules.options.simple" },
  { value: "PROTO", label: "Protobuf" },
  { value: "TEXTMSG", labelKey: "modules.options.text_message" },
  { value: "NMEA", label: "NMEA" },
  { value: "CALTOPO", label: "CalTopo" },
];

const CANNED_MSG_INPUT_EVENTS = [
  { value: "NONE", labelKey: "common.none" },
  { value: "UP_DOWN_SELECT", labelKey: "modules.options.up_down_select" },
  { value: "ROTARY", labelKey: "modules.options.rotary_encoder" },
];

const CODEC2_RATES = [
  { value: "CODEC2_DEFAULT", labelKey: "modules.options.default" },
  { value: "CODEC2_3200", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "3200" } },
  { value: "CODEC2_2400", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "2400" } },
  { value: "CODEC2_1600", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "1600" } },
  { value: "CODEC2_1400", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "1400" } },
  { value: "CODEC2_1300", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "1300" } },
  { value: "CODEC2_1200", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "1200" } },
  { value: "CODEC2_700B", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "700B" } },
  { value: "CODEC2_700", labelKey: "modules.options.bitrate_bps", labelParams: { rate: "700" } },
];

/**
 * Resolve option labels at render time. The constants above are evaluated at
 * import, before the panel sets the language, so they carry a labelKey (plus
 * optional labelParams) instead of a translated label. Numeric labels stay literal.
 */
function translateOptions(options) {
  return options.map((option) => ({
    value: option.value,
    label: option.labelKey ? t(option.labelKey, option.labelParams) : option.label,
  }));
}

/** Split a translated string on {placeholder} tokens and swap in Lit templates. */
function withTemplates(text, parts) {
  return text.split(/(\{\w+\})/).map((piece) => {
    const match = piece.match(/^\{(\w+)\}$/);
    return match && match[1] in parts ? parts[match[1]] : piece;
  });
}

/* ── Base class for module config panels ── */

class ModuleConfigPanel extends LitElement {
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
        .info-banner {
          background: var(--secondary-background-color);
          border-left: 3px solid var(--info-color, #2196f3);
          padding: 10px 12px;
          border-radius: 4px;
          font-size: 12px;
          line-height: 1.5;
          margin-bottom: 12px;
          color: var(--primary-text-color);
        }
        .info-banner code {
          background: var(--code-editor-background-color, rgba(0,0,0,0.15));
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
          font-family: var(--code-font-family, monospace);
        }
        .quick-presets {
          margin-top: 8px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .quick-preset {
          padding: 3px 10px;
          border-radius: 12px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .quick-preset:hover {
          background: var(--primary-color);
          color: var(--text-primary-color);
          border-color: var(--primary-color);
        }
      `,
    ];
  }

  /** Subclasses override — the config section name for set_config */
  get _section() { return ""; }

  /** Path in module_config to read from */
  get _configPath() { return this._section; }

  updated(changedProps) {
    if (changedProps.has("config") && this.config && !this._dirty) {
      this._resetDraft();
    }
  }

  _resetDraft() {
    const src = this.config?.module_config?.[this._configPath] || {};
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

  /** Helper: section title */
  _sectionTitle(text) {
    return html`<div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--secondary-text-color); letter-spacing: 0.5px; margin-bottom: 12px;">${text}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════
   <mesh-settings-mqtt>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsMqtt extends ModuleConfigPanel {
  get _section() { return "mqtt"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.mqtt.title")}</h3>
          <p>${t("modules.mqtt.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle
            label=${t("modules.mqtt.enabled")}
            description=${t("modules.mqtt.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}
          ></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle(t("modules.mqtt.broker"))}
              <div class="form-grid">
                <mesh-text-input label=${t("modules.mqtt.address")} description=${t("modules.mqtt.address_desc")}
                  .value=${d.address || ""} placeholder="mqtt.meshtastic.org"
                  @change=${(e) => this._updateField("address", e.detail.value)}></mesh-text-input>
                <mesh-number-input label=${t("modules.mqtt.port")} .value=${d.port ?? 1883} .min=${1} .max=${65535}
                  @change=${(e) => this._updateField("port", e.detail.value)}></mesh-number-input>
                <mesh-text-input label=${t("modules.mqtt.username")} .value=${d.username || ""}
                  @change=${(e) => this._updateField("username", e.detail.value)}></mesh-text-input>
                <mesh-text-input label=${t("modules.mqtt.password")} type="password" .value=${d.password || ""}
                  @change=${(e) => this._updateField("password", e.detail.value)}></mesh-text-input>
                <mesh-text-input label=${t("modules.mqtt.root_topic")} description=${t("modules.mqtt.root_topic_desc")}
                  .value=${d.root || ""} placeholder="msh"
                  @change=${(e) => this._updateField("root", e.detail.value)}></mesh-text-input>
              </div>
            </div>

            <div class="settings-section">
              ${this._sectionTitle(t("modules.mqtt.options"))}
              <mesh-toggle label=${t("modules.mqtt.encryption")} description=${t("modules.mqtt.encryption_desc")}
                .checked=${d.encryption_enabled === true}
                @change=${(e) => this._updateField("encryption_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.mqtt.json")} description=${t("modules.mqtt.json_desc")}
                .checked=${d.json_enabled === true}
                @change=${(e) => this._updateField("json_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.mqtt.tls")} description=${t("modules.mqtt.tls_desc")}
                .checked=${d.tls_enabled === true}
                @change=${(e) => this._updateField("tls_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.mqtt.proxy_to_client")} description=${t("modules.mqtt.proxy_to_client_desc")}
                .checked=${d.proxy_to_client_enabled === true}
                @change=${(e) => this._updateField("proxy_to_client_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.mqtt.map_reporting")} description=${t("modules.mqtt.map_reporting_desc")}
                .checked=${d.map_reporting_enabled === true}
                @change=${(e) => this._updateField("map_reporting_enabled", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-mqtt", MeshSettingsMqtt);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-serial>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsSerial extends ModuleConfigPanel {
  get _section() { return "serial"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.serial.title")}</h3>
          <p>${t("modules.serial.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.serial.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select label=${t("modules.serial.baud_rate")} .value=${String(d.baud || "BAUD_DEFAULT")}
                  .options=${translateOptions(SERIAL_BAUD_RATES)}
                  @change=${(e) => this._updateField("baud", e.detail.value)}></mesh-select>
                <mesh-select label=${t("modules.serial.mode")} description=${t("modules.serial.mode_desc")}
                  .value=${String(d.mode || "DEFAULT")}
                  .options=${translateOptions(SERIAL_MODES)}
                  @change=${(e) => this._updateField("mode", e.detail.value)}></mesh-select>
                <mesh-number-input label=${t("modules.serial.rx_gpio")} .value=${d.rxd ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("rxd", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.serial.tx_gpio")} .value=${d.txd ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("txd", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.serial.timeout")} description=${t("modules.serial.timeout_desc")}
                  .value=${d.timeout ?? 0} .min=${0}
                  @change=${(e) => this._updateField("timeout", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label=${t("modules.serial.echo")} description=${t("modules.serial.echo_desc")}
                .checked=${d.echo === true}
                @change=${(e) => this._updateField("echo", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.serial.override_console")}
                description=${t("modules.serial.override_console_desc")}
                .checked=${d.override_console_serial_port === true}
                @change=${(e) => this._updateField("override_console_serial_port", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-serial", MeshSettingsSerial);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-ext-notification>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsExtNotification extends ModuleConfigPanel {
  get _section() { return "external_notification"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.ext_notification.title")}</h3>
          <p>${t("modules.ext_notification.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.ext_notification.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle(t("modules.ext_notification.output"))}
              <div class="form-grid">
                <mesh-number-input label=${t("modules.ext_notification.output_gpio")} description=${t("modules.ext_notification.output_gpio_desc")}
                  .value=${d.output ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ext_notification.output_vibra")} description=${t("modules.ext_notification.output_vibra_desc")}
                  .value=${d.output_vibra ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output_vibra", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ext_notification.output_buzzer")} description=${t("modules.ext_notification.output_buzzer_desc")}
                  .value=${d.output_buzzer ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output_buzzer", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ext_notification.nag_timeout")} description=${t("modules.ext_notification.nag_timeout_desc")}
                  .value=${d.nag_timeout ?? 0} .min=${0}
                  @change=${(e) => this._updateField("nag_timeout", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ext_notification.output_ms")} description=${t("modules.ext_notification.output_ms_desc")}
                  .value=${d.output_ms ?? 0} .min=${0}
                  @change=${(e) => this._updateField("output_ms", e.detail.value)}></mesh-number-input>
              </div>
            </div>

            <div class="settings-section">
              ${this._sectionTitle(t("modules.ext_notification.triggers"))}
              <mesh-toggle label=${t("modules.ext_notification.alert_message")} description=${t("modules.ext_notification.alert_message_desc")}
                .checked=${d.alert_message === true}
                @change=${(e) => this._updateField("alert_message", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.alert_message_buzzer")} description=${t("modules.ext_notification.alert_message_buzzer_desc")}
                .checked=${d.alert_message_buzzer === true}
                @change=${(e) => this._updateField("alert_message_buzzer", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.alert_message_vibra")} description=${t("modules.ext_notification.alert_message_vibra_desc")}
                .checked=${d.alert_message_vibra === true}
                @change=${(e) => this._updateField("alert_message_vibra", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.alert_bell")} description=${t("modules.ext_notification.alert_bell_desc")}
                .checked=${d.alert_bell === true}
                @change=${(e) => this._updateField("alert_bell", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.alert_bell_buzzer")}
                .checked=${d.alert_bell_buzzer === true}
                @change=${(e) => this._updateField("alert_bell_buzzer", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.alert_bell_vibra")}
                .checked=${d.alert_bell_vibra === true}
                @change=${(e) => this._updateField("alert_bell_vibra", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.use_pwm")} description=${t("modules.ext_notification.use_pwm_desc")}
                .checked=${d.use_pwm === true}
                @change=${(e) => this._updateField("use_pwm", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.ext_notification.active_high")} description=${t("modules.ext_notification.active_high_desc")}
                .checked=${d.active === true}
                @change=${(e) => this._updateField("active", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-ext-notification", MeshSettingsExtNotification);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-store-forward>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsStoreForward extends ModuleConfigPanel {
  get _section() { return "store_forward"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.store_forward.title")}</h3>
          <p>${t("modules.store_forward.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.store_forward.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.store_forward.records")} description=${t("modules.store_forward.records_desc")}
                  .value=${d.records ?? 0} .min=${0}
                  @change=${(e) => this._updateField("records", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.store_forward.history_return_max")}
                  description=${t("modules.store_forward.history_return_max_desc")}
                  .value=${d.history_return_max ?? 0} .min=${0}
                  @change=${(e) => this._updateField("history_return_max", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.store_forward.history_return_window")}
                  description=${t("modules.store_forward.history_return_window_desc")}
                  .value=${d.history_return_window ?? 0} .min=${0}
                  @change=${(e) => this._updateField("history_return_window", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label=${t("modules.store_forward.heartbeat")} description=${t("modules.store_forward.heartbeat_desc")}
                .checked=${d.heartbeat === true}
                @change=${(e) => this._updateField("heartbeat", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.store_forward.is_server")} description=${t("modules.store_forward.is_server_desc")}
                .checked=${d.is_server === true}
                @change=${(e) => this._updateField("is_server", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-store-forward", MeshSettingsStoreForward);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-range-test>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsRangeTest extends ModuleConfigPanel {
  get _section() { return "range_test"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.range_test.title")}</h3>
          <p>${t("modules.range_test.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.range_test.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.range_test.sender_interval")}
                  description=${t("modules.range_test.sender_interval_desc")}
                  .value=${d.sender ?? 0} .min=${0}
                  @change=${(e) => this._updateField("sender", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label=${t("modules.range_test.save_to_file")} description=${t("modules.range_test.save_to_file_desc")}
                .checked=${d.save === true}
                @change=${(e) => this._updateField("save", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-range-test", MeshSettingsRangeTest);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-telemetry>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsTelemetry extends ModuleConfigPanel {
  get _section() { return "telemetry"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.telemetry.title")}</h3>
          <p>${t("modules.telemetry.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            ${this._sectionTitle(t("modules.telemetry.device_metrics"))}
            <div class="info-banner">
              <strong>${t("modules.telemetry.banner_title")}</strong>
              ${withTemplates(t("modules.telemetry.banner_default"), { default: html`<code>3600</code>` })}
              ${withTemplates(t("modules.telemetry.banner_advice"), {
                five: html`<code>300</code>`,
                ten: html`<code>600</code>`,
              })}
              <div class="quick-presets">
                <button class="quick-preset" type="button"
                  @click=${() => this._updateField("device_update_interval", 300)}>${t("modules.telemetry.preset_minutes", { minutes: 5 })}</button>
                <button class="quick-preset" type="button"
                  @click=${() => this._updateField("device_update_interval", 600)}>${t("modules.telemetry.preset_minutes", { minutes: 10 })}</button>
                <button class="quick-preset" type="button"
                  @click=${() => this._updateField("device_update_interval", 1800)}>${t("modules.telemetry.preset_minutes", { minutes: 30 })}</button>
              </div>
            </div>
            <div class="form-grid">
              <mesh-number-input label=${t("modules.update_interval_secs")}
                description=${t("modules.telemetry.device_update_interval_desc")}
                .value=${d.device_update_interval ?? 0} .min=${0}
                @change=${(e) => this._updateField("device_update_interval", e.detail.value)}></mesh-number-input>
            </div>
          </div>

          <div class="settings-section">
            ${this._sectionTitle(t("modules.telemetry.environment"))}
            <mesh-toggle label=${t("modules.telemetry.environment_enabled")}
              description=${t("modules.telemetry.environment_enabled_desc")}
              .checked=${d.environment_measurement_enabled === true}
              @change=${(e) => this._updateField("environment_measurement_enabled", e.detail.checked)}></mesh-toggle>
            ${d.environment_measurement_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label=${t("modules.telemetry.environment_interval")}
                  .value=${d.environment_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("environment_update_interval", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.telemetry.environment_screen")}
                  description=${t("modules.telemetry.show_on_screen_desc")}
                  .value=${d.environment_screen_enabled ? 1 : 0} .min=${0} .max=${1}
                  @change=${(e) => this._updateField("environment_screen_enabled", e.detail.value === 1)}></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            ${this._sectionTitle(t("modules.telemetry.air_quality"))}
            <mesh-toggle label=${t("modules.telemetry.air_quality_enabled")}
              description=${t("modules.telemetry.air_quality_enabled_desc")}
              .checked=${d.air_quality_enabled === true}
              @change=${(e) => this._updateField("air_quality_enabled", e.detail.checked)}></mesh-toggle>
            ${d.air_quality_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label=${t("modules.telemetry.air_quality_interval")}
                  .value=${d.air_quality_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("air_quality_interval", e.detail.value)}></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            ${this._sectionTitle(t("modules.telemetry.power_metrics"))}
            <mesh-toggle label=${t("modules.telemetry.power_enabled")}
              description=${t("modules.telemetry.power_enabled_desc")}
              .checked=${d.power_measurement_enabled === true}
              @change=${(e) => this._updateField("power_measurement_enabled", e.detail.checked)}></mesh-toggle>
            ${d.power_measurement_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label=${t("modules.telemetry.power_interval")}
                  .value=${d.power_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("power_update_interval", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.telemetry.power_screen")}
                  description=${t("modules.telemetry.show_on_screen_desc")}
                  .value=${d.power_screen_enabled ? 1 : 0} .min=${0} .max=${1}
                  @change=${(e) => this._updateField("power_screen_enabled", e.detail.value === 1)}></mesh-number-input>
              </div>
            ` : ""}
          </div>
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-telemetry", MeshSettingsTelemetry);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-canned-message>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsCannedMessage extends ModuleConfigPanel {
  get _section() { return "canned_message"; }

  static get styles() {
    return [
      settingsStyles,
      formStyles,
      saveBarStyles,
      css`
        :host { display: block; }
        textarea {
          width: 100%;
          min-height: 120px;
          padding: 10px 12px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-size: 14px;
          font-family: monospace;
          outline: none;
          resize: vertical;
          box-sizing: border-box;
        }
        textarea:focus { border-color: var(--primary-color); }
      `,
    ];
  }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.canned_message.title")}</h3>
          <p>${t("modules.canned_message.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.canned_message.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle(t("modules.canned_message.messages"))}
              <div style="margin-bottom: 4px; font-size: 12px; color: var(--secondary-text-color);">
                ${t("modules.canned_message.messages_help")}
              </div>
              <textarea
                .value=${d.messages || ""}
                @input=${(e) => this._updateField("messages", e.target.value)}
                placeholder=${t("modules.canned_message.messages_placeholder")}
              ></textarea>
            </div>

            <div class="settings-section">
              ${this._sectionTitle(t("modules.canned_message.input_source"))}
              <div class="form-grid">
                <mesh-select label=${t("modules.canned_message.input_event_source")}
                  .value=${String(d.inputbroker_event_cw || "NONE")}
                  .options=${translateOptions(CANNED_MSG_INPUT_EVENTS)}
                  @change=${(e) => this._updateField("inputbroker_event_cw", e.detail.value)}></mesh-select>
                <mesh-number-input label=${t("modules.canned_message.pin_a")} description=${t("modules.canned_message.pin_a_desc")}
                  .value=${d.inputbroker_pin_a ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_a", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.canned_message.pin_b")} description=${t("modules.canned_message.pin_b_desc")}
                  .value=${d.inputbroker_pin_b ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_b", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.canned_message.pin_press")} description=${t("modules.canned_message.pin_press_desc")}
                  .value=${d.inputbroker_pin_press ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_press", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label=${t("modules.canned_message.rotary_enabled")}
                .checked=${d.rotary1_enabled === true}
                @change=${(e) => this._updateField("rotary1_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.canned_message.updown_enabled")}
                .checked=${d.updown1_enabled === true}
                @change=${(e) => this._updateField("updown1_enabled", e.detail.checked)}></mesh-toggle>
            </div>

            <div class="settings-section">
              <div class="form-grid">
                <mesh-toggle label=${t("modules.canned_message.send_bell")} description=${t("modules.canned_message.send_bell_desc")}
                  .checked=${d.send_bell === true}
                  @change=${(e) => this._updateField("send_bell", e.detail.checked)}></mesh-toggle>
              </div>
              <mesh-toggle label=${t("modules.canned_message.allow_input_source")} description=${t("modules.canned_message.allow_input_source_desc")}
                .checked=${d.allow_input_source === true}
                @change=${(e) => this._updateField("allow_input_source", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-canned-message", MeshSettingsCannedMessage);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-audio>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsAudio extends ModuleConfigPanel {
  get _section() { return "audio"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.audio.title")}</h3>
          <p>${t("modules.audio.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("modules.audio.codec2_enabled")} description=${t("modules.audio.codec2_enabled_desc")}
            .checked=${d.codec2_enabled === true}
            @change=${(e) => this._updateField("codec2_enabled", e.detail.checked)}></mesh-toggle>

          ${d.codec2_enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select label=${t("modules.audio.bitrate")} description=${t("modules.audio.bitrate_desc")}
                  .value=${String(d.bitrate || "CODEC2_DEFAULT")}
                  .options=${translateOptions(CODEC2_RATES)}
                  @change=${(e) => this._updateField("bitrate", e.detail.value)}></mesh-select>
                <mesh-number-input label=${t("modules.audio.ptt_gpio")} description=${t("modules.audio.ptt_gpio_desc")}
                  .value=${d.ptt_pin ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("ptt_pin", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="I2S WS GPIO"
                  .value=${d.i2s_ws ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("i2s_ws", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="I2S SD GPIO"
                  .value=${d.i2s_sd ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("i2s_sd", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="I2S DIN GPIO"
                  .value=${d.i2s_din ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("i2s_din", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="I2S SCK GPIO"
                  .value=${d.i2s_sck ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("i2s_sck", e.detail.value)}></mesh-number-input>
              </div>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-audio", MeshSettingsAudio);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-neighbor-info>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsNeighborInfo extends ModuleConfigPanel {
  get _section() { return "neighbor_info"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.neighbor_info.title")}</h3>
          <p>${t("modules.neighbor_info.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.neighbor_info.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.update_interval_secs")}
                  description=${t("modules.neighbor_info.update_interval_desc")}
                  .value=${d.update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("update_interval", e.detail.value)}></mesh-number-input>
              </div>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-neighbor-info", MeshSettingsNeighborInfo);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-ambient-lighting>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsAmbientLighting extends ModuleConfigPanel {
  get _section() { return "ambient_lighting"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.ambient_lighting.title")}</h3>
          <p>${t("modules.ambient_lighting.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("modules.ambient_lighting.led_state")} description=${t("modules.ambient_lighting.led_state_desc")}
            .checked=${d.led_state === true}
            @change=${(e) => this._updateField("led_state", e.detail.checked)}></mesh-toggle>

          ${d.led_state ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.ambient_lighting.red")} description=${t("modules.ambient_lighting.red_desc")}
                  .value=${d.red ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("red", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ambient_lighting.green")} description=${t("modules.ambient_lighting.green_desc")}
                  .value=${d.green ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("green", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ambient_lighting.blue")} description=${t("modules.ambient_lighting.blue_desc")}
                  .value=${d.blue ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("blue", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.ambient_lighting.current")} description=${t("modules.ambient_lighting.current_desc")}
                  .value=${d.current ?? 0} .min=${0} .max=${31}
                  @change=${(e) => this._updateField("current", e.detail.value)}></mesh-number-input>
              </div>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-ambient-lighting", MeshSettingsAmbientLighting);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-detection-sensor>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsDetectionSensor extends ModuleConfigPanel {
  get _section() { return "detection_sensor"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.detection_sensor.title")}</h3>
          <p>${t("modules.detection_sensor.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.detection_sensor.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.detection_sensor.monitor_pin")} description=${t("modules.detection_sensor.monitor_pin_desc")}
                  .value=${d.monitor_pin ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("monitor_pin", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.detection_sensor.min_broadcast_secs")}
                  description=${t("modules.detection_sensor.min_broadcast_secs_desc")}
                  .value=${d.minimum_broadcast_secs ?? 0} .min=${0}
                  @change=${(e) => this._updateField("minimum_broadcast_secs", e.detail.value)}></mesh-number-input>
                <mesh-number-input label=${t("modules.detection_sensor.state_broadcast_secs")}
                  description=${t("modules.detection_sensor.state_broadcast_secs_desc")}
                  .value=${d.state_broadcast_secs ?? 0} .min=${0}
                  @change=${(e) => this._updateField("state_broadcast_secs", e.detail.value)}></mesh-number-input>
                <mesh-text-input label=${t("modules.detection_sensor.triggered_high")}
                  description=${t("modules.detection_sensor.triggered_high_desc")}
                  .value=${d.detection_triggered_high || ""}
                  @change=${(e) => this._updateField("detection_triggered_high", e.detail.value)}></mesh-text-input>
                <mesh-text-input label=${t("modules.detection_sensor.triggered_low")}
                  description=${t("modules.detection_sensor.triggered_low_desc")}
                  .value=${d.detection_triggered_low || ""}
                  @change=${(e) => this._updateField("detection_triggered_low", e.detail.value)}></mesh-text-input>
              </div>
              <mesh-toggle label=${t("modules.detection_sensor.send_bell")} description=${t("modules.detection_sensor.send_bell_desc")}
                .checked=${d.send_bell === true}
                @change=${(e) => this._updateField("send_bell", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label=${t("modules.detection_sensor.use_pullup")} description=${t("modules.detection_sensor.use_pullup_desc")}
                .checked=${d.use_pullup === true}
                @change=${(e) => this._updateField("use_pullup", e.detail.checked)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-detection-sensor", MeshSettingsDetectionSensor);

/* ══════════════════════════════════════════════════════════
   <mesh-settings-paxcounter>
   ══════════════════════════════════════════════════════════ */

class MeshSettingsPaxcounter extends ModuleConfigPanel {
  get _section() { return "paxcounter"; }

  render() {
    const d = this._draft;
    return html`
      <div class="settings-panel">
        <div class="settings-panel-header">
          <h3>${t("modules.paxcounter.title")}</h3>
          <p>${t("modules.paxcounter.subtitle")}</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label=${t("common.enabled")} description=${t("modules.paxcounter.enabled_desc")}
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label=${t("modules.update_interval_secs")}
                  description=${t("modules.paxcounter.update_interval_desc")}
                  .value=${d.paxcounter_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("paxcounter_update_interval", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label=${t("modules.paxcounter.wifi_threshold")}
                description=${t("modules.paxcounter.wifi_threshold_desc")}
                .checked=${d.wifi_threshold !== 0}
                @change=${(e) => this._updateField("wifi_threshold", e.detail.checked ? -80 : 0)}></mesh-toggle>
              <mesh-toggle label=${t("modules.paxcounter.ble_threshold")}
                description=${t("modules.paxcounter.ble_threshold_desc")}
                .checked=${d.ble_threshold !== 0}
                @change=${(e) => this._updateField("ble_threshold", e.detail.checked ? -80 : 0)}></mesh-toggle>
            </div>
          ` : ""}
        </div>
        <mesh-save-bar .dirty=${this._dirty} .saving=${this._saving}
          @save=${this._save} @discard=${this._resetDraft}></mesh-save-bar>
      </div>
    `;
  }
}
customElements.define("mesh-settings-paxcounter", MeshSettingsPaxcounter);

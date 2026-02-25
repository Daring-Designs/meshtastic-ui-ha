import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";
import "./components.js";
import {
  settingsStyles,
  formStyles,
  saveBarStyles,
} from "./styles.js";

/* ── Enum maps ── */

const SERIAL_BAUD_RATES = [
  { value: "BAUD_DEFAULT", label: "Default" },
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
  { value: "DEFAULT", label: "Default" },
  { value: "SIMPLE", label: "Simple" },
  { value: "PROTO", label: "Protobuf" },
  { value: "TEXTMSG", label: "Text Message" },
  { value: "NMEA", label: "NMEA" },
  { value: "CALTOPO", label: "CalTopo" },
];

const CANNED_MSG_INPUT_EVENTS = [
  { value: "NONE", label: "None" },
  { value: "UP_DOWN_SELECT", label: "Up/Down/Select" },
  { value: "ROTARY", label: "Rotary Encoder" },
];

const CODEC2_RATES = [
  { value: "CODEC2_DEFAULT", label: "Default" },
  { value: "CODEC2_3200", label: "3200 bps" },
  { value: "CODEC2_2400", label: "2400 bps" },
  { value: "CODEC2_1600", label: "1600 bps" },
  { value: "CODEC2_1400", label: "1400 bps" },
  { value: "CODEC2_1300", label: "1300 bps" },
  { value: "CODEC2_1200", label: "1200 bps" },
  { value: "CODEC2_700B", label: "700B bps" },
  { value: "CODEC2_700", label: "700 bps" },
];

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
      css` :host { display: block; } `,
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
          <h3>MQTT Configuration</h3>
          <p>Configure MQTT broker connection, encryption, and map reporting.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle
            label="MQTT Enabled"
            description="Enable MQTT client on this device"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}
          ></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle("Broker")}
              <div class="form-grid">
                <mesh-text-input label="Address" description="MQTT broker hostname or IP"
                  .value=${d.address || ""} placeholder="mqtt.meshtastic.org"
                  @change=${(e) => this._updateField("address", e.detail.value)}></mesh-text-input>
                <mesh-number-input label="Port" .value=${d.port ?? 1883} .min=${1} .max=${65535}
                  @change=${(e) => this._updateField("port", e.detail.value)}></mesh-number-input>
                <mesh-text-input label="Username" .value=${d.username || ""}
                  @change=${(e) => this._updateField("username", e.detail.value)}></mesh-text-input>
                <mesh-text-input label="Password" .value=${d.password || ""}
                  @change=${(e) => this._updateField("password", e.detail.value)}></mesh-text-input>
                <mesh-text-input label="Root Topic" description="MQTT root topic"
                  .value=${d.root || ""} placeholder="msh"
                  @change=${(e) => this._updateField("root", e.detail.value)}></mesh-text-input>
              </div>
            </div>

            <div class="settings-section">
              ${this._sectionTitle("Options")}
              <mesh-toggle label="Encryption Enabled" description="Encrypt MQTT traffic"
                .checked=${d.encryption_enabled === true}
                @change=${(e) => this._updateField("encryption_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="JSON Enabled" description="Send JSON-formatted messages to MQTT"
                .checked=${d.json_enabled === true}
                @change=${(e) => this._updateField("json_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="TLS Enabled" description="Use TLS for broker connection"
                .checked=${d.tls_enabled === true}
                @change=${(e) => this._updateField("tls_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Proxy to Client Enabled" description="Proxy MQTT traffic through connected client"
                .checked=${d.proxy_to_client_enabled === true}
                @change=${(e) => this._updateField("proxy_to_client_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Map Reporting Enabled" description="Report position to the Meshtastic map"
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
          <h3>Serial Module</h3>
          <p>Configure the serial interface module for external device communication.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable serial module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select label="Baud Rate" .value=${String(d.baud || "BAUD_DEFAULT")}
                  .options=${SERIAL_BAUD_RATES}
                  @change=${(e) => this._updateField("baud", e.detail.value)}></mesh-select>
                <mesh-select label="Mode" description="Serial communication protocol"
                  .value=${String(d.mode || "DEFAULT")}
                  .options=${SERIAL_MODES}
                  @change=${(e) => this._updateField("mode", e.detail.value)}></mesh-select>
                <mesh-number-input label="RX GPIO" .value=${d.rxd ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("rxd", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="TX GPIO" .value=${d.txd ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("txd", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Timeout (ms)" description="Serial timeout in milliseconds"
                  .value=${d.timeout ?? 0} .min=${0}
                  @change=${(e) => this._updateField("timeout", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="Echo" description="Echo received serial data back"
                .checked=${d.echo === true}
                @change=${(e) => this._updateField("echo", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Override Console Serial Port"
                description="Use the main serial port for this module"
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
          <h3>External Notification</h3>
          <p>Configure buzzer, vibration motor, and LED notifications.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable external notification module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle("Output")}
              <div class="form-grid">
                <mesh-number-input label="Output GPIO" description="GPIO pin for notification output"
                  .value=${d.output ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Output Vibra GPIO" description="GPIO for vibration motor"
                  .value=${d.output_vibra ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output_vibra", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Output Buzzer GPIO" description="GPIO for piezo buzzer"
                  .value=${d.output_buzzer ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("output_buzzer", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Nag Timeout (secs)" description="Repeat notification interval (0 = once)"
                  .value=${d.nag_timeout ?? 0} .min=${0}
                  @change=${(e) => this._updateField("nag_timeout", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Output Duration (ms)" description="Notification pulse duration"
                  .value=${d.output_ms ?? 0} .min=${0}
                  @change=${(e) => this._updateField("output_ms", e.detail.value)}></mesh-number-input>
              </div>
            </div>

            <div class="settings-section">
              ${this._sectionTitle("Triggers")}
              <mesh-toggle label="Alert on Message" description="Notify on incoming messages"
                .checked=${d.alert_message === true}
                @change=${(e) => this._updateField("alert_message", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Alert on Message Buzzer" description="Use buzzer for message alerts"
                .checked=${d.alert_message_buzzer === true}
                @change=${(e) => this._updateField("alert_message_buzzer", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Alert on Message Vibra" description="Use vibration for message alerts"
                .checked=${d.alert_message_vibra === true}
                @change=${(e) => this._updateField("alert_message_vibra", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Alert on Bell" description="Notify on bell character"
                .checked=${d.alert_bell === true}
                @change=${(e) => this._updateField("alert_bell", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Alert on Bell Buzzer"
                .checked=${d.alert_bell_buzzer === true}
                @change=${(e) => this._updateField("alert_bell_buzzer", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Alert on Bell Vibra"
                .checked=${d.alert_bell_vibra === true}
                @change=${(e) => this._updateField("alert_bell_vibra", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Use PWM Buzzer" description="Drive buzzer with PWM for tones"
                .checked=${d.use_pwm === true}
                @change=${(e) => this._updateField("use_pwm", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Active High" description="Output is active-high (vs active-low)"
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
          <h3>Store & Forward</h3>
          <p>Store messages and forward them to nodes that come online later.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Store & Forward module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Records" description="Number of messages to store (0 = auto)"
                  .value=${d.records ?? 0} .min=${0}
                  @change=${(e) => this._updateField("records", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="History Return Max"
                  description="Max messages to return on request"
                  .value=${d.history_return_max ?? 0} .min=${0}
                  @change=${(e) => this._updateField("history_return_max", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="History Return Window (secs)"
                  description="Time window for history requests"
                  .value=${d.history_return_window ?? 0} .min=${0}
                  @change=${(e) => this._updateField("history_return_window", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="Heartbeat" description="Send periodic heartbeat to clients"
                .checked=${d.heartbeat === true}
                @change=${(e) => this._updateField("heartbeat", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Is Server" description="Act as the S&F server for the mesh"
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
          <h3>Range Test</h3>
          <p>Send periodic test messages to measure range and link quality.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Range Test module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Sender Interval (secs)"
                  description="Seconds between test messages (0 = receive only)"
                  .value=${d.sender ?? 0} .min=${0}
                  @change=${(e) => this._updateField("sender", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="Save to File" description="Save received test data to file"
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
          <h3>Telemetry</h3>
          <p>Configure device metrics, environment, air quality, and power telemetry intervals.</p>
        </div>
        <div class="settings-panel-body">
          <div class="settings-section">
            ${this._sectionTitle("Device Metrics")}
            <div class="form-grid">
              <mesh-number-input label="Update Interval (secs)"
                description="How often to broadcast device metrics (0 = default)"
                .value=${d.device_update_interval ?? 0} .min=${0}
                @change=${(e) => this._updateField("device_update_interval", e.detail.value)}></mesh-number-input>
            </div>
          </div>

          <div class="settings-section">
            ${this._sectionTitle("Environment")}
            <mesh-toggle label="Environment Measurement Enabled"
              description="Enable environment sensor readings"
              .checked=${d.environment_measurement_enabled === true}
              @change=${(e) => this._updateField("environment_measurement_enabled", e.detail.checked)}></mesh-toggle>
            ${d.environment_measurement_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label="Environment Update Interval (secs)"
                  .value=${d.environment_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("environment_update_interval", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Environment Screen Enabled"
                  description="Show on screen (1 = yes)"
                  .value=${d.environment_screen_enabled ? 1 : 0} .min=${0} .max=${1}
                  @change=${(e) => this._updateField("environment_screen_enabled", e.detail.value === 1)}></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            ${this._sectionTitle("Air Quality")}
            <mesh-toggle label="Air Quality Enabled"
              description="Enable air quality sensor readings"
              .checked=${d.air_quality_enabled === true}
              @change=${(e) => this._updateField("air_quality_enabled", e.detail.checked)}></mesh-toggle>
            ${d.air_quality_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label="Air Quality Interval (secs)"
                  .value=${d.air_quality_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("air_quality_interval", e.detail.value)}></mesh-number-input>
              </div>
            ` : ""}
          </div>

          <div class="settings-section">
            ${this._sectionTitle("Power Metrics")}
            <mesh-toggle label="Power Measurement Enabled"
              description="Enable power sensor readings (INA sensors)"
              .checked=${d.power_measurement_enabled === true}
              @change=${(e) => this._updateField("power_measurement_enabled", e.detail.checked)}></mesh-toggle>
            ${d.power_measurement_enabled ? html`
              <div class="form-grid" style="margin-top: 8px;">
                <mesh-number-input label="Power Update Interval (secs)"
                  .value=${d.power_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("power_update_interval", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Power Screen Enabled"
                  description="Show on screen (1 = yes)"
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
          <h3>Canned Messages</h3>
          <p>Pre-defined messages that can be sent quickly using hardware input.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Canned Message module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              ${this._sectionTitle("Messages")}
              <div style="margin-bottom: 4px; font-size: 12px; color: var(--secondary-text-color);">
                One message per line. Use | to separate messages. Available on device input.
              </div>
              <textarea
                .value=${d.messages || ""}
                @input=${(e) => this._updateField("messages", e.target.value)}
                placeholder="Hello|On my way|Be right there"
              ></textarea>
            </div>

            <div class="settings-section">
              ${this._sectionTitle("Input Source")}
              <div class="form-grid">
                <mesh-select label="Input Event Source"
                  .value=${String(d.inputbroker_event_cw || "NONE")}
                  .options=${CANNED_MSG_INPUT_EVENTS}
                  @change=${(e) => this._updateField("inputbroker_event_cw", e.detail.value)}></mesh-select>
                <mesh-number-input label="Input Pin A" description="GPIO for rotary encoder / button A"
                  .value=${d.inputbroker_pin_a ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_a", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Input Pin B" description="GPIO for rotary encoder B"
                  .value=${d.inputbroker_pin_b ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_b", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Input Pin Press" description="GPIO for press/select"
                  .value=${d.inputbroker_pin_press ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("inputbroker_pin_press", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="Rotary Encoder Enabled"
                .checked=${d.rotary1_enabled === true}
                @change=${(e) => this._updateField("rotary1_enabled", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Up/Down Enabled"
                .checked=${d.updown1_enabled === true}
                @change=${(e) => this._updateField("updown1_enabled", e.detail.checked)}></mesh-toggle>
            </div>

            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Send to Channel" description="Channel index to send on"
                  .value=${d.send_bell ?? 0} .min=${0} .max=${7}
                  @change=${(e) => this._updateField("send_bell", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="Allow Input Source" description="Allow message input from hardware"
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
          <h3>Audio / Codec2</h3>
          <p>Configure audio codec settings for voice communication over mesh.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Codec2 Enabled" description="Enable Codec2 audio module"
            .checked=${d.codec2_enabled === true}
            @change=${(e) => this._updateField("codec2_enabled", e.detail.checked)}></mesh-toggle>

          ${d.codec2_enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-select label="Bitrate" description="Codec2 bitrate setting"
                  .value=${String(d.bitrate || "CODEC2_DEFAULT")}
                  .options=${CODEC2_RATES}
                  @change=${(e) => this._updateField("bitrate", e.detail.value)}></mesh-select>
                <mesh-number-input label="PTT GPIO" description="GPIO for push-to-talk button"
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
          <h3>Neighbor Info</h3>
          <p>Broadcast information about direct neighbors for mesh topology mapping.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Neighbor Info module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Update Interval (secs)"
                  description="How often to broadcast neighbor info (0 = default)"
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
          <h3>Ambient Lighting</h3>
          <p>Configure onboard LED color and brightness.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="LED State" description="Turn the LED on or off"
            .checked=${d.led_state === true}
            @change=${(e) => this._updateField("led_state", e.detail.checked)}></mesh-toggle>

          ${d.led_state ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Red" description="Red channel (0-255)"
                  .value=${d.red ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("red", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Green" description="Green channel (0-255)"
                  .value=${d.green ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("green", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Blue" description="Blue channel (0-255)"
                  .value=${d.blue ?? 0} .min=${0} .max=${255}
                  @change=${(e) => this._updateField("blue", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Current" description="LED brightness / current limit (0-31)"
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
          <h3>Detection Sensor</h3>
          <p>Configure a GPIO-based detection sensor that sends alerts on the mesh.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Detection Sensor module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Monitor Pin" description="GPIO pin to monitor for detection"
                  .value=${d.monitor_pin ?? 0} .min=${0} .max=${48}
                  @change=${(e) => this._updateField("monitor_pin", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="Minimum Broadcast Secs"
                  description="Min interval between alert broadcasts"
                  .value=${d.minimum_broadcast_secs ?? 0} .min=${0}
                  @change=${(e) => this._updateField("minimum_broadcast_secs", e.detail.value)}></mesh-number-input>
                <mesh-number-input label="State Broadcast Secs"
                  description="Periodic state broadcast interval"
                  .value=${d.state_broadcast_secs ?? 0} .min=${0}
                  @change=${(e) => this._updateField("state_broadcast_secs", e.detail.value)}></mesh-number-input>
                <mesh-text-input label="Detection Triggered High"
                  description="Message when pin goes HIGH"
                  .value=${d.detection_triggered_high || ""}
                  @change=${(e) => this._updateField("detection_triggered_high", e.detail.value)}></mesh-text-input>
                <mesh-text-input label="Detection Triggered Low"
                  description="Message when pin goes LOW"
                  .value=${d.detection_triggered_low || ""}
                  @change=${(e) => this._updateField("detection_triggered_low", e.detail.value)}></mesh-text-input>
              </div>
              <mesh-toggle label="Send Bell" description="Send a bell notification with alerts"
                .checked=${d.send_bell === true}
                @change=${(e) => this._updateField("send_bell", e.detail.checked)}></mesh-toggle>
              <mesh-toggle label="Use Pullup" description="Enable internal pullup resistor"
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
          <h3>Paxcounter</h3>
          <p>Count nearby WiFi and BLE devices and broadcast counts on the mesh.</p>
        </div>
        <div class="settings-panel-body">
          <mesh-toggle label="Enabled" description="Enable Paxcounter module"
            .checked=${d.enabled === true}
            @change=${(e) => this._updateField("enabled", e.detail.checked)}></mesh-toggle>

          ${d.enabled ? html`
            <div class="settings-section">
              <div class="form-grid">
                <mesh-number-input label="Update Interval (secs)"
                  description="How often to broadcast pax count (0 = default)"
                  .value=${d.paxcounter_update_interval ?? 0} .min=${0}
                  @change=${(e) => this._updateField("paxcounter_update_interval", e.detail.value)}></mesh-number-input>
              </div>
              <mesh-toggle label="WiFi Threshold"
                description="Enable WiFi device counting"
                .checked=${d.wifi_threshold !== 0}
                @change=${(e) => this._updateField("wifi_threshold", e.detail.checked ? -80 : 0)}></mesh-toggle>
              <mesh-toggle label="BLE Threshold"
                description="Enable BLE device counting"
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

import {
  LitElement,
  html,
  css,
} from "./vendor/lit/lit-element.js";

/* ── <mesh-form-field> ── */
export class MeshFormField extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      description: { type: String },
    };
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .description {
        font-size: 11px;
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <slot></slot>
      ${this.description ? html`<span class="description">${this.description}</span>` : ""}
    `;
  }
}
customElements.define("mesh-form-field", MeshFormField);

/* ── <mesh-toggle> ── */
export class MeshToggle extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      description: { type: String },
      checked: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.checked = false;
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
      }
      .label-area {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        margin-right: 12px;
      }
      .label-text {
        font-size: 14px;
      }
      .description {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .switch {
        position: relative;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--divider-color);
        border-radius: 24px;
        transition: 0.2s;
      }
      .slider:before {
        content: "";
        position: absolute;
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background: white;
        border-radius: 50%;
        transition: 0.2s;
      }
      input:checked + .slider {
        background: var(--primary-color);
      }
      input:checked + .slider:before {
        transform: translateX(20px);
      }
    `;
  }

  render() {
    return html`
      <div class="label-area">
        ${this.label ? html`<span class="label-text">${this.label}</span>` : ""}
        ${this.description ? html`<span class="description">${this.description}</span>` : ""}
      </div>
      <label class="switch">
        <input
          type="checkbox"
          .checked=${this.checked}
          @change=${this._onChange}
        />
        <span class="slider"></span>
      </label>
    `;
  }

  _onChange(e) {
    this.checked = e.target.checked;
    this.dispatchEvent(
      new CustomEvent("change", { detail: { checked: this.checked }, bubbles: true, composed: true })
    );
  }
}
customElements.define("mesh-toggle", MeshToggle);

/* ── <mesh-select> ── */
export class MeshSelect extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      description: { type: String },
      value: { type: String },
      options: { type: Array }, // [{value, label}]
    };
  }

  constructor() {
    super();
    this.options = [];
    this.value = "";
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      select {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        outline: none;
      }
      select:focus {
        border-color: var(--primary-color);
      }
      .description {
        font-size: 11px;
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value} @change=${this._onChange}>
        ${this.options.map(
          (opt) => html`
            <option value=${opt.value} ?selected=${String(opt.value) === String(this.value)}>
              ${opt.label}
            </option>
          `
        )}
      </select>
      ${this.description ? html`<span class="description">${this.description}</span>` : ""}
    `;
  }

  _onChange(e) {
    this.value = e.target.value;
    this.dispatchEvent(
      new CustomEvent("change", { detail: { value: this.value }, bubbles: true, composed: true })
    );
  }
}
customElements.define("mesh-select", MeshSelect);

/* ── <mesh-number-input> ── */
export class MeshNumberInput extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      description: { type: String },
      value: { type: Number },
      min: { type: Number },
      max: { type: Number },
      step: { type: Number },
    };
  }

  constructor() {
    super();
    this.value = 0;
    this.step = 1;
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      input {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        outline: none;
      }
      input:focus {
        border-color: var(--primary-color);
      }
      .description {
        font-size: 11px;
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <input
        type="number"
        .value=${String(this.value)}
        min=${this.min ?? ""}
        max=${this.max ?? ""}
        step=${this.step}
        @change=${this._onChange}
      />
      ${this.description ? html`<span class="description">${this.description}</span>` : ""}
    `;
  }

  _onChange(e) {
    this.value = parseFloat(e.target.value) || 0;
    this.dispatchEvent(
      new CustomEvent("change", { detail: { value: this.value }, bubbles: true, composed: true })
    );
  }
}
customElements.define("mesh-number-input", MeshNumberInput);

/* ── <mesh-text-input> ── */
export class MeshTextInput extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      description: { type: String },
      value: { type: String },
      maxlength: { type: Number },
      placeholder: { type: String },
    };
  }

  constructor() {
    super();
    this.value = "";
    this.placeholder = "";
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      input {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        outline: none;
      }
      input:focus {
        border-color: var(--primary-color);
      }
      .description {
        font-size: 11px;
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <input
        type="text"
        .value=${this.value}
        maxlength=${this.maxlength ?? ""}
        placeholder=${this.placeholder}
        @input=${this._onInput}
      />
      ${this.description ? html`<span class="description">${this.description}</span>` : ""}
    `;
  }

  _onInput(e) {
    this.value = e.target.value;
    this.dispatchEvent(
      new CustomEvent("change", { detail: { value: this.value }, bubbles: true, composed: true })
    );
  }
}
customElements.define("mesh-text-input", MeshTextInput);

/* ── <mesh-confirm-dialog> ── */
export class MeshConfirmDialog extends LitElement {
  static get properties() {
    return {
      open: { type: Boolean },
      title: { type: String },
      message: { type: String },
      confirmLabel: { type: String },
      danger: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.open = false;
    this.confirmLabel = "Confirm";
    this.danger = false;
  }

  static get styles() {
    return css`
      .backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dialog {
        background: var(--card-background-color);
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 24px;
      }
      h3 {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 600;
      }
      p {
        margin: 0 0 20px;
        font-size: 14px;
        color: var(--secondary-text-color);
        line-height: 1.5;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      button {
        padding: 8px 20px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }
      .cancel-btn {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .confirm-btn {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      .confirm-btn.danger {
        background: #f44336;
        color: white;
      }
      button:hover {
        opacity: 0.85;
      }
    `;
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div class="backdrop" @click=${this._onBackdropClick}>
        <div class="dialog" @click=${(e) => e.stopPropagation()}>
          <h3>${this.title}</h3>
          <p>${this.message}</p>
          <div class="actions">
            <button class="cancel-btn" @click=${this._onCancel}>Cancel</button>
            <button
              class="confirm-btn ${this.danger ? "danger" : ""}"
              @click=${this._onConfirm}
            >
              ${this.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _onBackdropClick() {
    this._onCancel();
  }

  _onCancel() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
  }

  _onConfirm() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("confirm", { bubbles: true, composed: true }));
  }
}
customElements.define("mesh-confirm-dialog", MeshConfirmDialog);

/* ── <mesh-save-bar> ── */
export class MeshSaveBar extends LitElement {
  static get properties() {
    return {
      dirty: { type: Boolean },
      saving: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.dirty = false;
    this.saving = false;
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
      }
      .label {
        flex: 1;
        font-size: 13px;
        color: var(--secondary-text-color);
      }
      button {
        padding: 8px 20px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }
      .discard {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .save {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      button:hover {
        opacity: 0.85;
      }
      button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    `;
  }

  render() {
    if (!this.dirty) return html``;
    return html`
      <div class="bar">
        <span class="label">You have unsaved changes</span>
        <button class="discard" @click=${this._onDiscard} ?disabled=${this.saving}>Discard</button>
        <button class="save" @click=${this._onSave} ?disabled=${this.saving}>
          ${this.saving ? "Saving..." : "Save"}
        </button>
      </div>
    `;
  }

  _onDiscard() {
    this.dispatchEvent(new CustomEvent("discard", { bubbles: true, composed: true }));
  }

  _onSave() {
    this.dispatchEvent(new CustomEvent("save", { bubbles: true, composed: true }));
  }
}
customElements.define("mesh-save-bar", MeshSaveBar);

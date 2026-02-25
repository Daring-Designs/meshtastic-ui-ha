import { css } from "./vendor/lit/lit-element.js";

/* ── Layout & Cards ── */
export const layoutStyles = css`
  :host {
    display: block;
    height: 100%;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
  }

  .card {
    background: var(--card-background-color);
    border-radius: 12px;
    border: 1px solid var(--divider-color);
    margin-bottom: 16px;
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--divider-color);
  }

  .card-body {
    padding: 16px 20px;
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
`;

/* ── Empty States ── */
export const emptyStateStyles = css`
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
`;

/* ── Form Fields ── */
export const formStyles = css`
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-field label {
    font-size: 12px;
    font-weight: 600;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-field .description {
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.8;
    margin-top: 2px;
  }

  .form-field input,
  .form-field select {
    padding: 8px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-size: 14px;
    outline: none;
  }

  .form-field input:focus,
  .form-field select:focus {
    border-color: var(--primary-color);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }

  .toggle-row .toggle-label {
    font-size: 14px;
  }

  .toggle-row .toggle-description {
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  .toggle-switch {
    position: relative;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
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

  .toggle-slider:before {
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

  .toggle-switch input:checked + .toggle-slider {
    background: var(--primary-color);
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }
`;

/* ── Dialog ── */
export const dialogStyles = css`
  .dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog-card {
    background: var(--card-background-color);
    border-radius: 12px;
    width: 90%;
    max-width: 560px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--divider-color);
  }

  .dialog-title {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
  }

  .dialog-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--secondary-text-color);
    padding: 4px 8px;
    line-height: 1;
  }

  .dialog-close:hover {
    color: var(--primary-text-color);
  }

  .dialog-body {
    padding: 0;
  }

  .dialog-section {
    padding: 16px 20px;
  }

  .dialog-section + .dialog-section {
    border-top: 1px solid var(--divider-color);
  }

  .dialog-actions {
    display: flex;
    gap: 8px;
    padding: 16px 20px;
    border-top: 1px solid var(--divider-color);
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-btn.primary {
    background: var(--primary-color);
    color: var(--text-primary-color);
  }

  .action-btn.secondary {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }

  .action-btn.danger {
    background: #f44336;
    color: white;
  }

  .action-btn:hover {
    opacity: 0.85;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-feedback {
    padding: 8px 16px;
    font-size: 13px;
    color: var(--primary-color);
    font-weight: 500;
    display: flex;
    align-items: center;
  }
`;

/* ── Save Bar ── */
export const saveBarStyles = css`
  .save-bar {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    background: var(--card-background-color);
    border-top: 1px solid var(--divider-color);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }

  .save-bar .save-label {
    flex: 1;
    font-size: 13px;
    color: var(--secondary-text-color);
  }
`;

/* ── Settings Layout ── */
export const settingsStyles = css`
  .settings-layout {
    display: flex;
    gap: 16px;
    height: calc(100vh - 150px);
  }

  .settings-nav {
    width: 220px;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .settings-nav-group {
    margin-bottom: 16px;
  }

  .settings-nav-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--secondary-text-color);
    letter-spacing: 0.5px;
    padding: 8px 12px 4px;
  }

  .settings-nav-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 8px;
    margin-bottom: 2px;
    font-size: 14px;
    transition: background 0.15s;
    color: var(--primary-text-color);
  }

  .settings-nav-item:hover {
    background: var(--secondary-background-color);
  }

  .settings-nav-item.active {
    background: var(--primary-color);
    color: var(--text-primary-color);
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .settings-panel {
    background: var(--card-background-color);
    border-radius: 12px;
    border: 1px solid var(--divider-color);
    overflow: hidden;
  }

  .settings-panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--divider-color);
  }

  .settings-panel-header h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }

  .settings-panel-header p {
    margin: 0;
    font-size: 13px;
    color: var(--secondary-text-color);
  }

  .settings-panel-body {
    padding: 20px;
  }

  .settings-section + .settings-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid var(--divider-color);
  }

  @media (max-width: 600px) {
    .settings-layout {
      flex-direction: column;
      height: auto;
    }
    .settings-nav {
      width: auto;
      flex-shrink: 0;
      overflow-x: auto;
      overflow-y: hidden;
      display: flex;
      gap: 4px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider-color);
    }
    .settings-nav-group {
      display: flex;
      gap: 4px;
      margin-bottom: 0;
      flex-shrink: 0;
    }
    .settings-nav-header {
      display: none;
    }
    .settings-nav-item {
      white-space: nowrap;
      padding: 6px 12px;
      font-size: 13px;
      margin-bottom: 0;
      flex-shrink: 0;
    }
    .settings-content {
      overflow-y: visible;
    }
    .settings-panel-body {
      padding: 12px;
    }
  }
`;

/* ── Badges ── */
export const badgeStyles = css`
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

  .badge.success {
    background: #4caf50;
    color: white;
  }

  .badge.warning {
    background: #ff9800;
    color: white;
  }

  .badge.danger {
    background: #f44336;
    color: white;
  }
`;

/* ── Channel Editor ── */
export const channelStyles = css`
  .channel-card {
    background: var(--primary-background-color);
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .channel-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
  }

  .channel-card-header:hover {
    background: var(--secondary-background-color);
  }

  .channel-card-title {
    font-size: 14px;
    font-weight: 600;
  }

  .channel-card-body {
    padding: 14px;
    border-top: 1px solid var(--divider-color);
  }
`;

/* ── Device Actions ── */
export const deviceActionStyles = css`
  .device-actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .device-action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    background: var(--primary-background-color);
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
  }

  .device-action-card:hover {
    border-color: var(--primary-color);
    background: var(--secondary-background-color);
  }

  .device-action-card.danger:hover {
    border-color: #f44336;
  }

  .device-action-card ha-icon {
    --mdc-icon-size: 28px;
    color: var(--primary-color);
  }

  .device-action-card.danger ha-icon {
    color: #f44336;
  }

  .device-action-card .action-name {
    font-size: 14px;
    font-weight: 500;
  }

  .device-action-card .action-desc {
    font-size: 12px;
    color: var(--secondary-text-color);
  }
`;

import {LitElement, css, customElement, html} from './deps/lit.js';

@customElement('pkm-sidebar')
export class Sidebar extends LitElement {
  static override readonly styles = css`
    :host {
      display: block;
    }
    :host(:not([collapsed])) {
      width: 400px;
      transition: width ease-in-out 100ms;
      background: rgba(255, 255, 255, 0.05);
      box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.16),
        0 3px 6px rgba(0, 0, 0, 0.23);
    }
    #toggles {
      padding: 5px;
    }
    ::slotted(*) {
      padding: 5px;
      border-bottom: solid gray 1px;
    }
    :host([collapsed]) ::slotted(*) {
      display: none;
    }
    :host([collapsed]) #version {
      display: none;
    }
    #version {
      opacity: 0.5;
      font-family: monospace;
    }
  `;
  toggle() {
    document.startViewTransition(() => void this.toggleAttribute('collapsed'));
  }
  override render() {
    return html` <div id="toggles" @click=${this.toggle}>
        <span id="toggle">⚠️</span>
        <span id="version">${import.meta.env.COMMIT}</span>
      </div>
      <slot></slot>`;
  }
}

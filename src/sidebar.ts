import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import SideNavigationIcon from './icons/material-symbols-rounded/side_navigation_24dp_FILL1_wght400_GRAD0_opsz24.js';
import ManageSearchIcon from './icons/material-symbols-rounded/manage_search_24dp_FILL1_wght400_GRAD0_opsz24.js';
import {templateContent} from 'lit/directives/template-content.js';

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
      margin: 5px;
      display: grid;
      grid-template-columns: repeat(2, auto) 1fr;
      gap: 5px;
      align-items: center;
    }
    #toggles :is(#toggle, #commands) {
      cursor: pointer;
      fill: currentColor;
    }
    ::slotted(*) {
      padding: 5px;
      border-bottom: solid gray 1px;
    }
    :host([collapsed]) #toggles {
      display: flex;
      flex-flow: column;
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
  commands(e: PointerEvent) {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('pkm-commands', {
        bubbles: true,
        composed: true,
      }),
    );
  }
  override render() {
    return html` <div id="toggles">
        <div id="toggle" @click=${this.toggle}>
          ${templateContent(SideNavigationIcon)}
        </div>
        <div
          title="Commands (Control+p)"
          id="commands"
          @pointerdown=${this.commands}
        >
          ${templateContent(ManageSearchIcon)}
        </div>
        <div id="version">${import.meta.env.COMMIT}</div>
      </div>
      <slot></slot>`;
  }
}

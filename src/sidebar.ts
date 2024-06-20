import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import SideNavigationIcon from './icons/material-symbols-rounded/side_navigation_24dp_FILL1_wght400_GRAD0_opsz24.js';
import ManageSearchIcon from './icons/material-symbols-rounded/manage_search_24dp_FILL1_wght400_GRAD0_opsz24.js';
import {templateContent} from 'lit/directives/template-content.js';
import {assert} from './asserts.js';

@customElement('pkm-sidebar')
export class Sidebar extends LitElement {
  static override readonly styles = css`
    :host {
      display: grid;
      grid-template-columns: 5px 1fr;
    }
    :host(:not([collapsed])) {
      min-width: max(var(--pkm-sidebar-width, min(50dvw, 400px)), 200px);
      background: rgba(255, 255, 255, 0.05);
      box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.16),
        0 3px 6px rgba(0, 0, 0, 0.23);
    }
    #resize {
      grid-column: 1;
      grid-row: 1/999;
      cursor: col-resize;
    }
    :host([collapsed]) #resize {
      width: 0px;
    }
    #toggles {
      margin: 5px;
      margin-left: 0px;
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
      padding-left: 0px;
      border-bottom: solid gray 1px;
      overflow: hidden;
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
  constructor() {
    super();
    // TODO: need to be more selective about this, currently prevents selection
    this.addEventListener('pointerdown', (e) => e.preventDefault());
  }
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
  private startX = 0;
  private width = 0;
  private resizeDown(e: PointerEvent) {
    assert(e.target instanceof HTMLElement);
    e.target.setPointerCapture(e.pointerId);
    this.width = this.offsetWidth;
    this.startX = e.clientX;
  }
  private resizeMove(e: PointerEvent) {
    assert(e.target instanceof HTMLElement);
    if (!e.target.hasPointerCapture(e.pointerId)) return;
    this.width += this.startX - e.clientX;
    this.startX = e.clientX;
    this.attributeStyleMap.set('--pkm-sidebar-width', `${this.width}px`);
  }
  override render() {
    return html` <div
        id="resize"
        @pointerdown=${this.resizeDown}
        @pointermove=${this.resizeMove}
      ></div>
      <div id="toggles">
        <div id="toggle" @click=${this.toggle}>
          ${templateContent(SideNavigationIcon)}
        </div>
        <div title="Commands (Control+p)" id="commands" @click=${this.commands}>
          ${templateContent(ManageSearchIcon)}
        </div>
        <div id="version">${import.meta.env.COMMIT}</div>
      </div>
      <slot></slot>`;
  }
}

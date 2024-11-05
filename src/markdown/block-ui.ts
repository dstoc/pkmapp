import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {type ViewModelNode, viewModel} from './view-model-node.js';
import {ListItemNode} from './node.js';
import {SignalWatcher} from '@lit-labs/preact-signals';

@customElement('md-section-ui')
export class Section extends SignalWatcher(LitElement) {
  static override readonly styles = css`
    :host {
      display: grid;
      grid-template-columns: 18px 1fr;
      align-items: baseline;
      margin-left: var(--md-section-nested-gutter);
    }
    #gutter {
      color: var(--md-accent-color);
      margin-right: 3px;
      align-self: stretch;
      user-select: none;
      background: var(--md-section-gutter-color);
    }
  `;
  @property({attribute: false})
  accessor node!: ViewModelNode;
  protected override render() {
    this.node[viewModel].renderSignal.value;
    const node = this.node;
    let marker = '';
    if (node.type === 'section') {
      if (node[viewModel].parent?.type !== 'section') {
        marker = '★';
      } else {
        const idx = Math.min(node.marker.length - 1, 9);
        const n = '₁₂₃₄₅₆₇₈₉ₙ'[idx];
        marker = `§${n}`;
      }
    }
    return html`
      <div id="gutter">${marker}</div>
      <div>
        <slot></slot>
      </div>
    `;
  }
}

@customElement('md-list-item-ui')
export class ListItem extends SignalWatcher(LitElement) {
  static override readonly styles = css`
    :host {
      display: grid;
      grid-template-columns: 18px 1fr;
      align-items: baseline;
    }
    #gutter {
      color: var(--md-accent-color);
      user-select: none;
      cursor: pointer;
    }
  `;
  @property({attribute: false})
  accessor node!: ListItemNode & ViewModelNode;
  protected override render() {
    this.node[viewModel].renderSignal.value;
    return html`
      <div id="gutter" @click=${this.#handleClick}>
        ${this.#icon(this.node.checked)}
      </div>
      <div>
        <slot></slot>
      </div>
    `;
  }
  #icon(checked: true | false | undefined) {
    if (checked === true) return '☑';
    if (checked === false) return '☐';
    return '०';
    // return '०';
  }
  #handleClick(e: Event) {
    e.preventDefault();
    this.node[viewModel].tree.edit(() => {
      let newValue;
      switch (this.node.checked) {
        case true:
          newValue = undefined;
          break;
        case false:
          newValue = true;
          break;
        case undefined:
          newValue = false;
          break;
      }
      this.node[viewModel].updateChecked(newValue);
      return {};
    });
  }
}

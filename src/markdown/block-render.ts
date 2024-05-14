// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  state,
  css,
  customElement,
  html,
  LitElement,
  property,
} from '../deps/lit.js';

import {MarkdownInline} from './inline-render.js';
import {isInlineNode} from './node.js';
import type {ViewModelNode} from './view-model-node.js';
import './transclusion.js';
import {hostContext, HostContext} from './host-context.js';
import {provide, consume} from '../deps/lit-context.js';

@customElement('md-block')
export class MarkdownBlock extends LitElement {
  @property({type: Boolean, reflect: true}) selected?: boolean;
  @property({type: String, reflect: true}) checked?: 'true' | 'false';
  @property({type: Boolean, reflect: true}) root?: boolean;
  @property({type: String, reflect: true}) type = '';
  @property({type: String, reflect: true}) marker?: string;
  @property({attribute: false}) node?: ViewModelNode;
  @consume({context: hostContext, subscribe: true})
  @property({attribute: false})
  hostContext: HostContext | undefined;
  constructor() {
    super();
    this.addEventListener('click', (e) => this.handleClick(e));
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.addObserver(this.node);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeObserver(this.node);
  }
  override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('node')) {
      const oldNode = changedProperties.get('node') as ViewModelNode;
      this.removeObserver(oldNode);
      if (this.isConnected) {
        this.addObserver(this.node);
      }
    }
  }
  override render() {
    this.selected = this.hostContext?.selection.has(this.node!) ?? false;
    const node = this.node;
    if (!node) return;
    this.type = node.type;
    if (node.type === 'list-item') {
      this.checked =
        node.checked === undefined
          ? undefined
          : node.checked
            ? 'true'
            : 'false';
    }
    if (node.type === 'section') {
      const idx = Math.min(node.marker.length - 1, 9);
      const n = '₁₂₃₄₅₆₇₈₉ₙ'[idx];
      this.marker = `#${n}`;
    }
    // TODO: maybe this is were extensions get injected?
    if (node.type === 'code-block' && node.info === 'tc') {
      return html`<md-transclusion .node=${node}></md-transclusion>`;
    }
    return html`${isInlineNode(node)
      ? html`<md-inline .node=${node}></md-inline>`
      : ''}
    ${node.children?.map((node) => html`<md-block .node=${node}></md-block>`)} `;
  }
  protected override createRenderRoot() {
    return this;
  }
  private handleClick(e: Event) {
    const node = this.node;
    if (!node) return;
    if (node.type === 'list-item') {
      if (e.target !== this) return;
      e.preventDefault();
      let newValue;
      switch (node.checked) {
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
      node.viewModel.updateChecked(newValue);
    }
  }
  private readonly observer = (node: ViewModelNode) => {
    if (node !== this.node) {
      this.removeObserver(node);
      return;
    }
    this.requestUpdate();
  };
  private addObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.add(this.observer);
  }
  private removeObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.remove(this.observer);
  }
}

@customElement('md-block-render')
export class MarkdownRenderer extends LitElement {
  static override get styles() {
    return [
      ...MarkdownInline.styles,
      css`
        md-block {
          display: block;
          margin-block-start: 0.25lh;
          margin-block-end: 0.25lh;
        }
        md-block[root] {
          margin-block: 0;
        }
        md-block[type='list'] {
        }
        md-block[type='list-item']:not([root]) {
          display: list-item;
          white-space: initial;
          margin-block: 0;

          display: grid;
          grid-template-columns: auto 1fr;
          align-items: baseline;
        }
        md-block[type='list-item']::before {
          width: 15px;
          margin-right: 3px;
          content: '●';
          color: var(--md-accent-color);
          cursor: pointer;
          grid-row: 1 / 999999;
          align-self: stretch;
        }
        md-block[type='list-item'][checked='true']::before {
          content: '☑';
        }
        md-block[type='list-item'][checked='false']::before {
          content: '☐';
        }
        md-block[type='code-block'] md-inline {
          font-family: monospace;
          white-space: pre-wrap;
        }
        md-block[type='section'] > md-inline {
          font-weight: bold;
        }
        md-block[type='section'] > md-block[type='section'] {
          margin-left: calc(-1 * var(--section-gutter));
        }
        md-block[type='section'] {
          --section-gutter: 20px;
          display: grid;
          grid-template-columns: var(--section-gutter) 1fr;
          align-items: baseline;
          margin-block-end: 0.75lh;
        }
        md-block[type='section']:focus-within:not(
            :has(:is(md-block[type='section'], md-transclusion):focus-within)
          )::before {
          background: var(--md-active-block-color);
        }
        md-block[type='section']::before {
          margin-right: 3px;
          content: attr(marker);
          text-align: right;
          color: var(--md-accent-color);
          grid-row: 1 / 999999;
          align-self: stretch;
        }
        /* Reduce gap between block and list */
        md-block + md-block[type='list'] {
          margin-block-start: -0.25lh !important;
        }
        /* Remove gap between list item and nested list */
        md-block[type='list-item']
          > md-block[type='paragraph']
          + md-block[type='list'] {
          margin-block-start: -0.25lh !important;
        }
        /* Reduce gap between section title and first content */
        md-block[type='section'] > md-block:nth-child(2) {
          margin-block-start: 0.25lh !important;
        }
        /* No gap before the first nested block */
        md-block > md-block:first-child {
          margin-block-start: 0;
        }
        /* No gap after the last nested block */
        md-block > md-block:last-child {
          margin-block-end: 0;
        }
        md-block[selected] > md-inline {
          background: var(--md-block-selection-bgcolor);
          caret-color: transparent;
        }
        md-block[selected]:not(:has(md-block)),
        md-block:has(md-block[selected]):not(
            :has(md-block:not([selected]) > md-inline)
          ) {
          --md-accent-color: currentcolor;
          --md-block-quote-bgcolor: var(--md-block-selection-bgcolor);
          --md-code-block-bgcolor: var(--md-block-selection-bgcolor);
          --md-code-span-bgcolor: var(--md-block-selection-bgcolor);
          --md-tag-bgcolor: var(--md-block-selection-bgcolor);
          --root-background-color: var(--md-block-selection-bgcolor);
          caret-color: transparent;
        }
      `,
      // Overridable styles.
      css`
        md-span[type='code_span'] {
          font-family: var(--md-code-font-family);
          border-radius: 3px;
          padding: 3px;
          background: var(--md-code-span-bgcolor);
        }
        md-block[type='block-quote'] {
          background: var(--md-block-quote-bgcolor);
          border-left: 10px solid var(--md-accent-color);
          padding: 10px;
          padding-left: 20px;
          border-radius: 10px;
          background-clip: padding-box;
          border: var(--md-block-quote-border);
          background-image: linear-gradient(
            90deg,
            var(--md-accent-color) 0,
            var(--md-accent-color) 10px,
            transparent 10px
          );
        }
        md-block[type='code-block'] md-inline {
          font-family: var(--md-code-font-family);
          background: var(--md-code-block-bgcolor);
          padding: 10px;
          border-radius: 10px;
          background-clip: padding-box;
          border: var(--md-code-block-border);
        }
        a,
        md-span[type='shortcut_link'],
        md-span[type='uri_autolink'],
        md-span[type='inline_link'] {
          color: var(--md-accent-color);
        }
        md-span[type='shortcut_link'] a,
        md-span[type='uri_autolink'],
        md-span[type='inline_link'] a {
          color: var(--md-accent-color);
          text-decoration: none;
        }
        md-span[type='tag'] {
          border-radius: 3px;
          padding: 3px;
          background: var(--md-tag-bgcolor);
        }
      `,
    ];
  }

  @provide({context: hostContext})
  @state()
  readonly hostContext = new HostContext();

  @property({attribute: false}) block!: ViewModelNode;
  override render() {
    this.hostContext.root = this.block;
    if (!this.block) return html``;
    return html`<md-block .node=${this.block} ?root=${true}></md-block>`;
  }
  getInlineSelection(): {
    inline?: MarkdownInline;
    startIndex?: number;
    endIndex?: number;
  } {
    let active = this.shadowRoot!.activeElement;
    while (true) {
      if (!active || active instanceof MarkdownInline) {
        const selection = active?.getSelection();
        return {
          inline: active ?? undefined,
          startIndex: selection?.start.index,
          endIndex: selection?.end.index,
        };
      } else {
        active = active.shadowRoot?.activeElement ?? null;
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'md-block': MarkdownBlock;
    'md-block-render': MarkdownRenderer;
  }
}

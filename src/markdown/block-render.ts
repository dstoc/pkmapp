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

import {assert} from '../asserts.js';
import {css, customElement, html, LitElement, property} from '../deps/lit.js';

import {MarkdownInline} from './inline-render.js';
import {ViewModelNode} from './view-model.js';

@customElement('md-block')
export class MarkdownBlock extends LitElement {
  @property({type: String, reflect: true}) checked?: boolean;
  @property({type: String, reflect: true}) type = '';
  @property({attribute: false}) node: ViewModelNode|undefined;
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
    const node = this.node;
    if (!node) return;
    this.type = node.type;
    if (node.type === 'list-item') {
      this.checked = node.checked;
    }
    return html`${
        (node.type === 'paragraph' || node.type === 'code-block' ||
         node.type === 'section') ?
            html`<md-inline .node=${node}></md-inline>` :
            ''}
        ${
        node.children?.map((node) => html`<md-block .node=${node}></md-block>`)}
    `;
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
  private addObserver(node: ViewModelNode|undefined) {
    node?.viewModel.observe.add(this.observer);
  }
  private removeObserver(node: ViewModelNode|undefined) {
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
          margin-block-start: 1em;
          margin-block-end: 1em;
        }
        md-block[type='list'] {
          list-style-type: disc;
          padding-inline-start: 16px;
        }
        md-block[type='list-item'] {
          display: list-item;
          white-space: initial;
          margin-block: 0;
        }
        md-block[type='list-item'][checked='true']::marker {
          content: '🗹 ';
        }
        md-block[type='list-item'][checked='false']::marker {
          content: '☐ ';
        }
        md-block[type='code-block'] md-inline {
          font-family: monospace;
          white-space: pre-wrap;
        }
        md-block[type='section'] > md-inline {
          font-weight: bold;
        }
        md-block + md-block[type='list'] {
          margin-block-start: -1em !important;
        }
        md-block > md-block:first-child {
          margin-block-start: 0em;
        }
        md-block > md-block:last-child {
          margin-block-end: 0em;
        }
        md-block[type='block-quote'] {
        }
        md-block[type='list'] + md-block {
          margin-block-start: 0em;
        }
      `,
      // Overridable styles.
      css`
        md-span[type='code_span'] {
          font-family: var(--md-code-font-family);
          border-radius: 3px;
          padding: 3px;
          background: var(--md-code-block-bgcolor);
        }
        md-block[type='block-quote'] {
          background: var(--md-block-quote-bgcolor);
          border-left: 10px solid var(--md-accent-color);
          padding: 10px;
          border-radius: 10px;
        }
        md-block[type='code-block'] md-inline {
          font-family: var(--md-code-font-family);
          background: var(--md-code-block-bgcolor);
          padding: 10px;
          border-radius: 10px;
        }
        md-span[type='shortcut_link'],
        md-span[type='inline_link'] {
          color: var(--md-accent-color);
        }
        md-span[type='shortcut_link'] a,
        md-span[type='inline_link'] a {
          color: var(--md-accent-color);
          text-decoration: none;
        }
      `,
    ];
  }

  @property({type: Object, reflect: false}) block!: ViewModelNode;
  override render() {
    if (!this.block) return html``;
    return html`<md-block .node=${this.block}></md-block>`;
  }
  getInlineSelection() {
    const inline = this.shadowRoot!.activeElement;
    assert(!inline || inline instanceof MarkdownInline);
    const selection = inline?.getSelection();
    return {
      node: inline?.node,
      startIndex: selection?.start.index,
      endIndex: selection?.end.index,
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'md-block': MarkdownBlock;
    'md-block-render': MarkdownRenderer;
  }
}

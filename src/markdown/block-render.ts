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

import {css, customElement, html, LitElement, property} from '../deps/lit.js';

import {MarkdownInline} from './inline-render.js';
import {ViewModelNode} from './view-model.js';

@customElement('md-block')
export class MarkdownBlock extends LitElement {
  @property({type: String, reflect: true}) type = '';
  @property({type: Object, reflect: false}) node: ViewModelNode|undefined;
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
    if (node.type === 'paragraph' || node.type === 'code-block' ||
        node.type === 'heading') {
      return html`
        <md-inline .node=${node}></md-inline>`;
    } else {
      return node.children?.map(
          node => html`<md-block .node=${node}></md-block>`);
    }
  }
  protected override createRenderRoot() {
    return this;
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
          font-family: 'Roboto', sans-serif;
        }
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
        md-block[type='code-block'] md-inline {
          font-family: 'Roboto Mono', monospace;
          white-space: pre-wrap;
        }
        md-block[type='heading'] md-inline {
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
          background: #f9f9f9;
          border-left: 10px solid #ccc;
          padding: 0.5em 10px;
        }
        md-block[type='list'] + md-block {
          margin-block-start: 0em;
        }
      `,
    ];
  }

  @property({type: Object, reflect: false}) block!: ViewModelNode;
  override render() {
    if (!this.block) return html``;
    return html`<md-block .node=${this.block}></md-block>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'md-block': MarkdownBlock;
    'md-block-render': MarkdownRenderer;
  }
}

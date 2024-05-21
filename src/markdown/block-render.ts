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

import {state, customElement, html, LitElement, property} from '../deps/lit.js';

import {MarkdownInline} from './inline-render.js';
import {isInlineNode} from './node.js';
import type {ViewModelNode} from './view-model-node.js';
import './transclusion.js';
import {hostContext, HostContext} from './host-context.js';
import {provide, consume} from '../deps/lit-context.js';
import {styles} from './style.js';

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
      if (
        node.viewModel.parent?.type !== 'section' &&
        !node.viewModel.previousSibling
      ) {
        this.marker = undefined;
      } else {
        const idx = Math.min(node.marker.length - 1, 9);
        const n = '₁₂₃₄₅₆₇₈₉ₙ'[idx];
        this.marker = `§${n}`;
      }
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
  static override styles = styles;

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

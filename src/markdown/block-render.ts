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

import {html, LitElement, render} from 'lit';
import {customElement, property} from 'lit/decorators.js';

import {MarkdownInline} from './inline-render.js';
import {isInlineNode} from './node.js';
import {
  InlineViewModelNode,
  type ViewModelNode,
  viewModel,
} from './view-model-node.js';
import './transclusion.js';
import {hostContext, HostContext} from './host-context.js';
import {provide, consume} from '@lit/context';
import {styles} from './style.js';
import {sigprop, SigpropHost} from '../signal-utils.js';
import {repeat} from 'lit/directives/repeat.js';
import './block-ui.js';

@customElement('md-block')
export class MarkdownBlock extends LitElement implements SigpropHost {
  @property({type: Boolean, reflect: true}) accessor root: boolean | undefined;
  @property({type: String, reflect: true}) accessor type = '';
  @consume({context: hostContext, subscribe: true})
  @property({attribute: false})
  accessor hostContext: HostContext | undefined;
  @sigprop accessor node: ViewModelNode | undefined;
  constructor() {
    super();
  }
  effectDispose?: () => void;
  effect() {
    this.node?.[viewModel].renderSignal.value;
    this.requestUpdate();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.effectDispose?.();
  }
  override render() {
    const node = this.node;
    if (!node) return;
    this.type = node.type;
    // TODO: maybe this is were extensions get injected?
    // TODO: consider whether we should use shadow ui here
    if (node.type === 'code-block' && node.info === 'tc') {
      // TODO: wrap with a md-extension type that can handle selection instead.
      const selected = this.hostContext?.selection.has(node) ?? false;
      return html`<md-transclusion
        .node=${node}
        ?selected=${selected}
      ></md-transclusion>`;
    }
    return html`${isInlineNode(node)
      ? html`<md-inline .node=${node}></md-inline>`
      : ''}
    ${repeat(
      node.children ?? [],
      (node) => node[viewModel].id,
      (node) => html`<md-block .node=${node}></md-block>`,
    )}`;
  }
  #renderShadow() {
    const node = this.node;
    if (!node) return;
    if (node.type === 'section') {
      return html`
        <md-section-ui .node=${this.node}>
          <slot></slot>
        </md-section-ui>
      `;
    }
    if (node.type === 'list-item') {
      return html`
        <md-list-item-ui .node=${this.node}>
          <slot></slot>
        </md-list-item-ui>
      `;
    }
    return;
  }
  protected override updated() {
    const content = this.#renderShadow();
    if (content && !this.shadowRoot) {
      this.attachShadow({mode: 'open'});
    }
    if (this.shadowRoot) {
      render(content ?? html`<slot></slot>`, this.shadowRoot);
    }
  }
  protected override createRenderRoot() {
    return this;
  }
}

@customElement('md-block-render')
export class MarkdownRenderer extends LitElement {
  static override styles = styles;

  @provide({context: hostContext})
  accessor hostContext = new HostContext();

  constructor() {
    super();
    // TODO: remove after lit/lit#4675
    this.hostContext = new HostContext();
  }

  protected override createRenderRoot() {
    const root = super.createRenderRoot();
    root.addEventListener('focusin', this.onFocusIn);
    return root;
  }

  @property({attribute: false}) accessor block!: ViewModelNode;
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

  private onFocusIn(e: Event) {
    if (!(e.target instanceof MarkdownInline) || !e.target.node) return;
    this.dispatchEvent(
      new CustomEvent('md-block-focus', {
        detail: e.target.node,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'md-block': MarkdownBlock;
    'md-block-render': MarkdownRenderer;
  }
  interface HTMLElementEventMap {
    'md-block-focus': CustomEvent<InlineViewModelNode>;
  }
}

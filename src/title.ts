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

import {Library} from './library.js';
import {assert} from './asserts.js';
import {findNextEditable} from './markdown/view-model-util.js';
import {css, html, LitElement} from 'lit';
import {property, customElement, state} from 'lit/decorators.js';
import {consume} from '@lit/context';
import {libraryContext} from './app-context.js';
import {getLogicalContainingBlock, isExplicitlyNamed} from './block-util.js';
import type {ViewModelNode} from './markdown/view-model-node.js';
import {viewModel} from './markdown/view-model-node.js';
import {effect} from '@preact/signals-core';

@customElement('pkm-title')
export class Title extends LitElement {
  static override styles = css`
    .item {
      white-space: nowrap;
    }
    .item a {
      text-decoration: underline;
      cursor: pointer;
    }
    .marker {
      color: var(--md-accent-color);
    }
  `;
  @property({attribute: false})
  accessor simple = false;
  @property({attribute: false})
  accessor node: ViewModelNode | undefined;
  @consume({context: libraryContext, subscribe: true})
  @state()
  accessor library!: Library;
  private effectDispose?: () => void;
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.effectDispose?.();
  }

  override render() {
    if (!this.node) return ``;
    if (
      !this.simple &&
      !this.node[viewModel].parent &&
      isExplicitlyNamed(this.node)
    )
      return ``;

    const containers: ViewModelNode[] = [];
    let next: ViewModelNode | undefined = this.node;
    while (next) {
      containers.unshift(next);
      next = getLogicalContainingBlock(next);
    }
    this.effectDispose?.();
    this.effectDispose = effect(() => {
      for (const container of containers) {
        container[viewModel].renderSignal.value;
      }
      this.requestUpdate();
    });

    return html`
      ${containers.map(
        (node) =>
          html`<span class="item"
            ><span class="marker">»</span>
            <a class="item" @click=${() => this.onItemClick(node)}
              >${getTitle(node, this.library)}</a
            ></span
          > `,
      )}
    `;
  }
  private onItemClick(node: ViewModelNode) {
    this.dispatchEvent(
      new CustomEvent('title-item-click', {
        detail: node,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-title': Title;
  }
  interface HTMLElementEventMap {
    'title-item-click': CustomEvent<ViewModelNode>;
  }
}
function getTitle(node: ViewModelNode, library: Library): string {
  switch (node.type) {
    case 'list-item': {
      const inline = findNextEditable(node, node, false);
      // TODO: convert nodes to text
      return inline?.content.substring(0, 10) ?? 'no-inline';
    }
    case 'section':
      // TODO: use metadata
      return node.content;
    case 'document': {
      const document = library.getDocumentByTree(node[viewModel].tree);
      return document?.name ?? 'no-document';
    }
    default:
      assert(false);
  }
}

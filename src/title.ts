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
import {
  state,
  property,
  css,
  customElement,
  html,
  LitElement,
} from './deps/lit.js';
import {consume} from './deps/lit-context.js';
import {libraryContext} from './app-context.js';
import {getLogicalContainingBlock, isExplicitlyNamed} from './block-util.js';
import {Observers, Observer} from './observe.js';
import type {ViewModelNode} from './markdown/view-model-node.js';

@customElement('pkm-title')
export class Title extends LitElement {
  static override styles = css`
    .item {
      text-decoration: underline;
      cursor: pointer;
    }
  `;
  @property({attribute: false})
  node?: ViewModelNode;
  @consume({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
  observers?: Observers;

  override render() {
    if (!this.node) return ``;
    if (!this.node.viewModel.parent && isExplicitlyNamed(this.node)) return ``;

    this.observers?.clear();
    const containers: ViewModelNode[] = [];
    let next: ViewModelNode | undefined = this.node;
    while (next) {
      containers.unshift(next);
      next = getLogicalContainingBlock(next);
    }
    this.observers = new Observers(
      ...containers.map(
        (container) =>
          new Observer(
            () => container.viewModel.observe,
            () => this.requestUpdate(),
            (target, observer) => target.add(observer),
            (target, observer) => target.remove(observer),
          ),
      ),
    );
    this.observers.update();

    return html`
      ${containers.map(
        (node) =>
          html`»
            <a class="item" @click=${() => this.onItemClick(node)}
              >${getTitle(node, this.library)}</a
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
      const document = library.getDocumentByTree(node.viewModel.tree);
      return document?.name ?? 'no-document';
    }
    default:
      assert(false);
  }
}

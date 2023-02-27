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

import {ViewModelNode} from './markdown/view-model.js';
import {Library} from './library.js';
import {assert} from './asserts.js';
import {findNextEditable} from './markdown/view-model-util.js';
import {state, property, css, customElement, html, LitElement} from './deps/lit.js';
import {contextProvided} from './deps/lit-labs-context.js';
import {libraryContext} from './app-context.js';

type LogicalContainingBlock = ViewModelNode&{type: 'list-item'|'section'|'document'};

@customElement('pkm-title')
export class Title extends LitElement {
  static override get styles() {
    return css`
      .item {
        text-decoration: underline;
        cursor: pointer;
      }
    `;
  }
  @property()
  node?: LogicalContainingBlock;
  @contextProvided({context: libraryContext, subscribe: true})
  @state()
  library!: Library;

  override render() {
    if (!this.node) return ``;
    let containers = [];
    let next: LogicalContainingBlock|undefined = this.node;
    while (next) {
      containers.unshift(next);
      next = getLogicalContainingBlock(next);
    }

    return html`
      ${containers.map(node => html`» <a class=item @click=${() => this.onItemClick(node)}>${getTitle(node, this.library)}</a> `)}
    `;
  }
  private onItemClick(node: LogicalContainingBlock) {
    this.dispatchEvent(new CustomEvent('title-item-click', {
      detail: node,
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-title': Title;
  }
  interface HTMLElementEventMap {
    'title-item-click': CustomEvent<LogicalContainingBlock>;
  }
}
function getTitle(node: LogicalContainingBlock, library: Library): string {
  switch (node.type) {
    case 'list-item':
      const inline = findNextEditable(node, node, false);
      // TODO: convert nodes to text
      return inline?.content.substring(0, 10) ?? 'no-inline';
    case 'section':
      return node.content;
    case 'document':
      const document = library.getDocumentByTree(node.viewModel.tree);
      return document?.aliases[0] ?? 'no-document';
    default:
      assert(false);
  }
}

// TODO: dedupe with `logicalContainingBlock` in editor.ts
function getLogicalContainingBlock(node: ViewModelNode): LogicalContainingBlock|undefined {
  let next = node.viewModel.parent;
  while (next) {
    switch (next.type) {
      case 'list-item':
      case 'section':
      case 'document':
        return next;
      default:
        next = next.viewModel.parent;
        continue;
    }
  }
  return;
}


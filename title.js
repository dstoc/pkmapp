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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { assert } from './asserts.js';
import { findNextEditable } from './markdown/view-model-util.js';
import { state, property, css, customElement, html, LitElement } from './deps/lit.js';
import { contextProvided } from './deps/lit-labs-context.js';
import { libraryContext } from './app-context.js';
let Title = class Title extends LitElement {
    static get styles() {
        return css `
      .item {
        text-decoration: underline;
        cursor: pointer;
      }
    `;
    }
    render() {
        if (!this.node)
            return ``;
        let containers = [];
        let next = this.node;
        while (next) {
            containers.unshift(next);
            next = getLogicalContainingBlock(next);
        }
        return html `
      ${containers.map(node => html `» <a class=item @click=${() => this.onItemClick(node)}>${getTitle(node, this.library)}</a> `)}
    `;
    }
    onItemClick(node) {
        this.dispatchEvent(new CustomEvent('title-item-click', {
            detail: node,
            bubbles: true,
            composed: true,
        }));
    }
};
__decorate([
    property()
], Title.prototype, "node", void 0);
__decorate([
    contextProvided({ context: libraryContext, subscribe: true }),
    state()
], Title.prototype, "library", void 0);
Title = __decorate([
    customElement('pkm-title')
], Title);
export { Title };
function getTitle(node, library) {
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
function getLogicalContainingBlock(node) {
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
//# sourceMappingURL=title.js.map
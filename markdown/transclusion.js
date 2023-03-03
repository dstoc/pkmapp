// Copyright 2023 Google LLC
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
import { query, customElement, html, css, state, LitElement, property } from '../deps/lit.js';
import { MarkdownRenderer } from './block-render.js';
import { libraryContext } from '../app-context.js';
import './block-render.js';
import { contextProvided } from '../deps/lit-labs-context.js';
import { hostContext } from './host-context.js';
import { findNextEditable, findFinalEditable } from './view-model-util.js';
let MarkdownTransclusion = class MarkdownTransclusion extends LitElement {
    constructor() {
        super(...arguments);
        this.observer = () => {
            this.maybeUpdateFocus();
        };
    }
    render() {
        if (!this.root && this.node)
            this.load(this.node.content.trim());
        return this.root ? html `
      ⮴ ${this.node?.content.trim()}
      <md-block-render .block=${this.root}></md-block-render>
    ` : '';
    }
    static get styles() {
        return css `
      :host {
        display: block;
        background: var(--md-code-block-bgcolor);
        padding: 10px;
        border-radius: 10px;
      }
    `;
    }
    async load(name) {
        const { root } = await this.library.find(name);
        this.root = root;
    }
    maybeUpdateFocus() {
        if (!this.isConnected)
            return;
        if (!this.hostContext)
            return;
        if (!this.root)
            return;
        if (this.hostContext.focusNode !== this.node)
            return;
        const node = (this.hostContext.focusOffset ?? -1) >= 0 ?
            findNextEditable(this.root, this.root, true) :
            findFinalEditable(this.root, true);
        this.markdownRenderer.hostContext.focusNode = node || undefined;
        this.markdownRenderer.hostContext.focusOffset = this.hostContext.focusOffset;
        this.hostContext.focusNode = undefined;
        this.hostContext.focusOffset = undefined;
        node?.viewModel.observe.notify();
    }
    connectedCallback() {
        super.connectedCallback();
        this.addObserver(this.node);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeObserver(this.node);
    }
    willUpdate(changedProperties) {
        if (changedProperties.has('node')) {
            const oldNode = changedProperties.get('node');
            this.removeObserver(oldNode);
            this.addObserver(this.node);
        }
    }
    addObserver(node) {
        node?.viewModel.observe.add(this.observer);
    }
    removeObserver(node) {
        node?.viewModel.observe.remove(this.observer);
    }
};
__decorate([
    property({ attribute: false })
], MarkdownTransclusion.prototype, "node", void 0);
__decorate([
    contextProvided({ context: libraryContext, subscribe: true }),
    state()
], MarkdownTransclusion.prototype, "library", void 0);
__decorate([
    contextProvided({ context: hostContext, subscribe: true }),
    property({ attribute: false })
], MarkdownTransclusion.prototype, "hostContext", void 0);
__decorate([
    state()
], MarkdownTransclusion.prototype, "root", void 0);
__decorate([
    query('md-block-render')
], MarkdownTransclusion.prototype, "markdownRenderer", void 0);
MarkdownTransclusion = __decorate([
    customElement('md-transclusion')
], MarkdownTransclusion);
export { MarkdownTransclusion };
export function getContainingTransclusion(element) {
    const renderShadow = element.getRootNode();
    if (!(renderShadow instanceof ShadowRoot))
        return;
    const renderHost = renderShadow.host;
    if (!(renderHost instanceof MarkdownRenderer))
        return;
    const shadow = renderHost.getRootNode();
    if (!(shadow instanceof ShadowRoot))
        return;
    const transclusion = shadow.host;
    if (!(transclusion instanceof MarkdownTransclusion))
        return;
    return transclusion;
}
//# sourceMappingURL=transclusion.js.map
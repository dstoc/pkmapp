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
import { css, customElement, html, LitElement, property } from '../deps/lit.js';
import { MarkdownInline } from './inline-render.js';
let MarkdownBlock = class MarkdownBlock extends LitElement {
    constructor() {
        super(...arguments);
        this.type = '';
        this.observer = (node) => {
            if (node !== this.node) {
                this.removeObserver(node);
                return;
            }
            this.requestUpdate();
        };
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
            if (this.isConnected) {
                this.addObserver(this.node);
            }
        }
    }
    render() {
        const node = this.node;
        if (!node)
            return;
        this.type = node.type;
        if (node.type === 'paragraph' || node.type === 'code-block' ||
            node.type === 'heading') {
            return html `
        <md-inline .node=${node}></md-inline>`;
        }
        else {
            return node.children?.map(node => html `<md-block .node=${node}></md-block>`);
        }
    }
    createRenderRoot() {
        return this;
    }
    addObserver(node) {
        node?.viewModel.observe.add(this.observer);
    }
    removeObserver(node) {
        node?.viewModel.observe.remove(this.observer);
    }
};
__decorate([
    property({ type: String, reflect: true })
], MarkdownBlock.prototype, "type", void 0);
__decorate([
    property({ type: Object, reflect: false })
], MarkdownBlock.prototype, "node", void 0);
MarkdownBlock = __decorate([
    customElement('md-block')
], MarkdownBlock);
export { MarkdownBlock };
let MarkdownRenderer = class MarkdownRenderer extends LitElement {
    static get styles() {
        return [
            ...MarkdownInline.styles,
            css `
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
          font-family: monospace;
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
        }
        md-block[type='list'] + md-block {
          margin-block-start: 0em;
        }
      `,
            // Overridable styles.
            css `
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
    render() {
        if (!this.block)
            return html ``;
        return html `<md-block .node=${this.block}></md-block>`;
    }
};
__decorate([
    property({ type: Object, reflect: false })
], MarkdownRenderer.prototype, "block", void 0);
MarkdownRenderer = __decorate([
    customElement('md-block-render')
], MarkdownRenderer);
export { MarkdownRenderer };
//# sourceMappingURL=block-render.js.map
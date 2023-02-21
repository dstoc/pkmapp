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
import { state, css, customElement, html, LitElement, property } from '../deps/lit.js';
import { MarkdownInline } from './inline-render.js';
import './transclusion.js';
import { hostContext, HostContext } from './host-context.js';
import { contextProvider, contextProvided } from '../deps/lit-labs-context.js';
let MarkdownBlock = class MarkdownBlock extends LitElement {
    constructor() {
        super();
        this.type = '';
        this.observer = (node) => {
            if (node !== this.node) {
                this.removeObserver(node);
                return;
            }
            this.requestUpdate();
        };
        this.addEventListener('click', (e) => this.handleClick(e));
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
        this.selected = this.hostContext?.selection.has(this.node) ?? false;
        const node = this.node;
        if (!node)
            return;
        this.type = node.type;
        if (node.type === 'list-item') {
            this.checked = node.checked;
        }
        if (node.type === 'code-block' && node.info === 'tc') {
            return html `<md-transclusion .node=${node}></md-transclusion>`;
        }
        return html `${(node.type === 'paragraph' || node.type === 'code-block' ||
            node.type === 'section') ?
            html `<md-inline .node=${node}></md-inline>` :
            ''}
        ${node.children?.map((node) => html `<md-block .node=${node}></md-block>`)}
    `;
    }
    createRenderRoot() {
        return this;
    }
    handleClick(e) {
        const node = this.node;
        if (!node)
            return;
        if (node.type === 'list-item') {
            if (e.target !== this)
                return;
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
    addObserver(node) {
        node?.viewModel.observe.add(this.observer);
    }
    removeObserver(node) {
        node?.viewModel.observe.remove(this.observer);
    }
};
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownBlock.prototype, "selected", void 0);
__decorate([
    property({ type: String, reflect: true })
], MarkdownBlock.prototype, "checked", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownBlock.prototype, "root", void 0);
__decorate([
    property({ type: String, reflect: true })
], MarkdownBlock.prototype, "type", void 0);
__decorate([
    property({ attribute: false })
], MarkdownBlock.prototype, "node", void 0);
__decorate([
    contextProvided({ context: hostContext, subscribe: true }),
    property({ attribute: false })
], MarkdownBlock.prototype, "hostContext", void 0);
MarkdownBlock = __decorate([
    customElement('md-block')
], MarkdownBlock);
export { MarkdownBlock };
let MarkdownRenderer = class MarkdownRenderer extends LitElement {
    constructor() {
        super(...arguments);
        this.hostContext = new HostContext();
    }
    static get styles() {
        return [
            ...MarkdownInline.styles,
            css `
        md-block {
          display: block;
          margin-block-start: 1em;
          margin-block-end: 1em;
        }
        md-block[root] {
          margin-block: 0;
        }
        md-block[type='list'] {
          list-style-type: disc;
          padding-inline-start: 20px;
        }
        md-block[type='list-item']:not([root]) {
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
          margin-block-start: -0.5em !important;
        }
        md-block[type='section'] > md-block:nth-child(2) {
          margin-block-start: 0.5em !important;
        }
        md-block > md-block:first-child {
          margin-block-start: 0em;
        }
        md-block > md-block:last-child {
          margin-block-end: 0em;
        }
        md-block[type='list'] + md-block {
          margin-block-start: 0em;
        }
        md-block[selected]:not([type='section']),
        md-block[selected][type='section'] > md-inline {
          background: var(--md-block-selection-color);
          caret-color: transparent;
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
        this.hostContext.root = this.block;
        if (!this.block)
            return html ``;
        return html `<md-block .node=${this.block} ?root=${true}></md-block>`;
    }
    getInlineSelection() {
        let active = this.shadowRoot.activeElement;
        while (true) {
            if (!active || active instanceof MarkdownInline) {
                const selection = active?.getSelection();
                return {
                    inline: active || undefined,
                    startIndex: selection?.start.index,
                    endIndex: selection?.end.index,
                };
            }
            else {
                active = active.shadowRoot?.activeElement ?? null;
            }
        }
    }
};
__decorate([
    contextProvider({ context: hostContext }),
    state()
], MarkdownRenderer.prototype, "hostContext", void 0);
__decorate([
    property({ type: Object, reflect: false })
], MarkdownRenderer.prototype, "block", void 0);
MarkdownRenderer = __decorate([
    customElement('md-block-render')
], MarkdownRenderer);
export { MarkdownRenderer };
//# sourceMappingURL=block-render.js.map
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
var MarkdownInline_1;
import { html, LitElement, customElement, property, repeat, css, } from '../deps/lit.js';
import Parser from '../deps/tree-sitter.js';
await Parser.init();
const blocks = await Parser.Language.load('/tree-sitter-markdown_inline.wasm');
const parser = new Parser();
parser.setLanguage(blocks);
let MarkdownInline = MarkdownInline_1 = class MarkdownInline extends LitElement {
    constructor() {
        super();
        this.contenteditable = true;
        this.active = false;
        this.hasFocus = false;
        this.observer = (node) => {
            if (node !== this.node) {
                this.removeObserver(node);
                return;
            }
            this.requestUpdate();
        };
        this.addEventListener('beforeinput', this.onBeforeInput, { capture: true });
        this.addEventListener('keydown', this.onKeyDown, { capture: true });
        this.addEventListener('pointerup', () => {
            if (this.hasFocus) {
                this.active = true;
            }
        });
        this.addEventListener('focus', () => {
            this.hasFocus = true;
        });
        this.addEventListener('blur', () => {
            this.active = false;
            this.hasFocus = false;
        });
    }
    static get styles() {
        return [
            css `
        md-inline {
          display: block;
          outline: none;
        }
        md-inline[active] {
          white-space: pre;
          --focus-invalid: --;
        }
        md-inline[active] * {
          white-space: pre-wrap;
        }
        md-span a,
        md-span {
          visibility: visible;
          font-size: 16px;
        }
        md-span[type='backslash_escape']::first-letter {
          font-size: 0;
        }
        md-span[type='link_destination'],
        md-span[type='link_title'],
        md-span[type='code_span_delimiter'],
        md-span[type='emphasis_delimiter'] {
          display: var(--focus-invalid, none);
        }
        md-span[type='inline_link'],
        md-span[type='image'],
        md-span[type='shortcut_link'] {
          visibility: var(--focus-invalid, collapse);
          font-size: var(--focus-invalid, 0);
        }
        md-span[type='shortcut_link'],
        md-span[type='inline_link'] {
          color: blue;
        }
        md-span[type='emphasis'] {
          font-style: italic;
        }
        md-span[type='strong_emphasis'] {
          font-weight: bold;
        }
        md-span[type='code_span'] {
          white-space: pre;
          font-family: monospace;
        }
      `,
        ];
    }
    render() {
        if (!this.node)
            return;
        if (this.node !== this.lastNode) {
            this.tree = undefined;
        }
        this.lastNode = this.node;
        this.tree = parser.parse(this.node.content, this.tree);
        return html `<md-span
      .node=${this.tree.rootNode}
      .active=${this.active}
    ></md-span>`;
    }
    willUpdate(changedProperties) {
        if (changedProperties.has('node')) {
            const oldNode = changedProperties.get('node');
            this.removeObserver(oldNode);
            this.addObserver(this.node);
        }
    }
    updated() {
        if (this.node?.viewModel.autofocus) {
            this.focus();
            this.active = true;
            this.node.viewModel.autofocus = false;
        }
    }
    createRenderRoot() {
        return this;
    }
    static nodeOffsetToInputPoint(node, offset) {
        if (node instanceof MarkdownInline_1) {
            return { index: 0 };
        }
        let previous = node.previousSibling;
        while (previous && previous.nodeType !== Node.ELEMENT_NODE) {
            previous = previous.previousSibling;
        }
        let index;
        if (previous) {
            index = previous.node.endIndex + offset;
        }
        else {
            index = node.parentElement.node.startIndex + offset;
        }
        return {
            span: node.parentElement,
            index,
        };
    }
    edit({ startIndex, newEndIndex, oldEndIndex, newText }, setFocus) {
        if (!this.node)
            throw new Error('no node');
        const oldText = this.node.content.substring(startIndex, oldEndIndex);
        const result = {
            oldText,
            newText,
            startIndex,
            startPosition: indexToPosition(this.node.content, startIndex),
            oldEndIndex,
            oldEndPosition: indexToPosition(this.node.content, oldEndIndex),
            newEndIndex,
            newEndPosition: indexToPosition(this.node.content, newEndIndex),
        };
        this.node.content = apply(this.node.content, result);
        this.node.viewModel.tree.observe.notify();
        this.tree = this.tree.edit(result);
        this.requestUpdate();
        if (setFocus) {
            setTimeout(() => {
                const selection = this.getRootNode().getSelection();
                const range = document.createRange();
                range.setStart(this, 0);
                selection.removeAllRanges();
                selection.addRange(range);
                for (let i = 0; i < newEndIndex; i++) {
                    selection.modify('move', 'forward', 'character');
                }
            }, 0);
        }
    }
    onKeyDown(e) {
        const inlineKeydown = {
            inline: this,
            node: this.node,
            keyboardEvent: e,
        };
        this.dispatchEvent(new CustomEvent('inline-keydown', {
            detail: inlineKeydown,
            bubbles: true,
            composed: true,
        }));
    }
    onBeforeInput(e) {
        if (!this.node)
            return;
        e.preventDefault();
        const selection = this.getRootNode().getSelection();
        const inputStart = MarkdownInline_1.nodeOffsetToInputPoint(selection.anchorNode, selection.anchorOffset);
        const inputEnd = MarkdownInline_1.nodeOffsetToInputPoint(selection.focusNode, selection.focusOffset);
        const inlineInput = {
            inline: this,
            node: this.node,
            inputEvent: e,
            inputStart,
            inputEnd,
            content: this.node.content,
        };
        this.dispatchEvent(new CustomEvent('inline-input', {
            detail: inlineInput,
            bubbles: true,
            composed: true,
        }));
    }
    addObserver(node) {
        node?.viewModel.observe.add(this.observer);
    }
    removeObserver(node) {
        node?.viewModel.observe.remove(this.observer);
    }
};
__decorate([
    property({ type: Object, reflect: false })
], MarkdownInline.prototype, "node", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownInline.prototype, "contenteditable", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownInline.prototype, "active", void 0);
MarkdownInline = MarkdownInline_1 = __decorate([
    customElement('md-inline')
], MarkdownInline);
export { MarkdownInline };
let MarkdownSpan = class MarkdownSpan extends LitElement {
    constructor() {
        super();
        this.active = false;
        this.formatting = false;
        this.type = '';
        this.nodeIds = new NodeIds();
    }
    shouldUpdate(changed) {
        let result = false;
        if (changed.has('node')) {
            const oldSyntaxNode = changed.get('node');
            const newSyntaxNode = this.node;
            if (newSyntaxNode &&
                (!oldSyntaxNode || oldSyntaxNode.id !== newSyntaxNode.id)) {
                result = true;
                this.nodeIds?.migrate(oldSyntaxNode, newSyntaxNode);
            }
        }
        return result;
    }
    createRenderRoot() {
        return this;
    }
    onLinkClick(event) {
        event.preventDefault();
        const anchor = event.composedPath()[0];
        const inlineLinkClick = {
            type: this.node.type,
            destination: anchor.getAttribute('href') ?? '',
        };
        this.dispatchEvent(new CustomEvent('inline-link-click', {
            detail: inlineLinkClick,
            bubbles: true,
            composed: true,
        }));
    }
    render() {
        const node = this.node;
        if (!node)
            return html ``;
        if (typeof node === 'string') {
            this.type = '';
            return html `${node}`;
        }
        this.type = node.type;
        this.formatting = isFormatting(node);
        let index = node.startIndex;
        if (!this.active &&
            (node.type === 'inline_link' || node.type === 'shortcut_link')) {
            const text = node.namedChildren.find(node => node.type === 'link_text')?.text ?? '';
            const destination = node.namedChildren.find(node => node.type === 'link_destination')
                ?.text ?? text;
            return html `<a
        href="${destination}"
        target="_blank"
        @click=${this.onLinkClick}
        contenteditable=${false}
        >${text}</a
      >`;
        }
        const results = [];
        const children = [...node.namedChildren];
        while (index < node.endIndex) {
            const child = children.shift();
            if (child) {
                if (index < child.startIndex) {
                    const text = node.text.substring(index - node.startIndex, child.startIndex - node.startIndex);
                    results.push({ result: html `${text}` });
                }
                index = child.endIndex;
                results.push({
                    node: child,
                    result: html `<md-span
            .node=${child}
            .active=${this.active}
          ></md-span>`,
                });
            }
            else {
                const text = node.text.substring(index - node.startIndex, node.endIndex - node.startIndex);
                results.push({ result: html `${text}` });
                index = node.endIndex;
            }
        }
        let nextId = -Number.MAX_SAFE_INTEGER;
        const key = (result) => {
            if (!result.node)
                return nextId++;
            return this.nodeIds.get(result.node);
        };
        const content = repeat(results, key, item => {
            return item.result;
        });
        return content;
    }
};
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownSpan.prototype, "active", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], MarkdownSpan.prototype, "formatting", void 0);
__decorate([
    property({ type: String, reflect: true })
], MarkdownSpan.prototype, "type", void 0);
__decorate([
    property({ type: Object, reflect: false })
], MarkdownSpan.prototype, "node", void 0);
MarkdownSpan = __decorate([
    customElement('md-span')
], MarkdownSpan);
export { MarkdownSpan };
class NodeIds {
    constructor() {
        this.idMap = new Map();
        this.nextId = 0;
    }
    get(node) {
        return this.idMap.get(node.id);
    }
    migrate(oldNode, newNode) {
        const posMap = new Map();
        function key(node) {
            return node.startIndex;
        }
        for (const node of childNodes(oldNode)) {
            posMap.set(key(node), this.idMap.get(node.id));
        }
        this.idMap = new Map();
        for (const node of childNodes(newNode)) {
            this.idMap.set(node.id, posMap.get(key(node)) ?? this.nextId++);
        }
        return this.idMap.size;
    }
}
function* childNodes(node) {
    if (!node)
        return;
    const next = (next) => {
        if (next)
            node = next;
        return !!next;
    };
    if (next(node.firstChild)) {
        do {
            yield node;
        } while (next(node.nextSibling));
    }
}
function indexToPosition(text, index) {
    let row = 1;
    let column = 1;
    for (let i = 0; i < index; i++) {
        if (text[i] === '\n') {
            row++;
            column = 1;
        }
        else {
            column++;
        }
    }
    return { row, column };
}
function apply(text, edit) {
    return (text.substring(0, edit.startIndex) +
        (edit.newText ?? '') +
        text.substring(edit.oldEndIndex));
}
function isFormatting(node) {
    return [
        'block_continuation',
        'list_marker_star',
        'list_marker_minus',
        'list_marker_dot',
        'code_span_delimiter',
        'fenced_code_block_delimiter',
        'info_string',
        'block_quote_marker',
        'emphasis_delimiter',
        'setext_h1_underline',
    ].includes(node.type);
}
//# sourceMappingURL=inline-render.js.map
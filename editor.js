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
import './markdown/block-render.js';
import { libraryContext } from './app-context.js';
import { assert, cast } from './asserts.js';
import { contextProvided, contextProvider } from './deps/lit-labs-context.js';
import { css, customElement, html, LitElement, property, query, state } from './deps/lit.js';
import { parseBlocks } from './markdown/block-parser.js';
import { serializeToString } from './markdown/block-serializer.js';
import { hostContext } from './markdown/host-context.js';
import { normalizeTree } from './markdown/normalize.js';
import { ancestors, children, findAncestor, findNextEditable, findPreviousDfs, reverseDfs, swapNodes } from './markdown/view-model-util.js';
import { Observer, Observers } from './observe.js';
let Editor = class Editor extends LitElement {
    constructor() {
        super();
        this.dirty = false;
        this.hostContext = {};
        this.observers = new Observers(new Observer(() => this.document?.observe, (t, o) => t?.add(o), (t, o) => t?.remove(o), () => this.requestUpdate()));
        // this.addEventListener('focus', () => this.appContext.activeEditor =
        // this);
    }
    static get styles() {
        return [
            css `
        #status {
          position: absolute;
        }
        #content {
          display: flex;
          justify-content: center;
          flex-grow: 1;
        }
        md-block-render {
          width: 700px;
        }
      `,
        ];
    }
    render() {
        this.observers.update();
        this.dirty = this.document?.dirty ?? false;
        return html `
    <div id=status>${this.document?.dirty ? '💽' : ''}</div>
    <div id=content>
    <md-block-render
      .block=${this.document?.tree.root}
      @inline-input=${this.onInlineInput}
      @inline-link-click=${this.onInlineLinkClick}
      @inline-keydown=${this.onInlineKeyDown}></md-block-render>
    </div>`;
    }
    async connectedCallback() {
        super.connectedCallback();
        const url = new URL(location.toString());
        await this.updateComplete;
        if (url.searchParams.has('path')) {
            await this.load(url.searchParams.get('path'));
        }
    }
    async load(name) {
        if (!this.library)
            return;
        this.status = 'loading';
        this.document = undefined;
        try {
            this.document = await this.library.getDocument(name + '.md');
            normalizeTree(this.document.tree);
            const node = findNextEditable(this.document.tree.root);
            if (node) {
                focusNode(this.hostContext, node, 0);
            }
            this.status = 'loaded';
        }
        catch (e) {
            this.status = 'error';
            console.error(e);
        }
    }
    onInlineLinkClick({ detail: { destination }, }) {
        this.load(destination);
    }
    onInlineKeyDown({ detail: { inline, node, keyboardEvent }, }) {
        const finishEditing = node.viewModel.tree.edit();
        try {
            assert(inline.node);
            if (keyboardEvent.key === 'ArrowUp') {
                keyboardEvent.preventDefault();
                const result = inline.moveCaretUp();
                if (result !== true) {
                    const prev = findPreviousDfs(node, ({ type }) => ['paragraph', 'code-block', 'section'].includes(type));
                    if (prev)
                        focusNode(this.hostContext, prev, -result);
                }
            }
            else if (keyboardEvent.key === 'ArrowDown') {
                keyboardEvent.preventDefault();
                const result = inline.moveCaretDown();
                if (result !== true) {
                    const next = findNextEditable(node);
                    if (next)
                        focusNode(this.hostContext, next, -result);
                }
            }
            else if (keyboardEvent.key === 'Tab') {
                keyboardEvent.preventDefault();
                const { start } = inline.getSelection();
                focusNode(this.hostContext, node, start.index);
                if (keyboardEvent.shiftKey) {
                    unindent(node);
                }
                else {
                    indent(node);
                }
            }
            else {
                return;
            }
        }
        finally {
            finishEditing();
        }
    }
    onInlineInput(event) {
        const { detail: { inline, inputEvent, inputStart, inputEnd }, } = event;
        if (!inline.node)
            return;
        const finishEditing = inline.node.viewModel.tree.edit();
        try {
            if (handleInlineInputAsBlockEdit(event, this.hostContext))
                return;
            let newText;
            let startIndex;
            let oldEndIndex;
            let newEndIndex;
            if (inputEvent.inputType === 'insertText' ||
                inputEvent.inputType === 'insertReplacementText' ||
                inputEvent.inputType === 'insertFromPaste' ||
                inputEvent.inputType === 'deleteByCut' ||
                inputEvent.inputType === 'deleteContentBackward') {
                startIndex = inputStart.index;
                oldEndIndex = inputEnd.index;
                if (inputEvent.inputType === 'insertReplacementText' ||
                    inputEvent.inputType === 'insertFromPaste') {
                    newText = inputEvent.dataTransfer.getData('text');
                }
                else if (inputEvent.inputType === 'deleteByCut') {
                    newText = '';
                }
                else if (inputEvent.inputType === 'deleteContentBackward') {
                    newText = '';
                    startIndex = Math.max(0, startIndex - 1);
                }
                else {
                    newText = inputEvent.data ?? '';
                }
                newEndIndex = startIndex + newText.length;
            }
            else {
                console.log('unsupported inputType:', inputEvent.inputType);
                return;
            }
            const edit = {
                newText,
                startIndex,
                oldEndIndex,
                newEndIndex,
            };
            this.editInlineNode(inline.node, edit);
        }
        finally {
            finishEditing();
        }
    }
    editInlineNode(node, edit) {
        const newNodes = node.viewModel.edit(edit);
        if (newNodes) {
            // TODO: is this needed?
            normalizeTree(node.viewModel.tree);
            const next = findNextEditable(newNodes[0], true);
            // TODO: is the focus offset always 0?
            if (next)
                focusNode(this.hostContext, next, 0);
        }
        else {
            // TODO: generalize this (inline block mutation)
            const parent = node.viewModel.parent;
            if (parent?.type === 'list-item' && parent.checked === undefined &&
                /^\[( |x)] /.test(node.content)) {
                parent.viewModel.updateChecked(node.content[1] === 'x');
                node.viewModel.edit({
                    newText: '',
                    startIndex: 0,
                    newEndIndex: 0,
                    oldEndIndex: 4,
                });
            }
            focusNode(this.hostContext, node, edit.newEndIndex);
        }
    }
    getCommands() {
        const { node: activeInline } = this.markdownRenderer.getInlineSelection();
        return [
            {
                description: 'Find, Open, Create...',
                argument: {
                    description: 'Find or create...',
                    suggestions: () => this.library.getAllNames(),
                    validate: () => true,
                },
                execute: (file) => this.load(file),
            },
            {
                description: 'Force save',
                execute: async () => this.document?.save(),
            },
            {
                description: 'Copy all as markdown',
                execute: async () => {
                    const markdown = serializeToString(this.document.tree.root);
                    const type = 'application/x-markdown';
                    navigator.clipboard.write([
                        new ClipboardItem({ [type]: new Blob([markdown], { type }) }),
                    ]);
                },
            },
            {
                description: 'Paste as markdown',
                execute: async () => {
                    if (!activeInline)
                        return;
                    const target = activeInline;
                    const text = await navigator.clipboard.readText();
                    const root = parseBlocks(text + '\n');
                    if (!root)
                        return;
                    assert(root.type === 'document' && root.children);
                    const finishEditing = target.viewModel.tree.edit();
                    try {
                        const newNodes = root.children.map(node => target.viewModel.tree.add(node));
                        performLogicalInsertion(activeInline, newNodes);
                    }
                    finally {
                        finishEditing();
                    }
                    // TODO: focus the last inline node
                },
            },
        ];
    }
};
__decorate([
    property({ type: String, reflect: true })
], Editor.prototype, "status", void 0);
__decorate([
    state()
], Editor.prototype, "document", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], Editor.prototype, "dirty", void 0);
__decorate([
    contextProvided({ context: libraryContext, subscribe: true }),
    state()
], Editor.prototype, "library", void 0);
__decorate([
    contextProvider({ context: hostContext }),
    state()
], Editor.prototype, "hostContext", void 0);
__decorate([
    query('md-block-render')
], Editor.prototype, "markdownRenderer", void 0);
Editor = __decorate([
    customElement('pkm-editor')
], Editor);
export { Editor };
function performLogicalInsertion(context, nodes) {
    const { parent, nextSibling } = nextLogicalInsertionPoint(context);
    if (parent.type == 'list') {
        if (nodes.length === 1 && nodes[0].type === 'list') {
            const [node] = nodes;
            for (const child of children(node)) {
                assert(child.type === 'list-item');
                child.viewModel.insertBefore(parent, nextSibling);
            }
        }
        else {
            const listItem = parent.viewModel.tree.add({
                type: 'list-item',
                // TODO: infer from list
                marker: '*',
            });
            listItem.viewModel.insertBefore(parent, nextSibling);
            for (const node of nodes) {
                node.viewModel.insertBefore(listItem, undefined);
            }
        }
    }
    else {
        for (const node of nodes) {
            node.viewModel.insertBefore(parent, nextSibling);
        }
    }
}
function nextLogicalInsertionPoint(node) {
    if (!node.viewModel.nextSibling &&
        node.viewModel.parent?.type === 'list-item') {
        const listItem = node.viewModel.parent;
        return {
            parent: cast(listItem.viewModel.parent),
            nextSibling: listItem.viewModel.nextSibling,
        };
    }
    return {
        parent: cast(node.viewModel.parent),
        nextSibling: node.viewModel.nextSibling,
    };
}
function maybeMergeContentInto(node, target, context) {
    if (target.type === 'code-block' || target.type === 'paragraph' ||
        target.type === 'section') {
        focusNode(context, target, target.content.length);
        target.viewModel.edit({
            startIndex: target.content.length,
            oldEndIndex: target.content.length,
            newEndIndex: target.content.length + node.content.length,
            newText: node.content,
        });
        node.viewModel.remove();
        return true;
    }
    return false;
}
function focusNode(context, node, offset) {
    context.focusNode = node;
    context.focusOffset = offset;
    node.viewModel.observe.notify();
}
function unindent(node) {
    const { ancestor: listItem, path } = findAncestor(node, 'list-item');
    if (!listItem || !path)
        return;
    const target = path[0];
    const nextSibling = listItem.viewModel.nextSibling;
    const list = listItem.viewModel.parent;
    const targetListItemSibling = list.viewModel.parent;
    if (targetListItemSibling?.type === 'list-item') {
        listItem.viewModel.insertBefore(cast(targetListItemSibling.viewModel.parent), targetListItemSibling.viewModel.nextSibling);
    }
    else {
        target.viewModel.insertBefore(cast(list.viewModel.parent), list.viewModel.nextSibling);
        listItem.viewModel.remove();
    }
    // Siblings of the undended list-item move to sublist.
    if (nextSibling) {
        let next = nextSibling;
        while (next) {
            if (listItem.viewModel.lastChild?.type !== 'list') {
                listItem.viewModel.tree
                    .add({
                    type: 'list',
                })
                    .viewModel.insertBefore(listItem);
            }
            const targetList = listItem.viewModel.lastChild;
            const toMove = next;
            next = toMove.viewModel.nextSibling;
            toMove.viewModel.insertBefore(targetList);
        }
    }
    // The target might have been removed from the list item. Move any
    // remaining siblings to the same level.
    if (listItem.children?.length && !listItem.viewModel.parent) {
        // TODO: move more than the first child.
        listItem.viewModel.firstChild?.viewModel.insertBefore(cast(target.viewModel.parent), target.viewModel.nextSibling);
    }
    if (!list.children?.length) {
        list.viewModel.remove();
    }
}
function indent(node) {
    let target = node;
    for (const ancestor of ancestors(node)) {
        if (ancestor.type === 'list-item') {
            break;
        }
        if (ancestor.type === 'document') {
            break;
        }
        // Don't indent a section at the top level, unless we are inside a heading.
        if (ancestor.type === 'section' &&
            ancestor.viewModel.parent.type == 'document') {
            if (target.type === 'section') {
                target = ancestor;
            }
            break;
        }
        target = ancestor;
    }
    let listItem;
    if (target.viewModel.parent.type === 'list-item') {
        listItem = target.viewModel.parent;
    }
    else {
        listItem = target.viewModel.tree.add({
            type: 'list-item',
            marker: '* ',
        });
        listItem.viewModel.insertBefore(cast(target.viewModel.parent), target);
        target.viewModel.insertBefore(listItem);
    }
    const listItemPreviousSibling = listItem.viewModel.previousSibling;
    if (listItemPreviousSibling?.type === 'list-item') {
        const lastChild = listItemPreviousSibling.viewModel.lastChild;
        if (lastChild?.type === 'list') {
            listItem.viewModel.insertBefore(lastChild);
        }
        else {
            listItem.viewModel.insertBefore(listItemPreviousSibling);
        }
    }
    else if (listItemPreviousSibling?.type === 'list') {
        listItem.viewModel.insertBefore(listItemPreviousSibling);
    }
    // Ensure the list-item we may have created is in a list.
    if (listItem.viewModel.parent.type !== 'list') {
        const list = target.viewModel.tree.add({
            type: 'list',
        });
        list.viewModel.insertBefore(cast(listItem.viewModel.parent), listItem);
        listItem.viewModel.insertBefore(list);
    }
}
function insertSiblingParagraph(node, startIndex, context) {
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(cast(node.viewModel.parent), node.viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function insertParagraphInList(node, startIndex, context) {
    const { ancestor, path } = findAncestor(node, 'list');
    if (!ancestor)
        return false;
    let targetList;
    let targetListItemNextSibling;
    if (node.viewModel.nextSibling) {
        if (node.viewModel.nextSibling.type === 'list') {
            targetList = node.viewModel.nextSibling;
            targetListItemNextSibling = targetList.viewModel.firstChild;
        }
        else {
            targetList = node.viewModel.tree.add({
                type: 'list',
            });
            targetList.viewModel.insertBefore(cast(node.viewModel.parent), node.viewModel.nextSibling);
            targetListItemNextSibling = undefined;
        }
    }
    else {
        targetList = ancestor;
        targetListItemNextSibling = path[0].viewModel.nextSibling;
    }
    const firstListItem = targetList.viewModel.firstChild;
    if (firstListItem && firstListItem.type !== 'list-item')
        return false;
    const newListItem = node.viewModel.tree.add({
        type: 'list-item',
        marker: firstListItem?.marker ?? '* ',
    });
    newListItem.viewModel.insertBefore(targetList, targetListItemNextSibling);
    if (newListItem.viewModel.previousSibling?.type === 'list-item' &&
        newListItem.viewModel.previousSibling.checked !== undefined) {
        newListItem.viewModel.updateChecked(false);
    }
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(newListItem);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function insertParagraphInDocument(node, startIndex, context) {
    const { ancestor: section, path } = findAncestor(node, 'document');
    if (!section)
        return false;
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function insertParagraphInSection(node, startIndex, context) {
    let { ancestor: section, path } = findAncestor(node, 'section');
    let nextSibling;
    if (section) {
        nextSibling = path[0].viewModel.nextSibling;
    }
    else if (node.type === 'section') {
        section = node;
        nextSibling = section.viewModel.firstChild;
    }
    if (!section)
        return false;
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(section, nextSibling);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function areAncestorAndDescendant(node, node2) {
    return [...ancestors(node)].includes(node2) ||
        [...ancestors(node2)].includes(node);
}
function finishInsertParagraph(node, newParagraph, startIndex, context) {
    const shouldSwap = startIndex === 0 && node.content.length > 0 &&
        !areAncestorAndDescendant(node, newParagraph);
    if (shouldSwap) {
        swapNodes(node, newParagraph);
    }
    else {
        newParagraph.viewModel.edit({
            startIndex: 0,
            newEndIndex: 0,
            oldEndIndex: 0,
            newText: node.content.substring(startIndex),
        });
        node.viewModel.edit({
            startIndex,
            oldEndIndex: node.content.length,
            newEndIndex: startIndex,
            newText: '',
        });
    }
    focusNode(context, newParagraph);
}
function handleInlineInputAsBlockEdit({ detail: { inline, inputEvent, inputStart, inputEnd }, }, context) {
    if (!inline.node)
        return false;
    if (inputEvent.inputType === 'deleteContentBackward') {
        if (inputStart.index !== 0 || inputEnd.index !== 0)
            return false;
        const node = inline.node;
        // Turn sections and code-blocks into paragraphs.
        if (node.type === 'section') {
            node.viewModel.updateMarker(node.marker.substring(0, node.marker.length - 1));
            if (node.marker === '') {
                const paragraph = node.viewModel.tree.add({
                    type: 'paragraph',
                    content: node.content,
                });
                paragraph.viewModel.insertBefore(cast(node.viewModel.parent), node);
                // Move all section content out.
                for (const child of children(node)) {
                    child.viewModel.insertBefore(cast(node.viewModel.parent), node);
                }
                node.viewModel.remove();
                focusNode(context, paragraph, 0);
            }
            else {
                focusNode(context, node, 0);
            }
            return true;
        }
        else if (node.type === 'code-block') {
            const paragraph = node.viewModel.tree.add({
                type: 'paragraph',
                content: node.content, // TODO: detect new blocks
            });
            paragraph.viewModel.insertBefore(cast(node.viewModel.parent), node);
            node.viewModel.remove();
            focusNode(context, paragraph, 0);
            return true;
        }
        // Remove a surrounding block-quote.
        const { ancestor } = findAncestor(node, 'block-quote');
        if (ancestor) {
            // Unless there's an earlier opportunity to merge into a previous
            // content node.
            for (const prev of reverseDfs(node, ancestor)) {
                if (maybeMergeContentInto(node, prev, context))
                    return true;
            }
            for (const child of [...children(ancestor)]) {
                child.viewModel.insertBefore(cast(ancestor.viewModel.parent), ancestor);
            }
            ancestor.viewModel.remove();
            focusNode(context, node);
            return true;
        }
        // Merge into a previous content node.
        for (const prev of reverseDfs(node)) {
            if (maybeMergeContentInto(node, prev, context))
                return true;
        }
    }
    else if (inputEvent.inputType === 'insertParagraph') {
        return insertParagraphInList(inline.node, inputStart.index, context) ||
            insertParagraphInSection(inline.node, inputStart.index, context) ||
            insertParagraphInDocument(inline.node, inputStart.index, context);
    }
    else if (inputEvent.inputType === 'insertLineBreak') {
        return insertSiblingParagraph(inline.node, inputStart.index, context);
    }
    return false;
}
//# sourceMappingURL=editor.js.map
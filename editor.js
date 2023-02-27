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
import './autocomplete.js';
import { libraryContext } from './app-context.js';
import { assert, cast } from './asserts.js';
import { contextProvided } from './deps/lit-labs-context.js';
import { css, customElement, html, LitElement, property, query, state } from './deps/lit.js';
import { parseBlocks } from './markdown/block-parser.js';
import { serializeToString } from './markdown/block-serializer.js';
import { focusNode } from './markdown/host-context.js';
import { normalizeTree } from './markdown/normalize.js';
import { ancestors, children, findAncestor, findFinalEditable, findNextEditable, findPreviousEditable, reverseDfs, swapNodes } from './markdown/view-model-util.js';
import { Observer, Observers } from './observe.js';
import { getContainingTransclusion } from './markdown/transclusion.js';
import { resolveDateAlias } from './date-aliases.js';
import { maybeEditBlockSelectionIndent, editInlineIndent } from './indent-util.js';
import { getBlockSelectionTarget, maybeRemoveSelectedNodes, maybeRemoveSelectedNodesIn } from './block-selection-util.js';
let Editor = class Editor extends LitElement {
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
    constructor() {
        super();
        this.dirty = false;
        this.observers = new Observers(new Observer(() => this.document?.observe, (t, o) => t?.add(o), (t, o) => t?.remove(o), () => this.requestUpdate()));
    }
    render() {
        this.observers.update();
        this.dirty = this.document?.dirty ?? false;
        return html `
    <div id=status>${this.document?.dirty ? '💽' : ''}</div>
    <div id=content>
    <md-block-render
      .block=${this.root}
      @inline-input=${this.onInlineInput}
      @inline-link-click=${this.onInlineLinkClick}
      @inline-keydown=${this.onInlineKeyDown}></md-block-render>
    </div>
    <pkm-autocomplete></pkm-autocomplete>`;
    }
    async connectedCallback() {
        super.connectedCallback();
        const url = new URL(location.toString());
        await this.updateComplete;
        if (url.searchParams.has('path')) {
            await this.load(url.searchParams.get('path'));
        }
    }
    async load(name, forceRefresh = false) {
        if (!this.library)
            return;
        // TODO: this probably belongs somewhere else
        name = resolveDateAlias(name) ?? name;
        this.status = 'loading';
        this.document = undefined;
        try {
            this.document = await this.library.getDocument(name, forceRefresh);
            this.root = this.document.tree.root;
            normalizeTree(this.document.tree);
            const node = findNextEditable(this.root, this.root);
            if (node) {
                focusNode(this.markdownRenderer.hostContext, node, 0);
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
    onInlineKeyDown(event) {
        const { detail: { inline, node, keyboardEvent } } = event;
        const hostContext = cast(inline.hostContext);
        const finishEditing = node.viewModel.tree.edit();
        try {
            assert(inline.node);
            if (this.autocomplete.onInlineKeyDown(event)) {
                return;
            }
            else if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(keyboardEvent.key)) {
                keyboardEvent.preventDefault();
                const direction = ['ArrowUp', 'ArrowLeft'].includes(keyboardEvent.key) ? 'backward' : 'forward';
                const alter = keyboardEvent.shiftKey ? 'extend' : 'move';
                const granularity = ['ArrowUp', 'ArrowDown'].includes(keyboardEvent.key) ? 'line' : keyboardEvent.ctrlKey ? 'word' : 'character';
                const result = hostContext.hasSelection ? 0 : inline.moveCaret(alter, direction, granularity);
                if (result === true) {
                    hostContext.clearSelection();
                }
                else {
                    function updateFocus(element, node, offset) {
                        // Retarget if there's any containing transclusion that has a selection.
                        const target = getBlockSelectionTarget(element);
                        if (target) {
                            node = cast(target.node);
                            element = target;
                        }
                        if (alter !== 'extend') {
                            cast(element.hostContext).clearSelection();
                        }
                        while (true) {
                            const root = cast(cast(element.hostContext).root);
                            const next = direction === 'backward' ? findPreviousEditable(node, root) : findNextEditable(node, root);
                            if (next) {
                                focusNode(cast(element.hostContext), next, direction === 'backward' ? -offset : offset);
                                return { node, element, next };
                            }
                            else {
                                const transclusion = getContainingTransclusion(element);
                                if (!transclusion || alter === 'extend')
                                    return {};
                                element = transclusion;
                                node = cast(transclusion.node);
                            }
                        }
                    }
                    const { node: updatedNode, element, next } = updateFocus(inline, node, result);
                    if (next && alter === 'extend') {
                        const hostContext = cast(element.hostContext);
                        if (hostContext.selectionAnchor) {
                            hostContext.extendSelection(updatedNode, next);
                        }
                        else {
                            this.autocomplete.abort();
                            hostContext.setSelection(updatedNode, next);
                        }
                    }
                }
            }
            else if (keyboardEvent.key === 'Tab') {
                keyboardEvent.preventDefault();
                const mode = keyboardEvent.shiftKey ? 'unindent' : 'indent';
                if (maybeEditBlockSelectionIndent(inline, mode))
                    return;
                editInlineIndent(inline, mode);
            }
            else if (keyboardEvent.key === 'a' && keyboardEvent.ctrlKey) {
                keyboardEvent.preventDefault();
                if (!hostContext.hasSelection) {
                    this.autocomplete.abort();
                    hostContext.setSelection(node, node);
                }
            }
            else if (keyboardEvent.key === 'c' && keyboardEvent.ctrlKey) {
                const { hostContext } = getBlockSelectionTarget(inline) ?? {};
                if (!hostContext)
                    return;
                keyboardEvent.preventDefault();
                copyMarkdownToClipboard(serializeSelection(hostContext));
            }
            else if (keyboardEvent.key === 'x' && keyboardEvent.ctrlKey) {
                const { hostContext } = getBlockSelectionTarget(inline) ?? {};
                if (!hostContext)
                    return;
                keyboardEvent.preventDefault();
                copyMarkdownToClipboard(serializeSelection(hostContext));
                maybeRemoveSelectedNodesIn(hostContext);
                hostContext.clearSelection();
            }
            else if (keyboardEvent.key === 'Escape') {
                hostContext.clearSelection();
            }
            else if (keyboardEvent.key === 'Backspace') {
                if (!maybeRemoveSelectedNodes(inline))
                    return;
                keyboardEvent.preventDefault();
            }
            else {
                return;
            }
        }
        finally {
            finishEditing();
        }
    }
    async triggerPaste(inline, node, edit, forceMarkdown = false) {
        const content = await navigator.clipboard.read();
        const mdItem = content.find(item => item.types.includes('web text/markdown'));
        let mdText;
        if (mdItem) {
            const blob = await mdItem.getType('web text/markdown');
            mdText = await blob.text();
            // TODO: Drop this hack for broken custom formats.
            if (mdText.length === 0) {
                mdText = await navigator.clipboard.readText();
            }
        }
        else if (forceMarkdown) {
            mdText = await navigator.clipboard.readText();
        }
        if (mdText) {
            const root = parseBlocks(mdText + '\n');
            if (!root)
                return;
            assert(root.type === 'document' && root.children);
            const finishEditing = node.viewModel.tree.edit();
            try {
                const newNodes = root.children.map(newNode => node.viewModel.tree.add(newNode));
                let newFocus = findFinalEditable(newNodes[0]);
                performLogicalInsertion(node, newNodes);
                if (newFocus)
                    focusNode(cast(inline.hostContext), newFocus, Infinity);
            }
            finally {
                finishEditing();
            }
        }
        else {
            let text = await navigator.clipboard.readText();
            // TODO: Escape block creation.
            text = text.replace(/\n/g, ' ');
            const finishEditing = node.viewModel.tree.edit();
            try {
                this.editInlineNode(node, {
                    ...edit,
                    newText: text,
                    newEndIndex: edit.oldEndIndex + text.length,
                }, cast(inline.hostContext)); // TODO: wrong context
            }
            finally {
                finishEditing();
            }
        }
    }
    onInlineInput(event) {
        const { detail: { inline, inputEvent, inputStart, inputEnd }, } = event;
        if (!inline.node)
            return;
        // TODO: Most edit types could be handled here. E.g. insertText
        // could replace the selection.
        const { hostContext: selectionHostContext } = getBlockSelectionTarget(inline) ?? {};
        selectionHostContext?.clearSelection();
        const finishEditing = inline.node.viewModel.tree.edit();
        try {
            if (handleInlineInputAsBlockEdit(event, cast(inline.hostContext))) {
                this.autocomplete.abort();
                return;
            }
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
                    this.triggerPaste(inline, inline.node, { startIndex, oldEndIndex });
                    this.autocomplete.abort();
                    return;
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
            this.editInlineNode(inline.node, edit, cast(inline.hostContext));
            this.autocomplete.onInlineEdit(inline, newText, newEndIndex);
        }
        finally {
            finishEditing();
        }
    }
    editInlineNode(node, edit, hostContext) {
        const newNodes = node.viewModel.edit(edit);
        if (newNodes) {
            // TODO: is this needed?
            normalizeTree(node.viewModel.tree);
            const next = findNextEditable(newNodes[0], cast(hostContext.root), true);
            // TODO: is the focus offset always 0?
            if (next)
                focusNode(hostContext, next, 0);
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
            focusNode(hostContext, node, edit.newEndIndex);
        }
    }
    getCommands() {
        const { inline: activeInline, startIndex, endIndex } = this.markdownRenderer.getInlineSelection();
        const activeNode = activeInline?.node;
        const inTopLevelDocument = activeNode?.viewModel.tree === this.root?.viewModel.tree ?? false;
        const transclusion = activeInline && getContainingTransclusion(activeInline);
        return [
            {
                description: 'Find, Open, Create...',
                execute: async () => {
                    return (await this.library.getAllNames()).map(name => ({
                        description: name,
                        execute: async () => (this.load(name), []),
                    }));
                },
                executeFreeform: async (file) => (this.load(file), []),
            },
            {
                description: 'Force open',
                execute: async () => {
                    return (await this.library.getAllNames()).map(name => ({
                        description: name,
                        execute: async () => (this.load(name, true), []),
                    }));
                },
                executeFreeform: async (file) => (this.load(file, true), []),
            },
            {
                description: 'Sync all',
                execute: async () => {
                    await this.library.sync();
                    return [];
                },
                executeFreeform: async (file) => (this.load(file, true), []),
            },
            {
                description: 'Force save',
                execute: async () => (this.document?.save(), [])
            },
            {
                description: 'Copy all as markdown',
                execute: async () => {
                    const markdown = serializeToString(this.document.tree.root);
                    copyMarkdownToClipboard(markdown);
                    return [];
                },
            },
            {
                description: 'Backlinks',
                execute: async () => {
                    return this.library.backLinks.getBacklinksByDocument(this.document, this.library).map(name => ({
                        description: name,
                        execute: async () => (this.load(name), []),
                    }));
                }
            },
            ...activeNode && startIndex !== undefined && endIndex !== undefined ? [{
                    description: 'Paste as markdown',
                    execute: async () => {
                        this.triggerPaste(activeInline, activeNode, { startIndex, oldEndIndex: endIndex }, true);
                        return [];
                    },
                }] : [],
            ...inTopLevelDocument && activeNode && activeInline ? [{
                    description: 'Focus on block',
                    execute: async () => {
                        this.root = logicalContainingBlock(activeNode);
                        focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                        return [];
                    },
                }] : [],
            ...inTopLevelDocument && this.root !== this.document?.tree.root ? [{
                    description: 'Focus on containing block',
                    execute: async () => {
                        if (this.root?.viewModel.parent)
                            this.root = logicalContainingBlock(this.root.viewModel.parent);
                        if (activeNode && activeInline)
                            focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                        return [];
                    },
                }] : [],
            ...inTopLevelDocument && this.root !== this.document?.tree.root ? [{
                    description: 'Focus on document',
                    execute: async () => {
                        this.root = this.document?.tree.root;
                        if (activeNode)
                            focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                        return [];
                    },
                }] : [],
            ...transclusion ? [{
                    description: 'Delete transclusion',
                    execute: async () => {
                        const finished = transclusion.node.viewModel.tree.edit();
                        transclusion.node.viewModel.remove();
                        finished();
                        // TODO: focus
                        return [];
                    },
                }] : [],
            ...activeNode ? [{
                    description: 'Insert transclusion',
                    execute: async () => {
                        return (await this.library.getAllNames()).map(target => ({
                            description: target,
                            execute: async () => {
                                const finished = activeNode.viewModel.tree.edit();
                                const newParagraph = activeNode.viewModel.tree.add({
                                    type: 'code-block',
                                    info: 'tc',
                                    content: target,
                                });
                                newParagraph.viewModel.insertBefore(cast(activeNode.viewModel.parent), activeNode.viewModel.nextSibling);
                                finished();
                                focusNode(activeInline.hostContext, newParagraph);
                                // TODO: focus
                                return [];
                            },
                        }));
                    },
                }] : [],
            ...transclusion ? [{
                    description: 'Insert before transclusion',
                    execute: async () => {
                        const node = transclusion.node;
                        const finished = node.viewModel.tree.edit();
                        const newParagraph = node.viewModel.tree.add({
                            type: 'paragraph',
                            content: '',
                        });
                        newParagraph.viewModel.insertBefore(cast(node.viewModel.parent), node);
                        finished();
                        focusNode(cast(transclusion.hostContext), newParagraph, 0);
                        return [];
                    },
                }] : [],
            ...transclusion ? [{
                    description: 'Insert after transclusion',
                    execute: async () => {
                        const node = transclusion.node;
                        const finished = node.viewModel.tree.edit();
                        const newParagraph = node.viewModel.tree.add({
                            type: 'paragraph',
                            content: '',
                        });
                        newParagraph.viewModel.insertBefore(cast(node.viewModel.parent), node.viewModel.nextSibling);
                        finished();
                        focusNode(cast(transclusion.hostContext), newParagraph, 0);
                        return [];
                    },
                }] : [],
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
    state()
], Editor.prototype, "root", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], Editor.prototype, "dirty", void 0);
__decorate([
    contextProvided({ context: libraryContext, subscribe: true }),
    state()
], Editor.prototype, "library", void 0);
__decorate([
    query('md-block-render')
], Editor.prototype, "markdownRenderer", void 0);
__decorate([
    query('pkm-autocomplete')
], Editor.prototype, "autocomplete", void 0);
Editor = __decorate([
    customElement('pkm-editor')
], Editor);
export { Editor };
function logicalContainingBlock(context) {
    let next = context;
    while (next) {
        if (next.type === 'section' || next.type === 'list-item' || next.type === 'document')
            return next;
        next = next.viewModel.parent;
    }
    return context;
}
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
function insertSiblingParagraph(node, root, startIndex, context) {
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(cast(node.viewModel.parent), node.viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, root, startIndex, context);
    return true;
}
function insertParagraphInList(node, root, startIndex, context) {
    const { ancestor, path } = findAncestor(node, root, 'list');
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
    finishInsertParagraph(node, newParagraph, root, startIndex, context);
    return true;
}
/**
 * Special case where we have a list-item that is not contained by a list
 * (because it is the root).
 */
function insertParagraphInListItem(node, root, startIndex, context) {
    const { ancestor: listItem, path } = findAncestor(node, root, 'list-item');
    if (!listItem)
        return false;
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(listItem, path[0].viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, root, startIndex, context);
    return true;
}
function insertParagraphInDocument(node, root, startIndex, context) {
    const { ancestor: section, path } = findAncestor(node, root, 'document');
    if (!section)
        return false;
    const newParagraph = node.viewModel.tree.add({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, root, startIndex, context);
    return true;
}
function insertParagraphInSection(node, root, startIndex, context) {
    let { ancestor: section, path } = findAncestor(node, root, 'section');
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
    finishInsertParagraph(node, newParagraph, root, startIndex, context);
    return true;
}
function areAncestorAndDescendant(node, node2, root) {
    return [...ancestors(node, root)].includes(node2) ||
        [...ancestors(node2, root)].includes(node);
}
function finishInsertParagraph(node, newParagraph, root, startIndex, context) {
    const shouldSwap = startIndex === 0 && node.content.length > 0 &&
        !areAncestorAndDescendant(node, newParagraph, root);
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
    const root = cast(context.root);
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
        const { ancestor } = findAncestor(node, root, 'block-quote');
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
        return insertParagraphInList(inline.node, root, inputStart.index, context) ||
            insertParagraphInListItem(inline.node, root, inputStart.index, context) ||
            insertParagraphInSection(inline.node, root, inputStart.index, context) ||
            insertParagraphInDocument(inline.node, root, inputStart.index, context);
    }
    else if (inputEvent.inputType === 'insertLineBreak') {
        return insertSiblingParagraph(inline.node, root, inputStart.index, context);
    }
    return false;
}
function copyMarkdownToClipboard(markdown) {
    const textType = 'text/plain';
    const mdType = 'web text/markdown';
    navigator.clipboard.write([
        new ClipboardItem({
            [textType]: new Blob([markdown], { type: textType }),
            [mdType]: new Blob([markdown], { type: mdType }),
        }),
    ]);
}
function serializeSelection(hostContext) {
    return serializeToString(cast(hostContext.root), (node) => {
        switch (node.type) {
            case 'section':
            case 'paragraph':
            case 'code-block':
                return hostContext.selection.has(node);
            case 'unsupported':
                return false;
            default:
                return true;
        }
    });
}
//# sourceMappingURL=editor.js.map
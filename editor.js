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
import './title.js';
import { libraryContext } from './app-context.js';
import { assert, cast } from './asserts.js';
import { SimpleCommandBundle, } from './command-palette.js';
import { contextProvided } from './deps/lit-labs-context.js';
import { css, customElement, html, LitElement, property, query, state, } from './deps/lit.js';
import { parseBlocks } from './markdown/block-parser.js';
import { serializeToString } from './markdown/block-serializer.js';
import { focusNode } from './markdown/host-context.js';
import { normalizeTree } from './markdown/normalize.js';
import { ancestors, children, findAncestor, findFinalEditable, findNextEditable, findPreviousEditable, reverseDfs, swapNodes, removeDescendantNodes, cloneNode, } from './markdown/view-model-util.js';
import { MarkdownTree, } from './markdown/view-model.js';
import { Observer, Observers } from './observe.js';
import { getContainingTransclusion } from './markdown/transclusion.js';
import { maybeEditBlockSelectionIndent, editInlineIndent, } from './indent-util.js';
import { getBlockSelectionTarget, maybeRemoveSelectedNodes, maybeRemoveSelectedNodesIn, } from './block-selection-util.js';
import { isLogicalContainingBlock, getLogicalContainingBlock, } from './block-util.js';
import { blockPreview, blockIcon, BlockCommandBundle, } from './block-command-bundle.js';
import { getLanguageTools } from './language-tool-bundle.js';
export let Editor = class Editor extends LitElement {
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
        pkm-title {
          display: block;
          position: sticky;
          top: 0;
          padding-bottom: 0.5em;
          background: var(--root-background-color);
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
        return html ` <div id="status">${this.document?.dirty ? '💽' : ''}</div>
      <pkm-title
        .node=${this.root}
        @title-item-click=${this.onTitleItemClick}
      ></pkm-title>
      <div id="content">
        <md-block-render
          .block=${this.root}
          @inline-input=${this.onInlineInput}
          @inline-link-click=${this.onInlineLinkClick}
          @inline-keydown=${this.onInlineKeyDown}
        ></md-block-render>
      </div>
      <pkm-autocomplete></pkm-autocomplete>`;
    }
    updated() {
        if (this.name === undefined || this.name === this.document?.name)
            return;
        this.name = this.document?.name;
        this.dispatchEvent(new CustomEvent('editor-navigate', {
            detail: {
                kind: 'replace',
                document: this.document,
                root: this.root,
            },
            bubbles: true,
            composed: true,
        }));
    }
    async connectedCallback() {
        super.connectedCallback();
        await this.updateComplete;
        if (this.defaultName !== undefined) {
            await this.navigateByName(this.defaultName, true);
        }
    }
    async createAndNavigateByName(name, fireEvent = false) {
        const document = await this.library.newDocument(name);
        this.navigate(document, document.tree.root, fireEvent);
    }
    async navigateByName(name, fireEvent = false) {
        const old = {
            status: this.status,
            document: this.document,
            root: this.root,
            name: this.name,
        };
        this.status = 'loading';
        this.document = undefined;
        this.root = undefined;
        this.name = undefined;
        try {
            const results = await this.library.findAll(name);
            if (results.length === 1) {
                const [{ document, root }] = results;
                if (this.document === document && this.root === root) {
                    Object.assign(this, old);
                    return;
                }
                this.navigate(document, root, fireEvent);
            }
            else if (results.length > 1) {
                Object.assign(this, old);
                this.dispatchEvent(new CustomEvent('editor-commands', {
                    detail: new SimpleCommandBundle(`Which "${name}"?`, results.map(({ document, root }) => ({
                        description: document.name,
                        execute: async () => void this.navigate(document, root, fireEvent),
                        icon: blockIcon({ root }),
                        preview: () => blockPreview({ root }),
                    }))),
                    bubbles: true,
                    composed: true,
                }));
            }
            else {
                Object.assign(this, old);
                this.dispatchEvent(new CustomEvent('editor-commands', {
                    detail: new SimpleCommandBundle(`"${name}" does not exist, create it?`, [
                        {
                            description: 'Yes',
                            execute: async () => void this.createAndNavigateByName(name, fireEvent),
                        },
                        {
                            description: 'No',
                            execute: async () => void 0,
                        },
                    ]),
                    bubbles: true,
                    composed: true,
                }));
            }
        }
        catch (e) {
            this.status = 'error';
            console.error(e);
        }
    }
    navigate(document, root, fireEvent = false) {
        if (this.document === document && this.root === root) {
            if (this.status === 'loading')
                this.status = 'loaded';
            return;
        }
        assert(document.tree === root.viewModel.tree);
        assert(root.viewModel.connected);
        this.document = document;
        this.root = root;
        this.name = this.document.name;
        this.status = 'loaded';
        const node = findNextEditable(this.root, this.root);
        if (node) {
            focusNode(this.markdownRenderer.hostContext, node, 0);
        }
        if (fireEvent)
            this.dispatchEvent(new CustomEvent('editor-navigate', {
                detail: {
                    document,
                    root,
                },
                bubbles: true,
                composed: true,
            }));
    }
    onInlineLinkClick({ detail: { destination } }) {
        if (/^(\w)+:/i.test(destination)) {
            window.open(destination);
        }
        else {
            this.navigateByName(destination, true);
        }
    }
    onTitleItemClick({ detail }) {
        this.root = detail;
    }
    onInlineKeyDown(event) {
        const { detail: { inline, node, keyboardEvent }, } = event;
        const hostContext = cast(inline.hostContext);
        const finishEditing = node.viewModel.tree.edit();
        try {
            assert(inline.node);
            if (this.autocomplete.onInlineKeyDown(event)) {
                return;
            }
            else if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(keyboardEvent.key)) {
                keyboardEvent.preventDefault();
                const direction = ['ArrowUp', 'ArrowLeft'].includes(keyboardEvent.key)
                    ? 'backward'
                    : 'forward';
                const alter = keyboardEvent.shiftKey ? 'extend' : 'move';
                const granularity = ['ArrowUp', 'ArrowDown'].includes(keyboardEvent.key)
                    ? 'line'
                    : keyboardEvent.ctrlKey
                        ? 'word'
                        : 'character';
                const result = hostContext.hasSelection
                    ? 0
                    : inline.moveCaret(alter, direction, granularity);
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
                            const next = direction === 'backward'
                                ? findPreviousEditable(node, root)
                                : findNextEditable(node, root);
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
                    const { node: updatedNode, element, next, } = updateFocus(inline, node, result);
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
        const mdItem = content.find((item) => item.types.includes('web text/markdown'));
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
            const newFocus = insertMarkdown(mdText, node);
            if (newFocus)
                focusNode(cast(inline.hostContext), newFocus, Infinity);
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
                    if (startIndex === oldEndIndex) {
                        startIndex--;
                    }
                    startIndex = Math.max(0, startIndex);
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
            if (parent?.type === 'list-item' &&
                parent.checked === undefined &&
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
        const { inline: activeInline, startIndex, endIndex, } = this.markdownRenderer.getInlineSelection();
        const activeNode = activeInline?.node;
        const inTopLevelDocument = activeNode?.viewModel.tree === this.root?.viewModel.tree ?? false;
        const transclusion = activeInline && getContainingTransclusion(activeInline);
        return new SimpleCommandBundle('Choose command...', [
            {
                description: 'Find, Open, Create...',
                execute: async () => {
                    return new BlockCommandBundle('Find, Open, Create', this.library, async ({ document, root }) => void this.navigate(document, root, true), async ({ name }) => void this.createAndNavigateByName(name, true));
                },
            },
            {
                description: 'Sync all',
                execute: async () => void (await this.library.sync()),
            },
            {
                description: 'Force save',
                execute: async () => void this.document?.save(),
            },
            {
                description: 'Copy all as markdown',
                execute: async () => {
                    const markdown = serializeToString(this.document.tree.root);
                    copyMarkdownToClipboard(markdown);
                    return undefined;
                },
            },
            ...(this.document && this.root === this.document.tree.root
                ? [
                    {
                        description: 'Delete document',
                        execute: async () => {
                            return new SimpleCommandBundle('Delete document?', [
                                {
                                    description: 'No',
                                    execute: async () => void 0,
                                },
                                {
                                    description: 'Yes',
                                    execute: async () => {
                                        const tree = this.document.tree;
                                        const document = this.library.getDocumentByTree(tree);
                                        await document?.delete();
                                        await this.navigateByName('index', true);
                                        return undefined;
                                    },
                                },
                            ]);
                        },
                    },
                ]
                : []),
            ...(activeInline?.hostContext?.hasSelection
                ? [
                    {
                        description: 'Send to...',
                        execute: async () => {
                            return new BlockCommandBundle('Send to', this.library, async (result) => void sendTo(result, this.library, activeInline.hostContext, 'remove'), async (result) => void sendTo(result, this.library, activeInline.hostContext, 'remove'));
                        },
                    },
                    {
                        description: 'Send to and transclude...',
                        execute: async () => {
                            return new BlockCommandBundle('Send to and transclude', this.library, async (result) => void sendTo(result, this.library, activeInline.hostContext, 'transclude'), async (result) => void sendTo(result, this.library, activeInline.hostContext, 'transclude'));
                        },
                    },
                    {
                        description: 'Send to and link...',
                        execute: async () => {
                            return new BlockCommandBundle('Send to and link', this.library, async (result) => void sendTo(result, this.library, activeInline.hostContext, 'link'), async (result) => void sendTo(result, this.library, activeInline.hostContext, 'link'));
                        },
                    },
                ]
                : []),
            {
                description: 'Backlinks',
                execute: async () => {
                    const action = async (command) => void this.navigateByName(command.description, true);
                    const commands = this.library.backLinks
                        .getBacklinksByDocument(this.document, this.library)
                        .map((name) => ({
                        description: name,
                        execute: action,
                    }));
                    return new SimpleCommandBundle('Open Backlink', commands);
                },
            },
            ...(activeNode && startIndex !== undefined && endIndex !== undefined
                ? [
                    {
                        description: 'Paste as markdown',
                        execute: async () => {
                            this.triggerPaste(activeInline, activeNode, { startIndex, oldEndIndex: endIndex }, true);
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(inTopLevelDocument && activeNode && activeInline
                ? [
                    {
                        description: 'Focus on block',
                        execute: async () => {
                            this.root = isLogicalContainingBlock(activeNode)
                                ? activeNode
                                : getLogicalContainingBlock(activeNode);
                            focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(inTopLevelDocument && this.root !== this.document?.tree.root
                ? [
                    {
                        description: 'Focus on containing block',
                        execute: async () => {
                            if (this.root?.viewModel.parent)
                                this.root = getLogicalContainingBlock(this.root.viewModel.parent);
                            if (activeNode && activeInline)
                                focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(inTopLevelDocument && this.root !== this.document?.tree.root
                ? [
                    {
                        description: 'Focus on document',
                        execute: async () => {
                            this.root = this.document?.tree.root;
                            if (activeNode)
                                focusNode(cast(activeInline.hostContext), activeNode, startIndex);
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(transclusion
                ? [
                    {
                        description: 'Delete transclusion',
                        execute: async () => {
                            const finished = transclusion.node.viewModel.tree.edit();
                            transclusion.node.viewModel.remove();
                            finished();
                            // TODO: focus
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(activeNode
                ? [
                    {
                        description: 'Insert transclusion...',
                        execute: async () => {
                            const action = async ({ name }) => {
                                const finished = activeNode.viewModel.tree.edit();
                                const newParagraph = activeNode.viewModel.tree.add({
                                    type: 'code-block',
                                    info: 'tc',
                                    content: name,
                                });
                                newParagraph.viewModel.insertBefore(cast(activeNode.viewModel.parent), activeNode.viewModel.nextSibling);
                                finished();
                                focusNode(activeInline.hostContext, newParagraph);
                                return undefined;
                            };
                            return new BlockCommandBundle('Insert transclusion', this.library, action, action);
                        },
                    },
                ]
                : []),
            ...(transclusion
                ? [
                    {
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
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(transclusion
                ? [
                    {
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
                            return undefined;
                        },
                    },
                ]
                : []),
            ...(activeInline?.hostContext?.hasSelection
                ? getLanguageTools(() => serializeSelection(activeInline.hostContext))
                : []),
        ]);
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
function performLogicalInsertion(context, nodes) {
    let { parent, nextSibling } = nextLogicalInsertionPoint(context);
    if (context.type === 'section') {
        // Insertion into a section is append-only. Mainly so that send-to section
        // is sensible.
        parent = context;
        nextSibling = undefined;
        for (const node of nodes) {
            if (node.type === 'section') {
                const list = parent.viewModel.tree.add({ type: 'list' });
                const listItem = parent.viewModel.tree.add({
                    type: 'list-item',
                    marker: '* ',
                });
                list.viewModel.insertBefore(parent, nextSibling);
                listItem.viewModel.insertBefore(list);
                parent = listItem;
                nextSibling = undefined;
                break;
            }
        }
    }
    else if (parent.type == 'list') {
        if (nodes.length === 1 && nodes[0].type === 'list') {
            const [node] = nodes;
            nodes = [...children(node)];
        }
        else {
            const listItem = parent.viewModel.tree.add({
                type: 'list-item',
                // TODO: infer from list
                marker: '* ',
            });
            listItem.viewModel.insertBefore(parent, nextSibling);
            parent = listItem;
            nextSibling = undefined;
        }
    }
    for (const node of nodes) {
        node.viewModel.insertBefore(parent, nextSibling);
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
    if (target.type === 'code-block' ||
        target.type === 'paragraph' ||
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
    if (node.type === 'section') {
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
    return ([...ancestors(node, root)].includes(node2) ||
        [...ancestors(node2, root)].includes(node));
}
function finishInsertParagraph(node, newParagraph, root, startIndex, context) {
    const shouldSwap = startIndex === 0 &&
        node.content.length > 0 &&
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
        return (insertParagraphInList(inline.node, root, inputStart.index, context) ||
            insertParagraphInListItem(inline.node, root, inputStart.index, context) ||
            insertParagraphInSection(inline.node, root, inputStart.index, context) ||
            insertParagraphInDocument(inline.node, root, inputStart.index, context));
    }
    else if (inputEvent.inputType === 'insertLineBreak') {
        return insertSiblingParagraph(inline.node, root, inputStart.index, context);
    }
    return false;
}
async function sendTo({ root, name }, library, hostContext, mode) {
    if (!root) {
        // TODO: We shouldn't need to make the call here, but TS can't
        // figure out `root` that root is defined if we reassign it...
        const root = (await library.newDocument(name)).tree.root;
        sendTo({ root, name }, library, hostContext, mode);
        return;
    }
    const markdown = serializeSelection(hostContext);
    insertMarkdown(markdown, root.viewModel.lastChild ?? root);
    const focus = cast(hostContext.selectionFocus);
    // TODO: if the selection is a section, use that section's name
    const targetName = name;
    let replacement;
    switch (mode) {
        case 'remove':
            break;
        case 'transclude':
            replacement = focus.viewModel.tree.add({
                type: 'code-block',
                info: 'tc',
                content: targetName,
            });
            break;
        case 'link':
            replacement = focus.viewModel.tree.add({
                type: 'paragraph',
                content: `[${targetName}]`,
            });
            break;
    }
    const finish = focus.viewModel.tree.edit();
    try {
        replacement?.viewModel.insertBefore(cast(focus.viewModel.parent), focus);
        maybeRemoveSelectedNodesIn(hostContext);
    }
    finally {
        finish();
    }
}
function insertMarkdown(markdown, node) {
    const { node: root } = parseBlocks(markdown + '\n');
    if (!root)
        return;
    assert(root.type === 'document' && root.children);
    const finishEditing = node.viewModel.tree.edit();
    try {
        const newNodes = root.children.map((newNode) => node.viewModel.tree.add(newNode));
        let newFocus = findFinalEditable(newNodes[0]);
        performLogicalInsertion(node, newNodes);
        return newFocus;
    }
    finally {
        finishEditing();
    }
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
    // This is complex because:
    // 1. Sections can be disjoint.
    // 2. Expecations of what to serialize is different to the set of selected
    //    nodes. For example, if the selection is a paragaph immediately inside
    //    a list-item, we should serialize the list-item too.
    // The approach here is:
    // 1. Recursively expand the selection to include ancestor nodes, when the
    //    selected node is the first child.
    // 2. Combine the selected nodes when one is an ancestor of another.
    // 3. Clone the selected nodes, removing any inline nodes that were not
    //    part of the original selection.
    // 4. Build a new document, append the clones (triggering normalization)
    // 5. Serialize the new document.
    const expand = (node) => {
        let result = node;
        if (node.viewModel.previousSibling) {
            return result;
        }
        for (const ancestor of ancestors(node, hostContext.root)) {
            if (ancestor.type === 'section') {
                break;
            }
            result = ancestor;
            if (ancestor.viewModel.previousSibling) {
                break;
            }
        }
        return result;
    };
    const predicate = (node) => {
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
    };
    const roots = removeDescendantNodes([...hostContext.selection.values()].map(expand)).map((node) => cloneNode(node, predicate));
    const tree = new MarkdownTree({
        type: 'document',
    });
    const finishEditing = tree.edit();
    for (const root of roots) {
        const node = tree.add(root);
        node.viewModel.insertBefore(tree.root);
    }
    finishEditing();
    return serializeToString(tree.root);
}
//# sourceMappingURL=editor.js.map
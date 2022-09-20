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
import { contextProvider } from './deps/lit-labs-context.js';
import { customElement, html, LitElement, property, query, render, } from './deps/lit.js';
import { parseBlocks } from './markdown/block-parser.js';
import { serializeToString } from './markdown/block-serializer.js';
import { hostContext } from './markdown/host-context.js';
import { MarkdownTree } from './markdown/view-model.js';
function debounce(f) {
    let scheduled = false;
    return async () => {
        if (scheduled)
            return;
        scheduled = true;
        scheduled = await false;
        f();
    };
}
let TestHost = class TestHost extends LitElement {
    constructor() {
        super(...arguments);
        this.hostContext = {};
    }
    render() {
        return html `
    <input type=text></input>
    <button @click=${this.load}>Load</button>
    <button @click=${this.save}>Save</button>
    <br>
    <md-block-render
      .block=${this.tree?.root}
      @inline-input=${this.onInlineInput}
      @inline-link-click=${this.onInlineLinkClick}
      @inline-keydown=${this.onInlineKeyDown}></md-block-render>`;
    }
    async ensureDirectory() {
        if (!this.directory) {
            this.directory = await showDirectoryPicker({ mode: 'readwrite' });
        }
        return this.directory;
    }
    async load() {
        const directory = await this.ensureDirectory();
        const fileName = this.fileInput.value;
        let text = '';
        try {
            const handle = await directory.getFileHandle(fileName);
            const file = await handle.getFile();
            const decoder = new TextDecoder();
            text = decoder.decode(await file.arrayBuffer());
        }
        catch (e) {
            console.warn(e);
        }
        const node = parseBlocks(text);
        if (node)
            this.tree = new MarkdownTree(node);
        this.tree?.observe.add(debounce(() => this.save()));
    }
    async save() {
        if (!this.tree)
            return;
        const text = serializeToString(this.tree.root);
        const directory = await this.ensureDirectory();
        const fileName = this.fileInput.value;
        const handle = await directory.getFileHandle(fileName, { create: true });
        const stream = await handle.createWritable();
        await stream.write(text);
        await stream.close();
    }
    onInlineLinkClick({ detail: { type, destination }, }) {
        this.fileInput.value = destination + '.md';
        this.load();
    }
    onInlineKeyDown({ detail: { inline, node, keyboardEvent }, }) {
        if (keyboardEvent.key === 'ArrowUp') {
            keyboardEvent.preventDefault();
            const result = inline.moveCaretUp();
            if (result !== true) {
                for (const prev of reverseDfs(node)) {
                    if (['paragraph', 'code-block', 'heading'].includes(prev.type)) {
                        focusNode(this.hostContext, prev, -result);
                        break;
                    }
                }
            }
            return;
        }
        if (keyboardEvent.key === 'ArrowDown') {
            keyboardEvent.preventDefault();
            const result = inline.moveCaretDown();
            if (result !== true) {
                for (const next of dfs(node)) {
                    if (['paragraph', 'code-block', 'heading'].includes(next.type)) {
                        focusNode(this.hostContext, next, result);
                        break;
                    }
                }
            }
            return;
        }
        if (keyboardEvent.key === 'Tab') {
            keyboardEvent.preventDefault();
            const { start } = inline.getSelection();
            focusNode(this.hostContext, node, start.index);
            if (keyboardEvent.shiftKey) {
                unindent(node);
                return;
            }
            indent(node);
            return;
        }
    }
    onInlineInput({ detail: { inline, inputEvent, inputStart, inputEnd }, }) {
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
                if (inputStart.index === 0 && inputEnd.index === 0) {
                    const node = inline.node;
                    // Turn headings and code-blocks into paragraphs.
                    if (node.type === 'heading' || node.type === 'code-block') {
                        const paragraph = node.viewModel.tree.import({
                            type: 'paragraph',
                            content: node.content,
                        });
                        paragraph.viewModel.insertBefore(node.viewModel.parent, node);
                        node.viewModel.remove();
                        focusNode(this.hostContext, paragraph, 0);
                        return;
                    }
                    // Remove a surrounding block-quote.
                    const { ancestor } = findAncestor(node, 'block-quote');
                    if (ancestor) {
                        // Unless there's an earlier opportunity to merge into a previous
                        // content node.
                        for (const prev of reverseDfs(node, ancestor)) {
                            if (maybeMergeContentInto(node, prev, this.hostContext))
                                return;
                        }
                        for (const child of [...ancestor.children]) {
                            child.viewModel.insertBefore(ancestor.viewModel.parent, ancestor);
                        }
                        ancestor.viewModel.remove();
                        focusNode(this.hostContext, node);
                        return;
                    }
                    // Merge into a previous content node.
                    for (const prev of reverseDfs(node)) {
                        if (maybeMergeContentInto(node, prev, this.hostContext))
                            return;
                    }
                    return;
                }
                newText = '';
                startIndex = Math.max(0, startIndex - 1);
            }
            else {
                newText = inputEvent.data ?? '';
            }
            newEndIndex = startIndex + newText.length;
        }
        else if (inputEvent.inputType === 'insertParagraph') {
            if (insertParagraphInList(inline.node, inputStart.index, this.hostContext)) {
                return;
            }
            if (insertParagraphInSection(inline.node, inputStart.index, this.hostContext))
                return;
            return;
        }
        else if (inputEvent.inputType === 'insertLineBreak') {
            if (insertSiblingParagraph(inline.node, inputStart.index, this.hostContext))
                return;
            return;
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
        inline.edit(edit, true);
    }
};
__decorate([
    query('md-block-render')
], TestHost.prototype, "blockRender", void 0);
__decorate([
    query('input')
], TestHost.prototype, "fileInput", void 0);
__decorate([
    property({ type: Object, reflect: false })
], TestHost.prototype, "tree", void 0);
__decorate([
    contextProvider({ context: hostContext }),
    property({ reflect: false })
], TestHost.prototype, "hostContext", void 0);
TestHost = __decorate([
    customElement('test-host')
], TestHost);
export { TestHost };
function maybeMergeContentInto(node, target, context) {
    if (target.type === 'code-block' || target.type === 'paragraph' ||
        target.type === 'heading') {
        focusNode(context, target, target.content.length);
        target.content += node.content;
        let parent = node.viewModel.parent;
        node.viewModel.remove();
        cleanupNode(parent);
        return true;
    }
    return false;
}
function cleanupNode(node) {
    if (node.type === 'block-quote' || node.type === 'heading' ||
        node.type === 'paragraph') {
        return;
    }
    while (node?.children?.length === 0) {
        const toRemove = node;
        node = node.viewModel.parent;
        toRemove.viewModel.remove();
    }
}
function focusNode(context, node, offset) {
    context.focusNode = node;
    context.focusOffset = offset;
    node.viewModel.observe.notify();
}
function swapNodes(node1, node2) {
    const node1Parent = node1.viewModel.parent;
    const node1NextSibling = node1.viewModel.nextSibling;
    node1.viewModel.insertBefore(node2.viewModel.parent, node2);
    node2.viewModel.insertBefore(node1Parent, node1NextSibling);
}
function* ancestors(node) {
    while (node.viewModel.parent) {
        yield node.viewModel.parent;
        node = node.viewModel.parent;
    }
}
function* reverseDfs(node, limit) {
    function next(next) {
        return next && (node = next);
    }
    do {
        while (next(node.viewModel.previousSibling)) {
            while (next(node.viewModel.lastChild))
                ;
            yield node;
            if (node === limit)
                return;
        }
        if (next(node.viewModel.parent)) {
            yield node;
            if (node === limit)
                return;
            continue;
        }
        return;
    } while (true);
}
function* dfs(node) {
    function next(next) {
        return next && (node = next);
    }
    do {
        while (next(node.viewModel.nextSibling)) {
            while (next(node.viewModel.firstChild))
                ;
            yield node;
        }
        if (next(node.viewModel.parent)) {
            yield node;
            continue;
        }
        return;
    } while (true);
}
function findAncestor(node, type) {
    const path = [node];
    let ancestor = node;
    for (const ancestor of ancestors(node)) {
        if (ancestor.type === type)
            return {
                ancestor,
                path,
            };
        path.unshift(ancestor);
    }
    return {};
}
function moveParagraphBackwards(node) {
    return false;
}
function unindent(node) {
    const { ancestor: listItem, path } = findAncestor(node, 'list-item');
    if (!path)
        return;
    const target = path[0];
    const nextSibling = listItem.viewModel.nextSibling;
    const list = listItem.viewModel.parent;
    const targetListItemSibling = list.viewModel.parent;
    if (targetListItemSibling?.type === 'list-item') {
        listItem.viewModel.insertBefore(targetListItemSibling.viewModel.parent, targetListItemSibling.viewModel.nextSibling);
    }
    else {
        target.viewModel.insertBefore(list.viewModel.parent, list.viewModel.nextSibling);
        listItem.viewModel.remove();
    }
    // Siblings of the undended list-item move to sublist.
    if (nextSibling) {
        let next = nextSibling;
        while (next) {
            if (listItem.viewModel.lastChild?.type !== 'list') {
                listItem.viewModel.tree
                    .import({
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
        listItem.viewModel.firstChild?.viewModel.insertBefore(target.viewModel.parent, target.viewModel.nextSibling);
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
        // Don't indent a section at the top level, unless we are inside a heading.
        if (ancestor.type === 'section' &&
            ancestor.viewModel.parent.type == 'document') {
            if (target.type === 'heading') {
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
        listItem = target.viewModel.tree.import({
            type: 'list-item',
            marker: '* ',
        });
        listItem.viewModel.insertBefore(target.viewModel.parent, target);
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
        const list = target.viewModel.tree.import({
            type: 'list',
        });
        list.viewModel.insertBefore(listItem.viewModel.parent, listItem);
        listItem.viewModel.insertBefore(list);
        // TODO: Merge this with any sibling lists.
    }
}
function insertSiblingParagraph(node, startIndex, context) {
    const newParagraph = node.viewModel.tree.import({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(node.viewModel.parent, node.viewModel.nextSibling);
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
            targetList = node.viewModel.tree.import({
                type: 'list',
            });
            targetList.viewModel.insertBefore(node.viewModel.parent, node.viewModel.nextSibling);
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
    const newListItem = node.viewModel.tree.import({
        type: 'list-item',
        marker: firstListItem?.marker ?? '* ',
    });
    newListItem.viewModel.insertBefore(targetList, targetListItemNextSibling);
    const newParagraph = node.viewModel.tree.import({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(newListItem);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function insertParagraphInSection(node, startIndex, context) {
    const { ancestor: section, path } = findAncestor(node, 'section');
    if (!section)
        return false;
    const newParagraph = node.viewModel.tree.import({
        type: 'paragraph',
        content: '',
    });
    newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
    finishInsertParagraph(node, newParagraph, startIndex, context);
    return true;
}
function finishInsertParagraph(node, newParagraph, startIndex, context) {
    const atStart = startIndex === 0;
    if (atStart) {
        swapNodes(node, newParagraph);
    }
    else {
        newParagraph.content = node.content.substring(startIndex);
        node.content = node.content.substring(0, startIndex);
    }
    focusNode(context, newParagraph);
}
render(html `<test-host></test-host>`, document.body);

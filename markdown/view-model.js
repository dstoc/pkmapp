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
import { parser as inlineParser } from './inline-parser.js';
import { parseBlocks } from './block-parser.js';
import { assert, cast } from '../asserts.js';
import { Observe } from '../observe.js';
import { normalizeTree } from './normalize.js';
import { dfs } from './view-model-util.js';
class ViewModel {
    constructor(self, tree, parent, childIndex, connected = false) {
        this.self = self;
        this.tree = tree;
        this.parent = parent;
        this.connected = connected;
        this.version = 0;
        this.initialize(parent, childIndex);
        this.observe = new Observe(this.self, this.tree.observe);
    }
    initialize(parent, childIndex) {
        this.parent = parent;
        this.previousSibling = undefined;
        this.nextSibling = undefined;
        if (parent && childIndex !== undefined) {
            if (childIndex > 0) {
                this.previousSibling = parent.children?.[childIndex - 1];
            }
            this.nextSibling = parent.children?.[childIndex + 1];
        }
        this.firstChild = this.self.children?.[0];
        this.lastChild = this.self.children?.[this.self.children.length - 1];
    }
    signalMutation(notify = true) {
        this.version = this.tree.root.viewModel.version + 1;
        let parent = this.parent;
        while (parent) {
            parent.viewModel.version = this.version;
            parent = parent.viewModel.parent;
        }
        if (notify) {
            this.observe.notify();
        }
    }
    remove() {
        assert(this.tree.state === 'editing');
        assert(this.parent);
        if (this.parent?.viewModel.firstChild === this.self) {
            this.parent.viewModel.firstChild = this.nextSibling;
        }
        if (this.parent?.viewModel.lastChild === this.self) {
            this.parent.viewModel.lastChild = this.previousSibling;
        }
        if (this.previousSibling) {
            this.previousSibling.viewModel.nextSibling = this.nextSibling;
        }
        if (this.nextSibling) {
            this.nextSibling.viewModel.previousSibling = this.previousSibling;
        }
        const index = this.parent.children.indexOf(this.self);
        this.parent.children.splice(index, 1);
        if (!this.previousSibling)
            this.parent.viewModel.firstChild = this.nextSibling;
        if (!this.nextSibling)
            this.parent.viewModel.lastChild = this.previousSibling;
        const parent = this.parent;
        this.signalMutation(false);
        this.parent = undefined;
        this.nextSibling = undefined;
        this.previousSibling = undefined;
        this.tree.removed.add(this.self);
        parent.viewModel.observe.notify();
    }
    insertBefore(parent, nextSibling) {
        assert(this.tree.state === 'editing');
        if (nextSibling === this.self) {
            assert(parent === this.parent);
            return;
        }
        if (this.parent)
            this.remove();
        const previousSibling = nextSibling ?
            nextSibling?.viewModel.previousSibling :
            parent.viewModel.lastChild;
        this.parent = parent;
        this.previousSibling = previousSibling;
        this.nextSibling = nextSibling;
        if (previousSibling) {
            previousSibling.viewModel.nextSibling = this.self;
        }
        else {
            parent.viewModel.firstChild = this.self;
        }
        if (nextSibling) {
            nextSibling.viewModel.previousSibling = this.self;
        }
        else {
            parent.viewModel.lastChild = this.self;
        }
        if (!parent.children) {
            parent.children = [];
        }
        let index;
        if (previousSibling) {
            index = parent.children.indexOf(previousSibling) + 1;
        }
        else if (nextSibling) {
            index = parent.children.indexOf(nextSibling);
        }
        else {
            index = 0;
        }
        parent.children.splice(index, 0, this.self);
        this.signalMutation(false);
        parent.viewModel.observe.notify();
    }
    updateMarker(marker) {
        // TODO: assert tree editing
        switch (this.self.type) {
            case 'list-item':
            case 'section':
                if (this.self.marker === marker)
                    return;
                this.self.marker = marker;
                this.signalMutation();
                break;
        }
    }
    updateChecked(checked) {
        // TODO: assert tree editing
        switch (this.self.type) {
            case 'list-item':
                if (this.self.checked === checked)
                    return;
                this.self.checked = checked;
                this.signalMutation();
                break;
        }
    }
}
export class InlineViewModel extends ViewModel {
    constructor(self, tree, parent, childIndex) {
        super(self, tree, parent, childIndex);
        this.inlineTree = inlineParser.parse(self.content);
        this.self = self;
    }
    edit({ startIndex, newEndIndex, oldEndIndex, newText }) {
        const oldText = this.self.content.substring(startIndex, oldEndIndex);
        const result = {
            oldText,
            newText,
            startIndex,
            startPosition: indexToPosition(this.self.content, startIndex),
            oldEndIndex,
            oldEndPosition: indexToPosition(this.self.content, oldEndIndex),
            newEndIndex,
            newEndPosition: indexToPosition(this.self.content, newEndIndex),
        };
        const newContent = apply(this.self.content, result);
        if (this.self.content === newContent)
            return null;
        this.self.content = newContent;
        const newNodes = this.maybeReplaceWithBlocks();
        if (newNodes)
            return newNodes;
        this.inlineTree = this.inlineTree.edit(result);
        this.inlineTree = inlineParser.parse(this.self.content, this.inlineTree);
        this.signalMutation();
        return null;
    }
    maybeReplaceWithBlocks() {
        const blocks = this.parseAsBlocks();
        if (!blocks)
            return false;
        const newNodes = [];
        for (const child of blocks) {
            const node = this.tree.add(child);
            node.viewModel.insertBefore(cast(this.parent), this.nextSibling);
            newNodes.push(node);
        }
        this.remove();
        return newNodes;
    }
    parseAsBlocks() {
        const content = this.self.content;
        // TODO: Ensure inline does not start with whitespace, or contain tabs or
        // newlines.
        // TODO: Support other block types.
        if (!/^(\d+[.)] |[-+*>] |#+ |[`*\-_]{3})/.test(content))
            return;
        if (this.self.type !== 'paragraph')
            return;
        // TODO: Ensure there's a trailing new line?
        const node = parseBlocks(this.self.content + '\n');
        assert(node);
        assert(node.type === 'document' && node.children);
        return node.children;
    }
}
export class MarkdownTree {
    constructor(root, delegate) {
        this.delegate = delegate;
        this.state = 'idle';
        this.editCount = 0;
        this.editStartVersion = 0;
        this.editResumeObserve = () => void 0;
        this.observe = new Observe(this);
        this.removed = new Set();
        this.root = this.addDom(root);
    }
    setRoot(node) {
        assert(node.viewModel.tree === this);
        assert(!node.viewModel.parent);
        const finish = this.edit();
        this.removed.add(this.root);
        this.root = node;
        finish();
    }
    add(node) {
        if (node.viewModel) {
            throw new Error('node is already part of a tree');
        }
        return this.addDom(node);
    }
    edit() {
        if (this.state === 'idle') {
            this.editStartVersion = this.root.viewModel.version;
            this.editResumeObserve = this.observe.suspend();
            this.state = 'editing';
            this.removed.clear();
        }
        this.editCount++;
        return () => this.finishEdit();
    }
    finishEdit() {
        assert(this.state === 'editing');
        this.editCount--;
        if (this.editCount > 0)
            return;
        normalizeTree(this);
        const removedRoots = new Set();
        for (const node of this.removed.values()) {
            if (!node.viewModel.parent) {
                removedRoots.add(node);
            }
        }
        this.state = 'post-edit';
        for (const root of removedRoots.values()) {
            for (const node of dfs(root)) {
                node.viewModel.connected = false;
                this.delegate?.postEditUpdate(node, 'disconnected');
            }
        }
        for (const node of dfs(this.root)) {
            if (!node.viewModel.connected) {
                node.viewModel.connected = true;
                this.delegate?.postEditUpdate(node, 'connected');
            }
            else if (node.viewModel.version > this.editStartVersion) {
                this.delegate?.postEditUpdate(node, 'changed');
            }
        }
        this.state = 'idle';
        if (this.root.viewModel.version > this.editStartVersion) {
            this.observe.notify();
        }
        this.editResumeObserve();
    }
    addDom(node, parent, childIndex) {
        const result = node;
        if (result.type === 'paragraph' || result.type === 'section' ||
            result.type === 'code-block') {
            assert(!result.viewModel);
            result.viewModel = new InlineViewModel(result, this, parent, childIndex);
        }
        else {
            assert(!result.viewModel);
            result.viewModel = new ViewModel(result, this, parent, childIndex);
        }
        if (result.children) {
            for (let i = 0; i < result.children.length; i++) {
                this.addDom(result.children[i], result, i);
            }
        }
        return result;
    }
    serialize(node) {
        if (!node)
            node = this.root;
        assert(node.viewModel.tree === this);
        assert(this.state === 'idle');
        const result = { ...node };
        delete result.viewModel;
        result.children = node.children?.map(this.serialize);
        return result;
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
    return (text.substring(0, edit.startIndex) + (edit.newText ?? '') +
        text.substring(edit.oldEndIndex));
}
//# sourceMappingURL=view-model.js.map
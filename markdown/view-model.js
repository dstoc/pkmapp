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
import { parser } from './inline-parser.js';
class Observe {
    constructor(target) {
        this.target = target;
        this.observers = new Set();
    }
    notify() {
        for (const observer of this.observers.values()) {
            observer(this.target);
        }
    }
    add(observer) {
        this.observers.add(observer);
    }
    remove(observer) {
        this.observers.delete(observer);
    }
}
class ViewModel {
    constructor(self, tree, parent, childIndex) {
        this.self = self;
        this.tree = tree;
        this.parent = parent;
        this.observe = new Observe(this.self);
        this.initialize(parent, childIndex);
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
    remove() {
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
        this.parent.viewModel.observe.notify();
        this.parent = undefined;
        this.tree.observe.notify();
    }
    insertBefore(parent, nextSibling) {
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
        parent.viewModel.observe.notify();
        this.tree.observe.notify();
    }
}
export class InlineViewModel extends ViewModel {
    constructor(self, tree, parent, childIndex) {
        super(self, tree, parent, childIndex);
        this.inlineTree = parser.parse(self.content);
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
        this.self.content = apply(this.self.content, result);
        this.tree.observe.notify();
        this.inlineTree = this.inlineTree.edit(result);
        this.inlineTree = parser.parse(this.self.content, this.inlineTree);
        this.observe.notify();
    }
}
export class MarkdownTree {
    constructor(root) {
        this.observe = new Observe(this);
        this.root = this.addDom(root);
    }
    import(node) {
        if (node.viewModel) {
            throw new Error('node is already part of a tree');
        }
        return this.addDom(node);
    }
    addDom(node, parent, childIndex) {
        const result = node;
        if ('content' in result) {
            result.viewModel = new InlineViewModel(result, this, parent, childIndex);
        }
        else {
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
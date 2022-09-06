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

import type {MarkdownNode} from './node.js';

class Observe<T> {
  private observers = new Set<(target: T) => void>();
  constructor(readonly target: T) {}
  notify() {
    for (const observer of this.observers.values()) {
      observer(this.target);
    }
  }
  add(observer: (node: T) => void) {
    this.observers.add(observer);
  }
  remove(observer: (node: T) => void) {
    this.observers.delete(observer);
  }
}

class ViewModel {
  constructor(
    readonly self: ViewModelNode,
    readonly tree: MarkdownTree,
    public parent?: ViewModelNode,
    childIndex?: number
  ) {
    this.initialize(parent, childIndex);
  }
  private initialize(parent?: ViewModelNode, childIndex?: number) {
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
  firstChild?: ViewModelNode;
  lastChild?: ViewModelNode;
  nextSibling?: ViewModelNode;
  previousSibling?: ViewModelNode;
  autofocus = false;
  readonly observe = new Observe(this.self);
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
    const index = this.parent!.children!.indexOf(this.self);
    this.parent!.children!.splice(index, 1);
    this.parent!.viewModel.observe.notify();
    this.parent = undefined;
    this.tree.observe.notify();
  }

  insertBefore(parent: ViewModelNode, nextSibling?: ViewModelNode) {
    if (this.parent) this.remove();
    const previousSibling = nextSibling
      ? nextSibling?.viewModel.previousSibling
      : parent.viewModel.lastChild;

    this.parent = parent;
    this.previousSibling = previousSibling;
    this.nextSibling = nextSibling;

    if (previousSibling) {
      previousSibling.viewModel.nextSibling = this.self;
    } else {
      parent.viewModel.firstChild = this.self;
    }
    if (nextSibling) {
      nextSibling.viewModel.previousSibling = this.self;
    } else {
      parent.viewModel.lastChild = this.self;
    }
    if (!parent.children) {
      parent.children = [];
    }
    let index: number;
    if (previousSibling) {
      index = parent.children.indexOf(previousSibling) + 1;
    } else if (nextSibling) {
      index = parent.children.indexOf(nextSibling);
    } else {
      index = 0;
    }
    parent.children.splice(index, 0, this.self);
    parent.viewModel.observe.notify();
    this.tree.observe.notify();
  }
}

export class MarkdownTree {
  constructor(root: MarkdownNode) {
    this.root = this.addDom(root);
  }
  root: ViewModelNode;
  readonly observe = new Observe(this);

  import(node: MarkdownNode) {
    if ((node as MaybeViewModelNode).viewModel)
      throw new Error('node is already part of a tree');
    return this.addDom(node);
  }

  private addDom(
    node: MarkdownNode,
    parent?: ViewModelNode,
    childIndex?: number
  ) {
    const result = node as ViewModelNode;
    result.viewModel = new ViewModel(result, this, parent, childIndex);
    if (result.children) {
      for (let i = 0; i < result.children.length; i++) {
        this.addDom(result.children[i], result, i);
      }
    }
    return result;
  }

  serialize(node?: ViewModelNode): MarkdownNode {
    if (!node) node = this.root;
    const result: MaybeViewModelNode = {...node};
    delete result.viewModel;
    result.children = node.children?.map(this.serialize);
    return result;
  }
}

export type MaybeViewModelNode = MarkdownNode & {
  viewModel?: ViewModel;
  children?: MarkdownNode[];
};

export type ViewModelNode = MarkdownNode & {
  viewModel: ViewModel;
  children?: ViewModelNode[];
};

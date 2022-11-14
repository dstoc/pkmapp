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

import type {MarkdownNode, InlineNode} from './node.js';

import {parser as inlineParser} from './inline-parser.js';
import {parseBlocks} from './block-parser.js';
import Parser from 'web-tree-sitter';
import {assert, cast} from '../asserts.js';
import {Observe} from '../observe.js';
import {normalizeTree} from './normalize.js';

class ViewModel {
  constructor(
      readonly self: ViewModelNode, readonly tree: MarkdownTree,
      public parent?: ViewModelNode, childIndex?: number) {
    this.initialize(parent, childIndex);
    this.observe = new Observe(this.self, this.tree.observe);
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
  version: number = 0;
  firstChild?: ViewModelNode;
  lastChild?: ViewModelNode;
  nextSibling?: ViewModelNode;
  previousSibling?: ViewModelNode;
  readonly observe;
  protected increaseVersion() {
    this.version = this.tree.root.viewModel.version + 1;
    let parent = this.parent;
    while (parent) {
      parent.viewModel.version = this.version;
      parent = parent.viewModel.parent;
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
    const index = this.parent!.children!.indexOf(this.self);
    this.parent!.children!.splice(index, 1);
    const parent = this.parent;
    this.parent = undefined;
    this.increaseVersion();
    this.parent = undefined;
    parent.viewModel.observe.notify();
  }

  insertBefore(parent: ViewModelNode, nextSibling?: ViewModelNode) {
    assert(this.tree.state === 'editing');
    if (nextSibling === this.self) {
      assert(parent === this.parent);
      return;
    }
    if (this.parent) this.remove();
    const previousSibling = nextSibling ?
        nextSibling?.viewModel.previousSibling :
        parent.viewModel.lastChild;

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
    this.increaseVersion();
    parent.viewModel.observe.notify();
  }
}

export class InlineViewModel extends ViewModel {
  constructor(
      self: InlineNode&ViewModelNode, tree: MarkdownTree,
      parent?: ViewModelNode, childIndex?: number) {
    super(self, tree, parent, childIndex);
    this.inlineTree = inlineParser.parse(self.content);
    this.self = self;
  }
  inlineTree: Parser.Tree;
  override self: InlineNode&ViewModelNode;
  edit({startIndex, newEndIndex, oldEndIndex, newText}: InlineEdit) {
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
    const newNodes = this.maybeReplaceWithBlocks();
    if (newNodes) return newNodes;
    this.increaseVersion();
    this.inlineTree = this.inlineTree!.edit(result);
    this.inlineTree = inlineParser.parse(this.self.content, this.inlineTree);
    this.observe.notify();
    return null;
  }
  private maybeReplaceWithBlocks() {
    const blocks = this.parseAsBlocks();
    if (!blocks) return false;
    const newNodes: ViewModelNode[] = [];
    for (const child of blocks) {
      const node = this.tree.import<MarkdownNode>(child);
      node.viewModel.insertBefore(cast(this.parent), this.nextSibling);
      newNodes.push(node);
    }
    this.remove();
    return newNodes;
  }
  private parseAsBlocks() {
    const content = this.self.content;
    // TODO: Ensure inline does not start with whitespace, or contain tabs or
    // newlines.
    // TODO: Support other block types.
    if (!/^(\d+[.)] |[\-+*>] |#+ |[`*\-_]{3})/.test(content)) return;
    if (this.self.type !== 'paragraph') return;
    // TODO: Ensure there's a trailing new line?
    const node = parseBlocks(this.self.content + '\n');
    assert(node);
    assert(node.type === 'document' && node.children);
    return node.children;
  }
}


export class MarkdownTree {
  constructor(root: MarkdownNode) {
    this.root = this.addDom<MarkdownNode>(root);
  }

  state: 'editing'|'idle' = 'idle';
  root: ViewModelNode;
  readonly observe = new Observe(this);

  import<T>(node: T&MarkdownNode) {
    if ((node as MaybeViewModelNode).viewModel) {
    throw new Error('node is already part of a tree');
    }
    return this.addDom(node);
  }

  edit() {
    assert(this.state === 'idle');
    const startVersion = this.root.viewModel.version;
    const resumeObserve = this.observe.suspend();
    this.state = 'editing';
    return () => {
    normalizeTree(this);
    this.state = 'idle';
    if (this.root.viewModel.version > startVersion) {
      this.observe.notify();
    }
    resumeObserve();
    };
  }

  private addDom<T>(
    node: T&MarkdownNode,
    parent?: ViewModelNode,
    childIndex?: number
  ) {
    const result = node as T&ViewModelNode;
    if (result.type === 'paragraph' || result.type === 'section' || result.type === 'code-block') {
    assert(!result.viewModel);
    result.viewModel = new InlineViewModel(result, this, parent, childIndex);
    } else {
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

  serialize(node?: ViewModelNode): MarkdownNode {
    if (!node) node = this.root;
    assert(node.viewModel.tree === this);
    assert(this.state === 'idle');
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

  export type ViewModelNode = MarkdownNode&{
    viewModel: ViewModel;
    children?: ViewModelNode[];
  };

  export type InlineViewModelNode = InlineNode&{
    viewModel: InlineViewModel;
    children?: ViewModelNode[];
  };

  interface Position {
    row: number;
    column: number;
  }

  function indexToPosition(text: string, index: number): Position {
    let row = 1;
    let column = 1;
    for (let i = 0; i < index; i++) {
      if (text[i] === '\n') {
        row++;
        column = 1;
      } else {
        column++;
      }
    }
    return {row, column};
  }

  interface Edit {
    startIndex: number;
    startPosition: Position;
    newEndIndex: number;
    newEndPosition: Position;
    oldEndIndex: number;
    oldEndPosition: Position;
    newText?: string;
  }

  function apply(text: string, edit: Edit) {
    return (
        text.substring(0, edit.startIndex) + (edit.newText ?? '') +
        text.substring(edit.oldEndIndex));
  }

  interface InlineEdit {
    newText: string;
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
  }

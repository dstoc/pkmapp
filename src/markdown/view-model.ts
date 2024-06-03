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

import {type MarkdownNode, type DocumentNode, isInlineNode} from './node.js';
import type {
  ViewModelNode,
  MaybeViewModelNode,
  InlineViewModelNode,
} from './view-model-node.js';

import {parser as inlineParser} from './inline-parser.js';
import {parseBlocks} from './block-parser.js';
import Parser from 'web-tree-sitter';
import {assert, cast} from '../asserts.js';
import {Observe} from '../observe.js';
import {normalizeTree} from './normalize.js';
import {dfs} from './view-model-util.js';
import {
  Focus,
  Op,
  OpBatch,
  canCoalesce,
  classify,
  doOp,
  undoOp,
} from './view-model-ops.js';

export class ViewModel {
  constructor(
    readonly self: ViewModelNode,
    readonly tree: MarkdownTree,
    public parent?: ViewModelNode,
    childIndex?: number,
    public connected = false,
  ) {
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
  version = 0;
  firstChild?: ViewModelNode;
  lastChild?: ViewModelNode;
  nextSibling?: ViewModelNode;
  previousSibling?: ViewModelNode;
  readonly observe;
  protected signalMutation(op: Op, notify = true) {
    this.version = this.tree.root.viewModel.version + 1;
    this.tree.record(op);
    let parent = this.parent;
    while (parent) {
      parent.viewModel.version = this.version;
      parent = parent.viewModel.parent;
    }
    for (const node of dfs(
      this.self,
      this.self,
      (node) => !node.viewModel.connected,
    )) {
      node.viewModel.version = this.version;
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
    const index = this.parent.children!.indexOf(this.self);
    this.parent.children!.splice(index, 1);
    if (!this.previousSibling)
      this.parent.viewModel.firstChild = this.nextSibling;
    if (!this.nextSibling)
      this.parent.viewModel.lastChild = this.previousSibling;
    const parent = this.parent;
    const nextSibling = this.nextSibling;
    this.signalMutation(
      {
        type: 'remove',
        node: this.self,
        parent,
        nextSibling,
      },
      false,
    );
    this.parent = undefined;
    this.nextSibling = undefined;
    this.previousSibling = undefined;
    this.tree.removed.add(this.self);
    parent.viewModel.observe.notify();
  }

  insertBefore(parent: ViewModelNode, nextSibling?: ViewModelNode) {
    assert(this.tree.state === 'editing');
    if (parent === this.parent && nextSibling === this.nextSibling) {
      return;
    }
    // Maybe this is a weird API, but it frequently simplifies calling
    // code to allow this case.
    if (nextSibling === this.self) {
      assert(parent === this.parent);
      return;
    }
    const hadParent = !!this.parent;
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
    this.signalMutation(
      {
        type: 'insert',
        node: this.self,
        hadParent,
        parent,
        nextSibling,
      },
      false,
    );
    parent.viewModel.observe.notify();
  }

  updateMarker(marker: string) {
    assert(this.tree.state === 'editing');
    switch (this.self.type) {
      case 'list-item':
      case 'section': {
        const oldMarker = this.self.marker;
        if (oldMarker === marker) return;
        (this.self as {marker: string}).marker = marker;
        this.signalMutation({
          type: 'marker',
          node: this.self,
          marker,
          oldMarker,
        });
        break;
      }
    }
  }

  updateChecked(checked: boolean | undefined) {
    assert(this.tree.state === 'editing');
    switch (this.self.type) {
      case 'list-item': {
        const oldChecked = this.self.checked;
        if (oldChecked === checked) return;
        (this.self as {checked?: boolean}).checked = checked;
        this.signalMutation({
          type: 'check',
          node: this.self,
          checked,
          oldChecked,
        });
        break;
      }
    }
  }
}

export interface InlineTreeNode {
  id: number;
  startIndex: number;
  endIndex: number;
  text: string;
  type: string;
  namedChildren: InlineTreeNode[];
}

export interface InlineTree {
  rootNode: InlineTreeNode;
}

export function* traverseInlineNodes(node: InlineTreeNode) {
  const seen = new Set<InlineTreeNode>();
  const queue = [node];
  while (queue.length) {
    const next = cast(queue.pop());
    if (seen.has(next)) {
      yield next;
      if (next === node) return;
    } else {
      seen.add(next);
      queue.push(next, ...(next?.namedChildren ?? []));
    }
  }
}

export class InlineViewModel extends ViewModel {
  constructor(
    override readonly self: InlineViewModelNode,
    tree: MarkdownTree,
    parent?: ViewModelNode,
    childIndex?: number,
  ) {
    super(self, tree, parent, childIndex);
    this.self = self;
  }
  private editedInlineTree?: Parser.Tree;
  private inlineTree_?: Parser.Tree;
  get inlineTree(): InlineTree {
    assert(this.connected);
    if (!this.inlineTree_) {
      this.inlineTree_ = inlineParser.parse(
        this.self.content,
        this.editedInlineTree,
      );
      this.editedInlineTree?.delete();
      this.editedInlineTree = undefined;
    }
    return this.inlineTree_;
  }
  edit(
    {startIndex, newEndIndex, oldEndIndex, newText}: InlineEdit,
    replaceWithBlocks = true,
  ) {
    assert(this.tree.state === 'editing');
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
    if (this.self.content === newContent) return null;
    (this.self as {content: string}).content = newContent;
    const newNodes = replaceWithBlocks ? this.maybeReplaceWithBlocks() : false;
    this.editedInlineTree ??= this.inlineTree_;
    this.inlineTree_ = undefined;
    if (this.editedInlineTree) {
      this.editedInlineTree.edit(result);
    }
    this.signalMutation({
      type: 'edit',
      node: this.self,
      edit: {startIndex, newEndIndex, oldEndIndex, newText},
      oldText,
    });
    if (newNodes) return newNodes;
    return null;
  }
  private maybeReplaceWithBlocks() {
    const blocks = this.parseAsBlocks();
    if (!blocks) return false;
    const newNodes: ViewModelNode[] = [];
    for (const child of blocks) {
      const node = this.tree.add<MarkdownNode>(child);
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
    if (!/^(\d+[.)] |[-+*>] |#+ |[`*\-_]{3})/.test(content)) return;
    if (this.self.type !== 'paragraph') return;
    // TODO: Ensure there's a trailing new line?
    const {node} = parseBlocks(this.self.content + '\n');
    assert(node);
    assert(node.type === 'document' && node.children);
    return node.children;
  }
}

export interface MarkdownTreeDelegate {
  postEditUpdate(
    node: ViewModelNode,
    change: 'connected' | 'disconnected' | 'changed',
  ): void;
}

export interface MarkdownTreeEdit {
  commit: (startFocus?: Focus, endFocus?: Focus) => Op[];
  [Symbol.dispose]: () => void;
}

export class MarkdownTree {
  constructor(
    root: DocumentNode,
    private readonly delegate?: MarkdownTreeDelegate,
  ) {
    this.root = this.addDom<DocumentNode>(root);
    this.setRoot(this.root);
  }

  state: 'editing' | 'post-edit' | 'idle' = 'idle';
  private editCount = 0;
  private editStartVersion = 0;
  private editResumeObserve: () => void = () => void 0;
  private editOperations: Op[] = [];
  root: ViewModelNode & DocumentNode;
  readonly observe = new Observe(this);
  removed = new Set<ViewModelNode>();

  private undoStack: OpBatch[] = [];
  private redoStack: OpBatch[] = [];

  setRoot(node: DocumentNode & ViewModelNode) {
    assert(node.viewModel.tree === this);
    assert(!node.viewModel.parent);
    using _ = this.edit();
    // Ensures that the whole tree is considered new and marked
    // as connected in post-edit.
    this.editStartVersion = -1;
    // TODO: Clear undo/redo
    if (node !== this.root) {
      // Disconnect the existing tree.
      this.removed.add(this.root);
      this.root = node;
    }
  }

  add<T extends MarkdownNode>(node: T) {
    if ((node as MaybeViewModelNode).viewModel) {
      throw new Error('node is already part of a tree');
    }
    return this.addDom(node);
  }

  undo(root: ViewModelNode) {
    assert(this.state === 'idle');
    let batch: OpBatch | undefined = undefined;
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      const classification = classify(root, this.undoStack[i]);
      if (classification === 'outside') continue;
      if (classification === 'inside') {
        [batch] = this.undoStack.splice(i, 1);
        break;
      }
      if (classification === 'both') return;
    }
    if (!batch) return;
    {
      using edit = this.edit();
      for (const op of batch.ops.toReversed()) {
        undoOp(op);
      }
      this.editOperations.length = 0;
      this.redoStack.push(batch);
      const newOps = edit.commit();
      assert(newOps.length === 0);
    }
    return batch.startFocus;
  }

  redo(root: ViewModelNode) {
    assert(this.state === 'idle');
    let batch: OpBatch | undefined = undefined;
    for (let i = this.redoStack.length - 1; i >= 0; i--) {
      const classification = classify(root, this.redoStack[i]);
      if (classification === 'outside') continue;
      if (classification === 'inside') {
        [batch] = this.redoStack.splice(i, 1);
        break;
      }
      if (classification === 'both') return;
    }
    if (!batch) return;
    {
      using edit = this.edit();
      for (const op of batch.ops) {
        doOp(op);
      }
      this.editOperations.length = 0;
      this.undoStack.push(batch);
      const newOps = edit.commit();
      assert(newOps.length === 0);
    }
    return batch.endFocus;
  }

  // TODO: Remove recursive edit.
  edit(): MarkdownTreeEdit {
    if (this.state === 'idle') {
      this.editStartVersion = this.root.viewModel.version;
      this.editResumeObserve = this.observe.suspend();
      this.state = 'editing';
      this.removed.clear();
    }
    const editCount = ++this.editCount;
    const finish = (startFocus?: Focus, endFocus?: Focus) =>
      this.finishEdit(editCount, startFocus, endFocus);
    let finished = false;
    return {
      commit: (startFocus?: Focus, endFocus?: Focus) => {
        assert(!finished);
        assert(this.editCount === 1);
        finished = true;
        return finish(startFocus, endFocus);
      },
      [Symbol.dispose]() {
        if (finished) return;
        finish();
      },
    };
  }

  record(op: Op) {
    assert(this.state === 'editing');
    this.editOperations.push(op);
  }

  private finishEdit(
    editCount: number,
    startFocus: Focus | undefined,
    endFocus: Focus | undefined,
  ) {
    assert(this.editCount === editCount);
    assert(this.state === 'editing');
    this.editCount--;
    if (this.editCount > 0) return [];
    normalizeTree(this);
    const removedRoots = new Set<ViewModelNode>();
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
    for (const node of dfs(
      this.root,
      undefined,
      (node) => node.viewModel.version > this.editStartVersion,
    )) {
      if (!node.viewModel.connected) {
        node.viewModel.connected = true;
        this.delegate?.postEditUpdate(node, 'connected');
      } else {
        assert(node.viewModel.version > this.editStartVersion);
        this.delegate?.postEditUpdate(node, 'changed');
      }
    }

    let result: Op[] = [];
    if (this.editOperations.length) {
      result = [...this.editOperations];
      const now = Date.now();
      const last = this.undoStack.at(-1);
      if (
        last &&
        now - last.timestamp < 1000 &&
        canCoalesce(last, this.editOperations)
      ) {
        last.ops = [...last.ops, ...this.editOperations];
        last.timestamp = now;
        last.endFocus = endFocus;
      } else {
        this.undoStack.push({
          ops: [...this.editOperations],
          timestamp: Date.now(),
          startFocus,
          endFocus,
        });
      }
      this.editOperations.length = 0;
      this.redoStack.length = 0;
    }

    this.state = 'idle';
    if (this.root.viewModel.version > this.editStartVersion) {
      // TODO: Probably need to track/notify whether it's a
      // cache/metadata change, or an edit.
      this.observe.notify();
    }
    this.editResumeObserve();
    return result;
  }

  private addDom<T extends MarkdownNode>(
    node: T,
    parent?: ViewModelNode,
    childIndex?: number,
  ) {
    const result = node as T & ViewModelNode;
    if (isInlineNode(result)) {
      assert(!result.viewModel);
      result.viewModel = new InlineViewModel(
        result as InlineViewModelNode,
        this,
        parent,
        childIndex,
      );
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
    node = node ?? this.root;
    assert(node.viewModel.tree === this);
    assert(this.state === 'idle');
    const result: MarkdownNode & MaybeViewModelNode = {
      ...node,
      [Symbol.for('markdown-tree')]: true,
    };
    delete result.viewModel;
    result.children = node.children?.map((node: ViewModelNode) =>
      this.serialize(node),
    );
    return result;
  }
}

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
    text.substring(0, edit.startIndex) +
    (edit.newText ?? '') +
    text.substring(edit.oldEndIndex)
  );
}

export interface InlineEdit {
  newText: string;
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
}

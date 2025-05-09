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
  Caches,
} from './view-model-node.js';

import {parser as inlineParser} from './inline-parser.js';
import {parseBlocks} from './block-parser.js';
import Parser from 'web-tree-sitter';
import {assert, cast} from '../asserts.js';
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
import {viewModel} from './view-model-node.js';
import {batch, signal} from '@preact/signals-core';
import {TypedCustomEvent, TypedEventTargetConstructor} from '../event-utils.js';

function emptyDocument(): DocumentNode {
  return {type: 'document', children: [{type: 'paragraph', content: ''}]};
}

let sequence = 0;
export class ViewModel {
  constructor(
    readonly self: ViewModelNode,
    readonly tree: MarkdownTree,
    public parent?: ViewModelNode,
    childIndex?: number,
  ) {
    this.initialize(parent, childIndex);
  }
  readonly id = sequence++;
  get connected(): boolean {
    return this.connected_;
  }
  get caches(): Caches | undefined {
    return this.tree.caches.get(this.self);
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
  readonly renderSignal = signal(0);
  protected signalMutation(op: Op, notify = true) {
    this.version = this.tree.root[viewModel].version + 1;
    this.tree.record(op);
    let parent = this.parent;
    while (parent) {
      parent[viewModel].version = this.version;
      parent = parent[viewModel].parent;
    }
    for (const node of dfs(
      this.self,
      this.self,
      (node) => !node[viewModel].connected,
    )) {
      node[viewModel].version = this.version;
    }
    if (notify) {
      this.renderSignal.value++;
    }
  }
  private connected_ = false;
  connect() {
    this.connected_ = true;
    this.renderSignal.value++;
  }
  disconnect() {
    this.connected_ = false;
    this.renderSignal.value++;
  }
  remove() {
    assert(this.tree.state === 'editing');
    assert(this.parent);
    if (this.parent?.[viewModel].firstChild === this.self) {
      this.parent[viewModel].firstChild = this.nextSibling;
    }
    if (this.parent?.[viewModel].lastChild === this.self) {
      this.parent[viewModel].lastChild = this.previousSibling;
    }
    if (this.previousSibling) {
      this.previousSibling[viewModel].nextSibling = this.nextSibling;
    }
    if (this.nextSibling) {
      this.nextSibling[viewModel].previousSibling = this.previousSibling;
    }
    const index = this.parent.children!.indexOf(this.self);
    this.parent.children!.splice(index, 1);
    if (!this.previousSibling)
      this.parent[viewModel].firstChild = this.nextSibling;
    if (!this.nextSibling)
      this.parent[viewModel].lastChild = this.previousSibling;
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
    parent[viewModel].renderSignal.value++;
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
      ? nextSibling?.[viewModel].previousSibling
      : parent[viewModel].lastChild;

    this.parent = parent;
    this.previousSibling = previousSibling;
    this.nextSibling = nextSibling;

    if (previousSibling) {
      previousSibling[viewModel].nextSibling = this.self;
    } else {
      parent[viewModel].firstChild = this.self;
    }
    if (nextSibling) {
      nextSibling[viewModel].previousSibling = this.self;
    } else {
      parent[viewModel].lastChild = this.self;
    }
    parent.children ??= [];
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
    parent[viewModel].renderSignal.value++;
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
        if (checked == undefined) {
          delete (this.self as {checked?: boolean}).checked;
        } else {
          (this.self as {checked?: boolean}).checked = checked;
        }

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
  override disconnect() {
    super.disconnect();
    this.inlineTree_?.delete();
    this.inlineTree_ = undefined;
    this.editedInlineTree?.delete();
    this.editedInlineTree = undefined;
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
      node[viewModel].insertBefore(cast(this.parent), this.nextSibling);
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

export type TreeChange = 'edit' | 'cache';

interface MarkdownTreeEventMap {
  'tree-change': CustomEvent<TreeChange>;
}

export class MarkdownTree extends (EventTarget as TypedEventTargetConstructor<
  MarkdownTree,
  MarkdownTreeEventMap
>) {
  constructor(
    root: DocumentNode | undefined,
    caches?: Map<MarkdownNode, Caches>,
    private readonly delegate?: MarkdownTreeDelegate,
  ) {
    super();
    if (!root) {
      this.#disconnected = true;
      if (caches) console.warn('disconnected but caches present');
      caches = undefined;
      root = emptyDocument();
    } else {
      this.#disconnected = false;
    }
    this.root = this.addDom(root);
    this.caches = caches ?? new Map<MarkdownNode, Caches>();
    this.setRoot(this.root);
  }

  readonly caches: Map<MarkdownNode, Caches>;
  state: 'editing' | 'post-edit' | 'idle' = 'idle';
  private editStartVersion = 0;
  private editOperations: Op[] = [];
  private editChangedCaches = false;

  root: ViewModelNode & DocumentNode;
  removed = new Set<ViewModelNode>();

  // Effectively a tombstone state.
  #disconnected: boolean;
  get disconnected() {
    return this.#disconnected;
  }

  private undoStack: OpBatch[] = [];
  private redoStack: OpBatch[] = [];

  disconnect() {
    if (this.#disconnected) return;
    this.caches.clear();
    this.#disconnected = true;
    this.setRoot(this.addDom(emptyDocument()));
  }

  connect() {
    if (!this.#disconnected) return;
    this.#disconnected = false;
  }

  setRoot(node: DocumentNode & ViewModelNode, fireTreeEditEvent = false) {
    assert(node[viewModel].tree === this);
    assert(!node[viewModel].parent);
    this.edit(() => {
      // Ensures that the whole tree is considered new and marked
      // as connected in post-edit.
      this.editStartVersion = -1;
      // TODO: Clear undo/redo
      if (node !== this.root) {
        // Disconnect the existing tree.
        this.removed.add(this.root);
        this.root = node;
      }
      return {};
    }, fireTreeEditEvent);
  }

  add<T extends MarkdownNode>(node: T) {
    if ((node as MaybeViewModelNode)[viewModel]) {
      throw new Error('node is already part of a tree');
    }
    return this.addDom(node);
  }

  undo(root: ViewModelNode) {
    assert(this.state === 'idle');
    assert(!this.#disconnected);
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
      const newOps = this.edit(() => {
        for (const op of batch.ops.toReversed()) {
          undoOp(op);
        }
        this.editOperations.length = 0;
        this.redoStack.push(batch);
        return {};
      });
      assert(newOps.length === 0);
    }
    return batch.startFocus;
  }

  redo(root: ViewModelNode) {
    assert(this.state === 'idle');
    assert(!this.#disconnected);
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
      const newOps = this.edit(() => {
        for (const op of batch.ops) {
          doOp(op);
        }
        this.editOperations.length = 0;
        this.undoStack.push(batch);
        return {};
      });
      assert(newOps.length === 0);
    }
    return batch.endFocus;
  }

  edit(
    editFn: () => {startFocus?: Focus; endFocus?: Focus},
    fireTreeEditEvent = true,
  ): Op[] {
    assert(this.state === 'idle');
    this.editStartVersion = this.root[viewModel].version;
    this.state = 'editing';
    this.removed.clear();
    return batch(() => {
      const {startFocus, endFocus} = editFn();
      return this.finishEdit(startFocus, endFocus, fireTreeEditEvent);
    });
  }

  editCache<K extends keyof Caches>(
    node: ViewModelNode,
    version: number,
    key: K,
    value?: Caches[K],
  ) {
    assert(this.state === 'idle');
    assert(node[viewModel].version === version);
    assert(node[viewModel].connected);
    assert(node[viewModel].tree === this);
    assert(!this.#disconnected);
    let cache = this.caches.get(node);
    if (value !== undefined) {
      if (!cache) {
        this.caches.set(node, (cache = {}));
      }
      cache[key] = value;
    } else if (cache) {
      delete cache[key];
      if (!Object.keys(cache)) {
        this.caches.delete(node);
      }
    }
    this.dispatchEvent(new TypedCustomEvent('tree-change', {detail: 'cache'}));
  }

  setCache<K extends keyof Caches>(
    node: ViewModelNode,
    key: K,
    value?: Caches[K],
  ) {
    assert(this.state === 'post-edit');
    assert(node[viewModel].tree === this);
    assert(!this.#disconnected);
    this.editChangedCaches = true;
    let cache = this.caches.get(node);
    if (value !== undefined) {
      if (!cache) {
        this.caches.set(node, (cache = {}));
      }
      if (cache[key] !== value) {
        this.editChangedCaches = true;
        cache[key] = value;
      }
    } else if (cache) {
      this.editChangedCaches = true;
      delete cache[key];
      if (!Object.keys(cache)) {
        this.caches.delete(node);
      }
    }
  }

  record(op: Op) {
    assert(this.state === 'editing');
    assert(!this.#disconnected);
    this.editOperations.push(op);
  }

  private finishEdit(
    startFocus: Focus | undefined,
    endFocus: Focus | undefined,
    fireTreeEditEvent = true,
  ) {
    assert(this.state === 'editing');
    if (this.root[viewModel].version > this.editStartVersion) {
      normalizeTree(this);
    }
    const removedRoots = new Set<ViewModelNode>();
    for (const node of this.removed.values()) {
      if (!node[viewModel].parent) {
        removedRoots.add(node);
      }
    }
    this.state = 'post-edit';
    for (const root of removedRoots.values()) {
      for (const node of dfs(root)) {
        node[viewModel].disconnect();
        this.caches.delete(node);
        this.delegate?.postEditUpdate(node, 'disconnected');
      }
    }
    for (const node of dfs(
      this.root,
      undefined,
      (node) => node[viewModel].version > this.editStartVersion,
    )) {
      if (!node[viewModel].connected) {
        node[viewModel].connect();
        if (!this.#disconnected) {
          this.delegate?.postEditUpdate(node, 'connected');
        }
      } else {
        assert(node[viewModel].version > this.editStartVersion);
        // TODO: Sometimes it could be safe to keep the cache.
        // e.g. if a node has moved it's content can be unchanged.
        // Could move the clearing responsibility to the impls,
        // otherwise they may need to build other optimizations.
        this.caches.delete(node);
        if (!this.#disconnected) {
          this.delegate?.postEditUpdate(node, 'changed');
        }
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
    if (fireTreeEditEvent) {
      if (this.root[viewModel].version > this.editStartVersion) {
        this.dispatchEvent(
          new TypedCustomEvent('tree-change', {detail: 'edit'}),
        );
      } else if (this.editChangedCaches) {
        this.editChangedCaches = false;
        this.dispatchEvent(
          new TypedCustomEvent('tree-change', {detail: 'cache'}),
        );
      }
    } else {
      this.editChangedCaches = false;
    }
    return result;
  }

  private addDom<T extends MarkdownNode>(
    node: T,
    parent?: ViewModelNode,
    childIndex?: number,
  ) {
    const result = node as T & ViewModelNode;
    if (isInlineNode(result)) {
      assert(!result[viewModel]);
      result[viewModel] = new InlineViewModel(
        result as InlineViewModelNode,
        this,
        parent,
        childIndex,
      );
    } else {
      assert(!result[viewModel]);
      result[viewModel] = new ViewModel(result, this, parent, childIndex);
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
    assert(node[viewModel].tree === this);
    assert(this.state === 'idle');
    const result = structuredClone(node);
    assert(!result[viewModel]);
    return result;
  }

  serializeWithCaches(): {
    root: MarkdownNode;
    caches: Map<MarkdownNode, Caches>;
  } {
    return structuredClone({root: this.root, caches: this.caches});
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

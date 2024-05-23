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

import {assert, cast} from '../asserts.js';

import type {MaybeViewModelNode, ViewModelNode} from './view-model-node.js';
import {
  CodeBlockNode,
  MarkdownNode,
  ParagraphNode,
  SectionNode,
} from './node.js';

export function swapNodes(node1: ViewModelNode, node2: ViewModelNode) {
  if (node1.viewModel.nextSibling === node2) {
    node2.viewModel.insertBefore(cast(node1.viewModel.parent), node1);
    return;
  }
  if (node2.viewModel.nextSibling === node1) {
    node1.viewModel.insertBefore(cast(node2.viewModel.parent), node2);
    return;
  }
  const node1Parent = node1.viewModel.parent!;
  const node1NextSibling = node1.viewModel.nextSibling;
  node1.viewModel.insertBefore(cast(node2.viewModel.parent), node2);
  node2.viewModel.insertBefore(node1Parent, node1NextSibling);
}

export function isAncestorOf(
  maybeAncestor: ViewModelNode,
  descendant: ViewModelNode,
) {
  for (const ancestor of ancestors(
    descendant,
    descendant.viewModel.tree.root,
  )) {
    if (ancestor === maybeAncestor) {
      return true;
    }
  }
  return false;
}

export function* ancestors(
  node: ViewModelNode,
  root: ViewModelNode = node.viewModel.tree.root,
) {
  while (node.viewModel.parent) {
    yield node.viewModel.parent;
    node = node.viewModel.parent;
    if (node === root) return;
  }
}

export function* reverseDfs(node: ViewModelNode, limit?: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && (node = next);
  }
  do {
    while (next(node.viewModel.previousSibling)) {
      while (next(node.viewModel.lastChild));
      yield node;
      if (node === limit) return;
    }
    if (next(node.viewModel.parent)) {
      yield node;
      if (node === limit) return;
      continue;
    }
    return;
  } while (true);
}

/**
 * Performs an in order traversal starting at `node` and ending at `root`,
 * or the root of the tree if `root` is not encountered. Optionally `predicate`
 * may be specified to exclude specific subtrees by returning `false`.
 */
export function* dfs(
  node: ViewModelNode,
  root: ViewModelNode = node.viewModel.tree.root,
  predicate?: (node: ViewModelNode) => boolean,
) {
  function next(next?: ViewModelNode) {
    return next && next !== root.viewModel.parent && (node = next);
  }
  do {
    if (!predicate || predicate(node)) {
      yield node;
      if (next(node.viewModel.firstChild)) continue;
    }
    if (next(node.viewModel.nextSibling)) continue;
    do {
      if (!next(node.viewModel.parent)) return;
    } while (!next(node.viewModel.nextSibling));
  } while (true);
}

/**
 * Traverses siblings, parent, parent siblings, and repeats until root.
 *
 * Assumes that `node` is contained by `root`.
 */
export function* shallowTraverse(node: ViewModelNode, root: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && next !== root && (node = next);
  }
  do {
    yield node;
    if (next(node.viewModel.nextSibling)) continue;
    do {
      if (!next(node.viewModel.parent)) return;
    } while (!next(node.viewModel.nextSibling));
  } while (true);
}

export function findAncestor(
  node: ViewModelNode,
  root: ViewModelNode,
  ...type: string[]
) {
  const path = [node];
  for (const ancestor of ancestors(node, root)) {
    if (type.includes(ancestor.type)) {
      return {
        ancestor,
        path,
      };
    }
    path.unshift(ancestor);
  }
  return {};
}

type Editable = ViewModelNode & (ParagraphNode | CodeBlockNode | SectionNode);

function editable(node: ViewModelNode): node is Editable {
  return ['paragraph', 'code-block', 'section'].includes(node.type);
}

export function findPreviousEditable(
  node: ViewModelNode,
  root: ViewModelNode,
  include = false,
): Editable | null {
  if (include && editable(node)) return node;
  return findPreviousDfs(node, root, editable);
}

export function findNextEditable(
  node: ViewModelNode,
  root: ViewModelNode,
  include = false,
): Editable | null {
  if (include && editable(node)) return node;
  return findNextDfs(node, root, editable);
}

// TODO: why doesn't this return Editable?
export function findFinalEditable(
  node: ViewModelNode,
  include = false,
): ViewModelNode | null {
  let result: Editable | null = null;
  if (include && editable(node)) result = node;
  for (const next of dfs(node)) {
    if (editable(next)) result = next;
  }
  return result;
}

export function findNextDfs<T extends ViewModelNode>(
  node: ViewModelNode,
  root: ViewModelNode,
  predicate: (node: ViewModelNode) => node is T,
) {
  for (const next of dfs(node, root)) {
    if (next !== node && predicate(next)) return next;
  }
  return null;
}

export function findPreviousDfs<T extends ViewModelNode>(
  node: ViewModelNode,
  root: ViewModelNode,
  predicate: (node: ViewModelNode) => node is T,
) {
  for (const next of reverseDfs(node, root)) {
    if (next !== node && predicate(next)) return next;
  }
  return null;
}

export function* children(node: ViewModelNode) {
  let next = node.viewModel.firstChild;
  while (next) {
    assert(next.viewModel.parent === node);
    const child = next;
    next = child.viewModel.nextSibling;
    yield child;
  }
}

/**
 * Returns the values of `nodes` with any nodes that are descendants of
 * others removed.
 */
export function removeDescendantNodes(nodes: Iterable<ViewModelNode>) {
  const roots = new Set<ViewModelNode>(nodes);
  for (const node of nodes) {
    for (const ancestor of ancestors(node)) {
      if (roots.has(ancestor)) {
        roots.delete(node);
        break;
      }
    }
  }
  return [...roots.values()];
}

function* cloneChildren(
  children: ViewModelNode[],
  predicate?: (node: ViewModelNode) => boolean,
): Generator<MarkdownNode> {
  for (const child of children) {
    if (!predicate || predicate(child)) {
      yield cloneNode(child, predicate);
    }
  }
}

/**
 * Clones `node` into a `MarkdownNode` excluding any descendants where the
 * optional predicate returns `false`.
 */
export function cloneNode(
  node: ViewModelNode,
  predicate?: (node: ViewModelNode) => boolean,
): MarkdownNode {
  const result: MarkdownNode = {
    ...node,
    children: [...cloneChildren(node.children ?? [], predicate)],
  };
  delete (result as MaybeViewModelNode).viewModel;
  return result;
}

export function compareDocumentOrder(
  node1: ViewModelNode,
  node2: ViewModelNode,
) {
  if (node1 === node2) return 0;
  const node1Chain = [node1, ...ancestors(node1)];
  const node2Chain = [node2, ...ancestors(node2)];
  assert(
    node1Chain[node1Chain.length - 1] === node2Chain[node2Chain.length - 1],
  );
  while (
    node1Chain[node1Chain.length - 1] === node2Chain[node2Chain.length - 1]
  ) {
    node1Chain.pop();
    node2Chain.pop();
  }
  const node1Ancestor = node1Chain[node1Chain.length - 1];
  const node2Ancestor = node2Chain[node2Chain.length - 1];
  for (
    let node: ViewModelNode | undefined = node1Ancestor;
    node;
    node = node.viewModel.nextSibling
  ) {
    if (node2Ancestor === node) {
      return -1;
    }
  }
  return 1;
}

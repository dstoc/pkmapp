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

import {ViewModelNode} from './view-model.js';

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

export function* ancestors(node: ViewModelNode, root: ViewModelNode) {
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
      while (next(node.viewModel.lastChild))
        ;
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

export function* dfs(node: ViewModelNode, root = node.viewModel.tree.root) {
  function next(next?: ViewModelNode) {
    return next && next !== root.viewModel.parent && (node = next);
  }
  do {
    yield node;
    if (next(node.viewModel.firstChild)) continue;
    if (next(node.viewModel.nextSibling)) continue;
    do {
      if (!next(node.viewModel.parent)) return;
    } while (!next(node.viewModel.nextSibling));
  } while (true);
}

export function findAncestor(node: ViewModelNode, root: ViewModelNode, type: string) {
  const path = [node];
  for (const ancestor of ancestors(node, root)) {
    if (ancestor.type === type) {
      return {
        ancestor,
        path,
      };
    }
    path.unshift(ancestor);
  }
  return {};
}

export function findNextEditable(node: ViewModelNode, root: ViewModelNode, include = false) {
  const predicate =
      (node: ViewModelNode) => ['paragraph', 'code-block', 'section'].includes(
          node.type);
  if (include && predicate(node)) return node;
  return findNextDfs(node, root, predicate);
}

export function findFinalEditable(node: ViewModelNode, include = false) {
  const predicate =
      (node: ViewModelNode) => ['paragraph', 'code-block', 'section'].includes(
          node.type);
  let result: ViewModelNode|null = null;
  if (include && predicate(node)) result = node;
  for (const next of dfs(node)) {
    if (predicate(next)) result = next;
  }
  return result;
}

export function findNextDfs(
    node: ViewModelNode, root: ViewModelNode, predicate: (node: ViewModelNode) => boolean) {
  for (const next of dfs(node, root)) {
    if (next !== node && predicate(next)) return next;
  }
  return null;
}

export function findPreviousDfs(
    node: ViewModelNode, predicate: (node: ViewModelNode) => boolean) {
  for (const next of reverseDfs(node)) {
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

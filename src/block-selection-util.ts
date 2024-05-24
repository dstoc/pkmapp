// Copyright 2023 Google LLC
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

import {HostContext} from './markdown/host-context.js';
import type {ViewModelNode} from './markdown/view-model-node.js';
import {getContainingTransclusion} from './markdown/transclusion.js';
import {assert, cast} from './asserts.js';
import {focusNode} from './markdown/host-context.js';
import {
  findPreviousEditable,
  findNextEditable,
  dfs,
} from './markdown/view-model-util.js';
import {MarkdownInline} from './markdown/inline-render.js';
import {children} from './markdown/view-model-util.js';
import {isInlineNode} from './markdown/node.js';

export function getBlockSelectionTarget(
  element: Element & {hostContext?: HostContext; node?: ViewModelNode},
) {
  if (element.hostContext?.hasSelection) return element;
  // Retarget if there's any containing transclusion that has a selection.
  let transclusion;
  do {
    transclusion = getContainingTransclusion(transclusion ?? element);
  } while (transclusion && !cast(transclusion.hostContext).hasSelection);
  if (transclusion && cast(transclusion.hostContext).hasSelection) {
    assert(transclusion.node);
    return transclusion;
  }
  return;
}

export function maybeRemoveSelectedNodes(inline: MarkdownInline) {
  const {hostContext} = getBlockSelectionTarget(inline) ?? {};
  if (!hostContext) return false;
  return maybeRemoveSelectedNodesIn(hostContext);
}

export function maybeRemoveSelectedNodesIn(hostContext: HostContext) {
  if (!hostContext.hasSelection) return false;
  const nodes = hostContext.selection;
  const context = [];
  const root = cast(hostContext.root);
  using _ = root.viewModel.tree.edit();
  for (const node of nodes) {
    node.viewModel.previousSibling &&
      context.push(node.viewModel.previousSibling);
    node.viewModel.parent && context.push(node.viewModel.parent);
    if (node.type === 'section' && node.viewModel.parent) {
      for (const child of children(node)) {
        child.viewModel.insertBefore(cast(node.viewModel.parent), node);
      }
    }
    node.viewModel.remove();
  }
  let didFocus = false;
  for (const node of context) {
    // TODO: this isn't a perfect test that the node is still connected
    if (node.viewModel.parent) {
      const prev = findPreviousEditable(node, root, true);
      if (prev) {
        focusNode(hostContext, prev, -Infinity);
        didFocus = true;
        break;
      }
    }
  }
  if (!didFocus) {
    const next = findNextEditable(root, root, true);
    if (next) {
      focusNode(hostContext, next, 0);
      didFocus = true;
    }
  }
  hostContext.clearSelection();
  return true;
}

// take all the nodes in the selection (inline nodes)
// try to add all their siblings (or children for sections)
// if nothing was added, find their parents, then add all children
// repeat until something was added or we reached the top.
export function expandSelection(hostContext: HostContext) {
  const visited = new Set<ViewModelNode>();
  const seeds = new Set<ViewModelNode>(hostContext.selection);
  for (const node of hostContext.selection) {
    if (node.type === 'section' && node.viewModel.firstChild) {
      seeds.add(node.viewModel.firstChild);
    }
  }
  const newNodes = new Set<ViewModelNode>();
  while (!newNodes.size && seeds.size) {
    const iteration = [...seeds];
    seeds.clear();
    for (const node of iteration) {
      const next = node.viewModel.parent;
      if (!next || next === hostContext.root?.viewModel.parent) {
        continue;
      }
      if (!visited.has(next)) {
        for (const candidate of dfs(next, next, (node) => !visited.has(node))) {
          if (
            isInlineNode(candidate) &&
            !hostContext.selection.has(candidate) &&
            !newNodes.has(candidate)
          ) {
            newNodes.add(candidate);
          }
        }
        seeds.add(next);
        visited.add(next);
      }
    }
  }
  if (newNodes.size) {
    hostContext.expandSelection(newNodes);
  }
}

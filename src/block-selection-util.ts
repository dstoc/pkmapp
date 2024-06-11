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
import type {
  InlineViewModelNode,
  ViewModelNode,
} from './markdown/view-model-node.js';
import {getContainingTransclusion} from './markdown/transclusion.js';
import {assert, cast} from './asserts.js';
import {dfs} from './markdown/view-model-util.js';
import {isInlineNode} from './markdown/node.js';
import {viewModel} from './markdown/view-model-node.js';

export type BlockSelectionTarget = Element & {
  hostContext?: HostContext;
  node?: InlineViewModelNode;
};

export function getBlockSelectionTarget(
  element: Element & {hostContext?: HostContext; node?: InlineViewModelNode},
): BlockSelectionTarget | undefined {
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

// take all the nodes in the selection (inline nodes)
// try to add all their siblings (or children for sections)
// if nothing was added, find their parents, then add all children
// repeat until something was added or we reached the top.
export function expandSelection(hostContext: HostContext) {
  const visited = new Set<ViewModelNode>();
  const seeds = new Set<ViewModelNode>();
  for (const node of hostContext.selection) {
    if (node.type === 'section' && node[viewModel].firstChild) {
      seeds.add(node[viewModel].firstChild);
    } else {
      seeds.add(node);
    }
  }
  const newNodes = new Set<InlineViewModelNode>();
  while (!newNodes.size && seeds.size) {
    const iteration = [...seeds];
    seeds.clear();
    for (const node of iteration) {
      const next = node[viewModel].parent;
      if (!next || next === hostContext.root?.[viewModel].parent) {
        continue;
      }
      if (!visited.has(next)) {
        for (const candidate of dfs(next, next, (node) => !visited.has(node))) {
          if (
            isInlineNode(candidate) &&
            !hostContext.selection.has(candidate)
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

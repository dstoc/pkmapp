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

import type {ViewModelNode} from './markdown/view-model-node.js';
import {viewModel} from './markdown/view-model-node.js';

export function isLogicalContainingBlock(node?: ViewModelNode) {
  switch (node?.type) {
    case 'section':
      if (
        !node[viewModel].previousSibling &&
        (node[viewModel].parent?.type === 'list-item' ||
          node[viewModel].parent?.type === 'document')
      )
        return false;
      return true;
    case 'list-item':
    case 'document':
      return true;
    default:
      return false;
  }
}

export function getLogicalContainingBlock(node?: ViewModelNode) {
  let next = node?.[viewModel].parent;
  while (next) {
    if (isLogicalContainingBlock(next)) return next;
    next = next[viewModel].parent;
  }
  return;
}

export function getNamedContainingBlock(node?: ViewModelNode) {
  let next = node;
  while (next) {
    if (isExplicitlyNamed(next)) return next;
    next = getLogicalContainingBlock(next);
  }
  return;
}

export function isExplicitlyNamed(node?: ViewModelNode) {
  switch (node?.type) {
    case 'section':
      return !(
        !node[viewModel].previousSibling &&
        (node[viewModel].parent?.type === 'list-item' ||
          node[viewModel].parent?.type === 'document')
      );
    case 'list-item':
      return node[viewModel].firstChild?.type === 'section';
    case 'document':
      return true;
    default:
      return false;
  }
}

export function getNameSource(node?: ViewModelNode) {
  switch (node?.type) {
    case 'section':
      if (
        !(
          !node[viewModel].previousSibling &&
          (node[viewModel].parent?.type === 'list-item' ||
            node[viewModel].parent?.type === 'document')
        )
      )
        return node;
      return undefined;
    case 'list-item':
      if (node[viewModel].firstChild?.type === 'section') {
        return node[viewModel].firstChild;
      }
      return undefined;
    case 'document':
      if (node[viewModel].firstChild?.type === 'section') {
        return node[viewModel].firstChild;
      }
      return node;
    default:
      return undefined;
  }
}

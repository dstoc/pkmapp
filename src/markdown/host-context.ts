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

import {cast} from '../asserts.js';
import {createContext} from '@lit/context';

import type {InlineViewModelNode, ViewModelNode} from './view-model-node.js';
import {compareDocumentOrder} from './view-model-util.js';
import {viewModel} from './view-model-node.js';

export class HostContext {
  focusNode?: InlineViewModelNode;
  focusOffset?: number;
  root?: ViewModelNode;
  readonly selection = new Set<InlineViewModelNode>();
  selectionAnchor?: InlineViewModelNode;
  selectionFocus?: InlineViewModelNode;

  get hasSelection() {
    return !!this.selection.size;
  }

  clearSelection() {
    if (!this.selection.size) return;
    const [...selection] = this.selection.values();
    this.selection.clear();
    this.selectionAnchor = undefined;
    this.selectionFocus = undefined;
    for (const node of selection) {
      node[viewModel].renderSignal.value++;
    }
  }

  // TODO: set and extend should consider the nodes between the arguments
  // at some point. This will be necessary to extend the selection by
  // pointer.
  setSelection(anchor: InlineViewModelNode, focus: InlineViewModelNode) {
    this.selectionAnchor = anchor;
    this.selectionFocus = focus;
    this.selection.add(anchor);
    this.selection.add(focus);
    anchor[viewModel].renderSignal.value++;
    focus[viewModel].renderSignal.value++;
  }

  extendSelection(from: InlineViewModelNode, to: InlineViewModelNode) {
    if (this.selection.has(to)) {
      this.selection.delete(from);
      if (this.selectionAnchor === from) {
        this.selectionAnchor = to;
      }
      from[viewModel].renderSignal.value++;
    }
    this.selection.add(to);
    this.selectionFocus = to;
    to[viewModel].renderSignal.value++;
  }

  expandSelection(nodes: Iterable<InlineViewModelNode>) {
    const oldAnchor = this.selectionAnchor;
    const oldFocus = this.selectionFocus;
    for (const node of nodes) {
      this.selection.add(node);
    }
    for (const node of nodes) {
      node[viewModel].renderSignal.value++;
    }
    // TODO: Consider whether there's a smarter way to set the
    // selectionAnchor/focus after this operation.
    const sorted = [...this.selection].sort(compareDocumentOrder);
    this.selectionAnchor = sorted[0];
    this.selectionFocus = cast(sorted.at(-1));
    oldAnchor && oldAnchor[viewModel].renderSignal.value++;
    oldFocus && oldFocus[viewModel].renderSignal.value++;
    focusNode(this, this.selectionFocus);
  }
}
export const hostContext = createContext<HostContext | undefined>(
  'hostContext',
);

export function focusNode(
  context: HostContext,
  node: InlineViewModelNode,
  offset?: number,
) {
  context.focusNode = node;
  context.focusOffset = offset;
  node[viewModel].renderSignal.value++;
}

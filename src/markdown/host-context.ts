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

import {createContext} from '../deps/lit-context.js';

import type {ViewModelNode} from './view-model-node.js';
import {compareDocumentOrder} from './view-model-util.js';

export class HostContext {
  focusNode?: ViewModelNode;
  focusOffset?: number;
  root?: ViewModelNode;
  readonly selection = new Set<ViewModelNode>();
  selectionAnchor?: ViewModelNode;
  selectionFocus?: ViewModelNode;

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
      node.viewModel.observe.notify();
    }
  }

  // TODO: set and extend should consider the nodes between the arguments
  // at some point. This will be necessary to extend the selection by
  // pointer.
  setSelection(anchor: ViewModelNode, focus: ViewModelNode) {
    this.selectionAnchor = anchor;
    this.selectionFocus = focus;
    this.selection.add(anchor);
    this.selection.add(focus);
    anchor.viewModel.observe.notify();
    focus.viewModel.observe.notify();
  }

  extendSelection(from: ViewModelNode, to: ViewModelNode) {
    if (this.selection.has(to)) {
      this.selection.delete(from);
      if (this.selectionAnchor === from) {
        this.selectionAnchor = to;
      }
      from.viewModel.observe.notify();
    }
    this.selection.add(to);
    this.selectionFocus = to;
    to.viewModel.observe.notify();
  }

  expandSelection(nodes: Iterable<ViewModelNode>) {
    const oldAnchor = this.selectionAnchor;
    const oldFocus = this.selectionFocus;
    for (const node of nodes) {
      this.selection.add(node);
    }
    for (const node of nodes) {
      node.viewModel.observe.notify();
    }
    // TODO: Consider whether there's a smarter way to set the
    // selectionAnchor/focus after this operation.
    const sorted = [...this.selection].sort(compareDocumentOrder);
    this.selectionAnchor = sorted[0];
    this.selectionFocus = sorted[sorted.length - 1];
    oldAnchor?.viewModel.observe.notify();
    oldFocus?.viewModel.observe.notify();
    focusNode(this, this.selectionFocus);
  }
}
export const hostContext = createContext<HostContext | undefined>(
  'hostContext',
);

export function focusNode(
  context: HostContext,
  node: ViewModelNode,
  offset?: number,
) {
  context.focusNode = node;
  context.focusOffset = offset;
  node.viewModel.observe.notify();
}

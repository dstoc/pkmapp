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

import type {CodeBlockNode} from './markdown/node.js';
import type {ViewModelNode} from './markdown/view-model.js';
import type {LogicalContainingBlock} from './block-util.js';
import {isLogicalContainingBlock} from './block-util.js';

export class Metadata {
  private data = new Map<ViewModelNode, string>();
  private reverse = new Map<ViewModelNode, LogicalContainingBlock>();
  private names = new Map<string, LogicalContainingBlock>();
  // TODO: sections, tags
  get(node: LogicalContainingBlock) {
    return this.data.get(node);
  }
  findByName(name: string) {
    return this.names.get(name);
  }
  postEditUpdate(node: ViewModelNode&CodeBlockNode, change: 'connected'|'disconnected'|'changed') {
    const container = node.viewModel.parent;
    const previousContainer = this.reverse.get(node);
    const isMetadata = node.info === 'meta';
    if (previousContainer && (previousContainer !== container || !isMetadata || change === 'disconnected')) {
      this.reverse.delete(node);
      const name = this.data.get(previousContainer);
      if (name !== undefined) {
        this.names.delete(name);
      }
      this.data.delete(previousContainer);
      previousContainer.viewModel.observe.notify();
    }
    if (isMetadata && change !== 'disconnected' && isLogicalContainingBlock(container)) {
      const name = node.content;
      this.reverse.set(node, container);
      this.data.set(container, name);
      this.names.set(name, container);
      container.viewModel.observe.notify();
    }
  }
}

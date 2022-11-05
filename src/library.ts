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

import {parseBlocks} from './markdown/block-parser.js';
import {serializeToString} from './markdown/block-serializer.js';
import {MarkdownNode} from './markdown/node.js';
import {MarkdownTree} from './markdown/view-model.js';
import {Observe} from './observe.js';

export interface Document {
  refresh(): Promise<void>;
  save(): Promise<void>;
  readonly tree: MarkdownTree;
  readonly dirty: boolean;
  readonly observe: Observe<Document>;
}

export interface Library {
  getDocument(name: string): Promise<Document>;
}

export class FileSystemLibrary implements Library {
  constructor(private readonly directory: FileSystemDirectoryHandle) {}
  async getDocument(name: string): Promise<Document> {
    const load = async () => {
      const fileName = name;
      let text = '';
      try {
        const handle = await this.directory.getFileHandle(fileName);
        const file = await handle.getFile();
        const decoder = new TextDecoder();
        text = decoder.decode(await file.arrayBuffer());
      } catch (e) {
        console.error(e);
      }
      return parseBlocks(text)!;
    };
    const directory = this.directory;
    const node = await load();
    const result = new class implements Document {
      constructor(public tree = new MarkdownTree(node)) {
        this.tree.observe.add(() => this.markDirty());
      }
      dirty = false;
      observe: Observe<Document> = new Observe<Document>(this);
      async refresh() {
        this.tree.root = this.tree.import<MarkdownNode>(await load());
        this.tree.observe.notify();
      }
      async save() {
        const text = serializeToString(this.tree.root);
        const fileName = name;
        const handle = await directory.getFileHandle(fileName, {create: true});
        const stream = await handle.createWritable();
        await stream.write(text);
        await stream.close();
      }
      private pendingModifications = 0;
      async markDirty() {
        // TODO: The tree could be in an inconsistent state, don't trigger the
        // the observer until the edit is finished, or wait for normalization.
        await 0;
        this.dirty = true;
        this.observe.notify();
        if (this.pendingModifications++) return;
        while (true) {
          let preSave = this.pendingModifications;
          // Save immediately on the fist iteration, may help keep tests fast.
          await this.save();
          if (this.pendingModifications === preSave) {
            this.pendingModifications = 0;
            this.dirty = false;
            this.observe.notify();
            return;
          }
          // Wait for an idle period with no modifications.
          let preIdle = NaN;
          do {
            preIdle = this.pendingModifications;
            // TODO: maybe a timeout is better?
            await new Promise(resolve => requestIdleCallback(resolve));
          } while (preIdle != this.pendingModifications);
        }
      }
    };
    return result;
  }
}
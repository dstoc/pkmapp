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
import { parseBlocks } from './markdown/block-parser.js';
import { serializeToString } from './markdown/block-serializer.js';
import { MarkdownTree } from './markdown/view-model.js';
import { Observe } from './observe.js';
async function* allFiles(prefix, directory) {
    for await (const entry of directory.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            yield prefix + entry.name.replace(/\.md$/i, '');
        }
        else if (entry.kind === 'directory') {
            yield* allFiles(prefix + entry.name + '/', entry);
        }
    }
}
async function getFileHandleFromPath(directory, path, create = false) {
    const parts = path.split('/');
    const name = parts.pop();
    for (const part of parts) {
        directory = await directory.getDirectoryHandle(part, { create });
    }
    return directory.getFileHandle(name, { create });
}
export class FileSystemLibrary {
    constructor(directory) {
        this.directory = directory;
        this.cache = new Map();
    }
    async getAllNames() {
        const result = [];
        for await (const name of allFiles('', this.directory)) {
            result.push(name);
        }
        return result;
    }
    async getDocument(name, forceRefresh = false) {
        const load = async () => {
            const fileName = name;
            let text = '';
            try {
                const handle = await getFileHandleFromPath(this.directory, fileName);
                const file = await handle.getFile();
                const decoder = new TextDecoder();
                text = decoder.decode(await file.arrayBuffer());
            }
            catch (e) {
                console.error(e);
            }
            return parseBlocks(text);
        };
        const directory = this.directory;
        const node = await load();
        const cached = this.cache.get(name);
        if (cached) {
            if (forceRefresh) {
                await cached.refresh();
            }
            return cached;
        }
        const result = new class {
            constructor(tree = new MarkdownTree(node)) {
                this.tree = tree;
                this.dirty = false;
                this.observe = new Observe(this);
                this.pendingModifications = 0;
                this.tree.observe.add(() => this.markDirty());
            }
            async refresh() {
                // this.tree.root.viewModel.remove();
                this.tree.root = this.tree.add(await load());
                this.tree.observe.notify();
            }
            async save() {
                const text = serializeToString(this.tree.root);
                const fileName = name;
                const handle = await getFileHandleFromPath(directory, fileName, true);
                const stream = await handle.createWritable();
                await stream.write(text);
                await stream.close();
            }
            async markDirty() {
                // TODO: The tree could be in an inconsistent state, don't trigger the
                // the observer until the edit is finished, or wait for normalization.
                await 0;
                this.dirty = true;
                this.observe.notify();
                if (this.pendingModifications++)
                    return;
                while (true) {
                    const preSave = this.pendingModifications;
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
                        await new Promise((resolve) => requestIdleCallback(resolve));
                    } while (preIdle != this.pendingModifications);
                }
            }
        };
        this.cache.set(name, result);
        return result;
    }
}
//# sourceMappingURL=library.js.map
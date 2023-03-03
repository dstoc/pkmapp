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
import { BackLinks } from './backlinks.js';
import { Metadata } from './metadata.js';
import { assert, cast } from './asserts.js';
import { resolveDateAlias } from './date-aliases.js';
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
        this.backLinks = new BackLinks();
        this.metadata = new Metadata();
    }
    async getAllNames() {
        const result = new Set();
        for (const document of this.cache.values()) {
            for (const name of document.allNames) {
                result.add(name);
            }
        }
        for (const name of this.metadata.getAllNames()) {
            result.add(name);
        }
        return [...result];
    }
    getDocumentByTree(tree) {
        // TODO: index
        for (const document of this.cache.values()) {
            if (document.tree === tree) {
                return document;
            }
        }
        return undefined;
    }
    async sync() {
        for await (const name of allFiles('', this.directory)) {
            const document = await this.loadDocument(name);
            await document.refresh();
        }
    }
    async find(name) {
        name = resolveDateAlias(name) ?? name;
        const root = this.metadata.findByName(name);
        if (root) {
            const document = cast(this.getDocumentByTree(root.viewModel.tree));
            return {
                document,
                root,
            };
        }
        else {
            const document = await this.loadDocument(name, true);
            return {
                document,
                root: document.tree.root,
            };
        }
    }
    async loadDocument(name, forceRefresh = false) {
        name = resolveDateAlias(name) ?? name;
        const fileName = name + '.md';
        const load = async (ifModifiedSince) => {
            let text = '';
            let lastModified = new Date().getTime();
            try {
                const handle = await getFileHandleFromPath(this.directory, fileName);
                const file = await handle.getFile();
                // TODO: also check that the content has actually changed
                if (ifModifiedSince >= file.lastModified)
                    return { lastModified: file.lastModified };
                const decoder = new TextDecoder();
                text = decoder.decode(await file.arrayBuffer());
                lastModified = file.lastModified;
            }
            catch (e) {
                console.error(e);
            }
            const root = parseBlocks(text);
            assert(root && root.type === 'document');
            return { root, lastModified };
        };
        const aliased = this.metadata.findByName(name);
        if (aliased) {
            const document = this.getDocumentByTree(aliased.viewModel.tree);
            return cast(document);
        }
        const cached = this.cache.get(name);
        if (cached) {
            if (forceRefresh) {
                await cached.refresh();
            }
            return cached;
        }
        const { root, lastModified } = await load(0);
        const library = this;
        const result = new class {
            constructor() {
                this.dirty = false;
                this.observe = new Observe(this);
                this.pendingModifications = 0;
                this.lastModified = lastModified;
                this.tree = new MarkdownTree(cast(root), this);
                this.tree.observe.add(() => this.markDirty());
            }
            get name() {
                return this.allNames[0];
            }
            get allNames() {
                return [
                    ...library.metadata.getNames(this.tree.root),
                    name,
                ];
            }
            postEditUpdate(node, change) {
                if (node.type === 'paragraph') {
                    library.backLinks.postEditUpdate(node, change);
                }
                if (node.type === 'code-block') {
                    library.metadata.updateCodeblock(node, change);
                }
                if (node.type === 'section') {
                    library.metadata.updateSection(node, change);
                }
            }
            async refresh() {
                const { root, lastModified } = await load(this.lastModified);
                if (root) {
                    this.lastModified = lastModified;
                    this.tree.setRoot(this.tree.add(root));
                    this.tree.observe.notify();
                }
            }
            async save() {
                const text = serializeToString(this.tree.root);
                const handle = await getFileHandleFromPath(library.directory, fileName, true);
                const stream = await handle.createWritable();
                await stream.write(text);
                await stream.close();
                this.lastModified = new Date().getTime();
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
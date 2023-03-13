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
import { getLogicalContainingBlock } from './block-util.js';
function normalizeName(name) {
    return name.toLowerCase();
}
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
async function createNewFile(directory, name, content) {
    let n = 0;
    while (true) {
        const resultName = `${name}${n > 0 ? '-' + String(n) : ''}`;
        const filename = `${resultName}.md`;
        try {
            await directory.getFileHandle(filename);
            n++;
            continue;
        }
        catch (e) {
            if (e.name !== 'NotFoundError') {
                throw e;
            }
        }
        const file = await directory.getFileHandle(filename, { create: true });
        const writable = await file.createWritable();
        await writable.write(content);
        await writable.close();
        return resultName;
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
async function deleteFile(directory, path, create = false) {
    const parts = path.split('/');
    const name = parts.pop();
    for (const part of parts) {
        directory = await directory.getDirectoryHandle(part, { create });
    }
    return directory.removeEntry(name);
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
        for (const name of this.metadata.getAllNames()) {
            result.add(normalizeName(name));
        }
        for (const document of this.cache.values()) {
            if (normalizeName(document.name) === normalizeName(document.filename)) {
                result.add(normalizeName(document.filename));
            }
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
            assert(document);
            await document.refresh();
        }
    }
    findByName(name) {
        name = normalizeName(name);
        const result = new Set(this.metadata.findByName(name));
        if (this.cache.has(name)) {
            const document = cast(this.cache.get(name));
            if (document.name === document.filename) {
                result.add(document.tree.root);
            }
        }
        return [...result];
    }
    async findAll(name) {
        name = resolveDateAlias(name) ?? name;
        const parts = name.split('/');
        const blocks = [];
        for (let i = 0; i < parts.length; i++) {
            blocks[i] = this.findByName(parts[i]).map(root => {
                return {
                    document: cast(this.getDocumentByTree(root.viewModel.tree)),
                    root,
                };
            });
            if (i > 0) {
                blocks[i] = blocks[i].filter(item => {
                    let next;
                    do {
                        next = getLogicalContainingBlock(next ?? item.root);
                        if (next) {
                            const prev = blocks[i - 1].find(({ root }) => root === next);
                            if (prev)
                                return true;
                        }
                    } while (next);
                    return false;
                });
            }
        }
        return blocks[blocks.length - 1];
    }
    async newDocument(name) {
        const content = `# ${name}`;
        const filename = await createNewFile(this.directory, name.toLowerCase(), content);
        return cast(await this.loadDocument(filename));
    }
    async load(name, ifModifiedSince) {
        let text = '';
        let lastModified = new Date().getTime();
        try {
            const filename = name + '.md';
            const handle = await getFileHandleFromPath(this.directory, filename);
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
            return undefined;
        }
        const root = parseBlocks(text);
        assert(root && root.type === 'document');
        return { root, lastModified };
    }
    async loadDocument(name) {
        name = resolveDateAlias(name) ?? name;
        const cached = this.cache.get(normalizeName(name));
        if (cached) {
            return cached;
        }
        const { root, lastModified } = await this.load(name, 0) ?? {};
        if (!root || lastModified == null)
            return;
        const library = this;
        const result = new FileSystemDocument(library, lastModified, root, name);
        this.cache.set(normalizeName(name), result);
        return result;
    }
}
class FileSystemDocument {
    constructor(library, lastModified, root, filename) {
        this.library = library;
        this.lastModified = lastModified;
        this.filename = filename;
        this.state = 'active';
        this.dirty = false;
        this.observe = new Observe(this);
        this.pendingModifications = 0;
        this.tree = new MarkdownTree(cast(root), this);
        this.tree.observe.add(() => this.markDirty());
    }
    get name() {
        return this.library.metadata.getPreferredName(this.tree.root) ?? this.filename;
    }
    get allNames() {
        const names = [
            ...this.library.metadata.getNames(this.tree.root),
        ];
        return names.length ? names : [this.filename];
    }
    postEditUpdate(node, change) {
        if (node.type === 'paragraph') {
            this.library.backLinks.postEditUpdate(node, change);
        }
        if (node.type === 'code-block') {
            this.library.metadata.updateCodeblock(node, change);
        }
        if (node.type === 'section') {
            this.library.metadata.updateSection(node, change);
        }
    }
    async refresh() {
        const { root, lastModified } = cast(await this.library.load(this.filename, this.lastModified));
        if (root) {
            this.lastModified = lastModified;
            this.tree.setRoot(this.tree.add(root));
            this.tree.observe.notify();
        }
    }
    async save() {
        if (this.state !== 'active')
            return;
        const text = serializeToString(this.tree.root);
        const handle = await getFileHandleFromPath(this.library.directory, this.filename + '.md', true);
        const stream = await handle.createWritable();
        await stream.write(text);
        await stream.close();
        this.lastModified = new Date().getTime();
    }
    async delete() {
        this.state = 'deleted';
        this.tree.setRoot(this.tree.add({
            type: 'document'
        }));
        this.library.cache.delete(normalizeName(this.filename));
        await deleteFile(this.library.directory, this.filename + '.md');
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
}
//# sourceMappingURL=library.js.map
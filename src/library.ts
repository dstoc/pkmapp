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
import {DocumentNode} from './markdown/node.js';
import {InlineViewModelNode, MarkdownTree, ViewModelNode} from './markdown/view-model.js';
import {Observe} from './observe.js';
import {BackLinks} from './backlinks.js';
import {Metadata} from './metadata.js';
import {assert, cast} from './asserts.js';
import {resolveDateAlias} from './date-aliases.js';
import {getLogicalContainingBlock} from './block-util.js';

export interface Document {
  refresh(): Promise<void>;
  save(): Promise<void>;
  delete(): Promise<void>;
  readonly name: string;
  readonly filename: string;
  readonly allNames: string[];
  readonly tree: MarkdownTree;
  readonly dirty: boolean;
  readonly observe: Observe<Document>;
}

export interface Library {
  findAll(name: string): Promise<{document: Document, root: ViewModelNode}[]>;
  newDocument(name: string): Promise<Document>;
  getDocumentByTree(tree: MarkdownTree): Document|undefined;
  getAllNames(): Promise<string[]>;
  readonly backLinks: BackLinks;
  readonly metadata: Metadata;
  sync(): Promise<void>;
}

function normalizeName(name: string) {
  return name.toLowerCase();
}

async function*
    allFiles(prefix: string, directory: FileSystemDirectoryHandle):
        AsyncGenerator<string, void, unknown> {
  for await (const entry of directory.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      yield prefix + entry.name.replace(/\.md$/i, '');
    } else if (entry.kind === 'directory') {
      yield* allFiles(prefix + entry.name + '/', entry);
    }
  }
}

async function createNewFile(directory: FileSystemDirectoryHandle, name: string, content: string) {
  let n = 0;
  while (true) {
    const resultName = `${name}${n > 0 ? '-' + String(n) : ''}`;
    const filename = `${resultName}.md`
    try {
      await directory.getFileHandle(filename);
      n++;
      continue;
    } catch (e) {
      if ((e as DOMException).name !== 'NotFoundError') {
        throw e;
      }
    }
    const file = await directory.getFileHandle(filename, {create: true});
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return resultName;
  }
}

async function getFileHandleFromPath(
    directory: FileSystemDirectoryHandle, path: string, create = false) {
  const parts = path.split('/');
  const name: string = parts.pop()!;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, {create});
  }
  return directory.getFileHandle(name, {create});
}

async function deleteFile(
    directory: FileSystemDirectoryHandle, path: string, create = false) {
  const parts = path.split('/');
  const name: string = parts.pop()!;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, {create});
  }
  return directory.removeEntry(name);
}

export class FileSystemLibrary implements Library {
  constructor(readonly directory: FileSystemDirectoryHandle) {}
  async getAllNames() {
    const result = new Set<string>();
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
  cache: Map<string, Document> = new Map();
  backLinks = new BackLinks();
  metadata = new Metadata();
  getDocumentByTree(tree: MarkdownTree): Document|undefined {
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
      if (!document) {
        console.error(`Could not load: ${name}`);
        continue;
      }
      assert(document);
      await document.refresh();
    }
  }
  private findByName(name: string) {
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
  async findAll(name: string) {
    name = resolveDateAlias(name) ?? name;

    type Result = {document: Document, root: ViewModelNode};
    const parts = name.split('/');
    const blocks: Result[][] = [];
    for (let i = 0; i < parts.length; i++) {
      blocks[i] = this.findByName(parts[i]).map(root => {
        return {
          document: cast(this.getDocumentByTree(root.viewModel.tree)),
          root,
        }
      });
      if (i > 0) {
        blocks[i] = blocks[i].filter(item => {
          let next: ViewModelNode|undefined;
          do {
            next = getLogicalContainingBlock(next ?? item.root);
            if (next) {
              const prev = blocks[i - 1].find(({root}) => root === next);
              if (prev) return true;
            }
          } while (next);
          return false;
        });
      }
    }
    return blocks[blocks.length - 1];
  }
  async newDocument(name: string): Promise<Document> {
    const content = `# ${name}`;
    const filename = await createNewFile(this.directory, name.toLowerCase(), content);
    return cast(await this.loadDocument(filename));
  }
  async load(name: string, ifModifiedSince: number) {
    let text = '';
    let lastModified = new Date().getTime();
    try {
      const filename = name + '.md';
      const handle = await getFileHandleFromPath(this.directory, filename);
      const file = await handle.getFile();
      // TODO: also check that the content has actually changed
      if (ifModifiedSince >= file.lastModified) return {lastModified: file.lastModified};
      const decoder = new TextDecoder();
      text = decoder.decode(await file.arrayBuffer());
      lastModified = file.lastModified;
    } catch (e) {
      console.error(e);
      return undefined;
    }
    const root = parseBlocks(text);
    assert(root && root.type === 'document');
    return {root, lastModified};
  }
  private async loadDocument(name: string): Promise<Document|undefined> {
    name = resolveDateAlias(name) ?? name;
    const cached = this.cache.get(normalizeName(name));
    if (cached) {
      return cached;
    }
    const {root, lastModified} = await this.load(name, 0) ?? {};
    if (!root || lastModified == null) return;
    const library = this;
    const result = new FileSystemDocument(library, lastModified, root, name);
    this.cache.set(normalizeName(name), result);
    return result;
  }
}

class FileSystemDocument implements Document {
  constructor(
      private library: FileSystemLibrary,
      private lastModified: number,
      root: DocumentNode,
      readonly filename: string) {
    this.tree = new MarkdownTree(cast(root), this);
    this.tree.observe.add(() => this.markDirty());
  }
  state: 'active'|'deleted' = 'active';
  readonly tree: MarkdownTree;
  dirty = false;
  observe: Observe<Document> = new Observe<Document>(this);
  get name() {
    return this.library.metadata.getPreferredName(this.tree.root) ?? this.filename;
  }
  get allNames() {
    const names = [
      ...this.library.metadata.getNames(this.tree.root),
    ];
    return names.length ? names : [this.filename];
  }
  postEditUpdate(node: ViewModelNode, change: 'connected'|'disconnected'|'changed') {
    if (node.type === 'paragraph') {
      this.library.backLinks.postEditUpdate(node as InlineViewModelNode, change);
    }
    if (node.type === 'code-block') {
      this.library.metadata.updateCodeblock(node, change);
    }
    if (node.type === 'section') {
      this.library.metadata.updateSection(node, change);
    }
  }
  async refresh() {
    const {root, lastModified} = cast(await this.library.load(this.filename, this.lastModified));
    if (root) {
      this.lastModified = lastModified;
      this.tree.setRoot(this.tree.add<DocumentNode>(root));
      this.tree.observe.notify();
    }
  }
  async save() {
    if (this.state !== 'active') return;
    const text = serializeToString(this.tree.root);
    const handle = await getFileHandleFromPath(this.library.directory, this.filename + '.md', true);
    const stream = await handle.createWritable();
    await stream.write(text);
    await stream.close();
    this.lastModified = new Date().getTime();
  }
  async delete() {
    this.state = 'deleted';
    this.tree.setRoot(this.tree.add<DocumentNode>({
      type: 'document'
    }));
    this.library.cache.delete(normalizeName(this.filename));
    await deleteFile(this.library.directory, this.filename + '.md');
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

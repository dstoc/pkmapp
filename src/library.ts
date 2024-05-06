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

import {DocumentNode} from './markdown/node.js';
import {MarkdownTree} from './markdown/view-model.js';
import {
  ViewModelNode,
  InlineViewModelNode,
} from './markdown/view-model-node.js';
import {Observe} from './observe.js';
import {BackLinks} from './backlinks.js';
import {Metadata} from './metadata.js';
import {assert, cast} from './asserts.js';
import {resolveDateAlias} from './date-aliases.js';
import {getLogicalContainingBlock} from './block-util.js';

export interface Document {
  replace(root: DocumentNode): Promise<void>;
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
  findAll(name: string): Promise<{document: Document; root: ViewModelNode}[]>;
  newDocument(name: string): Promise<Document>;
  getDocumentByTree(tree: MarkdownTree): Document | undefined;
  getAllNames(): Promise<string[]>;
  readonly backLinks: BackLinks;
  readonly metadata: Metadata;
  restore(): Promise<void>;
  import(root: DocumentNode, key: string): Promise<Document>;
}

function normalizeName(name: string) {
  return name.toLowerCase();
}

function wrap<T>(request: IDBRequest<T>) {
  return new Promise<IDBRequest<T>>(
    (resolve, reject) => (
      (request.onsuccess = () => resolve(request)), (request.onerror = reject)
    ),
  );
}

interface StoredDocument {
  root: DocumentNode;
}

export class IdbLibrary implements Library {
  constructor(readonly database: IDBDatabase) {}
  static async init(dbName: string) {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('documents');
    };
    const {result: database} = await wrap(request);
    return new IdbLibrary(database);
  }
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
  getDocumentByTree(tree: MarkdownTree): Document | undefined {
    // TODO: index
    for (const document of this.cache.values()) {
      if (document.tree === tree) {
        return document;
      }
    }
    return undefined;
  }
  async restore() {
    const {result: keys} = await wrap(
      this.database
        .transaction('documents')
        .objectStore('documents')
        .getAllKeys(),
    );
    for (const key of keys) {
      assert(typeof key === 'string');
      assert(await this.loadDocument(key));
    }
  }
  private findByName(name: string) {
    name = normalizeName(name);
    const result = new Set(this.metadata.findByName(name));
    if (this.cache.has(name)) {
      const document = cast(this.cache.get(name));
      if (
        document.name === document.filename ||
        document.filename === 'index'
      ) {
        result.add(document.tree.root);
      }
    }
    return [...result];
  }
  async findAll(name: string) {
    name = resolveDateAlias(name) ?? name;

    type Result = {document: Document; root: ViewModelNode};
    const parts = name.split('/');
    const blocks: Result[][] = [];
    for (let i = 0; i < parts.length; i++) {
      blocks[i] = this.findByName(parts[i]).map((root) => {
        return {
          document: cast(this.getDocumentByTree(root.viewModel.tree)),
          root,
        };
      });
      if (i > 0) {
        blocks[i] = blocks[i].filter((item) => {
          let next: ViewModelNode | undefined;
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
    name = resolveDateAlias(name) ?? name;
    const content: StoredDocument = {
      root: {
        type: 'document',
        children: [{type: 'section', marker: '#', content: name}],
      },
    };
    name = normalizeName(name);
    let n = 0;
    while (true) {
      const key = `${name}${n > 0 ? '-' + String(n) : ''}`;
      try {
        await wrap(
          this.database
            .transaction('documents', 'readwrite')
            .objectStore('documents')
            .add(content, key),
        );
      } catch (e) {
        // TODO: verify that e is correct
        n++;
        continue;
      }
      return cast(await this.loadDocument(key));
    }
  }
  async load(key: string) {
    let content: StoredDocument;
    try {
      ({result: content} = await wrap(
        this.database
          .transaction('documents', 'readwrite')
          .objectStore('documents')
          .get(key),
      ));
    } catch (e) {
      console.error(e);
      return undefined;
    }
    const {root} = content;
    assert(root && root.type === 'document');
    return {root};
  }
  private async loadDocument(name: string): Promise<Document | undefined> {
    const cached = this.cache.get(normalizeName(name));
    if (cached) {
      return cached;
    }
    const {root} = (await this.load(name)) ?? {};
    if (!root) return;
    const result = new IdbDocument(this, root, name);
    this.cache.set(normalizeName(name), result);
    return result;
  }
  async import(root: DocumentNode, key: string) {
    const doc = await this.newDocument(key);
    doc.replace(root);
    return doc;
  }
}

class IdbDocument implements Document {
  constructor(
    private library: IdbLibrary,
    root: DocumentNode,
    readonly filename: string,
  ) {
    this.tree = new MarkdownTree(cast(root), this);
    this.tree.observe.add(() => this.markDirty());
  }
  state: 'active' | 'deleted' = 'active';
  readonly tree: MarkdownTree;
  dirty = false;
  observe: Observe<Document> = new Observe<Document>(this);
  get name() {
    return (
      this.library.metadata.getPreferredName(this.tree.root) ?? this.filename
    );
  }
  get allNames() {
    const names = [...this.library.metadata.getNames(this.tree.root)];
    return names.length ? names : [this.filename];
  }
  postEditUpdate(
    node: ViewModelNode,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    if (node.type === 'paragraph') {
      this.library.backLinks.postEditUpdate(
        node as InlineViewModelNode,
        change,
      );
    }
    if (node.type === 'code-block') {
      this.library.metadata.updateCodeblock(node, change);
    }
    if (node.type === 'section') {
      this.library.metadata.updateSection(node, change);
    }
    if (node.type === 'paragraph') {
      this.library.metadata.updateInlineNode(
        node as InlineViewModelNode,
        change,
      );
    }
  }
  async replace(root: DocumentNode) {
    this.tree.setRoot(this.tree.add<DocumentNode>(root));
    this.tree.observe.notify();
  }
  async save() {
    if (this.state !== 'active') return;
    const root = this.tree.serialize();
    assert(root.type === 'document');
    const content: StoredDocument = {
      root,
    };
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .put(content, this.filename),
    );
  }
  async delete() {
    this.state = 'deleted';
    this.tree.setRoot(
      this.tree.add<DocumentNode>({
        type: 'document',
      }),
    );
    this.library.cache.delete(normalizeName(this.filename));
    // TODO: tombstone
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .delete(this.filename),
    );
  }
  private pendingModifications = 0;
  async markDirty() {
    // TODO: The tree could be in an inconsistent state, don't trigger the
    // the observer until the edit is finished, or wait for normalization.
    await Promise.resolve();
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

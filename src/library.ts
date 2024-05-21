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
import {noAwait} from './async.js';
import {Backup} from './backup.js';
import {wrap} from './indexeddb.js';
import {ConfigStore} from './config-store.js';

export interface DocumentMetadata {
  creationTime: number;
  modificationTime: number;
  state: 'active' | 'deleted';
  filename: string;
  component: Record<string, ComponentMetadata | undefined>;
}

export interface ComponentMetadata {
  key: string;
}

export interface Document {
  replace(root: DocumentNode): Promise<void>;
  save(): Promise<void>;
  delete(): Promise<void>;
  readonly name: string;
  readonly allNames: string[];
  readonly tree: MarkdownTree;
  readonly metadata: Readonly<DocumentMetadata>;
  readonly dirty: boolean;
  readonly observe: Observe<Document>;
  updateMetadata(updater: (metadata: DocumentMetadata) => boolean): void;
}

export interface Library {
  // TODO: Does this need to be async? Make iterable?
  findAll(name: string): Promise<{document: Document; root: ViewModelNode}[]>;
  newDocument(name: string): Promise<Document>;
  getDocumentByTree(tree: MarkdownTree): Document | undefined;
  // TODO: Does this need to be async? Make iterable?
  getAllNames(): Promise<string[]>;
  getAllDocuments(): IterableIterator<Document>;
  readonly backLinks: BackLinks;
  readonly metadata: Metadata;
  readonly backup: Backup;
  restore(): Promise<void>;
  import(root: DocumentNode, key: string): Promise<Document>;
  readonly observeDocuments: Observe<Library, Document>;
  readonly ready: Promise<void>;
}

function normalizeName(name: string) {
  return name.toLowerCase();
}

interface StoredDocument {
  root: DocumentNode;
  metadata: DocumentMetadata;
}

export class IdbLibrary implements Library {
  constructor(
    readonly database: IDBDatabase,
    private store: ConfigStore,
  ) {
    this.ready = new Promise((resolve) => {
      noAwait(this.restore().then(resolve));
    });
  }
  cache = new Map<string, Document>();
  backLinks = new BackLinks();
  metadata = new Metadata();
  observeDocuments: Observe<Library, Document> = new Observe<Library, Document>(
    this,
  );
  backup: Backup = new Backup(this, this.store);
  ready: Promise<void>;
  static async init(dbName: string) {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('documents');
    };
    const {result: database} = await wrap(request);
    const store = await ConfigStore.init('default');
    const library = new IdbLibrary(database, store);
    // TODO: Don't await this. Other components should wait for restore if
    // necessary.
    await library.ready;
    return library;
  }
  getAllDocuments() {
    return this.cache.values();
  }
  async getAllNames() {
    const result = new Set<string>();
    for (const name of this.metadata.getAllNames()) {
      result.add(normalizeName(name));
    }
    for (const document of this.cache.values()) {
      // TODO: check that the document doesn't have an explicit name?
      if (
        normalizeName(document.name) ===
        normalizeName(document.metadata.filename)
      ) {
        result.add(normalizeName(document.metadata.filename));
      }
    }
    return [...result];
  }
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
        document.name === document.metadata.filename ||
        document.metadata.filename === 'index'
      ) {
        result.add(document.tree.root);
      }
    }
    return [...result];
  }
  async findAll(name: string) {
    name = resolveDateAlias(name) ?? name;

    interface Result {
      document: Document;
      root: ViewModelNode;
    }
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
    const now = Date.now();
    const content: StoredDocument = {
      root: {
        type: 'document',
        children: [{type: 'section', marker: '#', content: name}],
      },
      metadata: {
        state: 'active',
        creationTime: now,
        modificationTime: now,
        filename: name,
        component: {},
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
  async load(key: string): Promise<StoredDocument | undefined> {
    let content: StoredDocument;
    try {
      const result = await wrap(
        this.database
          .transaction('documents', 'readwrite')
          .objectStore('documents')
          .get(key),
      );
      content = cast(result.result) as StoredDocument;
    } catch (e) {
      console.error(e);
      return undefined;
    }
    const {root, metadata} = content;
    assert(root && root.type === 'document');
    assert(metadata);
    return {root, metadata};
  }
  private async loadDocument(name: string): Promise<Document | undefined> {
    const cached = this.cache.get(normalizeName(name));
    if (cached) {
      return cached;
    }
    const stored = await this.load(name);
    if (!stored) return;
    const result = new IdbDocument(this, stored.root, stored.metadata);
    this.cache.set(normalizeName(name), result);
    return result;
  }
  async import(root: DocumentNode, key: string) {
    const doc = await this.newDocument(key);
    await doc.replace(root);
    return doc;
  }
}

class IdbDocument implements Document {
  constructor(
    private library: IdbLibrary,
    root: DocumentNode,
    readonly metadata: Readonly<DocumentMetadata>,
  ) {
    this.tree = new MarkdownTree(cast(root), this);
    this.tree.observe.add(() => this.treeChanged());
  }
  readonly tree: MarkdownTree;
  dirty = false;
  observe: Observe<Document> = new Observe<Document>(this);
  updateMetadata(
    updater: (metadata: DocumentMetadata) => boolean,
    markDirty = true,
  ) {
    if (!updater(this.metadata)) return;
    if (markDirty) this.metadataChanged();
  }
  get name() {
    return (
      this.library.metadata.getPreferredName(this.tree.root) ??
      this.metadata.filename
    );
  }
  get allNames() {
    const names = [...this.library.metadata.getNames(this.tree.root)];
    return names.length ? names : [this.metadata.filename];
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
    if (this.metadata.state !== 'active') return;
    const root = this.tree.serialize();
    assert(root.type === 'document');
    const content: StoredDocument = {
      root,
      metadata: this.metadata,
    };
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .put(content, this.metadata.filename),
    );
  }
  async delete() {
    this.updateMetadata((metadata) => {
      metadata.state = 'deleted';
      return true;
    }, false);
    this.tree.setRoot(
      this.tree.add<DocumentNode>({
        type: 'document',
      }),
    );
    this.library.cache.delete(normalizeName(this.metadata.filename));
    // TODO: tombstone
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .delete(this.metadata.filename),
    );
  }
  private metadataChanged() {
    noAwait(this.markDirty());
  }
  private treeChanged() {
    this.updateMetadata((metadata) => {
      metadata.modificationTime = Date.now();
      return true;
    }, false);
    noAwait(this.markDirty());
    this.library.observeDocuments.notify(this);
  }
  private pendingModifications = 0;
  private async markDirty() {
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

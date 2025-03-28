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

import {DocumentNode, MarkdownNode} from './markdown/node.js';
import {MarkdownTree, TreeChange} from './markdown/view-model.js';
import {Caches, ViewModelNode, viewModel} from './markdown/view-model-node.js';
import {Metadata} from './metadata.js';
import {assert, cast} from './asserts.js';
import {resolveDateAlias} from './date-aliases.js';
import {getLogicalContainingBlock} from './block-util.js';
import {noAwait} from './async.js';
import {wrap} from './indexeddb.js';
import {
  TypedCustomEvent,
  TypedEventTarget,
  TypedEventTargetConstructor,
} from './event-utils.js';
import {SCHEMA_VERSION, upgrade} from './library-schema.js';

export interface DocumentMetadata {
  clock?: number;
  creationTime: number;
  modificationTime: number;
  state: 'active' | 'deleted';
  key: string;
  component: Record<string, ComponentMetadata | undefined>;
}

export interface ComponentMetadata {
  key: string;
}

export interface Document {
  replace(
    root: DocumentNode | undefined,
    updater: (metadata: DocumentMetadata) => boolean,
  ): void;
  save(): Promise<void>;
  delete(): Promise<void>;
  readonly name: string;
  readonly allNames: string[];
  readonly tree: MarkdownTree;
  readonly metadata: Readonly<DocumentMetadata>;
  readonly storedMetadata: Readonly<DocumentMetadata>;
  updateMetadata(updater: (metadata: DocumentMetadata) => boolean): void;
}

interface LibraryEventMap {
  'post-edit-update': CustomEvent<{
    node: ViewModelNode;
    change: 'connected' | 'disconnected' | 'changed';
  }>;
  'document-change': CustomEvent<{
    document: Document;
    oldMetadata: DocumentMetadata;
  }>;
}

export interface Library extends TypedEventTarget<Library, LibraryEventMap> {
  // TODO: Does this need to be async? Make iterable?
  findAll(name: string): Promise<{document: Document; root: ViewModelNode}[]>;
  newDocument(name: string, root?: DocumentNode): Promise<Document>;
  getDocumentByTree(tree: MarkdownTree): Document | undefined;
  getDocumentByKey(key: string): Document | undefined;
  insertOrReplace<T>(
    key: string,
    updateDoc: (document?: Document) => {root?: DocumentNode; state: T},
    updateMetadata: (metadata: DocumentMetadata, state: T) => boolean,
  ): Promise<void>;
  // TODO: Does this need to be async? Make iterable?
  getAllNames(): Promise<string[]>;
  getAllDocuments(): IterableIterator<Document>;
  readonly metadata: Metadata;
  restore(): Promise<void>;
  readonly ready: Promise<void>;
  readonly clock: number;
  readonly flush: Promise<void>;
}

function normalizeName(name: string) {
  return name.toLowerCase();
}

interface StoredDocument {
  root: DocumentNode;
  caches?: Map<MarkdownNode, Caches>;
  metadata: DocumentMetadata;
}

export class IdbLibrary
  extends (EventTarget as TypedEventTargetConstructor<Library, LibraryEventMap>)
  implements Library
{
  constructor(readonly database: IDBDatabase) {
    super();
    this.metadata = new Metadata(this);
    this.ready = new Promise((resolve) => {
      noAwait(this.restore().then(resolve));
    });
  }
  metadata: Metadata;
  cache = new Map<string, Document>();
  ready: Promise<void>;
  #clock = 0;
  #pendingWrites = 0;
  #flush: {promise: Promise<void>; resolve?: () => void} = {
    promise: Promise.resolve(),
  };
  nextClock() {
    return ++this.#clock;
  }
  get clock() {
    return this.#clock;
  }
  static async init(prefix: string) {
    const request = indexedDB.open(prefix + 'library', SCHEMA_VERSION);
    request.onupgradeneeded = (e) => {
      const database = request.result;
      upgrade(database, cast(request.transaction), e.oldVersion);
    };
    const {result: database} = await wrap(request);
    const library = new IdbLibrary(database);
    return library;
  }
  getAllDocuments() {
    return this.cache.values();
  }
  writePending() {
    this.#pendingWrites++;
  }
  writeComplete() {
    this.#pendingWrites--;
    if (this.#pendingWrites === 0) {
      this.#flush.resolve?.();
      this.#flush.resolve = undefined;
    }
  }
  get flush(): Promise<void> {
    if (this.#pendingWrites && !this.#flush.resolve) {
      this.#flush = Promise.withResolvers<void>();
    }
    return this.#flush.promise;
  }
  async getAllNames() {
    const result = new Set<string>();
    for (const name of this.metadata.getAllNames()) {
      result.add(normalizeName(name));
    }
    for (const document of this.cache.values()) {
      // TODO: check that the document doesn't have an explicit name?
      if (document.metadata.state !== 'active') continue;
      if (normalizeName(document.name) === document.metadata.key) {
        result.add(document.metadata.key);
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
  getDocumentByKey(key: string): Document | undefined {
    // TODO: assert ready
    return this.cache.get(key);
  }
  private async insert(
    key: string,
    root: DocumentNode,
    metadata: DocumentMetadata,
  ) {
    assert(metadata.key === key);
    const content: StoredDocument = {
      root,
      metadata,
    };

    await wrap(
      this.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .add(content, key),
    );
    return cast(await this.loadDocument(key));
  }
  async insertOrReplace<T>(
    key: string,
    updateDoc: (document?: Document) => {root?: DocumentNode; state: T},
    updateMetadata: (metadata: DocumentMetadata, state: T) => boolean,
  ) {
    const doc = this.cache.get(key);
    const {root: newRoot, state} = updateDoc(doc);
    if (doc) {
      doc.replace(newRoot, (metadata) => updateMetadata(metadata, state));
    } else {
      assert(newRoot);
      const now = Date.now();
      const metadata: DocumentMetadata = {
        state: 'active',
        creationTime: now,
        modificationTime: now,
        key,
        component: {},
      };
      updateMetadata(metadata, state);
      // TODO: Is there a race where this can fail? If it fails, we could abort and restart insertOrReplace...
      assert(await this.insert(key, newRoot, metadata));
    }
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
        document.name === document.metadata.key ||
        document.metadata.key === 'index'
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
          document: cast(this.getDocumentByTree(root[viewModel].tree)),
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
    return cast(blocks.at(-1));
  }
  async newDocument(name: string, root?: DocumentNode): Promise<Document> {
    name = resolveDateAlias(name) ?? name;
    const now = Date.now();
    root ??= {
      type: 'document',
      children: [{type: 'section', marker: '#', content: name}],
    };
    name = normalizeName(name);
    const metadata: DocumentMetadata = {
      state: 'active',
      creationTime: now,
      modificationTime: now,
      clock: this.nextClock(),
      key: crypto.randomUUID(),
      component: {},
    };
    return await this.insert(metadata.key, root, metadata);
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
      // TODO: verify the error is as expected
      console.error(e);
      return undefined;
    }
    const {root, caches, metadata} = content;
    assert(root && root.type === 'document');
    assert(metadata);
    return {root, caches, metadata};
  }
  private async loadDocument(name: string): Promise<Document | undefined> {
    const cached = this.cache.get(normalizeName(name));
    if (cached) {
      return cached;
    }
    const stored = await this.load(name);
    if (!stored) return;
    if (
      stored.metadata.clock !== undefined &&
      stored.metadata.clock > this.clock
    ) {
      this.#clock = stored.metadata.clock;
    }
    const result = new IdbDocument(this, stored);
    this.cache.set(normalizeName(name), result);
    return result;
  }

  postEditUpdate(
    node: ViewModelNode,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    this.dispatchEvent(
      new TypedCustomEvent('post-edit-update', {detail: {node, change}}),
    );
  }

  #writeQueue: (() => Promise<void>)[] = [];
  #writing = false;
  async enqueueWrite(write: () => Promise<void>) {
    this.#writeQueue.push(write);
    if (this.#writing) return;
    this.#writing = true;
    while (true) {
      const write = cast(this.#writeQueue.shift());
      await write();
      if (!this.#writeQueue.length) {
        this.#writing = false;
        return;
      }
      let preIdle = NaN;
      do {
        preIdle = this.#writeQueue.length;
        await new Promise((resolve) => requestIdleCallback(resolve));
      } while (preIdle != this.#writeQueue.length);
    }
  }
}

class IdbDocument implements Document {
  constructor(
    private library: IdbLibrary,
    state: StoredDocument,
  ) {
    this.#metadata = state.metadata;
    this.#storedMetadata = state.metadata;
    const root = this.metadata.state === 'deleted' ? undefined : state.root;
    this.tree = new MarkdownTree(root, state.caches, library);
    this.tree.addEventListener('tree-change', (e) => {
      this.treeChanged(e.detail);
    });
  }
  #storedMetadata: Readonly<DocumentMetadata>;
  #metadata: Readonly<DocumentMetadata>;
  get storedMetadata() {
    return this.#storedMetadata;
  }
  get metadata() {
    return this.#metadata;
  }
  readonly tree: MarkdownTree;
  updateMetadata(
    updater: (metadata: DocumentMetadata) => boolean,
    scheduleSave = true,
  ) {
    const newMetadata = structuredClone(this.metadata);
    if (!updater(newMetadata)) return;
    this.#metadata = newMetadata;
    if (scheduleSave) this.metadataChanged();
  }
  get name() {
    return (
      this.library.metadata.getPreferredName(this.tree.root) ??
      this.metadata.key
    );
  }
  get allNames() {
    const names = [...this.library.metadata.getNames(this.tree.root)];
    return names.length ? names : [this.metadata.key];
  }
  replace(
    root: DocumentNode | undefined,
    updater: (metadata: DocumentMetadata) => boolean,
  ) {
    this.updateMetadata(updater, false);
    if (this.metadata.state === 'deleted') {
      this.tree.disconnect();
    } else if (root) {
      this.tree.connect();
      this.tree.setRoot(this.tree.add<DocumentNode>(root), false);
    }
    noAwait(this.scheduleSave());
  }
  async save() {
    const {root, caches} = this.tree.serializeWithCaches();
    assert(root.type === 'document');
    const metadata = this.#metadata;
    const content: StoredDocument = {
      root,
      caches: caches?.size && metadata.state !== 'deleted' ? caches : undefined,
      metadata,
    };
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .put(content, metadata.key),
    );
    this.#storedMetadata = metadata;
  }
  async delete() {
    this.replace({type: 'document'}, (metadata) => {
      metadata.state = 'deleted';
      metadata.clock = this.library.nextClock();
      metadata.modificationTime = Date.now();
      return true;
    });
  }
  private metadataChanged() {
    noAwait(this.scheduleSave());
  }
  private treeChanged(change: TreeChange) {
    if (change === 'edit') {
      this.updateMetadata((metadata) => {
        metadata.clock = this.library.nextClock();
        metadata.modificationTime = Date.now();
        return true;
      }, false);
    }
    noAwait(this.scheduleSave());
  }

  #pendinSaveOldMetadata: DocumentMetadata | undefined;
  #pendingSaveClock: number | undefined;
  private async scheduleSave() {
    const writeClock = this.#metadata.clock ?? 0;
    if (this.#pendingSaveClock === undefined) {
      this.#pendinSaveOldMetadata = this.#storedMetadata;
    } else {
      assert(this.#pendinSaveOldMetadata);
      if (writeClock === this.#pendingSaveClock) {
        // If the clock has not changed, we can join the scheduled write.
        return;
      }
    }
    this.#pendingSaveClock = writeClock;
    noAwait(
      this.library.enqueueWrite(async () => {
        if (writeClock !== this.#pendingSaveClock) {
          assert(this.#pendingSaveClock !== undefined);
          assert(this.#pendingSaveClock > writeClock);
          // A write for a newer clock will supersede this.
          return;
        }
        this.#pendingSaveClock = undefined;
        await this.save();
        if (this.#pendingSaveClock !== undefined) return;
        const oldMetadata = cast(this.#pendinSaveOldMetadata);
        this.#pendinSaveOldMetadata = undefined;
        this.library.dispatchEvent(
          new TypedCustomEvent('document-change', {
            detail: {document: this, oldMetadata},
          }),
        );
      }),
    );
  }
}

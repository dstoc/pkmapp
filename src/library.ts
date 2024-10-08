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
import {MarkdownTree, TreeChange} from './markdown/view-model.js';
import {ViewModelNode, viewModel} from './markdown/view-model-node.js';
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
    root: DocumentNode,
    updater: (metadata: DocumentMetadata) => boolean,
  ): void;
  save(): Promise<void>;
  delete(): Promise<void>;
  readonly name: string;
  readonly allNames: string[];
  readonly tree: MarkdownTree;
  readonly metadata: Readonly<DocumentMetadata>;
  readonly dirty: boolean;
  updateMetadata(updater: (metadata: DocumentMetadata) => boolean): void;
}

interface LibraryEventMap {
  'post-edit-update': CustomEvent<{
    node: ViewModelNode;
    change: 'connected' | 'disconnected' | 'changed';
  }>;
  'document-change': CustomEvent<Document>;
}

export interface Library extends TypedEventTarget<Library, LibraryEventMap> {
  // TODO: Does this need to be async? Make iterable?
  findAll(name: string): Promise<{document: Document; root: ViewModelNode}[]>;
  newDocument(name: string, root?: DocumentNode): Promise<Document>;
  getDocumentByTree(tree: MarkdownTree): Document | undefined;
  // TODO: Does this need to be async? Make iterable?
  getAllNames(): Promise<string[]>;
  getAllDocuments(): IterableIterator<Document>;
  readonly metadata: Metadata;
  restore(): Promise<void>;
  readonly ready: Promise<void>;
}

function normalizeName(name: string) {
  return name.toLowerCase();
}

function normalizeKey(name: string) {
  return name.toLowerCase().replaceAll(/[\\/:*?"<>|]/g, '');
}

interface StoredDocument {
  root: DocumentNode;
  metadata: DocumentMetadata;
}

const SCHEMA_VERSION = 1;

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
  private clock = 0;
  nextClock() {
    return ++this.clock;
  }
  currentClosk() {
    return this.clock;
  }
  static async init(prefix: string) {
    const request = indexedDB.open(prefix + 'library', SCHEMA_VERSION);
    request.onupgradeneeded = (e) => {
      assert(e.oldVersion === 0);
      const database = request.result;
      database.createObjectStore('documents');
    };
    const {result: database} = await wrap(request);
    const library = new IdbLibrary(database);
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
    const content: StoredDocument = {
      root,
      metadata: {
        state: 'active',
        creationTime: now,
        modificationTime: now,
        clock: this.clock++,
        key: name,
        component: {},
      },
    };
    let n = 0;
    while (true) {
      const key = `${normalizeKey(name)}${n > 0 ? '-' + String(n) : ''}`;
      content.metadata.key = key;
      try {
        await wrap(
          this.database
            .transaction('documents', 'readwrite')
            .objectStore('documents')
            .add(content, key),
        );
      } catch (_e) {
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
    if (
      stored.metadata.clock !== undefined &&
      stored.metadata.clock > this.clock
    ) {
      this.clock = stored.metadata.clock;
    }
    const result = new IdbDocument(this, stored.root, stored.metadata);
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
}

class IdbDocument implements Document {
  constructor(
    private library: IdbLibrary,
    root: DocumentNode,
    readonly metadata: Readonly<DocumentMetadata>,
  ) {
    this.tree = new MarkdownTree(cast(root), library);
    this.tree.addEventListener('tree-change', (e) => {
      this.treeChanged(e.detail);
    });
  }
  readonly tree: MarkdownTree;
  dirty = false;
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
      this.metadata.key
    );
  }
  get allNames() {
    const names = [...this.library.metadata.getNames(this.tree.root)];
    return names.length ? names : [this.metadata.key];
  }
  replace(
    root: DocumentNode,
    updater: (metadata: DocumentMetadata) => boolean,
  ) {
    this.tree.setRoot(this.tree.add<DocumentNode>(root), false);
    this.updateMetadata(updater, false);
    noAwait(this.markDirty());
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
        .put(content, this.metadata.key),
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
    this.library.cache.delete(this.metadata.key);
    // TODO: tombstone
    await wrap(
      this.library.database
        .transaction('documents', 'readwrite')
        .objectStore('documents')
        .delete(this.metadata.key),
    );
  }
  private metadataChanged() {
    noAwait(this.markDirty());
  }
  private treeChanged(change: TreeChange) {
    if (change === 'edit') {
      this.updateMetadata((metadata) => {
        metadata.clock = this.library.nextClock();
        metadata.modificationTime = Date.now();
        return true;
      }, false);
    }
    noAwait(this.markDirty());
  }
  private pendingModifications = 0;
  private async markDirty() {
    this.dirty = true;
    if (this.pendingModifications++) return;
    while (true) {
      const preSave = this.pendingModifications;
      // Save immediately on the fist iteration, may help keep tests fast.
      await this.save();
      this.library.dispatchEvent(
        new TypedCustomEvent('document-change', {detail: this}),
      );
      if (this.pendingModifications === preSave) {
        this.pendingModifications = 0;
        this.dirty = false;
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

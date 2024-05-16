import {Library, Document} from './library.js';
import {noAwait} from './async.js';
import {serializeToString} from './markdown/block-serializer.js';
import {assert} from './asserts.js';
import {ConfigStore} from './config-store.js';
import {Observe} from './observe.js';

export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatTime(date: Date) {
  return String(date.getHours()).padStart(2, '0');
}

interface BackupConfig {
  key: 'backup';
  directory: FileSystemDirectoryHandle;
  grouping: Grouping;
}

export type Grouping = 'none' | 'hourly' | 'daily';

export class Backup {
  constructor(
    library: Library,
    private readonly store: ConfigStore,
  ) {
    library.observeDocuments.add((_library, document) =>
      this.onDocumentUpdated(document),
    );
    noAwait(this.update());
  }
  // TODO: readonly
  state:
    | 'new'
    | 'idle'
    | 'waiting-for-config'
    | 'waiting-for-permission'
    | 'waiting-to-write' = 'waiting-for-config';
  private config?: BackupConfig;
  private backlog = new Set<Document>();
  readonly observe = new Observe(this);
  private async update() {
    if (!this.config) {
      this.config = (await this.store.getConfig('backup')) as BackupConfig;
      if (!this.config) {
        this.state = 'waiting-for-config';
        this.observe.notify();
        return;
      }
      this.state = 'waiting-for-permission';
    }
    if (this.state === 'waiting-for-permission') {
      let permission = 'prompt';
      permission = await this.config.directory.queryPermission({
        mode: 'readwrite',
      });
      if (permission !== 'granted') {
        this.observe.notify();
        return;
      }
      this.state = 'idle';
      this.observe.notify();
    }
    if (this.state === 'idle' && this.backlog.size) {
      assert(this.config);
      this.state = 'waiting-to-write';
      this.observe.notify();
      // TODO: update() can have multiple callers, there can be a race here.
      while (this.backlog.size) {
        // TODO: Check if state was reset & abort, might need to do this
        // after each await.
        await new Promise((resolve) => requestIdleCallback(resolve));
        const [document] = this.backlog;
        const content = serializeToString(document.tree.root);
        let targetDir = this.config.directory;
        if (this.config.grouping !== 'none') {
          targetDir = await targetDir.getDirectoryHandle(
            formatDate(new Date()),
            {create: true},
          );
          if (this.config.grouping === 'hourly') {
            targetDir = await targetDir.getDirectoryHandle(
              formatTime(new Date()),
              {create: true},
            );
          }
        }
        const file = await targetDir.getFileHandle(
          `${document.metadata.filename}.md`,
          {
            create: true,
          },
        );
        const stream = await file.createWritable();
        await stream.write(content);
        await stream.close();
        this.backlog.delete(document);
      }
      this.state = 'idle';
      this.observe.notify();
    }
  }
  private onDocumentUpdated(document: Document) {
    this.backlog.add(document);
    noAwait(this.update());
  }
  checkForPermission() {
    if (this.state !== 'waiting-for-permission') return;
    noAwait(this.update());
  }
  hasConfig() {
    return !!this.config;
  }
  async setConfiguration(
    directory: FileSystemDirectoryHandle,
    grouping: Grouping,
  ) {
    const config: BackupConfig = {
      key: 'backup',
      directory,
      grouping,
    };
    await this.store.setConfig(config);
    noAwait(this.update());
  }
  async resetConfiguration() {
    await this.store.removeConfig('backup');
    this.config = undefined;
    noAwait(this.update());
  }
}

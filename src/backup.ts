import {Library, Document, ComponentMetadata} from './library.js';
import {noAwait} from './async.js';
import {serializeToString} from './markdown/block-serializer.js';
import {assert} from './asserts.js';
import {ConfigStore} from './config-store.js';
import {signal} from '@preact/signals-core';

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
  snapshots?: Snapshots;
}

interface BackupMetadata extends ComponentMetadata {
  key: 'backup';
  backupModificationTime: number;
}

export type Snapshots = 'none' | 'hourly' | 'daily';

function needsBackup(document: Document) {
  const metadata = document.metadata.component['backup'] as
    | BackupMetadata
    | undefined;
  return (
    !metadata ||
    metadata.backupModificationTime < document.storedMetadata.modificationTime
  );
}

function normalizeFilename(name: string) {
  return name.toLowerCase().replaceAll(/[\\/:*?"<>|]/g, '');
}

export class Backup {
  constructor(
    private readonly library: Library,
    private readonly store: ConfigStore,
  ) {
    library.addEventListener('document-change', ({detail: {document}}) =>
      this.onDocumentUpdated(document),
    );
    noAwait(this.update());
  }
  readonly state = signal<
    | 'idle'
    | 'waiting-for-config'
    | 'waiting-for-permission'
    | 'checking-permission'
    | 'writing'
  >('waiting-for-config');
  private config?: BackupConfig;
  private backlog = new Set<Document>();
  private async update() {
    if (!this.config) {
      this.config = (await this.store.getConfig('backup')) as BackupConfig;
      if (!this.config) {
        this.state.value = 'waiting-for-config';
        return;
      }
      this.state.value = 'waiting-for-permission';
    }
    if (this.state.value === 'waiting-for-permission') {
      this.state.value = 'checking-permission';
      let permission = 'prompt';
      permission = await this.config.directory.requestPermission({
        mode: 'readwrite',
      });
      if (permission !== 'granted') {
        this.state.value = 'waiting-for-permission';
        return;
      }
      await this.library.ready;
      for (const document of this.library.getAllDocuments()) {
        if (needsBackup(document)) {
          this.backlog.add(document);
        }
      }
      this.state.value = 'idle';
    }
    if (this.state.value === 'idle' && this.backlog.size) {
      assert(this.config);
      this.state.value = 'writing';
      while (this.backlog.size) {
        // TODO: Check if state was reset & abort, might need to do this
        // after each await.
        await new Promise((resolve) => requestIdleCallback(resolve));
        const [document] = this.backlog;
        const name = document.name;
        const filename =
          name === document.metadata.key
            ? name
            : `${name}.${document.metadata.key}`;
        const file = await this.config.directory.getFileHandle(
          `${normalizeFilename(filename)}.md`,
          {
            create: true,
          },
        );
        if ((this.config.snapshots ?? 'none') !== 'none') {
          const existing = await file.getFile().catch((e) => {
            if (e instanceof DOMException && e.name === 'NotFoundError') {
              return undefined;
            }
            throw e;
          });

          await this.writeSnapshot(existing);
        }
        const stream = await file.createWritable();
        const content = serializeToString(document.tree.root);
        const modificationTime = document.storedMetadata.modificationTime;
        await stream.write(content);
        await stream.close();
        document.updateMetadata((metadata) => {
          const backup: BackupMetadata = (metadata.component[
            'backup'
          ] as BackupMetadata) ?? {
            key: 'backup',
            backupModificationTime: 0,
          };
          backup.backupModificationTime = modificationTime;
          metadata.component['backup'] = backup;
          return true;
        });
        if (document.storedMetadata.modificationTime <= modificationTime) {
          // Otherwise it was modified while we were writing.
          this.backlog.delete(document);
        }
      }
      this.state.value = 'idle';
    }
  }
  async writeSnapshot(existing?: File) {
    assert(this.config);
    if (!existing) return;
    const now = new Date();
    const lastModified = new Date(existing.lastModified);
    const newDate = formatDate(now) !== formatDate(lastModified);
    const newTime =
      this.config.snapshots === 'hourly' &&
      formatTime(now) !== formatTime(lastModified);
    if (!newDate && !newTime) return;

    let snapshotDir = await this.config.directory.getDirectoryHandle(
      formatDate(lastModified),
      {create: true},
    );
    if (this.config.snapshots === 'hourly') {
      snapshotDir = await snapshotDir.getDirectoryHandle(
        formatTime(lastModified),
        {
          create: true,
        },
      );
    }
    const snapshotFile = await snapshotDir.getFileHandle(existing.name, {
      create: true,
    });
    const stream = await snapshotFile.createWritable();
    await stream.write(await existing.arrayBuffer());
    await stream.close();
  }

  private onDocumentUpdated(document: Document) {
    if (!['idle', 'writing'].includes(this.state.value)) return;
    if (!needsBackup(document)) return;
    this.backlog.add(document);
    noAwait(this.update());
  }
  checkForPermission() {
    if (this.state.value !== 'waiting-for-permission') return;
    noAwait(this.update());
  }
  hasConfig() {
    return !!this.config;
  }
  async setConfiguration(
    directory: FileSystemDirectoryHandle,
    snapshots: Snapshots,
  ) {
    const config: BackupConfig = {
      key: 'backup',
      directory,
      snapshots,
    };
    await this.store.setConfig(config);
    noAwait(this.update());
  }
  async resetConfiguration() {
    await this.store.removeConfig('backup');
    this.config = undefined;
    await this.update();
    await this.library.ready;
    for (const document of this.library.getAllDocuments()) {
      document.updateMetadata((metadata) => {
        delete metadata.component['backup'];
        return true;
      });
    }
  }
}

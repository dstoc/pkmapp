import {Library, Document} from './library.js';
import {getDirectory, setDirectory} from './directory-db.js';
import {noAwait} from './async.js';
import {serializeToString} from './markdown/block-serializer.js';
import {assert} from './asserts.js';

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export class Backup {
  constructor(library: Library) {
    library.observeDocuments.add((_library, document) =>
      this.onDocumentUpdated(document),
    );
    noAwait(this.maybeUpdateState());
  }
  private state:
    | 'new'
    | 'idle'
    | 'waiting-for-permission'
    | 'waiting-to-write' = 'new';
  private directory?: FileSystemDirectoryHandle;
  private backlog = new Set<Document>();
  private async maybeUpdateState() {
    if (this.state === 'new') {
      this.state = 'waiting-for-permission';
      this.directory = await getDirectory('backup');
      if (!this.directory) {
        while (!navigator.userActivation.isActive) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        this.directory = await showDirectoryPicker({
          mode: 'readwrite',
          id: 'backup',
        });
        await setDirectory('backup', this.directory);
      }

      let state = 'prompt';
      do {
        state = await this.directory.queryPermission({mode: 'readwrite'});
        if (state === 'granted') break;
        while (!navigator.userActivation.isActive) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        state = await this.directory.requestPermission({mode: 'readwrite'});
      } while (state !== 'granted');
      this.state = 'idle';
    }
    if (this.state === 'idle' && this.backlog.size) {
      assert(this.directory);
      this.state = 'waiting-to-write';
      while (this.backlog.size) {
        await new Promise((resolve) => requestIdleCallback(resolve));
        let document: Document | undefined;
        for (const next of this.backlog) {
          document = next;
          break;
        }
        assert(document);
        const content = serializeToString(document.tree.root);
        const dateDir = await this.directory.getDirectoryHandle(
          formatDate(new Date()),
          {
            create: true,
          },
        );
        const file = await dateDir.getFileHandle(
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
    }
  }
  private onDocumentUpdated(document: Document) {
    this.backlog.add(document);
    noAwait(this.maybeUpdateState());
  }
}

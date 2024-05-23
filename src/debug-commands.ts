import {Document, Library} from './library.js';
import {Command} from './command-palette.js';
import {parseBlocks} from './markdown/block-parser.js';
import {serializeToString} from './markdown/block-serializer.js';

async function getAllDocuments(library: Library) {
  const documents = new Set<Document>();
  for (const name of await library.getAllNames()) {
    for (const {document} of await library.findAll(name)) {
      documents.add(document);
    }
  }
  return [...documents];
}

async function runExport(
  library: Library,
  directory: FileSystemDirectoryHandle,
) {
  for (const document of await getAllDocuments(library)) {
    const handle = await directory.getFileHandle(
      document.metadata.key + '.md',
      {create: true},
    );
    const stream = await handle.createWritable();
    await stream.write(serializeToString(document.tree.root));
    await stream.close();
  }
}

async function runImport(
  library: Library,
  directory: FileSystemDirectoryHandle,
) {
  for await (const entry of directory.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const file = await entry.getFile();
      const decoder = new TextDecoder();
      const text = decoder.decode(await file.arrayBuffer());
      await library.import(
        parseBlocks(text).node,
        entry.name.replace(/\.md$/, ''),
      );
    }
  }
}

export function debugCommands(library: Library): Command[] {
  if (!new URL(location.toString()).searchParams.has('debug')) return [];
  return [
    {
      description: '[DEBUG] Clear Library',
      execute: async () => {
        for (const document of await getAllDocuments(library)) {
          await document.delete();
        }
      },
    },
    {
      description: '[DEBUG] Import from OPFS',
      execute: async () => {
        const directory = await navigator.storage.getDirectory();
        await runImport(library, directory);
      },
    },
    {
      description: '[DEBUG] Export to OPFS',
      execute: async () => {
        const directory = await navigator.storage.getDirectory();
        await runExport(library, directory);
      },
    },
    {
      description: '[DEBUG] Import from directory',
      execute: async () => {
        const directory = await showDirectoryPicker({
          mode: 'read',
          id: 'debug-import',
        });
        await runImport(library, directory);
      },
    },
    {
      description: '[DEBUG] Export to directory',
      execute: async () => {
        const directory = await showDirectoryPicker({
          mode: 'readwrite',
          id: 'debug-export',
        });
        await runExport(library, directory);
      },
    },
  ];
}

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

export function debugCommands(library: Library): Command[] {
  if (!new URL(location.toString()).searchParams.has('debug')) return [];
  return [
    {
      description: '[DEBUG] Clear Library',
      execute: async () => {
        for (const document of await getAllDocuments(library)) {
          await document.delete();
        }

        return undefined;
      },
    },
    {
      description: '[DEBUG] Import from OPFS',
      execute: async () => {
        const directory = await navigator.storage.getDirectory();
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
        return undefined;
      },
    },
    {
      description: '[DEBUG] Export to OPFS',
      execute: async () => {
        const directory = await navigator.storage.getDirectory();
        for (const document of await getAllDocuments(library)) {
          const handle = await directory.getFileHandle(
            document.filename + '.md',
            {create: true},
          );
          const stream = await handle.createWritable();
          await stream.write(serializeToString(document.tree.root));
          await stream.close();
        }
        return undefined;
      },
    },
  ];
}

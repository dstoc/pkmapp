import {assert} from './asserts';
import {wrap} from './indexeddb';

// TODO rename this file to library-schema
/**
 * Version 2
 * * replaced documents#key (document.metadata.key) as initial title/filename with UUID
 */
export const SCHEMA_VERSION = 2;

export function upgrade(
  database: IDBDatabase,
  txn: IDBTransaction,
  from: number,
) {
  upgradeImpl(database, txn, from).catch((e) => {
    console.error('upgrade failed', e);
    txn.abort();
  });
}

async function upgradeImpl(
  database: IDBDatabase,
  txn: IDBTransaction,
  from: number,
) {
  if (from === 0) {
    database.createObjectStore('documents');
    from = 1;
  }
  if (from === 1) {
    interface V1Document {
      metadata: {
        key: string;
      };
    }
    const documents = txn.objectStore('documents');
    const {result: keys} = await wrap(documents.getAllKeys());
    for (const key of keys) {
      assert(typeof key === 'string');
      const {result: document} = (await wrap(documents.get(key))) as {
        result: V1Document;
      };
      const oldKey = document.metadata.key;
      console.error(oldKey);
      const newKey = crypto.randomUUID();
      document.metadata.key = newKey;
      await wrap(documents.delete(oldKey));
      await wrap(documents.put(document, newKey));
    }
    from = 2;
  }
  assert(from === SCHEMA_VERSION);
}

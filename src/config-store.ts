import {assert} from './asserts.js';
import {wrap} from './indexeddb.js';

const store = 'configs';

export interface Config {
  key: string;
}

export class ConfigStore {
  constructor(private readonly database: IDBDatabase) {}
  static async init(prefix: string) {
    const request = indexedDB.open(`${prefix}configuration`);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(store);
    };
    const {result: database} = await wrap(request);
    return new ConfigStore(database);
  }
  async getConfig(key: string) {
    const {result} = await wrap(
      this.database
        .transaction(store, 'readwrite')
        .objectStore(store)
        .get(key) as IDBRequest<Config>,
    );

    assert(!result || result.key === key);
    return result;
  }
  async setConfig(config: Config) {
    assert(config.key);
    await wrap(
      this.database
        .transaction(store, 'readwrite')
        .objectStore(store)
        .put(config, config.key),
    );
  }
  async removeConfig(key: string) {
    await wrap(
      this.database
        .transaction(store, 'readwrite')
        .objectStore(store)
        .delete(key),
    );
  }
}

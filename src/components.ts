import {assert} from './asserts.js';
import {BackLinks} from './backlinks.js';
import {Backup} from './backup.js';
import {ConfigStore} from './config-store.js';
import {Library} from './library.js';
import {Metadata} from './metadata.js';

export interface Components {
  library: Library;
  backLinks: BackLinks;
  metadata: Metadata;
  backup: Backup;
  configStore: ConfigStore;
}

export class ComponentsBuilder {
  private result: Partial<Components> = {};
  async add<K extends keyof Components>(
    key: K,
    init: (components: Partial<Components>) => Promise<Components[K]>,
  ) {
    assert(!this.result[key]);
    this.result[key] = await init(this.result);
  }
  build(verify: (result: Partial<Components>) => Components): Components {
    return verify(this.result);
  }
}

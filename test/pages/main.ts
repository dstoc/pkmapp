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

import {control} from '../util/input.js';
import {$, browser} from '@wdio/globals';
import {Page} from './page.js';

type Status = 'loading' | 'loaded' | 'error';
export class Main extends Page {
  path = '/?no-default&debug';
  host = $('>>>pkm-editor');
  dialog = $('>>>dialog[open]');
  isReady = this.host.shadow$('*').isExisting;
  fileSystem = new FileSystem();
  async status(...status: Status[]): Promise<Status> {
    await browser.waitUntil(async () =>
      status.includes((await this.host.getAttribute('status')) as Status),
    );
    return this.host.getAttribute('status') as Promise<Status>;
  }
  async runCommand(command: string, argument?: string) {
    await browser.keys(control('p'));
    await browser.keys(command.split(''));
    await browser.keys('\n');
    // TODO: Does the component correctly buffer these keystrokes?
    if (argument !== undefined) {
      await browser.keys(argument.split(''));
      await browser.keys('\n');
    }
    await this.host.$('>>>dialog[open]').waitForExist({reverse: true});
  }
}

export class FileSystem {
  async clear() {
    await browser.executeAsyncScript(
      `
      const [callback] = arguments;
      (async () => {
        await (await navigator.storage.getDirectory()).remove({recursive: true})
        callback();
      })();
      `,
      [],
    );
  }
  async getFile(fileName: string): Promise<string> {
    const result = await browser.executeAsyncScript(
      `
      const [fileName, callback] = arguments;
      (async () => {
        try {
          const directory = await navigator.storage.getDirectory();
          const handle = await directory.getFileHandle(fileName);
          const file = await handle.getFile();
          const decoder = new TextDecoder();
          callback(decoder.decode(await file.arrayBuffer()));
        } catch (e) {
          callback({
            message: e.message,
            stack: e.stack,
          });
        }
      })();
    `,
      [fileName],
    );
    if (typeof result === 'string') return result;
    const error = new Error(result.message);
    error.stack = result.stack;
    throw error;
  }
  async setFile(fileName: string, content: string): Promise<string> {
    const result = await browser.executeAsyncScript(
      `
      const [fileName, content, callback] = arguments;
      (async () => {
        try {
          const directory = await navigator.storage.getDirectory();
          const handle = await directory.getFileHandle(fileName, {create: true});
          const stream = await handle.createWritable();
          await stream.write(content);
          await stream.close();
          callback('');
        } catch (e) {
          callback({
            message: e.message,
            stack: e.stack,
          });
        }
      })();
    `,
      [fileName, content],
    );
    if (typeof result === 'string') return;
    const error = new Error(result.message);
    error.stack = result.stack;
    throw error;
  }
}

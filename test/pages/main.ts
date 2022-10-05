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

import {Page} from './page';

export class Main extends Page {
  path = '/';
  host = $('test-host');
  opendirButton = this.host.shadow$('#opendir');
  fileInput = this.host.shadow$('input');
  loadButton = this.host.shadow$('#load');
  saveButton = this.host.shadow$('#save');
  isReady = this.opendirButton.isExisting;
  fileSystem = new Promise<FileSystem>(async resolve => {
    await this.loaded;
    await browser.executeAsyncScript(`
      const callback = arguments[arguments.length - 1];
      import("/testing/memory_file_system.js").then(callback);
    `, []);
    resolve(new FileSystem());
  });
}

export class FileSystem {
  async getFile(fileName: string): Promise<string> {
    const result = await browser.executeAsyncScript(`
      const [fileName, callback] = arguments;
      (async () => {
        try {
          const directory = await showDirectoryPicker({mode: 'readwrite'});
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
    `, [fileName]);
    if (typeof result === 'string') return result;
    const error = new Error(result.message);
    error.stack = result.stack;
    throw error;
  }
  async setFile(fileName: string, content: string): Promise<string> {
    const result = await browser.executeAsyncScript(`
      const [fileName, content, callback] = arguments;
      (async () => {
        try {
          const directory = await showDirectoryPicker({mode: 'readwrite'});
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
    `, [fileName, content]);
    if (typeof result === 'string') return;
    const error = new Error(result.message);
    error.stack = result.stack;
    throw error;
  }
}
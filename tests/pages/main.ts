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

import {type Page} from '@playwright/test';

type Status = 'loading' | 'loaded' | 'error';
export class Main {
  constructor(readonly page: Page) {}
  path = '/?no-default&debug';
  host = this.page.locator('pkm-editor');
  dialog = this.page.locator('dialog[open]');
  isReady = this.host.locator('*').first();
  fileSystem = new FileSystem(this.page);
  async load(): Promise<this> {
    await this.page.goto(this.path);
    await this.isReady.waitFor({state: 'attached'});
    return this;
  }
  async status(...status: Status[]): Promise<Status> {
    const result = await this.page.waitForFunction(
      ({element, status}) =>
        status.includes(element!.getAttribute('status') as Status) &&
        element!.getAttribute('status'),
      {element: await this.host.elementHandle(), status},
    );
    return (await result.jsonValue()) as Status;
  }
  async runCommand(command: string, argument?: string) {
    await this.page.keyboard.press('Control+p');
    await this.page.locator('dialog[open]').waitFor({state: 'attached'});
    await this.page.keyboard.type(command);
    await this.page.keyboard.press('Enter');
    // TODO: Does the component correctly buffer these keystrokes?
    if (argument !== undefined) {
      await this.page.keyboard.type(argument);
      await this.page.keyboard.press('Enter');
    }
    await this.page.locator('dialog[open]').waitFor({state: 'detached'});
  }
}

export class FileSystem {
  constructor(readonly page: Page) {}
  async clear() {
    return this.page.evaluate(
      async () =>
        await (
          await navigator.storage.getDirectory()
        ).remove({recursive: true}),
    );
  }
  async getFile(fileName: string): Promise<string> {
    return this.page.evaluate(async (fileName) => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle(fileName);
      const file = await handle.getFile();
      const decoder = new TextDecoder();
      return decoder.decode(await file.arrayBuffer());
    }, fileName);
  }
  async setFile(fileName: string, content: string): Promise<void> {
    return this.page.evaluate(
      async ({fileName, content}) => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle(fileName, {create: true});
        const stream = await handle.createWritable();
        await stream.write(content);
        await stream.close();
      },
      {fileName, content},
    );
  }
}

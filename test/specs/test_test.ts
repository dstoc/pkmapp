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

import {Main} from '../pages/main';

function testState<T>(makeState: () => T|Promise<T>): T {
  const result = {};
  beforeEach(async () => {
    Object.assign(result, await makeState());
  });
  return result as T;
}

describe('main', () => {
  const state = testState(async () => {
    const main = await new Main().load();
    return {
      main,
      fs: await main.fileSystem
    };
  })
  it('can roundtrip simple markdown', async () => {
    const content = ` * a\n`
    await state.fs.setFile('test.md', content);
    await state.main.opendirButton.click();
    await browser.waitUntil(state.main.fileInput.isExisting);
    await state.main.loadButton.click();
    await browser.waitUntil($('>>>[contenteditable]').isExisting);
    await state.main.saveButton.click();
    expect(await state.fs.getFile('test.md')).toEqual(content);
  });
  it('can process inputs and save automatically', async () => {
    await state.main.opendirButton.click();
    await browser.waitUntil(state.main.fileInput.isExisting);
    await state.main.loadButton.click();
    await browser.waitUntil($('>>>[contenteditable]').isExisting);
    const inline = $('>>>[contenteditable]');
    await inline.click();
    await browser.keys('# hello world'.split(''));
    expect(await state.fs.getFile('test.md')).toEqual('# hello world\n');
  });
});
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
import {testState} from '../util/test_state';

describe('main', () => {
  const state = testState(async () => {
    const main = await new Main().load();
    return {main, fs: await main.fileSystem};
  });
  function inputOutputTest(input, output) {
    return async () => {
      const leading = /(\n +)/.exec(input)[1];
      input = input.replace(new RegExp(leading, 'g'), '\n');
      output = output.replace(new RegExp(leading, 'g'), '\n');
      await state.main.opendirButton.click();
      await browser.waitUntil(state.main.fileInput.isExisting);
      await state.main.loadButton.click();
      await browser.waitUntil($('>>>[contenteditable]').isExisting);
      const inline = $('>>>[contenteditable]');
      await inline.click();
      await browser.keys(input.split(''));
      await browser.waitUntil(state.main.isClean);
      expect(await state.fs.getFile('test.md')).toEqual(output);
    };
  }
  it('can generate multiple sections',
     inputOutputTest(
         `# 1
          a
          # 2
          b`,
         `# 1
          a

          # 2
          b
          `,
         ));
  it('can generate a list',
     inputOutputTest(
         // TODO: require a space after '*' to generate a new list
         `*a
          b`,
         `* a
          * b
          `,
         ));
});

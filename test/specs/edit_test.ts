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
import {control, input, removeLeadingWhitespace} from '../util/input';
import {testState} from '../util/test_state';

describe('input helper', () => {
  it('removes leading whitespace', () => {
    expect(input`a
                 b`)
        .toEqual(['a', '\n', 'b']);
  });
  it('merges keys', () => {
    expect(input`a${['Tab']}b`).toEqual(['a', 'Tab', 'b']);
  });
});

describe('main', () => {
  afterEach(async () => {
    expect(await browser.getLogs('browser')).toEqual([]);
  });
  const state = testState(async () => {
    const main = await new Main().load();
    return {main, fs: main.fileSystem};
  });
  function inputOutputTest(keys: string[], output: string) {
    return async () => {
      output = removeLeadingWhitespace(output);
      await state.fs.setFile('test.md', '');
      await state.main.runCommand('open', 'test');
      await state.main.status('loaded');
      const inline = $('>>>[contenteditable]');
      await inline.click();
      await browser.keys(keys);
      await browser.waitUntil(state.main.isClean);
      expect(await state.fs.getFile('test.md')).toEqual(output);
    };
  }
  it('can generate multiple sections',
     inputOutputTest(
         input`# 1
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
         input`* a
          b`,
         `* a
          * b
          `,
         ));
  describe('checklists', () => {
    it('can generate unchecked',
       inputOutputTest(
           input`* [ ] milk\neggs`,
           `* [ ] milk\n* [ ] eggs\n`,
           ));
    it('can generate checked',
       inputOutputTest(
           input`* [x] milk\neggs`,
           `* [x] milk\n* [ ] eggs\n`,
           ));
    it('ignores double check',
       inputOutputTest(
           input`* [x] [ ] milk\neggs`, `* [x] [ ] milk\n* [ ] eggs\n`));
  });
  it('does not generate lists in ambiguous situations',
     inputOutputTest(
         input`*a
          b`,
         `*a

          b
          `,
         ));
  describe('indentation', () => {
    it('can indent a top level paragraph',
       inputOutputTest(
           input`a${['Tab']}`,
           `* a
            `,
           ));
    it('can unindent a list-item in a list-item',
       inputOutputTest(
           input`* * a${['Shift', 'Tab', 'Shift']}`,
           `* a\n`,
           ));
  });
});

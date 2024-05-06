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

import {Main} from '../pages/main.js';
import {input, removeLeadingWhitespace} from '../util/input.js';
import {testState} from '../util/test_state.js';
import {$, browser} from '@wdio/globals';

describe('input helper', () => {
  it('removes leading whitespace', () => {
    expect(input`a
                 b`).toEqual(['a', '\n', 'b']);
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
      await browser.keys(keys);
      await checkExport('test.md', output);
    };
  }
  async function importFile(file: string, contents: string) {
    await state.fs.setFile(file, contents);
    await state.main.runCommand('Import from OPFS');
    await state.fs.clear();
  }
  async function checkExport(file: string, output: string) {
    output = removeLeadingWhitespace(output);
    await browser.waitUntil(state.main.isClean);
    await state.main.runCommand('Export to OPFS');
    const contents = await state.fs.getFile(file);
    await state.fs.clear();
    expect(contents).toEqual(output);
  }
  beforeEach(async () => {
    await state.main.runCommand('Clear Library');
    await importFile('test.md', '');
    await state.main.runCommand('open', 'test');
    await state.main.status('loaded');
    const inline = $('>>>[contenteditable]');
    await inline.click();
  });
  describe('transclusions', () => {
    it('can be inserted and edited', async () => {
      await browser.keys(input`test`);
      await importFile('transclusion.md', '');
      await state.main.runCommand('insert transclusion', 'transclusion');
      await browser.waitUntil(
        state.main.host.$('>>>md-transclusion').isExisting,
      );
      // TODO: shouldn't be required
      await browser.keys(['ArrowDown']);
      await browser.keys(input`content`);
      await checkExport(
        'test.md',
        `test

           \`\`\`tc
           transclusion
           \`\`\`
           `,
      );
      // TODO: does not wait for save
      await checkExport('transclusion.md', 'content\n');
    });
    it('can be inserted and deleted', async () => {
      await browser.keys(input`test`);
      await importFile('transclusion.md', '');
      await state.main.runCommand('insert transclusion', 'transclusion');
      await browser.waitUntil(
        state.main.host.$('>>>md-transclusion').isExisting,
      );
      // TODO: shouldn't be required
      await browser.keys(['ArrowDown']);
      await state.main.runCommand('delete transclusion');
      await checkExport('test.md', `test\n`);
    });
  });
  describe('sections', () => {
    it(
      'can generate multiple sections',
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
      ),
    );
    it(
      'nest correctly',
      inputOutputTest(
        input`a
            # 1
            a
            ## 2
            b
            # 3${Array(4).fill('ArrowUp')}${['Tab']}`,
        `a
            * # 1
              a
              
              ## 2
              b
            
            # 3
            `,
      ),
    );
    it(
      'nest correctly when ranges are not all contiguous',
      inputOutputTest(
        input`# top
                 * 1
                 2
                 3
                 # outer${['Shift', 'Tab', 'Shift']}${Array(2).fill(
                   'ArrowUp',
                 )}# `,
        `# top
            * 1
            * # 2
            * 3

            # outer
            `,
      ),
    );
  });
  it(
    'can generate a list',
    inputOutputTest(
      input`* a
          b`,
      `* a
          * b
          `,
    ),
  );
  describe('checklists', () => {
    it(
      'can generate unchecked',
      inputOutputTest(input`* [ ] milk\neggs`, `* [ ] milk\n* [ ] eggs\n`),
    );
    it(
      'can generate checked',
      inputOutputTest(input`* [x] milk\neggs`, `* [x] milk\n* [ ] eggs\n`),
    );
    it(
      'ignores double check',
      inputOutputTest(
        input`* [x] [ ] milk\neggs`,
        `* [x] [ ] milk\n* [ ] eggs\n`,
      ),
    );
  });
  it(
    'does not generate lists in ambiguous situations',
    inputOutputTest(
      input`*a
          b`,
      `*a

          b
          `,
    ),
  );
  describe('paragraph insertion', () => {
    it(
      'will split a paragraph',
      inputOutputTest(
        input`* ab${['ArrowLeft']}\nc`,
        `* a
            * cb
            `,
      ),
    );
    it(
      'will stay on the current line when splitting at start',
      inputOutputTest(
        input`* b${['ArrowLeft']}\na`,
        `* a
            * b
            `,
      ),
    );
    it(
      'will move to the next line if empty',
      inputOutputTest(
        input`* \nb`,
        `* 
            * b
            `,
      ),
    );
  });
  describe('indentation', () => {
    it(
      'can indent a top level paragraph',
      inputOutputTest(
        input`a${['Tab']}`,
        `* a
            `,
      ),
    );
    it(
      'can unindent a list-item in a list-item',
      inputOutputTest(input`* * a${['Shift', 'Tab', 'Shift']}`, `* a\n`),
    );
  });
  describe('links', () => {
    it(
      'automatically inserts closing `]`',
      inputOutputTest(
        input`[test`,
        `[test]
            `,
      ),
    );
    it(
      "doesn't insert duplicate `]`",
      inputOutputTest(
        input`[]`,
        `[]
            `,
      ),
    );
    it(
      'completes suggestions with <Tab>',
      inputOutputTest(
        input`[te${['Tab']}`,
        `[test]
            `,
      ),
    );
    it(
      'accepts freeform links',
      inputOutputTest(
        input`[doesnt exist${['Tab']}`,
        `[doesnt exist]
            `,
      ),
    );
  });
  describe('selection', () => {
    it(
      'can select and delete',
      inputOutputTest(
        input`a\nb\nc${['Shift', 'ArrowUp', 'Shift', 'Backspace']}`,
        `a
            `,
      ),
    );
    it(
      'can select a single block',
      inputOutputTest(
        input`* a\nb\nc${['ArrowUp', 'Control', 'a', 'Control', 'Backspace']}`,
        `* a
            * c
            `,
      ),
    );
  });
});

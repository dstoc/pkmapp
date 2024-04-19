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

import {Main} from './pages/main.js';
import {
  type KeyboardSequence,
  input,
  removeLeadingWhitespace,
} from './util/input.js';
import {testState} from './util/test_state.js';
import {test, expect} from '@playwright/test';

test.describe('editing', () => {
  const state = testState(async (page) => {
    const main = await new Main(page).load();
    return {main, fs: main.fileSystem};
  });

  test.beforeEach(async () => {
    await importFile('test.md', '');
    await state.main.runCommand('open', 'test');
    await state.main.status('loaded');
    const inline = state.main.host.locator('[contenteditable]').first();
    await inline.click();
  });

  test.afterEach(async () => {
    // TODO: how to fail on logs?
    // expect(await browser.getLogs('browser')).toEqual([]);
  });

  function inputOutputTest(sequence: KeyboardSequence, output: string) {
    return async () => {
      await sequence(state.main.page.keyboard);
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
    await state.main.runCommand('Export to OPFS');
    const contents = await state.fs.getFile(file);
    expect(contents).toEqual(output);
    await state.fs.clear();
  }
  test.describe('transclusions', () => {
    test('can be inserted and edited', async ({page}) => {
      await page.keyboard.type('test');
      await importFile('transclusion.md', 'aaa');
      await state.main.runCommand('insert transclusion', 'transclusion');
      await state.main.host
        .locator('md-transclusion')
        .waitFor({state: 'visible'});
      // TODO: shouldn't be required
      await page.keyboard.press('ArrowDown');
      await page.keyboard.type('content');
      await checkExport(
        'test.md',
        `test

             \`\`\`tc
             transclusion
             \`\`\`
             `,
      );
      await checkExport('transclusion.md', 'contentaaa\n');
    });
    test('can be inserted and deleted', async ({page}) => {
      await page.keyboard.type('test');
      await importFile('transclusion.md', '');
      await state.main.runCommand('insert transclusion', 'transclusion');
      await state.main.host
        .locator('md-transclusion')
        .waitFor({state: 'visible'});
      // TODO: shouldn't be required
      await page.keyboard.press('ArrowDown');
      await state.main.runCommand('delete transclusion');
      await checkExport('test.md', `test\n`);
    });
  });
  test.describe('sections', () => {
    test(
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
    test(
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
    test(
      'nest correctly when ranges are not all contiguous',
      inputOutputTest(
        input`# top
                   * 1
                   2
                   3
                   # outer${['Shift+Tab']}${['Home', 'ArrowUp', 'ArrowUp']}# `,
        `# top
              * 1
              * # 2
              * 3

              # outer
              `,
      ),
    );
  });
  test(
    'can generate a list',
    inputOutputTest(
      input`* a
            b`,
      `* a
            * b
            `,
    ),
  );
  test.describe('checklists', () => {
    test(
      'can generate unchecked',
      inputOutputTest(input`* [ ] milk\neggs`, `* [ ] milk\n* [ ] eggs\n`),
    );
    test(
      'can generate checked',
      inputOutputTest(input`* [x] milk\neggs`, `* [x] milk\n* [ ] eggs\n`),
    );
    test(
      'ignores double check',
      inputOutputTest(
        input`* [x] [ ] milk\neggs`,
        `* [x] [ ] milk\n* [ ] eggs\n`,
      ),
    );
  });
  test(
    'does not generate lists in ambiguous situations',
    inputOutputTest(
      input`*a
            b`,
      `*a

            b
            `,
    ),
  );
  test.describe('paragraph insertion', () => {
    test(
      'will split a paragraph',
      inputOutputTest(
        input`* ab${['ArrowLeft']}\nc`,
        `* a
              * cb
              `,
      ),
    );
    test(
      'will stay on the current line when splitting at start',
      inputOutputTest(
        input`* b${['ArrowLeft']}\na`,
        `* a
              * b
              `,
      ),
    );
  });
  test.describe('indentation', () => {
    test(
      'can indent a top level paragraph',
      inputOutputTest(
        input`a${['Tab']}`,
        `* a
              `,
      ),
    );
    test(
      'can unindent a list-item in a list-item',
      inputOutputTest(input`* * a${['Shift+Tab']}`, `* a\n`),
    );
  });
  test.describe('links', () => {
    test(
      'automatically inserts closing `]`',
      inputOutputTest(
        input`[test`,
        `[test]
              `,
      ),
    );
    test(
      "doesn't insert duplicate `]`",
      inputOutputTest(
        input`[]`,
        `[]
              `,
      ),
    );
    test(
      'completes suggestions with <Tab>',
      inputOutputTest(
        input`[te${['Tab']}`,
        `[test]
              `,
      ),
    );
    test(
      'accepts freeform links',
      inputOutputTest(
        input`[doesnt exist${['Tab']}`,
        `[doesnt exist]
              `,
      ),
    );
  });
  test.describe('selection', () => {
    test(
      'can select and delete',
      inputOutputTest(
        input`a\nb\nc${['Shift+ArrowUp', 'Backspace']}`,
        `a
              `,
      ),
    );
    test(
      'can select a single block',
      inputOutputTest(
        input`* a\nb\nc${['ArrowUp', 'Control+a', 'Backspace']}`,
        `* a
              * c
              `,
      ),
    );
  });
});

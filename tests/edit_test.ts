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
import {testState} from './util/test_state.js';
import {test, expect, addPrettySerializer} from './util/pretty.js';

const exportSymbol = Symbol();
addPrettySerializer({
  serialize(val) {
    const target = val as {content: string};
    return target.content;
  },
  test(val: unknown) {
    return val !== null && typeof val === 'object' && exportSymbol in val;
  },
});

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

  async function importFile(file: string, contents: string) {
    await state.fs.setFile(file, contents);
    await state.main.runCommand('Import from OPFS');
    await state.fs.clear();
  }
  async function exportMarkdown(file: string = 'test.md') {
    await state.main.runCommand('Export to OPFS');
    const content = await state.fs.getFile(file);
    await state.fs.clear();
    return {
      [exportSymbol]: true,
      file,
      content,
    };
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
      expect(await exportMarkdown('test.md')).toMatchPretty(`
        test

        \`\`\`tc
        transclusion
        \`\`\`

      `);
      expect(await exportMarkdown('transclusion.md')).toMatchPretty(`
        contentaaa

      `);
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
      expect(await exportMarkdown('test.md')).toMatchPretty(`
        test

      `);
    });
  });
  test.describe('sections', () => {
    test('can generate multiple sections', async ({page: {keyboard}}) => {
      await keyboard.type(`# 1\n`);
      await keyboard.type(`a\n`);
      await keyboard.type(`# 2\n`);
      await keyboard.type(`b`);
      expect(await exportMarkdown()).toMatchPretty(`
        # 1
        a

        # 2
        b

      `);
    });
    test('nest correctly', async ({page: {keyboard}}) => {
      await keyboard.type(`a\n`);
      await keyboard.type(`# 1\n`);
      await keyboard.type(`a\n`);
      await keyboard.type(`## 2\n`);
      await keyboard.type(`b\n`);
      await keyboard.type(`# 3`);
      for (let i = 0; i < 4; i++) {
        keyboard.press('ArrowUp');
      }
      await keyboard.press('Tab');
      expect(await exportMarkdown()).toMatchPretty(`
        a
        * # 1
          a
          
          ## 2
          b

        # 3

      `);
    });
    test('nest correctly when ranges are not all contiguous', async ({
      page: {keyboard},
    }) => {
      await keyboard.type(`# top\n`);
      await keyboard.type(`* 1\n`);
      await keyboard.type(`2\n`);
      await keyboard.type(`3\n`);
      await keyboard.type(`# outer`);
      await keyboard.press('Shift+Tab');
      await keyboard.press('Home');
      await keyboard.press('ArrowUp');
      await keyboard.press('ArrowUp');
      await keyboard.type(`# `);
      expect(await exportMarkdown()).toMatchPretty(`
        # top
        * 1
        * # 2
        * 3

        # outer

      `);
    });
    test('can generate a list', async ({page: {keyboard}}) => {
      await keyboard.type(`* a\nb`);
      expect(await exportMarkdown()).toMatchPretty(`
        * a
        * b

      `);
    });
  });
  test.describe('checklists', () => {
    test('can generate unchecked', async ({page: {keyboard}}) => {
      await keyboard.type(`* [ ] milk\neggs`);
      expect(await exportMarkdown()).toMatchPretty(`
        * [ ] milk
        * [ ] eggs

      `);
    });
    test('can generate checked', async ({page: {keyboard}}) => {
      await keyboard.type(`* [x] milk\neggs`);
      expect(await exportMarkdown()).toMatchPretty(`
        * [x] milk
        * [ ] eggs

      `);
    });
    test('ignores double check', async ({page: {keyboard}}) => {
      await keyboard.type(`* [x] [ ] milk\neggs`);
      expect(await exportMarkdown()).toMatchPretty(`
        * [x] [ ] milk
        * [ ] eggs

      `);
    });
  });
  test('does not generate lists in ambiguous situations', async ({
    page: {keyboard},
  }) => {
    await keyboard.type(`*a\nb`);
    expect(await exportMarkdown()).toMatchPretty(`
      *a

      b

    `);
  });
  test.describe('paragraph insertion', () => {
    test('will split a paragraph', async ({page: {keyboard}}) => {
      await keyboard.type(`* ab`);
      await keyboard.press('ArrowLeft');
      await keyboard.type(`\nc`);
      expect(await exportMarkdown()).toMatchPretty(`
        * a
        * cb

      `);
    });
    test('will stay on the current line when splitting at start', async ({
      page: {keyboard},
    }) => {
      await keyboard.type(`* b`);
      await keyboard.press('ArrowLeft');
      await keyboard.type(`\na`);
      expect(await exportMarkdown()).toMatchPretty(`
        * a
        * b

      `);
    });
  });
  test.describe('indentation', () => {
    test('can indent a top level paragraph', async ({page: {keyboard}}) => {
      await keyboard.type(`a`);
      await keyboard.press('Tab');
      expect(await exportMarkdown()).toMatchPretty(`
        * a

      `);
    });
    test('can unindent a list-item in a list-item', async ({
      page: {keyboard},
    }) => {
      await keyboard.type(`* * a`);
      await keyboard.press('Shift+Tab');
      expect(await exportMarkdown()).toMatchPretty(`
        * a

      `);
    });
  });
  test.describe('links', () => {
    test('automatically inserts closing `]`', async ({page: {keyboard}}) => {
      await keyboard.type(`[test`);
      expect(await exportMarkdown()).toMatchPretty(`
        [test]

      `);
    });
    test("doesn't insert duplicate `]`", async ({page: {keyboard}}) => {
      await keyboard.type(`[]`);
      expect(await exportMarkdown()).toMatchPretty(`
        []

      `);
    });
    test('completes suggestions with <Tab>', async ({page: {keyboard}}) => {
      await keyboard.type(`[te`);
      await keyboard.press('Tab');
      expect(await exportMarkdown()).toMatchPretty(`
        [test]

      `);
    });
    test('accepts freeform links', async ({page: {keyboard}}) => {
      await keyboard.type(`[doesnt exist`);
      await keyboard.press('Tab');
      expect(await exportMarkdown()).toMatchPretty(`
        [doesnt exist]

      `);
    });
  });
  test.describe('selection', () => {
    test('can select and delete', async ({page: {keyboard}}) => {
      await keyboard.type(`a\nb\nc`);
      await keyboard.press('Shift+ArrowUp');
      await keyboard.press('Backspace');
      expect(await exportMarkdown()).toMatchPretty(`
        a

      `);
    });
    test('can select a single block', async ({page: {keyboard}}) => {
      await keyboard.type(`* a\nb\nc`);
      await keyboard.press('ArrowUp');
      await keyboard.press('Control+a');
      await keyboard.press('Backspace');
      expect(await exportMarkdown()).toMatchPretty(`
        * a
        * c

      `);
    });
  });
});

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

import {FileSystem, Main} from '../pages/main';
import {testRoundtrip} from '../util/test_roundtrip';

async function getTests() {
  await browser.url('https://github.github.com/gfm');
  const result = JSON.parse(await browser.executeScript(
      `
    function extract(a) {
      const name = a.textContent;
      const href = a.href;
      const content = a.parentElement.nextElementSibling.textContent;
      return {name, href, content};
    }
    return JSON.stringify([...document.querySelectorAll('[href^="#example"]')].map(extract));
  `,
      []));
  await browser.back();
  return result;
}

const expectedFailures = {
  90: '',   // normalised code block
  93: '',   // normalised code block
  94: '',   // normalised code block
  95: '',   // normalised code block
  96: '',   // normalised code block
  97: '',   // normalised code block
  98: '',   // normalised code block
  109: '',  // normalised code block
  111: '',  // normalised code block
  113: '',  // normalised code block
  114: '',  // normalised code block
  116: '',  // normalised code block
  143: '',  // TODO html parser error?
  215: '',  // normalization, but TODO empty code blocks?
  218: '',  // normalization
  219: '',  // normalization, but TODO block quote missing space
  227: '',  // normalization
  300: '',  // normllization, but TODO extra newlines
  315: '',  // normalized code block
};

const expectedWhitespaceVariants = {
  32: true,
};

export function runTests(start = 1, limit = 678) {
  describe('github flavored markdown', () => {
    let tests = [];
    let main: Main;
    let fs: FileSystem;
    afterEach(async () => {
      expect(await browser.getLogs('browser')).toEqual([]);
    });
    beforeAll(async () => {
      tests = await getTests();
      tests.unshift(null);
      expect(tests.length).toEqual(677);
      main = await new Main().load();
      fs = await main.fileSystem;
    });
    for (let i = start; i < Math.min(limit, 678); i++) {
      it(`can ${
             expectedFailures[i] !== undefined ?
                 '(not) ' :
                 ''}roundtrip https://github.github.com/gfm/#example-${i}`,
         async () => testRoundtrip(
             tests[i].content.trim() + '\n', main, fs, true,
             expectedFailures[i]));
    }
  });
};

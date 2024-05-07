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
import {testRoundtrip} from '../util/test_roundtrip.js';
import {testState} from '../util/test_state.js';
import {browser} from '@wdio/globals';

describe('roundtrip parse/serialize', () => {
  afterEach(async () => {
    expect(await browser.getLogs('browser')).toEqual([]);
  });
  const state = testState(async () => {
    const main = await new Main().load();
    return {main, fs: main.fileSystem};
  });
  const roundtrip = (content: string) =>
    testRoundtrip(content, state.main, state.fs);

  it('preserves codeblock content inside blockquote', async () =>
    roundtrip(`
      > \`\`\`
      > a
      > b
      > \`\`\`
      `));
});

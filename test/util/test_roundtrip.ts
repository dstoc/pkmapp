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

export async function testRoundtrip(
    content: string, main: Main, fs: FileSystem, removeWhitespace = false,
    expectedFailure?: string) {
  await fs.setFile('test.md', content);
  await main.runCommand('open', 'test');
  expect(await main.status('loaded', 'error')).toEqual('loaded');
  await main.runCommand('force save');
  await browser.waitUntil(main.isClean);
  const result = await fs.getFile('test.md');
  const resultv = removeWhitespace ? result.replace(/\s+/g, '') : result;
  const contentv = removeWhitespace ? content.replace(/\s+/g, '') : result;
  // Alternatively, remove leading/trailing whitespace, collapse
  // remanining to \n or ' '. But this only produces a handful of new
  // normalization failures. const resultv =
  // result.replace(/\s*\n\s*/gs, '\n').replace(/[ \t]+/g, ' '); const
  // contentv = content.replace(/\s*\n\s*/gs, '\n').replace(/[ \t]+/g,
  // ' ');
  if (expectedFailure !== undefined) {
    expect(resultv).not.toEqual(contentv);
    expect(result).toContain(expectedFailure);
  } else {
    if (resultv !== contentv) expect(resultv).toEqual(content);
  }
}

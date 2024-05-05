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

import {default as Parser} from 'web-tree-sitter';

await Parser.init({
  locateFile(path: string) {
    if (path == 'tree-sitter.wasm') {
      return new URL('../deps/tree-sitter.wasm', import.meta.url).href;
    }
    throw new Error(`unknown resource: ${path}`);
  },
});
const inline = await Parser.Language.load(
  new URL('../deps/tree-sitter-markdown_inline.wasm', import.meta.url).href,
);
export const parser = new Parser();
parser.setLanguage(inline);

export function* dfs(node: Parser.SyntaxNode) {
  function next(next: Parser.SyntaxNode | null) {
    return next && (node = next);
  }
  do {
    yield node;
    if (next(node.firstChild)) continue;
    if (next(node.nextSibling)) continue;
    do {
      if (!next(node.parent)) return;
    } while (!next(node.nextSibling));
  } while (true);
}

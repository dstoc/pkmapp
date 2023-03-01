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
import Parser from '../deps/tree-sitter.js';
import { resolve } from '../resolve.js';
await Parser.init({
    locateFile(path) {
        return resolve(`./deps/${path}`);
    }
});
const inline = await Parser.Language.load(resolve('./deps/tree-sitter-markdown_inline.wasm'));
export const parser = new Parser();
parser.setLanguage(inline);
export function* dfs(node) {
    function next(next) {
        return next && (node = next);
    }
    do {
        yield node;
        if (next(node.firstChild))
            continue;
        if (next(node.nextSibling))
            continue;
        do {
            if (!next(node.parent))
                return;
        } while (!next(node.nextSibling));
    } while (true);
}
//# sourceMappingURL=inline-parser.js.map
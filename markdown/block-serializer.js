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
function* always(s) {
    while (true) {
        yield s;
    }
}
function* onceThenWhitespace(s) {
    const ws = s.replace(/./, ' ');
    yield s;
    while (true) {
        yield ws;
    }
}
function serializeBlocks(blocks, indents, result, separator) {
    let first = true;
    for (const block of blocks) {
        if (!first && separator.length) {
            for (const indent of indents) {
                result.push(indent.next().value);
            }
            result.push(separator(block));
        }
        first = false;
        serialize(block, indents, result);
    }
}
function serialize(node, indents, result) {
    function indent() {
        for (const indent of indents) {
            result.push(indent.next().value);
        }
    }
    let separator = (node) => '\n';
    const emptySeparator = () => '';
    if (node.type === 'list') {
        separator = emptySeparator;
    }
    if (node.type === 'list-item') {
        indents = [...indents, onceThenWhitespace(node.marker)];
        separator = (node) => {
            if (node.type === 'list-item')
                return '';
            return '\n';
        };
    }
    else if (node.type === 'block-quote') {
        indents = [...indents, always(node.marker)];
    }
    else if (node.type === 'paragraph') {
        indent();
        result.push(node.content);
        result.push('\n');
    }
    else if (node.type === 'heading') {
        indent();
        result.push(node.marker);
        result.push(node.content);
        result.push('\n');
    }
    else if (node.type === 'code-block') {
        indent();
        result.push('```');
        if (node.info !== null) {
            result.push(node.info);
        }
        result.push('\n');
        for (const line of node.content.trimEnd().split('\n')) {
            indent();
            result.push(line);
            result.push('\n');
        }
        indent();
        result.push('```\n');
    }
    serializeBlocks(node.children || [], indents, result, separator);
}
export function serializeToString(node) {
    const result = [];
    serialize(node, [], result);
    return result.join('');
}
//# sourceMappingURL=block-serializer.js.map
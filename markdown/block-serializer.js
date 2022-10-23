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
    const ws = s.replace(/./g, ' ');
    yield s;
    while (true) {
        yield ws;
    }
}
function separator(prev, next) {
    if (prev.type === 'heading')
        return '';
    if (next.type === 'list-item')
        return '';
    if (prev.type === 'paragraph' && next.type === 'list')
        return '';
    return '\n';
}
function serializeBlocks(blocks, indents, result) {
    let prev;
    for (const block of blocks) {
        if (prev) {
            const nextSeparator = separator(prev, block);
            if (nextSeparator !== '') {
                for (const indent of indents) {
                    result.push(indent.next().value);
                }
            }
            result.push(nextSeparator);
        }
        prev = block;
        serialize(block, indents, result);
    }
}
function serialize(node, indents, result) {
    function indent() {
        for (const indent of indents) {
            result.push(indent.next().value);
        }
    }
    if (node.type === 'list-item') {
        indents = [...indents, onceThenWhitespace(node.marker)];
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
        result.push(' ');
        result.push(node.content.trimStart());
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
    else if (node.type === 'unsupported') {
        for (const line of node.content.trimEnd().split('\n')) {
            indent();
            result.push(line);
            result.push('\n');
        }
    }
    serializeBlocks(node.children || [], indents, result);
}
export function serializeToString(node) {
    const result = [];
    serialize(node, [], result);
    return result.join('');
}
//# sourceMappingURL=block-serializer.js.map
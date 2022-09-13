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
await Parser.init();
const blocks = await Parser.Language.load('tree-sitter-markdown.wasm');
const parser = new Parser();
parser.setLanguage(blocks);
export function parseBlocks(markdown) {
    const tree = parser.parse(markdown);
    return convertNode(tree.rootNode);
}
function* convertNodes(nodes) {
    for (const node of nodes) {
        const result = convertNode(node);
        if (result)
            yield result;
    }
}
const emptyParagraph = {
    type: 'paragraph',
    content: '',
};
const emptySection = {
    type: 'section',
    children: [emptyParagraph],
};
function ensureContent(children, result = [emptyParagraph]) {
    if (children.length)
        return children;
    return result;
}
function convertNode(node) {
    switch (node.type) {
        case 'document':
            return {
                type: 'document',
                children: ensureContent([...convertNodes(node.namedChildren)], [emptySection]),
            };
        case 'section':
            return {
                type: 'section',
                children: ensureContent([...convertNodes(node.namedChildren)]),
            };
        case 'paragraph':
            return {
                type: 'paragraph',
                content: node.firstChild.text,
            };
        case 'list':
            return {
                type: 'list',
                children: [...convertNodes(node.namedChildren)],
            };
        case 'list_item': {
            const children = node.namedChildren;
            const marker = children[0].text;
            return {
                type: 'list-item',
                marker,
                children: ensureContent([...convertNodes(children)]),
            };
        }
        case 'block_quote': {
            const children = node.namedChildren;
            const marker = children[0].text;
            return {
                type: 'block-quote',
                marker,
                children: ensureContent([...convertNodes(children)]),
            };
        }
        case 'fenced_code_block': {
            const children = node.namedChildren;
            const info = children.find(node => node.type === 'info_string');
            const content = children.find(node => node.type === 'code_fence_content');
            return {
                type: 'code-block',
                info: info?.text ?? null,
                content: content?.text.trimEnd() ?? '',
            };
        }
        case 'atx_heading': {
            const children = node.namedChildren;
            const marker = children[0].text;
            const content = children[1]?.text ?? '';
            return {
                type: 'heading',
                marker,
                content,
            };
        }
        case 'block_continuation':
        case 'list_marker_star':
        case 'list_marker_minus':
        case 'block_quote_marker':
            return undefined;
        default:
            console.error(node.type);
            return undefined;
    }
}
//# sourceMappingURL=block-parser.js.map
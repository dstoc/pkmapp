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
function ensureContent(children, result = [{ ...emptyParagraph }]) {
    if (children.length)
        return children;
    return result;
}
function convertNode(node) {
    switch (node.type) {
        case 'document': {
            let children = node.namedChildren;
            const section = children[0];
            if (section?.type === 'section') {
                const sectionChildren = section.namedChildren;
                if (!sectionChildren.length) {
                    children = children.slice(1);
                }
                else if (sectionChildren[0].type !== 'atx_heading') {
                    children = [
                        ...sectionChildren,
                        ...children.slice(1),
                    ];
                }
            }
            return {
                type: 'document',
                children: ensureContent([...convertNodes(children)], [{ ...emptyParagraph }]),
            };
        }
        case 'section': {
            const children = node.namedChildren;
            const heading = children[0];
            const marker = heading.children[0].text;
            const content = heading.children[1]?.text.trimStart() ?? '';
            return {
                type: 'section',
                marker,
                content,
                children: [...convertNodes(node.namedChildren)],
            };
        }
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
            let marker = children[0].text;
            if (!marker.endsWith(' ')) {
                marker += ' ';
            }
            let checked;
            if (children[1]?.type === 'task_list_marker_unchecked')
                checked = false;
            if (children[1]?.type === 'task_list_marker_checked')
                checked = true;
            return {
                type: 'list-item',
                marker,
                checked,
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
            const info = children.find((node) => node.type === 'info_string');
            const content = children.find((node) => node.type === 'code_fence_content');
            const offset = content?.startPosition.column ?? 0;
            const prefix = new RegExp(`(?<=\n).{${offset}}`, 'g');
            return {
                type: 'code-block',
                info: info?.text ?? null,
                content: content?.text.replace(prefix, '').trimEnd() ?? '',
            };
        }
        case 'atx_heading':
        case 'block_continuation':
        case 'list_marker_star':
        case 'list_marker_minus':
        case 'list_marker_dot':
        case 'list_marker_parenthesis':
        case 'list_marker_plus':
        case 'block_quote_marker':
        case 'task_list_marker_unchecked':
        case 'task_list_marker_checked':
            return undefined;
        case 'setext_heading':
        case 'thematic_break':
        case 'indented_code_block':
        case 'html_block':
        case 'minus_metadata':
        case 'link_reference_definition':
        case 'pipe_table':
            return {
                type: 'unsupported',
                content: node.text,
                parser_type: node.type,
            };
        default:
            console.error(node.type);
            return undefined;
    }
}
//# sourceMappingURL=block-parser.js.map
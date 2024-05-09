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

import Parser from 'web-tree-sitter';
import type {MarkdownNode, ParagraphNode} from './node.js';
import {assert, cast} from '../asserts.js';

await Parser.init({
  locateFile(path: string) {
    if (path == 'tree-sitter.wasm') {
      return new URL('../deps/tree-sitter.wasm', import.meta.url).href;
    }
    throw new Error(`unknown resource: ${path}`);
  },
});
const blocks = await Parser.Language.load(
  new URL('../deps/tree-sitter-markdown.wasm', import.meta.url).href,
);
const parser = new Parser();
parser.setLanguage(blocks);

export type Tree = Parser.Tree;

export function parseBlocks(
  markdown: string,
  tree?: Parser.Tree,
  edit?: Parser.Edit,
) {
  if (tree) {
    tree.edit(cast(edit));
  }
  tree = parser.parse(markdown);
  const node = cast(convertNode(tree.rootNode));
  assert(node.type === 'document');
  return {node, tree};
}

function* convertNodes(
  nodes: Parser.SyntaxNode[],
): IterableIterator<MarkdownNode> {
  for (const node of nodes) {
    const result = convertNode(node);
    if (result) yield result;
  }
}

const emptyParagraph: ParagraphNode = {
  type: 'paragraph',
  content: '',
};

function ensureContent(
  children: MarkdownNode[],
  result: MarkdownNode[] = [{...emptyParagraph}],
): MarkdownNode[] {
  if (children.length) return children;
  return result;
}

function extractFrontMatter(text?: string) {
  if (text === undefined) return undefined;
  return text.match(/^---\s*(.*)\n---[\s\n]*$/)?.[1];
}

function convertNode(node: Parser.SyntaxNode): MarkdownNode | undefined {
  switch (node.type) {
    case 'document': {
      let children = node.namedChildren;
      let childIndex = 0;
      const metadata =
        children.length && children[0].type === 'minus_metadata'
          ? children[0]
          : undefined;
      if (metadata) childIndex++;
      const section = children[childIndex];
      if (section?.type === 'section') {
        const sectionChildren = section.namedChildren;
        if (!sectionChildren.length) {
          // TODO: do we need to check the next section too?
          // assert(node.previousSibling!.type === 'minus_metadata');
          children = children.slice(childIndex + 1);
        } else if (sectionChildren[0].type !== 'atx_heading') {
          // TODO: What is this case?
          children = [...sectionChildren, ...children.slice(childIndex + 1)];
        }
      }
      return {
        type: 'document',
        metadata: extractFrontMatter(metadata?.text),
        children: ensureContent(
          [...convertNodes(children)],
          [{...emptyParagraph}],
        ),
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
        content: node.firstChild!.text,
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
      let checked: boolean | undefined;
      if (children[1]?.type === 'task_list_marker_unchecked') checked = false;
      if (children[1]?.type === 'task_list_marker_checked') checked = true;
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
      const content = children.find(
        (node) => node.type === 'code_fence_content',
      );
      const offset = content?.startPosition.column ?? 0;
      const prefix = new RegExp(`(?<=\n).{${offset}}`, 'g');
      return {
        type: 'code-block',
        info: info?.text ?? null,
        content: content?.text.replace(prefix, '').trimEnd() ?? '',
      };
    }
    case 'minus_metadata':
      // handled in 'document'
      assert(false);
    // eslint-disable-next-line no-fallthrough
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

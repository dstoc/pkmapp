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

import {assert} from '../asserts.js';

import {MarkdownNode} from './node.js';

function* always(s: string): IndentGenerator {
  while (true) {
    yield s;
  }
}

function* onceThenWhitespace(s: string): IndentGenerator {
  const ws = s.replace(/./g, ' ');
  yield s;
  while (true) {
    yield ws;
  }
}

function* onceThenNothing(s: string): IndentGenerator {
  yield s;
  while (true) {
    yield '';
  }
}

type IndentGenerator = Generator<string, string, unknown>;
type Indents = Generator<string, string, unknown>[];

function separator(prev: MarkdownNode, next: MarkdownNode): string {
  if (next.type === 'list-item') return '';
  if (prev.type === 'paragraph' && next.type === 'list') return '';
  return '\n';
}

function serializeBlocks(
  blocks: MarkdownNode[],
  indents: Indents,
  result: string[],
  predicate?: (node: MarkdownNode) => boolean,
) {
  let prev: MarkdownNode | undefined;
  let serializedContent = false;
  for (const block of blocks) {
    const preResultLength = result.length;
    if (prev) {
      const nextSeparator = separator(prev, block);
      if (nextSeparator !== '') {
        for (const indent of indents) {
          result.push(indent.next().value);
        }
      }
      result.push(nextSeparator);
    }
    if (serialize(block, indents, result, predicate)) {
      prev = block;
      serializedContent = true;
    } else {
      while (result.length > preResultLength) {
        result.pop();
      }
    }
  }
  return serializedContent;
}

export function getPrefix(node: MarkdownNode): string {
  switch (node.type) {
    case 'document':
    case 'list':
    case 'paragraph':
      return '';
    case 'list-item':
      // TODO: whitespace should not be part of the marker.
      return node.marker;
    case 'block-quote':
      // TODO: whitespace should not be part of the marker.
      return node.marker;
    case 'section':
      return node.marker + ' ';
    case 'code-block':
      return '```' + (node.info ?? '');
    default:
      // TODO: assert unreachable
      assert(false);
  }
}

function serialize(
  node: MarkdownNode,
  indents: Indents,
  result: string[],
  predicate?: (node: MarkdownNode) => boolean,
) {
  function indent() {
    for (const indent of indents) {
      result.push(indent.next().value);
    }
  }

  const shouldSerializeNodeContent = !predicate || predicate(node);
  switch (node.type) {
    case 'document':
    case 'list':
      assert(node.children?.length);
      break;
    case 'section':
      indent();
      if (shouldSerializeNodeContent) {
        result.push(node.marker);
        result.push(' ');
        result.push(node.content.trimStart());
      }
      result.push('\n');
      break;
    case 'list-item':
      assert(node.children?.length);
      indents = [...indents, onceThenWhitespace(node.marker)];
      if (node.checked === true) indents.push(onceThenNothing('[x] '));
      if (node.checked === false) indents.push(onceThenNothing('[ ] '));
      break;
    case 'block-quote':
      assert(node.children?.length);
      indents = [...indents, always(node.marker)];
      break;
    case 'paragraph':
      indent();
      if (shouldSerializeNodeContent) {
        result.push(node.content);
      }
      result.push('\n');
      break;
    case 'code-block':
      indent();
      if (shouldSerializeNodeContent) {
        const maxBackticks = Math.max(
          2,
          ...(node.content.match(/`+/g)?.map((result) => result.length) ?? [0]),
        );
        const marker = '`'.repeat(maxBackticks + 1);
        result.push(marker);
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
        result.push(marker);
      }
      result.push('\n');
      break;
    default:
      // TODO: assert not reached?
      assert(false);
  }
  const serializedChild = serializeBlocks(
    node.children ?? [],
    indents,
    result,
    predicate,
  );
  return shouldSerializeNodeContent || serializedChild;
}

export function serializeToString(
  node: MarkdownNode,
  predicate?: (node: MarkdownNode) => boolean,
  prefix?: string,
): string {
  const result: string[] = [];
  serialize(node, prefix ? [always(prefix)] : [], result, predicate);
  return result.join('');
}

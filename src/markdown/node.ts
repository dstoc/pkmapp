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

export type MarkdownNode =
  | ParagraphNode
  | CodeBlockNode
  | SectionNode
  | DocumentNode
  | ListNode
  | BlockQuoteNode
  | ListItemNode
  | SectionNode
  | UnsupportedNode;
export type InlineNode = ParagraphNode | CodeBlockNode | SectionNode;
export type ParentNode =
  | DocumentNode
  | ListNode
  | BlockQuoteNode
  | ListItemNode
  | SectionNode;

export function isInlineNode(node: MarkdownNode): node is InlineNode {
  switch (node.type) {
    case 'paragraph':
    case 'code-block':
    case 'section':
      return true;
    default:
      return false;
  }
}

// TODO: ID, Sequence Number (per tree?)
interface Node {
  readonly children?: MarkdownNode[];
  readonly type:
    | 'document'
    | 'list'
    | 'section'
    | 'paragraph'
    | 'block-quote'
    | 'list-item'
    | 'code-block'
    | 'unsupported';
}

export interface DocumentNode extends Node {
  readonly type: 'document';
  readonly metadata?: string;
}

export interface ListNode extends Node {
  readonly type: 'list';
}

export interface SectionNode extends Node {
  readonly type: 'section';
  readonly marker: string;
  readonly content: string;
}

export interface ParagraphNode extends Node {
  readonly type: 'paragraph';
  readonly content: string;
}

export interface BlockQuoteNode extends Node {
  readonly type: 'block-quote';
  readonly marker: string;
}

export interface ListItemNode extends Node {
  readonly type: 'list-item';
  readonly marker: string;
  readonly checked?: boolean;
}

export interface CodeBlockNode extends Node {
  readonly type: 'code-block';
  readonly info: string | null;
  readonly content: string;
}

export interface UnsupportedNode extends Node {
  readonly type: 'unsupported';
  readonly content: string;
  readonly parser_type: string;
}

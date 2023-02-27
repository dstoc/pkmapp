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

export type MarkdownNode = DocumentNode|ListNode|ParagraphNode|BlockQuoteNode|
    ListItemNode|SectionNode|CodeBlockNode|UnsupportedNode;
export type InlineNode = ParagraphNode|CodeBlockNode|SectionNode;
export type ParentNode = DocumentNode|ListNode|BlockQuoteNode|ListItemNode|SectionNode;

// TODO: ID, Sequence Number (per tree?)
interface Node {
  readonly children?: MarkdownNode[];
}

export type DocumentNode = Node&{
  readonly type: 'document';
}

export type ListNode = Node&{
  readonly type: 'list';
}

export type SectionNode = Node&{
  readonly type: 'section';
  readonly marker: string;
  readonly content: string;
};

export type ParagraphNode = Node&{
  readonly type: 'paragraph';
  readonly content: string;
};

export type BlockQuoteNode = Node&{
  readonly type: 'block-quote';
  readonly marker: string;
};

export type ListItemNode = Node&{
  readonly type: 'list-item';
  readonly marker: string;
  readonly checked?: boolean;
};

export type CodeBlockNode = Node&{
  readonly type: 'code-block';
  readonly info: string|null;
  readonly content: string;
};

export type UnsupportedNode = Node&{
  readonly type: 'unsupported';
  readonly content: string;
  readonly parser_type: string;
};

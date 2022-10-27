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

export type MarkdownNode =|ContainerNode|ParagraphNode|MarkedNode|HeadingNode|
    CodeBlockNode|UnsupportedNode;
export type InlineNode = ParagraphNode|CodeBlockNode|HeadingNode;
export type ParentNode = ContainerNode|MarkedNode;

// TODO: ID, Sequence Number (per tree?)
interface Node {
  children?: MarkdownNode[];
}

export type ContainerNode = Node&{
  type: 'document'|'list'|'section';
};

export type ParagraphNode = Node&{
  type: 'paragraph';
  content: string;
};

export type MarkedNode = Node&{
  type: 'list-item'|'block-quote';
  marker: string;
};

export type HeadingNode = Node&{
  type: 'heading';
  marker: string;
  content: string;
};

export type CodeBlockNode = Node&{
  type: 'code-block';
  info: string|null;
  content: string;
};

export type UnsupportedNode = Node&{
  type: 'unsupported';
  content: string;
};

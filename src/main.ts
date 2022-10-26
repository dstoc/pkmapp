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

import './markdown/block-render.js';

import {assert, cast} from './asserts.js';
import {contextProvider} from './deps/lit-labs-context.js';
import {customElement, html, LitElement, property, query, render,} from './deps/lit.js';
import {parseBlocks} from './markdown/block-parser.js';
import {MarkdownRenderer} from './markdown/block-render.js';
import {serializeToString} from './markdown/block-serializer.js';
import {hostContext, HostContext} from './markdown/host-context.js';
import {InlineInput, InlineKeyDown, InlineLinkClick,} from './markdown/inline-render.js';
import {InlineNode, ParagraphNode} from './markdown/node.js';
import {InlineViewModel, MarkdownTree, ViewModelNode} from './markdown/view-model.js';

@customElement('test-host')
export class TestHost extends LitElement {
  @query('md-block-render') blockRender!: MarkdownRenderer;
  @query('input') fileInput!: HTMLInputElement;
  @property({type: String, reflect: true}) status: 'loading'|'loaded'|'error'|undefined;
  @property({type: Boolean, reflect: true}) dirty = false;
  @property({attribute: false}) tree: MarkdownTree|undefined;
  @property({attribute: false}) directory?: FileSystemDirectoryHandle;
  @contextProvider({context: hostContext})
  @property({reflect: false})
  hostContext: HostContext = {};
  override render() {
    if (!this.directory) {
      return html`
        <button id=opendir @click=${this.ensureDirectory}>
          Open directory...
        </button>
      `;
    }
    return html`
    <input type=text value="test.md"></input>
    <button id=load @click=${this.load}>Load</button>
    <button id=save @click=${this.markDirty}>Save</button>
    <br>
    <md-block-render
      .block=${this.tree?.root}
      @inline-input=${this.onInlineInput}
      @inline-link-click=${this.onInlineLinkClick}
      @inline-keydown=${this.onInlineKeyDown}></md-block-render>`;
  }
  async ensureDirectory() {
    if (!this.directory) {
      this.directory = await showDirectoryPicker({mode: 'readwrite'});
    }
    return this.directory;
  }
  async load() {
    this.status = 'loading';
    this.tree = undefined;
    const directory = await this.ensureDirectory();
    const fileName = this.fileInput.value;
    let text = '';
    try {
      const handle = await directory.getFileHandle(fileName);
      const file = await handle.getFile();
      const decoder = new TextDecoder();
      text = decoder.decode(await file.arrayBuffer());
    } catch (e) {
      console.warn(e);
    }

    try {
      const node = parseBlocks(text);
      if (node) this.tree = new MarkdownTree(node);
      this.tree?.observe.add(() => this.markDirty());
      this.status = 'loaded';
    } catch (e) {
      this.status = 'error';
      // TODO: store this somewhere?
      // throw e;
    }
  }

  private pendingModifications = 0;
  async markDirty() {
    this.dirty = true;
    if (this.pendingModifications++) return;
    while (this.pendingModifications) {
      this.pendingModifications = await 0;
      await this.save();
    }
    this.dirty = false;
  }
  private async save() {
    if (!this.tree) return;
    const text = serializeToString(this.tree.root);
    const directory = await this.ensureDirectory();
    const fileName = this.fileInput.value;
    const handle = await directory.getFileHandle(fileName, {create: true});
    const stream = await handle.createWritable();
    await stream.write(text);
    await stream.close();
  }
  onInlineLinkClick({
    detail: {type, destination},
  }: CustomEvent<InlineLinkClick>) {
    this.fileInput.value = destination + '.md';
    this.load();
  }
  onInlineKeyDown({
    detail: {inline, node, keyboardEvent},
  }: CustomEvent<InlineKeyDown>) {
    if (!inline.node) return;
    if (keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      const result = inline.moveCaretUp();
      if (result !== true) {
        const prev = findPreviousDfs(
            node,
            ({type}) => ['paragraph', 'code-block', 'heading'].includes(type));
        if (prev) focusNode(this.hostContext, prev, -result);
      }
    } else if (keyboardEvent.key === 'ArrowDown') {
      keyboardEvent.preventDefault();
      const result = inline.moveCaretDown();
      if (result !== true) {
        const next = findNextDfs(
            node,
            ({type}) => ['paragraph', 'code-block', 'heading'].includes(type));
        if (next) focusNode(this.hostContext, next, -result);
      }
    } else if (keyboardEvent.key === 'Tab') {
      keyboardEvent.preventDefault();
      const {start} = inline.getSelection();
      focusNode(this.hostContext, node, start.index);
      if (keyboardEvent.shiftKey) {
        unindent(node);
      } else {
        indent(node);
      }
    } else {
      return;
    }
    normalizeTree(node.viewModel.tree);
  }
  onInlineInput(event: CustomEvent<InlineInput>) {
    const {
    detail: {inline, inputEvent, inputStart, inputEnd},
  } = event;
    if (!inline.node) return;
    if (handleInlineInputAsBlockEdit(event, this.hostContext)) {
      normalizeTree(inline.node.viewModel.tree);
      return;
    }
    let newText;
    let startIndex;
    let oldEndIndex;
    let newEndIndex: number;
    if (inputEvent.inputType === 'insertText' ||
        inputEvent.inputType === 'insertReplacementText' ||
        inputEvent.inputType === 'insertFromPaste' ||
        inputEvent.inputType === 'deleteByCut' ||
        inputEvent.inputType === 'deleteContentBackward') {
      startIndex = inputStart.index;
      oldEndIndex = inputEnd.index;
      if (inputEvent.inputType === 'insertReplacementText' ||
          inputEvent.inputType === 'insertFromPaste') {
        newText = inputEvent.dataTransfer!.getData('text');
      } else if (inputEvent.inputType === 'deleteByCut') {
        newText = '';
      } else if (inputEvent.inputType === 'deleteContentBackward') {
        newText = '';
        startIndex = Math.max(0, startIndex - 1);
      } else {
        newText = inputEvent.data ?? '';
      }
      newEndIndex = startIndex + newText.length;
    } else {
      console.log('unsupported inputType:', inputEvent.inputType);
      return;
    }

    const edit = {
      newText,
      startIndex,
      oldEndIndex,
      newEndIndex,
    };

    inline.node.viewModel.edit(edit);
    // TODO: fix focus when edit mutates blocks
    this.hostContext.focusNode = inline.node;
    this.hostContext.focusOffset = newEndIndex;
  }
}

function maybeMergeContentInto(
    node: InlineNode&ViewModelNode, target: ViewModelNode,
    context: HostContext): boolean {
  if (target.type === 'code-block' || target.type === 'paragraph' ||
      target.type === 'heading') {
    focusNode(context, target, target.content.length);
    (target.viewModel as InlineViewModel).edit({
      startIndex: target.content.length,
      oldEndIndex: target.content.length,
      newEndIndex: target.content.length + node.content.length,
      newText: node.content,
    });
    let parent = node.viewModel.parent;
    node.viewModel.remove();
    cleanupNode(parent);
    return true;
  }
  return false;
}

function cleanupNode(node?: ViewModelNode) {
  if (!node) return;
  if (node.type === 'block-quote' || node.type === 'heading' ||
      node.type === 'paragraph') {
    return;
  }
  while (node?.children?.length === 0) {
    const toRemove = node;
    node = node.viewModel.parent;
    toRemove.viewModel.remove();
  }
}

function focusNode(context: HostContext, node: ViewModelNode, offset?: number) {
  context.focusNode = node;
  context.focusOffset = offset;
  node.viewModel.observe.notify();
}

function swapNodes(node1: ViewModelNode, node2: ViewModelNode) {
  const node1Parent = node1.viewModel.parent!;
  const node1NextSibling = node1.viewModel.nextSibling;
  node1.viewModel.insertBefore(cast(node2.viewModel.parent), node2);
  node2.viewModel.insertBefore(node1Parent, node1NextSibling);
}

function* ancestors(node: ViewModelNode) {
  while (node.viewModel.parent) {
    yield node.viewModel.parent;
    node = node.viewModel.parent;
  }
}

function* reverseDfs(node: ViewModelNode, limit?: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && (node = next);
  }
  do {
    while (next(node.viewModel.previousSibling)) {
      while (next(node.viewModel.lastChild))
        ;
      yield node;
      if (node === limit) return;
    }
    if (next(node.viewModel.parent)) {
      yield node;
      if (node === limit) return;
      continue;
    }
    return;
  } while (true);
}

function* dfs(node: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && (node = next);
  }
  let parent = false;
  do {
    if (!parent) {
      let moved = false;
      while (next(node.viewModel.firstChild)) moved = true;
      if (moved) {
        yield node;
        continue;
      }
    }

    if (next(node.viewModel.nextSibling)) {
      parent = false;
      if (!node.viewModel.firstChild) {
        yield node;
      }
      continue;
    }

    if (next(node.viewModel.parent)) {
      yield node;
      parent = true;
      continue;
    }
    return;
  } while (true);
}

function findAncestor(node: ViewModelNode, type: string) {
  const path = [node];
  for (const ancestor of ancestors(node)) {
    if (ancestor.type === type)
      return {
        ancestor,
        path,
      };
    path.unshift(ancestor);
  }
  return {};
}

function unindent(node: ViewModelNode) {
  const {ancestor: listItem, path} = findAncestor(node, 'list-item');
  if (!listItem || !path) return;
  const target = path[0];
  const nextSibling = listItem.viewModel.nextSibling;
  const list = listItem.viewModel.parent!;
  const targetListItemSibling = list.viewModel.parent!;
  if (targetListItemSibling?.type === 'list-item') {
    listItem.viewModel.insertBefore(
        cast(targetListItemSibling.viewModel.parent),
        targetListItemSibling.viewModel.nextSibling);
  } else {
    target.viewModel.insertBefore(
        cast(list.viewModel.parent), list.viewModel.nextSibling);
    listItem.viewModel.remove();
  }
  // Siblings of the undended list-item move to sublist.
  if (nextSibling) {
    let next: ViewModelNode|undefined = nextSibling;
    while (next) {
      if (listItem.viewModel.lastChild?.type !== 'list') {
        listItem.viewModel.tree
            .import({
              type: 'list',
            })
            .viewModel.insertBefore(listItem);
      }
      const targetList = listItem.viewModel.lastChild!;
      const toMove: ViewModelNode = next;
      next = toMove.viewModel.nextSibling;
      toMove.viewModel.insertBefore(targetList);
    }
  }
  // The target might have been removed from the list item. Move any
  // remaining siblings to the same level.
  if (listItem.children?.length && !listItem.viewModel.parent) {
    // TODO: move more than the first child.
    listItem.viewModel.firstChild?.viewModel.insertBefore(
        cast(target.viewModel.parent), target.viewModel.nextSibling);
  }
  if (!list.children?.length) {
    list.viewModel.remove();
  }
}

function indent(node: ViewModelNode) {
  let target = node;
  for (const ancestor of ancestors(node)) {
    if (ancestor.type === 'list-item') {
      break;
    }
    // Don't indent a section at the top level, unless we are inside a heading.
    if (ancestor.type === 'section' &&
        ancestor.viewModel.parent!.type == 'document') {
      if (target.type === 'heading') {
        target = ancestor;
      }
      break;
    }
    target = ancestor;
  }
  let listItem: ViewModelNode;
  if (target.viewModel.parent!.type === 'list-item') {
    listItem = target.viewModel.parent!;
  } else {
    listItem = target.viewModel.tree.import({
      type: 'list-item',
      marker: '* ',
    });
    listItem.viewModel.insertBefore(cast(target.viewModel.parent), target);
    target.viewModel.insertBefore(listItem);
  }
  const listItemPreviousSibling = listItem.viewModel.previousSibling;
  if (listItemPreviousSibling?.type === 'list-item') {
    const lastChild = listItemPreviousSibling.viewModel.lastChild;
    if (lastChild?.type === 'list') {
      listItem.viewModel.insertBefore(lastChild);
    } else {
      listItem.viewModel.insertBefore(listItemPreviousSibling);
    }
  } else if (listItemPreviousSibling?.type === 'list') {
    listItem.viewModel.insertBefore(listItemPreviousSibling);
  }
  // Ensure the list-item we may have created is in a list.
  if (listItem.viewModel.parent!.type !== 'list') {
    const list = target.viewModel.tree.import({
      type: 'list',
    });
    list.viewModel.insertBefore(cast(listItem.viewModel.parent), listItem);
    listItem.viewModel.insertBefore(list);
  }
}

function insertSiblingParagraph(
    node: InlineNode&ViewModelNode, startIndex: number, context: HostContext): boolean {
  const newParagraph = node.viewModel.tree.import({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(
      cast(node.viewModel.parent), node.viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function insertParagraphInList(
    node: InlineNode&ViewModelNode, startIndex: number, context: HostContext): boolean {
  const {ancestor, path} = findAncestor(node, 'list');
  if (!ancestor) return false;
  let targetList;
  let targetListItemNextSibling;
  if (node.viewModel.nextSibling) {
    if (node.viewModel.nextSibling.type === 'list') {
      targetList = node.viewModel.nextSibling;
      targetListItemNextSibling = targetList.viewModel.firstChild;
    } else {
      targetList = node.viewModel.tree.import({
        type: 'list',
      });
      targetList.viewModel.insertBefore(
          cast(node.viewModel.parent), node.viewModel.nextSibling);
      targetListItemNextSibling = undefined;
    }
  } else {
    targetList = ancestor;
    targetListItemNextSibling = path[0].viewModel.nextSibling;
  }

  const firstListItem = targetList.viewModel.firstChild;
  if (firstListItem && firstListItem.type !== 'list-item') return false;
  const newListItem = node.viewModel.tree.import({
    type: 'list-item',
    marker: firstListItem?.marker ?? '* ',
  });
  newListItem.viewModel.insertBefore(targetList, targetListItemNextSibling);
  const newParagraph = node.viewModel.tree.import({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(newListItem);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function insertParagraphInSection(
    node: InlineNode&ViewModelNode, startIndex: number, context: HostContext): boolean {
  const {ancestor: section, path} = findAncestor(node, 'section');
  if (!section) return false;
  const newParagraph = node.viewModel.tree.import({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function finishInsertParagraph(
  node: InlineNode&ViewModelNode, newParagraph: ParagraphNode&ViewModelNode, startIndex: number, context: HostContext) {
  const atStart = startIndex === 0;
  if (atStart) { swapNodes(node, newParagraph); }
  else {
    (newParagraph.viewModel as InlineViewModel).edit({
      startIndex: 0,
      newEndIndex: 0,
      oldEndIndex: 0,
      newText: node.content.substring(startIndex)
    });


    (node.viewModel as InlineViewModel).edit({
      startIndex,
      oldEndIndex: node.content.length,
      newEndIndex: startIndex,
      newText: '',
    });
  }
  focusNode(context, newParagraph);
}

function normalizeSection(node: ViewModelNode) {
  const isFirstDocumentSection = node.viewModel.parent?.type === 'document' &&
      node.viewModel.parent.viewModel.firstChild === node;
  let next = node.viewModel.firstChild;
  const sectionNextSibling = node.viewModel.nextSibling;
  let hasHeading = false;
  while (next) {
    const child = next;
    next = child.viewModel.nextSibling;
    if (child.type === 'heading') {
      if (hasHeading) {
        // Found a second heading, split out a new sibling section and move
        // all remaining children there.
        const newSection = node.viewModel.tree.import({type: 'section'});
        child.viewModel.insertBefore(newSection);
        while (next) {
          const child = next;
          next = child.viewModel.nextSibling;
          child.viewModel.insertBefore(newSection);
        }
        break;
      }
      hasHeading = true;
    } else if (child.type === 'section') {
      // Sections can't contain other sections.
      child.viewModel.insertBefore(
          cast(node.viewModel.parent), sectionNextSibling);
    } else if (isFirstDocumentSection) {
      // First document section only optionally requires a heading.
      hasHeading = true;
    } else if (!hasHeading) {
      child.viewModel.insertBefore(
          cast(node.viewModel.parent), sectionNextSibling);
    }
  }
  if (hasHeading) {
    return true;
  }
  // The section did not have a heading, the children have been removed.
  node.viewModel.remove();
  return false;
}

function findNextDfs(
    node: ViewModelNode, predicate: (node: ViewModelNode) => boolean) {
  for (const next of dfs(node)) {
    if (next !== node && predicate(next)) return next;
  }
  return null;
}

function findPreviousDfs(
    node: ViewModelNode, predicate: (node: ViewModelNode) => boolean) {
  for (const next of reverseDfs(node)) {
    if (next !== node && predicate(next)) return next;
  }
  return null;
}

function findChild(
    node: ViewModelNode, predicate: (node: ViewModelNode) => boolean) {
  let next = node.viewModel.firstChild;
  while (next) {
    if (next && predicate(next)) return next;
    next = next.viewModel.nextSibling;
  }
  return null;
}

function* children(node: ViewModelNode) {
  let next = node.viewModel.firstChild;
  while (next) {
    yield next;
    next = next.viewModel.nextSibling;
  }
}

function normalizeSections(node: ViewModelNode) {
  let section: ViewModelNode|null;
  do {
    section = findChild(node, ({type}) => type === 'section');
    if (!section) return;
  } while (!normalizeSection(section));
  while (section && section.viewModel.nextSibling) {
    const node: ViewModelNode = section.viewModel.nextSibling;
    if (node.type === 'section') {
      if (normalizeSection(node)) section = node;
    } else if (node.type === 'heading') {
      // Create and advance to a new section to hold the heading.
      section = node.viewModel.tree.import({
        type: 'section',
      });
      assert(section);
      section.viewModel.insertBefore(cast(node.viewModel.parent), node);
      node.viewModel.insertBefore(section);
    } else {
      node.viewModel.insertBefore(section);
    }
  }
}

function normalizeTree(tree: MarkdownTree) {
  const document = tree.root;
  // ensure first child is a section
  if (document.viewModel.firstChild?.type !== 'section') {
    const section = tree.import({
      type: 'section',
    });
    section.viewModel.insertBefore(document, document.viewModel.firstChild);
  }
  for (const node of dfs(tree.root)) {
    normalizeSections(node);
  }
  for (const node of dfs(tree.root)) {
    if (node.type === 'list') {
      while (node.viewModel.nextSibling?.type === 'list') {
        let next = node.viewModel.nextSibling;
        while (next.viewModel.firstChild) {
          next.viewModel.firstChild.viewModel.insertBefore(node);
        }
        next.viewModel.remove();
      }
    }
  }
}

function handleInlineInputAsBlockEdit({
  detail: {inline, inputEvent, inputStart, inputEnd},
}: CustomEvent<InlineInput>, context: HostContext): boolean {
  // TODO: Call normalizeTree at the right times
  if (!inline.node) return false;
  if (inputEvent.inputType === 'deleteContentBackward') {
    if (inputStart.index !== 0 || inputEnd.index !== 0) return false;
    const node = inline.node;
    // Turn headings and code-blocks into paragraphs.
    if (node.type === 'heading' || node.type === 'code-block') {
      const paragraph = node.viewModel.tree.import({
        type: 'paragraph',
        content: node.content,  // TODO: detect new blocks
      });
      paragraph.viewModel.insertBefore(cast(node.viewModel.parent), node);
      node.viewModel.remove();
      focusNode(context, paragraph, 0);
      return true;
    }

    // Remove a surrounding block-quote.
    const {ancestor} = findAncestor(node, 'block-quote');
    if (ancestor) {
      // Unless there's an earlier opportunity to merge into a previous
      // content node.
      for (const prev of reverseDfs(node, ancestor)) {
        if (maybeMergeContentInto(node, prev, context)) return true;
      }
      for (const child of [...children(ancestor)]) {
        child.viewModel.insertBefore(
            cast(ancestor.viewModel.parent), ancestor);
      }
      ancestor.viewModel.remove();
      focusNode(context, node);
      return true;
    }

    // Merge into a previous content node.
    for (const prev of reverseDfs(node)) {
      if (maybeMergeContentInto(node, prev, context)) return true;
    }
  } else if (inputEvent.inputType === 'insertParagraph') {
    return insertParagraphInList(
            inline.node, inputStart.index, context) || insertParagraphInSection(
            inline.node, inputStart.index, context);
  } else if (inputEvent.inputType === 'insertLineBreak') {
    return insertSiblingParagraph(
            inline.node, inputStart.index, context);
  }
  return false;
}

render(html`<test-host></test-host>`, document.body);

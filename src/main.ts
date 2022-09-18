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

import {
  html,
  render,
  LitElement,
  customElement,
  property,
  query,
} from './deps/lit.js';
import {MarkdownRenderer} from './markdown/block-render.js';
import {
  InlineInput,
  InlineKeyDown,
  InlineLinkClick,
} from './markdown/inline-render.js';
import './markdown/block-render.js';
import {MarkdownTree, ViewModelNode} from './markdown/view-model.js';
import {parseBlocks} from './markdown/block-parser.js';
import {serializeToString} from './markdown/block-serializer.js';
import {contextProvider} from './deps/lit-labs-context.js';
import {hostContext, HostContext} from './markdown/host-context.js';

function debounce(f: () => void) {
  let scheduled = false;
  return async () => {
    if (scheduled) return;
    scheduled = true;
    scheduled = await false;
    f();
  };
}

@customElement('test-host')
export class TestHost extends LitElement {
  @query('md-block-render') blockRender!: MarkdownRenderer;
  @query('input') fileInput!: HTMLInputElement;
  @property({type: Object, reflect: false}) tree: MarkdownTree | undefined;
  directory?: FileSystemDirectoryHandle;
  @contextProvider({context: hostContext})
  @property({reflect: false})
  hostContext: HostContext = {};
  override render() {
    return html`
    <input type=text></input>
    <button @click=${this.load}>Load</button>
    <button @click=${this.save}>Save</button>
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

    const node = parseBlocks(text);
    if (node) this.tree = new MarkdownTree(node);
    this.tree?.observe.add(debounce(() => this.save()));
  }
  async save() {
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
    if (keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      const result = inline.moveCaretUp();
      if (result !== true) {
        for (const prev of reverseDfs(node!)) {
          if (['paragraph', 'code-block', 'heading'].includes(prev.type)) {
            this.hostContext.focusNode = prev;
            this.hostContext.focusOffset = -result;
            prev.viewModel.observe.notify();
            break;
          }
        }
      }
      return;
    }
    if (keyboardEvent.key === 'ArrowDown') {
      keyboardEvent.preventDefault();
      const result = inline.moveCaretDown();
      if (result !== true) {
        for (const next of dfs(node!)) {
          if (['paragraph', 'code-block', 'heading'].includes(next.type)) {
            this.hostContext.focusNode = next;
            this.hostContext.focusOffset = result;
            next.viewModel.observe.notify();
            break;
          }
        }
      }
      return;
    }
    if (keyboardEvent.key === 'Tab') {
      this.hostContext.focusNode = node;
      node.viewModel.observe.notify();
      if (keyboardEvent.shiftKey) {
        // TODO: Find the right context.
        const context = node;
        const listItem = context.viewModel.parent!;
        const nextSibling = listItem.viewModel.nextSibling;
        const list = listItem.viewModel.parent!;
        const targetListItemSibling = list.viewModel.parent!;
        if (targetListItemSibling?.type === 'list-item') {
          listItem.viewModel.insertBefore(
            targetListItemSibling.viewModel.parent!,
            targetListItemSibling.viewModel.nextSibling
          );
        } else {
          context.viewModel.insertBefore(
            list.viewModel.parent!,
            list.viewModel.nextSibling
          );
          listItem.viewModel.remove();
        }
        // Siblings of the undended list-item move to sublist.
        if (nextSibling) {
          let next: ViewModelNode | undefined = nextSibling;
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
        // The context might have been removed from the list item. Move any
        // remaining siblings to the same level.
        if (listItem.children?.length && !listItem.viewModel.parent) {
          // TODO: move more than the first child.
          listItem.viewModel.firstChild?.viewModel.insertBefore(
            context.viewModel.parent!,
            context.viewModel.nextSibling
          );
        }
        if (!list.children?.length) {
          list.viewModel.remove();
        }
        return;
      }
      // TODO: Find the right context.
      const context = node;
      let listItem: ViewModelNode;
      if (context.viewModel.parent!.type === 'list-item') {
        listItem = context.viewModel.parent!;
      } else {
        listItem = node.viewModel.tree.import({
          type: 'list-item',
          marker: '* ',
        });
        listItem.viewModel.insertBefore(node.viewModel.parent!, node);
        node.viewModel.insertBefore(listItem);
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
        const list = node.viewModel.tree.import({
          type: 'list',
        });
        list.viewModel.insertBefore(listItem.viewModel.parent!, listItem);
        listItem.viewModel.insertBefore(list);
        // TODO: Merge this with any sibling lists.
      }
    }
  }
  onInlineInput({
    detail: {inline, inputEvent, inputStart, inputEnd},
  }: CustomEvent<InlineInput>) {
    let newText;
    let startIndex;
    let oldEndIndex;
    let newEndIndex: number;
    if (
      inputEvent.inputType === 'insertText' ||
      inputEvent.inputType === 'insertReplacementText' ||
      inputEvent.inputType === 'insertFromPaste' ||
      inputEvent.inputType === 'deleteByCut' ||
      inputEvent.inputType === 'deleteContentBackward'
    ) {
      startIndex = inputStart.index;
      oldEndIndex = inputEnd.index;
      if (
        inputEvent.inputType === 'insertReplacementText' ||
        inputEvent.inputType === 'insertFromPaste'
      ) {
        newText = inputEvent.dataTransfer!.getData('text');
      } else if (inputEvent.inputType === 'deleteByCut') {
        newText = '';
      } else if (inputEvent.inputType === 'deleteContentBackward') {
        if (inputStart.index === 0 && inputEnd.index === 0) {
          let node: ViewModelNode | undefined = inline.node;
          for (const prev of reverseDfs(node!)) {
            if (['paragraph', 'code-block', 'heading'].includes(prev.type)) {
              this.hostContext.focusNode = prev;
              this.hostContext.focusOffset = -Infinity;
              prev.viewModel.observe.notify();
              break;
            }
          }
          do {
            const toRemove = node;
            node = node?.viewModel.parent;
            toRemove?.viewModel.remove();
          } while (node && !node.children?.length);
          return;
        }
        newText = '';
        startIndex = Math.max(0, startIndex - 1);
      } else {
        newText = inputEvent.data ?? '';
      }
      newEndIndex = startIndex + newText.length;
    } else if (inputEvent.inputType === 'insertParagraph') {
      if (
        insertParagraphInList(
          inline.node!,
          inputStart.index === 0,
          this.hostContext
        )
      ) {
        return;
      }
      if (insertParagraphInSection(inline.node!, this.hostContext)) return;
      return;
    } else if (inputEvent.inputType === 'insertLineBreak') {
      if (insertSiblingParagraph(inline.node!, this.hostContext)) return;
      return;
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

    inline.edit(edit, true);
  }
}

function swapNodes(node1: ViewModelNode, node2: ViewModelNode) {
  const node1Parent = node1.viewModel.parent!;
  const node1NextSibling = node1.viewModel.nextSibling;
  node1.viewModel.insertBefore(node2.viewModel.parent!, node2);
  node2.viewModel.insertBefore(node1Parent, node1NextSibling);
}

function* reverseDfs(node: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && (node = next);
  }
  do {
    while (next(node.viewModel.previousSibling)) {
      while (next(node.viewModel.lastChild));
      yield node;
    }
    if (next(node.viewModel.parent)) {
      yield node;
      continue;
    }
    return;
  } while (true);
}

function* dfs(node: ViewModelNode) {
  function next(next?: ViewModelNode) {
    return next && (node = next);
  }
  do {
    while (next(node.viewModel.nextSibling)) {
      while (next(node.viewModel.firstChild));
      yield node;
    }
    if (next(node.viewModel.parent)) {
      yield node;
      continue;
    }
    return;
  } while (true);
}

function findAncestor(node: ViewModelNode, type: string) {
  const path = [node];
  let ancestor: ViewModelNode | undefined = node;
  do {
    path.unshift(ancestor);
    ancestor = ancestor.viewModel.parent;
    if (!ancestor) return {};
  } while (ancestor.type !== type);
  return {
    ancestor,
    path,
  };
}

function moveParagraphBackwards(node: ViewModelNode): boolean {
  return false;
}

function insertSiblingParagraph(node: ViewModelNode, context: HostContext): boolean {
  const newParagraph = node.viewModel.tree.import({
    type: 'paragraph',
    content: '',
  });
  context.focusNode = newParagraph;
  newParagraph.viewModel.insertBefore(
    node.viewModel.parent!,
    node.viewModel.nextSibling
  );
  return true;
}

function insertParagraphInList(
  node: ViewModelNode,
  atStart: boolean,
  context: HostContext
): boolean {
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
        node.viewModel.parent!,
        node.viewModel.nextSibling
      );
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
  if (atStart) swapNodes(node, newParagraph);
  context.focusNode = newParagraph;
  return true;
}

function insertParagraphInSection(
  node: ViewModelNode,
  context: HostContext
): boolean {
  const {ancestor: section, path} = findAncestor(node, 'section');
  if (!section) return false;
  const newParagraph = node.viewModel.tree.import({
    type: 'paragraph',
    content: '',
  });
  context.focusNode = newParagraph;
  newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
  return true;
}

render(html`<test-host></test-host>`, document.body);

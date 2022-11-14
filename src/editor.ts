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

import {libraryContext} from './app-context.js';
import {cast} from './asserts.js';
import {Command} from './command-palette.js';
import {contextProvided, contextProvider} from './deps/lit-labs-context.js';
import {css, customElement, html, LitElement, property, state} from './deps/lit.js';
import {Document, Library} from './library.js';
import {hostContext, HostContext} from './markdown/host-context.js';
import {InlineInput, InlineKeyDown, InlineLinkClick} from './markdown/inline-render.js';
import {InlineNode, ParagraphNode} from './markdown/node.js';
import {normalizeTree} from './markdown/normalize.js';
import {ancestors, children, findAncestor, findNextEditable, findPreviousDfs, reverseDfs, swapNodes} from './markdown/view-model-util.js';
import {InlineViewModel, ViewModelNode} from './markdown/view-model.js';
import {Observer, Observers} from './observe.js';

@customElement('pkm-editor')
export class Editor extends LitElement {
  @property({type: String, reflect: true})
  status: 'loading'|'loaded'|'error'|undefined;
  @state() document?: Document;
  @property({type: Boolean, reflect: true}) dirty = false;
  @contextProvided({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
  @contextProvider({context: hostContext})
  @state()
  hostContext: HostContext = {};
  private observers = new Observers(new Observer(
      () => this.document?.observe, (t, o) => t?.add(o), (t, o) => t?.remove(o),
      () => this.requestUpdate()));
  static override get styles() {
    return [
      css`
        #status {
          position: absolute;
        }
        #content {
          display: flex;
          justify-content: center;
          flex-grow: 1;
        }
        md-block-render {
          width: 700px;
        }
      `,
    ];
  }
  constructor() {
    super();
    // this.addEventListener('focus', () => this.appContext.activeEditor =
    // this);
  }
  override render() {
    this.observers.update();
    this.dirty = this.document?.dirty ?? false;
    return html`
    <div id=status>${this.document?.dirty ? '💽' : ''}</div>
    <div id=content>
    <md-block-render
      .block=${this.document?.tree.root}
      @inline-input=${this.onInlineInput}
      @inline-link-click=${this.onInlineLinkClick}
      @inline-keydown=${this.onInlineKeyDown}></md-block-render>
    </div>`;
  }
  override async connectedCallback() {
    super.connectedCallback();
    const url = new URL(location.toString());
    await this.updateComplete;
    if (url.searchParams.has('path')) {
      await this.load(url.searchParams.get('path')!);
    }
  }
  async load(name: string) {
    if (!this.library) return;
    this.status = 'loading';
    this.document = undefined;
    try {
      this.document = await this.library.getDocument(name + '.md');
      normalizeTree(this.document.tree);
      const node = findNextEditable(this.document.tree.root);
      if (node) {
        focusNode(this.hostContext, node, 0);
      }
      this.status = 'loaded';
    } catch (e) {
      this.status = 'error';
      console.error(e);
    }
  }
  onInlineLinkClick({
    detail: {destination},
  }: CustomEvent<InlineLinkClick>) {
    this.load(destination);
  }
  onInlineKeyDown({
    detail: {inline, node, keyboardEvent},
  }: CustomEvent<InlineKeyDown>) {
    const finishEditing = node.viewModel.tree.edit();
    try {
      if (!inline.node) return;
      if (keyboardEvent.key === 'ArrowUp') {
        keyboardEvent.preventDefault();
        const result = inline.moveCaretUp();
        if (result !== true) {
          const prev = findPreviousDfs(
              node,
              ({type}) => ['paragraph', 'code-block', 'section'].includes(
                  type));
          if (prev) focusNode(this.hostContext, prev, -result);
        }
      } else if (keyboardEvent.key === 'ArrowDown') {
        keyboardEvent.preventDefault();
        const result = inline.moveCaretDown();
        if (result !== true) {
          const next = findNextEditable(node);
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
    } finally {
      finishEditing();
    }
  }
  onInlineInput(event: CustomEvent<InlineInput>) {
    const {
      detail: {inline, inputEvent, inputStart, inputEnd},
    } = event;
    if (!inline.node) return;

    const finishEditing = inline.node.viewModel.tree.edit();
    try {
      if (handleInlineInputAsBlockEdit(event, this.hostContext)) return;
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

      const newNodes = inline.node.viewModel.edit(edit);
      if (newNodes) {
        // TODO: is this needed?
        normalizeTree(inline.node.viewModel.tree);
        const next = findNextEditable(newNodes[0], true);
        // TODO: is the focus offset always 0?
        if (next) focusNode(this.hostContext, next, 0);
      } else {
        // TODO: generalize this (inline block mutation)
        const parent = inline.node.viewModel.parent;
        if (parent?.type === 'list-item' && parent.checked === undefined &&
            /^\[( |x)] /.test(inline.node.content)) {
          parent.viewModel.updateChecked(inline.node.content[1] === 'x');
          inline.node.viewModel.edit({
            newText: '',
            startIndex: 0,
            newEndIndex: 0,
            oldEndIndex: 4,
          });
        }
        focusNode(this.hostContext, inline.node, newEndIndex);
      }
    } finally {
      finishEditing();
    }
  }
  getCommands(): Command[] {
    return [
      {
        description: 'Find, Open, Create...',
        argument: {
          description: 'Find or create...',
          suggestions: () => this.library.getAllNames(),
          validate: () => true,
        },
        execute: (file: string) => this.load(file),
      },
      {
        description: 'Force save',
        execute: async () => this.document?.save(),
      },
    ];
  }
}

function maybeMergeContentInto(
    node: InlineNode&ViewModelNode, target: ViewModelNode,
    context: HostContext): boolean {
  if (target.type === 'code-block' || target.type === 'paragraph' ||
      target.type === 'section') {
    focusNode(context, target, target.content.length);
    (target.viewModel as InlineViewModel).edit({
      startIndex: target.content.length,
      oldEndIndex: target.content.length,
      newEndIndex: target.content.length + node.content.length,
      newText: node.content,
    });
    node.viewModel.remove();
    return true;
  }
  return false;
}

function focusNode(context: HostContext, node: ViewModelNode, offset?: number) {
  context.focusNode = node;
  context.focusOffset = offset;
  node.viewModel.observe.notify();
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
            .add({
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
    if (ancestor.type === 'document') {
      break;
    }
    // Don't indent a section at the top level, unless we are inside a heading.
    if (ancestor.type === 'section' &&
        ancestor.viewModel.parent!.type == 'document') {
      if (target.type === 'section') {
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
    listItem = target.viewModel.tree.add({
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
    const list = target.viewModel.tree.add({
      type: 'list',
    });
    list.viewModel.insertBefore(cast(listItem.viewModel.parent), listItem);
    listItem.viewModel.insertBefore(list);
  }
}

function insertSiblingParagraph(
    node: InlineNode&ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(
      cast(node.viewModel.parent), node.viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function insertParagraphInList(
    node: InlineNode&ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  const {ancestor, path} = findAncestor(node, 'list');
  if (!ancestor) return false;
  let targetList;
  let targetListItemNextSibling;
  if (node.viewModel.nextSibling) {
    if (node.viewModel.nextSibling.type === 'list') {
      targetList = node.viewModel.nextSibling;
      targetListItemNextSibling = targetList.viewModel.firstChild;
    } else {
      targetList = node.viewModel.tree.add({
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
  const newListItem = node.viewModel.tree.add({
    type: 'list-item',
    marker: firstListItem?.marker ?? '* ',
  });
  newListItem.viewModel.insertBefore(targetList, targetListItemNextSibling);
  if (newListItem.viewModel.previousSibling?.type === 'list-item' &&
      newListItem.viewModel.previousSibling.checked !== undefined) {
    newListItem.viewModel.updateChecked(false);
  }
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(newListItem);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function insertParagraphInDocument(
    node: InlineNode&ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  const {ancestor: section, path} = findAncestor(node, 'document');
  if (!section) return false;
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function insertParagraphInSection(
    node: InlineNode&ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  let {ancestor: section, path} = findAncestor(node, 'section');
  let nextSibling;
  if (section) {
    nextSibling = path![0].viewModel.nextSibling;
  } else if (node.type === 'section') {
    section = node;
    nextSibling = section!.viewModel.firstChild;
  }
  if (!section) return false;
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(section, nextSibling);
  finishInsertParagraph(node, newParagraph, startIndex, context);
  return true;
}

function areAncestorAndDescendant(node: ViewModelNode, node2: ViewModelNode) {
  return [...ancestors(node)].includes(node2) ||
      [...ancestors(node2)].includes(node);
}

function finishInsertParagraph(
    node: InlineNode&ViewModelNode, newParagraph: ParagraphNode&ViewModelNode,
    startIndex: number, context: HostContext) {
  // TODO: Parent check is wrong. This was trying to fix insert from section.
  // Check is probably is one node the ancestor of the other?
  const shouldSwap = startIndex === 0 && node.content.length > 0 &&
      !areAncestorAndDescendant(node, newParagraph);
  if (shouldSwap) {
    swapNodes(node, newParagraph);
  } else {
    (newParagraph.viewModel as InlineViewModel).edit({
      startIndex: 0,
      newEndIndex: 0,
      oldEndIndex: 0,
      newText: node.content.substring(startIndex),
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

function handleInlineInputAsBlockEdit(
    {
      detail: {inline, inputEvent, inputStart, inputEnd},
    }: CustomEvent<InlineInput>,
    context: HostContext): boolean {
  if (!inline.node) return false;
  if (inputEvent.inputType === 'deleteContentBackward') {
    if (inputStart.index !== 0 || inputEnd.index !== 0) return false;
    const node = inline.node;
    // Turn sections and code-blocks into paragraphs.
    if (node.type === 'section') {
      node.viewModel.updateMarker(node.marker.substring(0, node.marker.length - 1));
      if (node.marker === '') {
        const paragraph = node.viewModel.tree.add({
          type: 'paragraph',
          content: node.content,
        });
        paragraph.viewModel.insertBefore(cast(node.viewModel.parent), node);
        // Move all section content out.
        for (const child of children(node)) {
          child.viewModel.insertBefore(cast(node.viewModel.parent), node);
        }
        node.viewModel.remove();
        focusNode(context, paragraph, 0);
      } else {
        focusNode(context, node, 0);
      }
      return true;
    } else if (node.type === 'code-block') {
      const paragraph = node.viewModel.tree.add({
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
        child.viewModel.insertBefore(cast(ancestor.viewModel.parent), ancestor);
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
    return insertParagraphInList(inline.node, inputStart.index, context) ||
        insertParagraphInSection(inline.node, inputStart.index, context) ||
        insertParagraphInDocument(inline.node, inputStart.index, context);
  } else if (inputEvent.inputType === 'insertLineBreak') {
    return insertSiblingParagraph(inline.node, inputStart.index, context);
  }
  return false;
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-editor': Editor;
  }
}

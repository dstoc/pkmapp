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
import {assert, cast} from './asserts.js';
import {Command} from './command-palette.js';
import {contextProvided} from './deps/lit-labs-context.js';
import {css, customElement, html, LitElement, property, query, state} from './deps/lit.js';
import {Document, Library} from './library.js';
import {parseBlocks} from './markdown/block-parser.js';
import {MarkdownRenderer} from './markdown/block-render.js';
import {serializeToString} from './markdown/block-serializer.js';
import {HostContext} from './markdown/host-context.js';
import {MarkdownInline, InlineInput, InlineKeyDown, InlineLinkClick} from './markdown/inline-render.js';
import {InlineNode, MarkdownNode, ParagraphNode} from './markdown/node.js';
import {normalizeTree} from './markdown/normalize.js';
import {ancestors, children, findAncestor, findFinalEditable, findNextEditable, findPreviousEditable, reverseDfs, swapNodes} from './markdown/view-model-util.js';
import {InlineEdit, InlineViewModel, InlineViewModelNode, ViewModelNode} from './markdown/view-model.js';
import {Observer, Observers} from './observe.js';
import {getContainingTransclusion} from './markdown/transclusion.js';

@customElement('pkm-editor')
export class Editor extends LitElement {
  @property({type: String, reflect: true})
  status: 'loading'|'loaded'|'error'|undefined;
  @state() document?: Document;
  @state() root?: ViewModelNode;
  @property({type: Boolean, reflect: true}) dirty = false;
  @contextProvided({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
  @query('md-block-render') private markdownRenderer!: MarkdownRenderer;
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
      .block=${this.root}
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
  async load(name: string, forceRefresh = false) {
    if (!this.library) return;
    this.status = 'loading';
    this.document = undefined;
    try {
      this.document = await this.library.getDocument(name + '.md', forceRefresh);
      this.root = this.document.tree.root;
      normalizeTree(this.document.tree);
      const node = findNextEditable(this.root, this.root);
      if (node) {
        focusNode(this.markdownRenderer.hostContext, node, 0);
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
      assert(inline.node);
      if (keyboardEvent.key === 'ArrowUp') {
        keyboardEvent.preventDefault();
        const result = inline.moveCaretUp();
        if (result !== true) {
          function focusPrevious(element: Element&{hostContext?: HostContext}, node: ViewModelNode, offset: number) {
            while (true) {
              const prev = findPreviousEditable(node, cast(cast(element.hostContext).root));
              if (prev) {
                focusNode(cast(element.hostContext), prev, -offset);
                break;
              } else {
                const transclusion = getContainingTransclusion(element);
                if (!transclusion) return;
                element = transclusion;
                node = cast(transclusion.node);
              }
            }
          }
          focusPrevious(inline, node, result);
        }
      } else if (keyboardEvent.key === 'ArrowDown') {
        keyboardEvent.preventDefault();
        const result = inline.moveCaretDown();
        if (result !== true) {
          function focusNext(element: Element&{hostContext?: HostContext}, node: ViewModelNode, offset: number) {
            while (true) {
              const next = findNextEditable(node, cast(cast(element.hostContext).root));
              if (next) {
                focusNode(cast(element.hostContext), next, offset);
                break;
              } else {
                const transclusion = getContainingTransclusion(element);
                if (!transclusion) return;
                element = transclusion;
                node = cast(transclusion.node);
              }
            }
          }
          focusNext(inline, node, result);
        }
      } else if (keyboardEvent.key === 'Tab') {
        keyboardEvent.preventDefault();
        const {start} = inline.getSelection();
        focusNode(cast(inline.hostContext), node, start.index);
        if (keyboardEvent.shiftKey) {
          unindent(node, cast(cast(inline.hostContext).root));
        } else {
          indent(node, cast(cast(inline.hostContext).root));
        }
      } else {
        return;
      }
    } finally {
      finishEditing();
    }
  }
  async triggerPaste(
      inline: MarkdownInline,
      node: InlineViewModelNode,
      edit: {startIndex: number, oldEndIndex: number}, forceMarkdown = false) {
    const content = await navigator.clipboard.read();
    const mdItem =
        content.find(item => item.types.includes('web text/markdown'));
    let mdText;
    if (mdItem) {
      const blob = await mdItem.getType('web text/markdown');
      mdText = await blob.text();
      // TODO: Drop this hack for broken custom formats.
      if (mdText.length === 0) {
        mdText = await navigator.clipboard.readText();
      }
    } else if (forceMarkdown) {
      mdText = await navigator.clipboard.readText();
    }
    if (mdText) {
      const root = parseBlocks(mdText + '\n');
      if (!root) return;
      assert(root.type === 'document' && root.children);
      const finishEditing = node.viewModel.tree.edit();
      try {
        const newNodes = root.children.map(
            newNode => node.viewModel.tree.add<MarkdownNode>(newNode));
        let newFocus = findFinalEditable(newNodes[0]);
        performLogicalInsertion(node, newNodes);
        if (newFocus) focusNode(cast(inline.hostContext), newFocus, Infinity);
      } finally {
        finishEditing();
      }
    } else {
      let text = await navigator.clipboard.readText();
      // TODO: Escape block creation.
      text = text.replace(/\n/g, ' ');
      const finishEditing = node.viewModel.tree.edit();
      try {
        this.editInlineNode(node, {
          ...edit,
          newText: text,
          newEndIndex: edit.oldEndIndex + text.length,
        }, cast(inline.hostContext)); // TODO: wrong context
      } finally {
        finishEditing();
      }
    }
  }
  onInlineInput(event: CustomEvent<InlineInput>) {
    const {
      detail: {inline, inputEvent, inputStart, inputEnd},
    } = event;
    if (!inline.node) return;

    const finishEditing = inline.node.viewModel.tree.edit();
    try {
      if (handleInlineInputAsBlockEdit(event, cast(inline.hostContext))) return;
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
          this.triggerPaste(inline, inline.node, {startIndex, oldEndIndex});
          return;
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

      this.editInlineNode(inline.node, edit, cast(inline.hostContext));
    } finally {
      finishEditing();
    }
  }
  private editInlineNode(node: InlineViewModelNode, edit: InlineEdit, hostContext: HostContext) {
    const newNodes = node.viewModel.edit(edit);
    if (newNodes) {
      // TODO: is this needed?
      normalizeTree(node.viewModel.tree);
      const next = findNextEditable(newNodes[0], cast(hostContext.root), true);
      // TODO: is the focus offset always 0?
      if (next) focusNode(hostContext, next, 0);
    } else {
      // TODO: generalize this (inline block mutation)
      const parent = node.viewModel.parent;
      if (parent?.type === 'list-item' && parent.checked === undefined &&
          /^\[( |x)] /.test(node.content)) {
        parent.viewModel.updateChecked(node.content[1] === 'x');
        node.viewModel.edit({
          newText: '',
          startIndex: 0,
          newEndIndex: 0,
          oldEndIndex: 4,
        });
      }
      focusNode(hostContext, node, edit.newEndIndex);
    }
  }
  getCommands(): Command[] {
    const {inline: activeInline, startIndex, endIndex} =
        this.markdownRenderer.getInlineSelection();
    const activeNode = activeInline?.node;
    const inTopLevelDocument = activeNode?.viewModel.tree === this.root?.viewModel.tree ?? false;
    const transclusion = activeInline && getContainingTransclusion(activeInline);
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
        description: 'Force open',
        argument: {
          description: 'Find or create...',
          suggestions: () => this.library.getAllNames(),
          validate: () => true,
        },
        execute: (file: string) => this.load(file, true),
      },
      {
        description: 'Force save',
        execute: async () => this.document?.save(),
      },
      {
        description: 'Copy all as markdown',
        execute: async () => {
          const markdown = serializeToString(this.document!.tree.root);
          const textType = 'text/plain';
          const mdType = 'web text/markdown';
          navigator.clipboard.write([
            new ClipboardItem({
              [textType]: new Blob([markdown], {type: textType}),
              [mdType]: new Blob([markdown], {type: mdType}),
            }),
          ]);
        },
      },
      ...activeNode && startIndex !== undefined && endIndex !== undefined ? [{
        description: 'Paste as markdown',
        execute: async () => {
          this.triggerPaste(
              activeInline, activeNode, {startIndex, oldEndIndex: endIndex}, true);
        },
      }] : [],
      ...inTopLevelDocument && activeNode && activeInline ? [{
        description: 'Focus on block',
        execute: async () => {
          this.root = logicalContainingBlock(activeNode);
          focusNode(cast(activeInline.hostContext), activeNode, startIndex);
        },
      }] : [],
      ...inTopLevelDocument && this.root !== this.document?.tree.root ? [{
        description: 'Focus on containing block',
        execute: async () => {
          if (this.root?.viewModel.parent) this.root = logicalContainingBlock(this.root.viewModel.parent);
          if (activeNode && activeInline) focusNode(cast(activeInline.hostContext), activeNode, startIndex);
        },
      }] : [],
      ...inTopLevelDocument && this.root !== this.document?.tree.root ? [{
        description: 'Focus on document',
        execute: async () => {
          this.root = this.document?.tree.root;
          if (activeNode) focusNode(cast(activeInline.hostContext), activeNode, startIndex);
        },
      }] : [],
      ...transclusion ? [{
        description: 'Delete transclusion',
        execute: async () => {
          const finished = transclusion.node!.viewModel.tree.edit();
          transclusion.node!.viewModel.remove();
          finished();
          // TODO: focus
        },
      }] : [],
      ...activeNode ? [{
        description: 'Insert transclusion',
        argument: {
          description: 'Find or create...',
          suggestions: () => this.library.getAllNames(),
          validate: () => true,
        },
        execute: async (target: string) => {
          const finished = activeNode.viewModel.tree.edit();
          const newParagraph = activeNode.viewModel.tree.add({
            type: 'code-block',
            info: 'tc',
            content: target,
          });
          newParagraph.viewModel.insertBefore(
              cast(activeNode.viewModel.parent), activeNode.viewModel.nextSibling);
          finished();
          focusNode(activeInline.hostContext!, newParagraph);
          // TODO: focus
        },
      }] : [],
      ...transclusion ? [{
        description: 'Insert before transclusion',
        execute: async () => {
          const node = transclusion.node!;
          const finished = node.viewModel.tree.edit();
          const newParagraph = node.viewModel.tree.add({
            type: 'paragraph',
            content: '',
          });
          newParagraph.viewModel.insertBefore(
              cast(node.viewModel.parent), node);
          finished();
          focusNode(cast(transclusion.hostContext), newParagraph, 0);
        },
      }] : [],
      ...transclusion ? [{
        description: 'Insert after transclusion',
        execute: async () => {
          const node = transclusion.node!;
          const finished = node.viewModel.tree.edit();
          const newParagraph = node.viewModel.tree.add({
            type: 'paragraph',
            content: '',
          });
          newParagraph.viewModel.insertBefore(
              cast(node.viewModel.parent), node.viewModel.nextSibling);
          finished();
          focusNode(cast(transclusion.hostContext), newParagraph, 0);
        },
      }] : [],
    ];
  }
}

function logicalContainingBlock(context: ViewModelNode) {
  let next: ViewModelNode|undefined = context;
  while (next) {
    if (next.type === 'section' || next.type === 'list-item' || next.type === 'document') return next;
    next = next.viewModel.parent;
  }
  return context;
}

function performLogicalInsertion(
    context: ViewModelNode, nodes: ViewModelNode[]) {
  const {parent, nextSibling} = nextLogicalInsertionPoint(context);
  if (parent.type == 'list') {
    if (nodes.length === 1 && nodes[0].type === 'list') {
      const [node] = nodes;
      for (const child of children(node)) {
        assert(child.type === 'list-item');
        child.viewModel.insertBefore(parent, nextSibling);
      }
    } else {
      const listItem = parent.viewModel.tree.add({
        type: 'list-item',
        // TODO: infer from list
        marker: '*',
      });
      listItem.viewModel.insertBefore(parent, nextSibling);
      for (const node of nodes) {
        node.viewModel.insertBefore(listItem, undefined);
      }
    }
  } else {
    for (const node of nodes) {
      node.viewModel.insertBefore(parent, nextSibling);
    }
  }
}

function nextLogicalInsertionPoint(node: ViewModelNode) {
  if (!node.viewModel.nextSibling &&
      node.viewModel.parent?.type === 'list-item') {
    const listItem = node.viewModel.parent;
    return {
      parent: cast(listItem.viewModel.parent),
      nextSibling: listItem.viewModel.nextSibling,
    };
  }
  return {
    parent: cast(node.viewModel.parent),
    nextSibling: node.viewModel.nextSibling,
  };
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

function unindent(node: ViewModelNode, root: ViewModelNode) {
  const {ancestor: listItem, path} = findAncestor(node, root, 'list-item');
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

function indent(node: ViewModelNode, root: ViewModelNode) {
  let target = node;
  for (const ancestor of ancestors(node, root)) {
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
    node: InlineNode&ViewModelNode,
    root: ViewModelNode,
    startIndex: number,
    context: HostContext): boolean {
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(
      cast(node.viewModel.parent), node.viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, root, startIndex, context);
  return true;
}

function insertParagraphInList(
    node: InlineNode&ViewModelNode,
    root: ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  const {ancestor, path} = findAncestor(node, root, 'list');
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
  finishInsertParagraph(node, newParagraph, root, startIndex, context);
  return true;
}

/**
 * Special case where we have a list-item that is not contained by a list
 * (because it is the root).
 */
function insertParagraphInListItem(
    node: InlineNode&ViewModelNode,
    root: ViewModelNode, startIndex: number,
    context: HostContext): boolean {
  const {ancestor: listItem, path} = findAncestor(node, root, 'list-item');
  if (!listItem) return false;
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(listItem, path[0].viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, root, startIndex, context);
  return true;
}

function insertParagraphInDocument(
    node: InlineNode&ViewModelNode,
    root: ViewModelNode,
    startIndex: number,
    context: HostContext): boolean {
  const {ancestor: section, path} = findAncestor(node, root, 'document');
  if (!section) return false;
  const newParagraph = node.viewModel.tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph.viewModel.insertBefore(section, path[0].viewModel.nextSibling);
  finishInsertParagraph(node, newParagraph, root, startIndex, context);
  return true;
}

function insertParagraphInSection(
    node: InlineNode&ViewModelNode,
    root: ViewModelNode,
    startIndex: number,
    context: HostContext): boolean {
  let {ancestor: section, path} = findAncestor(node, root, 'section');
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
  finishInsertParagraph(node, newParagraph, root, startIndex, context);
  return true;
}

function areAncestorAndDescendant(node: ViewModelNode, node2: ViewModelNode, root: ViewModelNode) {
  return [...ancestors(node, root)].includes(node2) ||
      [...ancestors(node2, root)].includes(node);
}

function finishInsertParagraph(
    node: InlineNode&ViewModelNode,
    newParagraph: ParagraphNode&ViewModelNode,
    root: ViewModelNode,
    startIndex: number, context: HostContext) {
  const shouldSwap = startIndex === 0 && node.content.length > 0 &&
      !areAncestorAndDescendant(node, newParagraph, root);
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
  const root = cast(context.root);
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
    const {ancestor} = findAncestor(node, root, 'block-quote');
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
    return insertParagraphInList(inline.node, root, inputStart.index, context) ||
        insertParagraphInListItem(inline.node, root, inputStart.index, context) ||
        insertParagraphInSection(inline.node, root, inputStart.index, context) ||
        insertParagraphInDocument(inline.node, root, inputStart.index, context);
  } else if (inputEvent.inputType === 'insertLineBreak') {
    return insertSiblingParagraph(inline.node, root, inputStart.index, context);
  }
  return false;
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-editor': Editor;
  }
}

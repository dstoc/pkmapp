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
import './autocomplete.js';
import './title.js';

import {libraryContext} from './app-context.js';
import {assert, cast} from './asserts.js';
import {Command, InputWrapper, SimpleCommandBundle} from './command-palette.js';
import {consume} from '@lit/context';
import {css, html, LitElement} from 'lit';
import {property, customElement, query, state} from 'lit/decorators.js';
import {Document, Library} from './library.js';
import {MarkdownRenderer} from './markdown/block-render.js';
import {serializeToString} from './markdown/block-serializer.js';
import {HostContext, focusNode} from './markdown/host-context.js';
import {
  MarkdownInline,
  InlineInput,
  InlineKeyDown,
  InlineLinkClick,
} from './markdown/inline-render.js';
import {
  findNextEditable,
  findPreviousEditable,
} from './markdown/view-model-util.js';
import {
  ViewModelNode,
  InlineViewModelNode,
  viewModel,
} from './markdown/view-model-node.js';
import {getContainingTransclusion} from './markdown/transclusion.js';
import {Autocomplete} from './autocomplete.js';
import {
  expandSelection,
  getBlockSelectionTarget,
} from './block-selection-util.js';
import {
  isLogicalContainingBlock,
  getLogicalContainingBlock,
} from './block-util.js';
import {
  blockPreview,
  blockIcon,
  BlockCommandBundle,
} from './block-command-bundle.js';
import {noAwait} from './async.js';
import {yesNoBundle} from './yes-no-bundle.js';
import {editBlockSelectionIndent} from './edits/indent-block-selection.js';
import {editInlineIndent} from './edits/indent-inline.js';
import {removeSelectedNodes} from './edits/remove-selected-nodes.js';
import {editInlineNode} from './edits/edit-inline-node.js';
import {insertLineBreak, insertParagraph} from './edits/insert-paragraph.js';
import {deleteContentBackwards} from './edits/delete-content-backwards.js';
import {
  copyMarkdownToClipboard,
  insertMarkdown,
  serializeSelection,
} from './copy-paste-util.js';
import {Focus} from './markdown/view-model-ops.js';
import {findOpenCreateBundle} from './commands/find-open-create.js';
import {CommandContext} from './commands/context.js';
import {sigprop} from './signal-utils.js';
import {normalizeKeys} from './keyboard.js';

export interface EditorNavigation {
  kind: 'navigate' | 'replace';
  document: Document;
  root: ViewModelNode;
}

// eslint-disable-next-line
type ExcludeFirst<T extends Parameters<any>> = T extends [any, ...infer Rest]
  ? Rest
  : never;

export interface EditContext {
  // TODO: maybe change the API so that the other functions are
  // available as a result of calling startEditing...
  startEditing(): void;
  keepFocus(): void;
  focus(node: ViewModelNode, offset: number): void;
  clearSelection(): void;
  setSelection(nodes: Iterable<InlineViewModelNode>): void;
  readonly selection: Iterable<ViewModelNode>;
  readonly node: ViewModelNode;
  readonly root: ViewModelNode;
}

@customElement('pkm-editor')
export class Editor extends LitElement {
  defaultName?: string;
  @property({type: String, reflect: true})
  accessor status: 'loading' | 'loaded' | 'error' | undefined;
  @state() private accessor document: Document | undefined;
  @sigprop private accessor root: ViewModelNode | undefined;
  private name?: string;
  @consume({context: libraryContext, subscribe: true})
  @state()
  accessor library!: Library;
  @query('md-block-render')
  private accessor markdownRenderer!: MarkdownRenderer;
  @query('pkm-autocomplete') private accessor autocomplete!: Autocomplete;
  static override get styles() {
    return [
      css`
        #status {
          position: absolute;
        }
        pkm-title {
          display: block;
          position: sticky;
          top: 0;
          padding-bottom: 0.5em;
          background: var(--root-background-color);
        }
        pkm-title:empty {
          padding-bottom: 0em;
        }
      `,
    ];
  }
  constructor() {
    super();
  }
  effect() {
    this.root?.[viewModel].renderSignal.value;
    this.requestUpdate();
  }
  override render() {
    if (this.document?.metadata.state === 'deleted') {
      // The document might have been deleted.
      noAwait(this.navigateByName('index', true));
    } else if (this.root?.[viewModel].connected === false) {
      // If the document is mutated (including the document root) the root
      // we are displaying could become disconnected. If that happens
      // navigate to the top/current root.
      assert(this.document);
      this.navigate(this.document, this.document.tree.root, false);
    }
    return html` <pkm-title .node=${this.root}></pkm-title>
      <md-block-render
        .block=${this.root}
        @inline-input=${this.onInlineInput}
        @inline-link-click=${this.onInlineLinkClick}
        @inline-keydown=${this.onInlineKeyDown}
      ></md-block-render>
      <pkm-autocomplete .editor=${this}></pkm-autocomplete>`;
  }
  override updated() {
    if (this.name === undefined || this.name === this.document?.name) return;
    this.name = this.document?.name;
    this.dispatchEvent(
      new CustomEvent('editor-navigate', {
        detail: {
          kind: 'replace',
          document: this.document,
          root: this.root,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
  override connectedCallback() {
    super.connectedCallback();
    noAwait(
      (async () => {
        await this.updateComplete;
        if (this.defaultName !== undefined) {
          await this.navigateByName(this.defaultName, true);
        }
      })(),
    );
  }
  serialize() {
    return {
      ...this.document!.tree.serialize(),
      [Symbol.for('markdown-tree')]: true,
    };
  }
  async createAndNavigateByName(name: string, fireEvent = false) {
    const document = await this.library.newDocument(name);
    this.navigate(document, document.tree.root, fireEvent);
  }
  async navigateByName(name: string, fireEvent = false) {
    const old = {
      status: this.status,
      document: this.document,
      root: this.root,
      name: this.name,
    };
    this.status = 'loading';
    this.document = undefined;
    this.root = undefined;
    this.name = undefined;
    try {
      const results = await this.library.findAll(name);
      if (results.length === 1) {
        const [{document, root}] = results;
        if (this.document === document && this.root === root) {
          Object.assign(this, old);
          return;
        }
        this.navigate(document, root, fireEvent);
      } else if (results.length > 1) {
        Object.assign(this, old);
        this.dispatchEvent(
          new CustomEvent('pkm-commands', {
            detail: new SimpleCommandBundle(
              `Which "${name}"?`,
              results.map(({document, root}) => ({
                description: document.name,
                execute: async () =>
                  void this.navigate(document, root, fireEvent),
                icon: blockIcon({root, name}),
                preview: () => blockPreview({root}),
              })),
            ),
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        Object.assign(this, old);
        this.dispatchEvent(
          new CustomEvent('pkm-commands', {
            detail: new InputWrapper(name, findOpenCreateBundle(this)),
            bubbles: true,
            composed: true,
          }),
        );
      }
    } catch (e) {
      this.status = 'error';
      console.error(e);
    }
  }
  navigate(document: Document, root: ViewModelNode, fireEvent = false) {
    if (this.document === document && this.root === root) {
      if (this.status === 'loading') this.status = 'loaded';
      return;
    }
    assert(document.tree === root[viewModel].tree);
    assert(root[viewModel].connected);
    this.document = document;
    this.root = root;
    this.name = this.document.name;
    this.status = 'loaded';
    const node = findNextEditable(this.root, this.root);
    if (node) {
      focusNode(this.markdownRenderer.hostContext, node, 0);
    }
    if (fireEvent)
      this.dispatchEvent(
        new CustomEvent('editor-navigate', {
          detail: {
            document,
            root,
          },
          bubbles: true,
          composed: true,
        }),
      );
  }
  runEditAction<
    T extends (
      state: EditContext,
      ...args: ExcludeFirst<Parameters<T>>
    ) => ReturnType<T>,
  >(
    element: Element & {hostContext?: HostContext; node?: ViewModelNode},
    action: T,
    ...args: ExcludeFirst<Parameters<T>>
  ): ReturnType<T> {
    const hostContext = cast(element.hostContext);
    const renderer = this.markdownRenderer;
    let endFocus: Focus | undefined;
    let startFocus: Focus | undefined;
    const context: EditContext = {
      get root() {
        return cast(hostContext.root);
      },
      get node() {
        return cast(element.node);
      },
      focus(node: InlineViewModelNode, offset: number) {
        endFocus = {node, offset};
      },
      startEditing() {
        if (element instanceof MarkdownInline) {
          const selection = element.getSelection();
          if (selection) {
            startFocus = {node: element.node!, offset: selection.start.index};
          }
        }
        if (!startFocus) {
          const {inline, startIndex} = renderer.getInlineSelection();
          if (inline?.node) {
            startFocus = {node: inline.node, offset: startIndex!};
          }
        }
        if (hostContext.hasSelection) {
          startFocus ??= {
            node: hostContext.selectionFocus!,
            offset: 0,
          };
          startFocus.selection = [...hostContext.selection];
        }
      },
      keepFocus() {
        if (hostContext.selectionFocus) {
          this.focus(hostContext.selectionFocus, 0);
        } else if (element instanceof MarkdownInline) {
          const selection = element.getSelection();
          const offset = selection?.start.index ?? 0;
          this.focus(this.node, offset);
        } else {
          const {inline, startIndex} = renderer.getInlineSelection();
          if (inline?.node) {
            this.focus(inline.node, startIndex!);
          }
        }
      },
      setSelection(nodes: Iterable<InlineViewModelNode>) {
        hostContext.clearSelection();
        hostContext.expandSelection(nodes);
      },
      clearSelection() {
        hostContext.clearSelection();
      },
      get selection() {
        return hostContext.selection;
      },
    };
    let actionResult: ReturnType<T>;
    const ops = context.node[viewModel].tree.edit(() => {
      actionResult = action(context, ...args);
      if (endFocus && hostContext.hasSelection) {
        endFocus.selection = [...hostContext.selection];
      }
      return {startFocus, endFocus};
    });
    if (ops.length > 0 && !endFocus) {
      // TODO: also check that the focus is still connected
      console.warn(`Edit action: "${action.name}" did not set final focus`);
    } else if (endFocus) {
      hostContext.focusNode = endFocus.node;
      hostContext.focusOffset = endFocus.offset;
      endFocus.node[viewModel].renderSignal.value++;
    }
    return actionResult!;
  }
  onInlineLinkClick({detail: {destination}}: CustomEvent<InlineLinkClick>) {
    if (/^(\w)+:/i.test(destination)) {
      window.open(destination);
    } else {
      noAwait(this.navigateByName(destination, true));
    }
  }
  onInlineKeyDown(event: CustomEvent<InlineKeyDown>) {
    // This function must only handle key events that do not generate text.
    // So as not to confuse handling here with insertText in onInlineInput.
    const {
      detail: {inline, node, keyboardEvent},
    } = event;
    const keyDown = normalizeKeys(keyboardEvent);
    const hostContext = cast(inline.hostContext);

    assert(inline.node);
    if (this.autocomplete.onInlineKeyDown(event)) {
      return;
    } else if (
      ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(keyDown.key)
    ) {
      keyboardEvent.preventDefault();
      const direction = ['ArrowUp', 'ArrowLeft'].includes(keyDown.key)
        ? 'backward'
        : 'forward';
      const alter = keyDown.shiftKey ? 'extend' : 'move';
      const granularity = ['ArrowUp', 'ArrowDown'].includes(keyDown.key)
        ? 'line'
        : keyDown.ctrlKey
          ? 'word'
          : 'character';
      const result = hostContext.hasSelection
        ? 0
        : inline.moveCaret(alter, direction, granularity);
      if (result === true) {
        hostContext.clearSelection();
      } else {
        function updateFocus(
          element: Element & {hostContext?: HostContext},
          node: InlineViewModelNode,
          offset: number,
        ) {
          // Retarget if there's any containing transclusion that has a selection.
          const target = getBlockSelectionTarget(element);
          if (target) {
            node = cast(target.node);
            element = target;
          }
          if (alter !== 'extend') {
            cast(element.hostContext).clearSelection();
          }
          while (true) {
            const root = cast(cast(element.hostContext).root);
            const next =
              direction === 'backward'
                ? findPreviousEditable(node, root)
                : findNextEditable(node, root);
            if (next) {
              // TODO: when moving forward by line, offset may be beyond the end
              // of the new element's first line
              focusNode(
                cast(element.hostContext),
                next,
                direction === 'backward' ? -offset : offset,
              );
              return {node, element, next};
            } else {
              const transclusion = getContainingTransclusion(element);
              if (!transclusion || alter === 'extend') return {};
              element = transclusion;
              node = cast(transclusion.node);
            }
          }
        }
        const {
          node: updatedNode,
          element,
          next,
        } = updateFocus(inline, node, result);
        if (next && alter === 'extend') {
          const hostContext = cast(element.hostContext);
          if (hostContext.selectionAnchor) {
            hostContext.extendSelection(updatedNode, next);
          } else {
            this.autocomplete.abort();
            hostContext.setSelection(updatedNode, next);
          }
        }
      }
    } else if (keyDown.key === 'Tab') {
      keyboardEvent.preventDefault();
      const mode = keyDown.shiftKey ? 'unindent' : 'indent';
      const blockTarget = getBlockSelectionTarget(inline);
      if (blockTarget) {
        this.runEditAction(blockTarget, editBlockSelectionIndent, mode);
      } else {
        this.runEditAction(inline, editInlineIndent, mode);
      }
    } else if (keyDown.key === 'z' && keyDown.ctrlKey) {
      if (!hostContext.root) return;
      event.preventDefault();
      const focus = hostContext.root[viewModel].tree.undo(hostContext.root);
      if (focus) {
        hostContext.clearSelection();
        if (focus.selection) {
          hostContext.expandSelection(focus.selection);
        }
        hostContext.focusNode = focus.node;
        hostContext.focusOffset = focus.offset;
        focus.node[viewModel].renderSignal.value++;
      }
    } else if (keyDown.key === 'y' && keyDown.ctrlKey) {
      if (!hostContext.root) return;
      event.preventDefault();
      const focus = hostContext.root[viewModel].tree.redo(hostContext.root);
      if (focus) {
        hostContext.clearSelection();
        if (focus.selection) {
          hostContext.expandSelection(focus.selection);
        }
        hostContext.focusNode = focus.node;
        hostContext.focusOffset = focus.offset;
        focus.node[viewModel].renderSignal.value++;
      }
    } else if (keyDown.key === 'a' && keyDown.ctrlKey) {
      this.autocomplete.abort();
      const {hostContext: selectedHostContext} =
        getBlockSelectionTarget(inline) ?? {};
      if (selectedHostContext?.hasSelection) {
        keyboardEvent.preventDefault();
        expandSelection(selectedHostContext);
      } else {
        const selection = inline.getSelection();
        if (
          selection &&
          selection.start.index === 0 &&
          selection.end.index === inline.node.content.length
        ) {
          keyboardEvent.preventDefault();
          focusNode(hostContext, inline.node, 0);
          hostContext.setSelection(node, node);
        }
      }
    } else if (keyDown.key === 'c' && keyDown.ctrlKey) {
      const {hostContext} = getBlockSelectionTarget(inline) ?? {};
      if (!hostContext) return;
      keyboardEvent.preventDefault();
      noAwait(copyMarkdownToClipboard(serializeSelection(hostContext)));
    } else if (keyDown.key === 'x' && keyDown.ctrlKey) {
      const selectionTarget = getBlockSelectionTarget(inline);
      if (!selectionTarget?.hostContext) return;
      keyboardEvent.preventDefault();
      noAwait(
        copyMarkdownToClipboard(
          serializeSelection(selectionTarget.hostContext),
        ),
      );
      this.runEditAction(selectionTarget, removeSelectedNodes);
    } else if (keyDown.key === 'Escape') {
      hostContext.clearSelection();
    } else if (keyDown.key === 'Backspace') {
      const selectionTarget = getBlockSelectionTarget(inline);
      if (!selectionTarget?.hostContext) return;
      keyboardEvent.preventDefault();
      this.runEditAction(selectionTarget, removeSelectedNodes);
    } else {
      return;
    }
  }
  async triggerPaste(
    inline: MarkdownInline,
    node: InlineViewModelNode,
    edit: {startIndex: number; oldEndIndex: number},
    forceMarkdown = false,
  ) {
    const content = await navigator.clipboard.read();
    const mdItem = content.find((item) =>
      item.types.includes('web text/markdown'),
    );
    let mdText: string | undefined;
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
      this.runEditAction(inline, (context: EditContext) => {
        context.startEditing();
        const {newFocus, newInlineNodes} = insertMarkdown(mdText, node) ?? {};
        if (newFocus) {
          context.focus(newFocus, Infinity);
        }
        if (newInlineNodes?.length) {
          context.setSelection(newInlineNodes);
        }
      });
    } else {
      let text = await navigator.clipboard.readText();
      // TODO: Escape block creation.
      text = text.replace(/\n/g, ' ');
      this.runEditAction(inline, editInlineNode, {
        ...edit,
        newText: text,
        newEndIndex: edit.oldEndIndex + text.length,
      }); // TODO: wrong context
    }
  }
  onInlineInput(event: CustomEvent<InlineInput>) {
    const {
      detail: {inline, inputEvent, inputStart, inputEnd},
    } = event;
    if (!inline.node) return;

    // TODO: Most edit types could be handled here. E.g. insertText
    // could replace the selection.
    const {hostContext: selectionHostContext} =
      getBlockSelectionTarget(inline) ?? {};
    selectionHostContext?.clearSelection();
    if (this.handleInlineInputAsBlockEdit(event)) {
      this.autocomplete.abort();
      return;
    }
    // TODO: Perhaps the remainder should be handled by an inline editor?
    let newText;
    let startIndex;
    let oldEndIndex;
    let newEndIndex: number;
    if (
      inputEvent.inputType === 'insertText' ||
      inputEvent.inputType === 'insertReplacementText' ||
      inputEvent.inputType === 'insertFromPaste' ||
      inputEvent.inputType === 'deleteByCut' ||
      inputEvent.inputType === 'deleteContentBackward' ||
      inputEvent.inputType === 'deleteWordBackward'
    ) {
      startIndex = inputStart.index;
      oldEndIndex = inputEnd.index;
      if (inputEvent.inputType === 'insertReplacementText') {
        newText = inputEvent.dataTransfer?.getData('text/plain') ?? '';
      } else if (inputEvent.inputType === 'insertFromPaste') {
        this.autocomplete.abort();
        // Note: We can't use dataTransfer here because not all types are
        // exposed. 'web text/markdown' for example.
        noAwait(
          this.triggerPaste(inline, inline.node, {startIndex, oldEndIndex}),
        );
        return;
      } else if (inputEvent.inputType === 'deleteWordBackward') {
        inline.moveCaret('move', 'backward', 'word');
        const selection = cast(inline.getSelection());
        startIndex = selection.start.index;
        newText = '';
      } else if (inputEvent.inputType === 'deleteByCut') {
        newText = '';
      } else if (inputEvent.inputType === 'deleteContentBackward') {
        newText = '';
        if (startIndex === oldEndIndex) {
          startIndex--;
        }
        startIndex = Math.max(0, startIndex);
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

    this.runEditAction(inline, (context: EditContext) => {
      editInlineNode(context, edit);
      noAwait(
        this.autocomplete.onInlineEdit(context, inline, newText, newEndIndex),
      );
    });
  }
  handleInlineInputAsBlockEdit({
    detail: {inline, inputEvent, inputStart, inputEnd},
  }: CustomEvent<InlineInput>): boolean {
    if (!inline.node) return false;
    if (
      inputEvent.inputType === 'deleteContentBackward' ||
      inputEvent.inputType === 'deleteWordBackward'
    ) {
      if (inputStart.index !== 0 || inputEnd.index !== 0) return false;
      return this.runEditAction(inline, deleteContentBackwards);
    } else if (inputEvent.inputType === 'insertParagraph') {
      this.runEditAction(inline, insertParagraph, inputStart.index);
      return true;
    } else if (inputEvent.inputType === 'insertLineBreak') {
      this.runEditAction(inline, insertLineBreak, inputStart.index);
      return true;
    }
    return false;
  }
  getCommandContext(): CommandContext {
    const inlineSelection = this.markdownRenderer.getInlineSelection();
    return {
      inlineSelection,
      node: inlineSelection.inline?.node,
      root: this.root,
      document: this.document,
      library: this.library,
      editor: this,
      transclusion:
        inlineSelection.inline &&
        getContainingTransclusion(inlineSelection.inline),
      blockSelectionTarget:
        inlineSelection.inline &&
        getBlockSelectionTarget(inlineSelection.inline),
    };
  }
  getCommands(): Iterable<Command> {
    const {
      inline: activeInline,
      startIndex,
      endIndex,
    } = this.markdownRenderer.getInlineSelection();
    const activeNode = activeInline?.node;
    const inTopLevelDocument =
      activeNode?.[viewModel].tree === (this.root?.[viewModel].tree ?? false);
    const transclusion =
      activeInline && getContainingTransclusion(activeInline);
    const selectionTarget =
      activeInline && getBlockSelectionTarget(activeInline);
    const selectionHostContext = selectionTarget?.hostContext;
    return [
      {
        description: 'Find, Open, Create...',
        execute: async () => {
          return findOpenCreateBundle(this);
        },
      },
      ...(this.document
        ? [
            {
              description: 'Copy all',
              execute: async () => {
                const markdown = serializeToString(this.document!.tree.root);
                await copyMarkdownToClipboard(markdown);
              },
              preview: () =>
                html`<pre style="white-space: pre-wrap">
${serializeToString(this.root!)}</pre
                >`,
            },
          ]
        : []),
      ...(selectionHostContext?.hasSelection
        ? [
            {
              description: 'Copy selection',
              execute: async () => {
                await copyMarkdownToClipboard(
                  serializeSelection(selectionHostContext),
                );
              },
              preview: () =>
                html`<pre>${serializeSelection(selectionHostContext)}</pre>`,
            },
          ]
        : []),
      ...(this.document && this.root === this.document.tree.root
        ? [
            {
              description: 'Delete document',
              execute: async () => {
                return yesNoBundle({
                  description: `Are you sure you want to delete "${this.document!.name}"?`,
                  yes: async () => {
                    const tree = this.document!.tree;
                    const document = this.library.getDocumentByTree(tree);
                    await document?.delete();
                  },
                });
              },
            },
          ]
        : []),
      ...(selectionTarget && selectionHostContext?.hasSelection
        ? [
            {
              description: 'Send to...',
              execute: async () => {
                return new BlockCommandBundle(
                  'Send to',
                  this.library,
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'remove'),
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'remove'),
                );
              },
            },
            {
              description: 'Send to and transclude...',
              execute: async () => {
                return new BlockCommandBundle(
                  'Send to and transclude',
                  this.library,
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'transclude'),
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'transclude'),
                );
              },
            },
            {
              description: 'Send to and link...',
              execute: async () => {
                return new BlockCommandBundle(
                  'Send to and link',
                  this.library,
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'link'),
                  async (result) =>
                    void sendTo(result, this, selectionTarget, 'link'),
                );
              },
            },
          ]
        : []),
      ...(activeNode && startIndex !== undefined && endIndex !== undefined
        ? [
            {
              description: 'Paste as markdown',
              execute: async () => {
                await this.triggerPaste(
                  activeInline,
                  activeNode,
                  {startIndex, oldEndIndex: endIndex},
                  true,
                );
              },
            },
          ]
        : []),
      ...(inTopLevelDocument && activeNode && activeInline
        ? [
            {
              description: 'Focus on block',
              execute: async () => {
                this.root = isLogicalContainingBlock(activeNode)
                  ? activeNode
                  : getLogicalContainingBlock(activeNode);
                focusNode(
                  cast(activeInline.hostContext),
                  activeNode,
                  startIndex,
                );
              },
              preview: () => {
                const block = isLogicalContainingBlock(activeNode)
                  ? activeNode
                  : getLogicalContainingBlock(activeNode);
                return block
                  ? html`<md-block-render .block=${block}></md-block-render>`
                  : html``;
              },
            },
          ]
        : []),
      ...(inTopLevelDocument && this.root !== this.document?.tree.root
        ? [
            {
              description: 'Focus on containing block',
              execute: async () => {
                if (this.root?.[viewModel].parent)
                  this.root = getLogicalContainingBlock(
                    this.root[viewModel].parent,
                  );
                if (activeNode && activeInline)
                  focusNode(
                    cast(activeInline.hostContext),
                    activeNode,
                    startIndex,
                  );
              },
              preview: () => {
                const block = getLogicalContainingBlock(
                  this.root?.[viewModel].parent,
                );
                return block
                  ? html`<md-block-render .block=${block}></md-block-render>`
                  : html``;
              },
            },
          ]
        : []),
      ...(inTopLevelDocument && this.root !== this.document?.tree.root
        ? [
            {
              description: 'Focus on document',
              execute: async () => {
                this.root = this.document?.tree.root;
                if (activeNode)
                  focusNode(
                    cast(activeInline.hostContext),
                    activeNode,
                    startIndex,
                  );
              },
              preview: () => {
                const block = this.document?.tree.root;
                return block
                  ? html`<md-block-render .block=${block}></md-block-render>`
                  : html``;
              },
            },
          ]
        : []),
      ...(transclusion
        ? [
            {
              description: 'Delete transclusion',
              execute: async () => {
                this.runEditAction(transclusion, (context: EditContext) => {
                  context.startEditing();
                  transclusion.node![viewModel].remove();
                  // TODO: focus
                });
              },
            },
          ]
        : []),
      ...(activeNode
        ? [
            {
              description: 'Insert transclusion...',
              execute: async () => {
                const action = async ({name}: {name: string}) => {
                  this.runEditAction(activeInline, (context: EditContext) => {
                    context.startEditing();
                    context.keepFocus();
                    const transclusion = activeNode[viewModel].tree.add({
                      type: 'code-block',
                      info: 'tc',
                      content: name,
                    });
                    transclusion[viewModel].insertBefore(
                      cast(activeNode[viewModel].parent),
                      activeNode[viewModel].nextSibling,
                    );
                  });
                };
                return new BlockCommandBundle(
                  'Insert transclusion',
                  this.library,
                  action,
                  action,
                );
              },
            },
          ]
        : []),
      ...(transclusion
        ? [
            {
              description: 'Insert before transclusion',
              execute: async () => {
                const node = transclusion.node!;
                node[viewModel].tree.edit(() => {
                  const newParagraph = node[viewModel].tree.add({
                    type: 'paragraph',
                    content: '',
                  });
                  newParagraph[viewModel].insertBefore(
                    cast(node[viewModel].parent),
                    node,
                  );
                  focusNode(cast(transclusion.hostContext), newParagraph, 0);
                  return {};
                });
              },
            },
          ]
        : []),
      ...(transclusion
        ? [
            {
              description: 'Insert after transclusion',
              execute: async () => {
                const node = transclusion.node!;
                node[viewModel].tree.edit(() => {
                  const newParagraph = node[viewModel].tree.add({
                    type: 'paragraph',
                    content: '',
                  });
                  newParagraph[viewModel].insertBefore(
                    cast(node[viewModel].parent),
                    node[viewModel].nextSibling,
                  );
                  focusNode(cast(transclusion.hostContext), newParagraph, 0);
                  return {};
                });
              },
            },
          ]
        : []),
    ];
  }
}

async function sendTo(
  {root, name}: {root?: ViewModelNode; name: string},
  editor: Editor,
  element: Element & {hostContext?: HostContext; node?: ViewModelNode},
  mode: 'remove' | 'transclude' | 'link',
) {
  root ??= (await editor.library.newDocument(name)).tree.root;
  assert(root);
  assert(element.hostContext);
  const markdown = serializeSelection(element.hostContext);
  const focus = cast(element.hostContext.selectionFocus);
  // TODO: if the selection is a section, use that section's name
  const targetName = name;
  let replacement: ViewModelNode | undefined;
  switch (mode) {
    case 'remove':
      break;
    case 'transclude':
      replacement = focus[viewModel].tree.add({
        type: 'code-block',
        info: 'tc',
        content: targetName,
      });
      break;
    case 'link':
      replacement = focus[viewModel].tree.add({
        type: 'paragraph',
        content: `[${targetName}]`,
      });
      break;
  }
  editor.runEditAction(element, (context: EditContext) => {
    context.startEditing();
    // Note. This insert may or may not be into the same document.
    // If not, it's harmless to do this here. But if it is part of
    // the same document this will batch it together with the other
    // parts of the action.
    if (root[viewModel].tree === context.root[viewModel].tree) {
      insertMarkdown(markdown, root[viewModel].lastChild ?? root);
    } else {
      root[viewModel].tree.edit(() => {
        insertMarkdown(markdown, root[viewModel].lastChild ?? root);
        return {};
      });
    }
    replacement?.[viewModel].insertBefore(cast(focus[viewModel].parent), focus);
    removeSelectedNodes(context);
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-editor': Editor;
  }
  interface HTMLElementEventMap {
    'editor-navigate': CustomEvent<EditorNavigation>;
  }
}

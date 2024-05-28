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
import {
  Command,
  CommandBundle,
  SimpleCommandBundle,
} from './command-palette.js';
import {consume} from './deps/lit-context.js';
import {
  css,
  customElement,
  html,
  LitElement,
  property,
  query,
  state,
} from './deps/lit.js';
import {Document, Library} from './library.js';
import {parseBlocks} from './markdown/block-parser.js';
import {MarkdownRenderer} from './markdown/block-render.js';
import {serializeToString} from './markdown/block-serializer.js';
import {HostContext, focusNode} from './markdown/host-context.js';
import {
  MarkdownInline,
  InlineInput,
  InlineKeyDown,
  InlineLinkClick,
} from './markdown/inline-render.js';
import {MarkdownNode} from './markdown/node.js';
import {
  ancestors,
  children,
  findFinalEditable,
  findNextEditable,
  findPreviousEditable,
  removeDescendantNodes,
  cloneNode,
} from './markdown/view-model-util.js';
import {
  ViewModelNode,
  InlineViewModelNode,
} from './markdown/view-model-node.js';
import {MarkdownTree} from './markdown/view-model.js';
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
import {getLanguageTools} from './language-tool-bundle.js';
import {debugCommands} from './debug-commands.js';
import {noAwait} from './async.js';
import {backupCommands} from './backup-commands.js';
import {yesNoBundle} from './yes-no-bundle.js';
import {editBlockSelectionIndent} from './edits/indent-block-selection.js';
import {editInlineIndent} from './edits/indent-inline.js';
import {removeSelectedNodes} from './edits/remove-selected-nodes.js';
import {editInlineNode} from './edits/edit-inline-node.js';
import {insertLineBreak, insertParagraph} from './edits/insert-paragraph.js';
import {deleteContentBackwards} from './edits/delete-content-backwards.js';

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
  readonly selection: Iterable<ViewModelNode>;
  readonly node: ViewModelNode;
  readonly root: ViewModelNode;
}

@customElement('pkm-editor')
export class Editor extends LitElement {
  defaultName?: string;
  @property({type: String, reflect: true})
  status: 'loading' | 'loaded' | 'error' | undefined;
  @state() private document?: Document;
  @state() private root?: ViewModelNode;
  private name?: string;
  @consume({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
  @query('md-block-render') private markdownRenderer!: MarkdownRenderer;
  @query('pkm-autocomplete') private autocomplete!: Autocomplete;
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
        pkm-title {
          display: block;
          position: sticky;
          top: 0;
          padding-bottom: 0.5em;
          background: var(--root-background-color);
        }
      `,
    ];
  }
  constructor() {
    super();
  }
  override render() {
    return html` <pkm-title
        .node=${this.root}
        @title-item-click=${this.onTitleItemClick}
      ></pkm-title>
      <div id="content">
        <md-block-render
          .block=${this.root}
          @inline-input=${this.onInlineInput}
          @inline-link-click=${this.onInlineLinkClick}
          @inline-keydown=${this.onInlineKeyDown}
        ></md-block-render>
      </div>
      <pkm-autocomplete></pkm-autocomplete>`;
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
  override async connectedCallback() {
    super.connectedCallback();
    await this.updateComplete;
    if (this.defaultName !== undefined) {
      await this.navigateByName(this.defaultName, true);
    }
  }
  serialize() {
    return this.document!.tree.serialize();
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
          new CustomEvent('editor-commands', {
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
          new CustomEvent('editor-commands', {
            detail: new SimpleCommandBundle(
              `"${name}" does not exist, create it?`,
              [
                {
                  description: 'Yes',
                  execute: async () =>
                    void this.createAndNavigateByName(name, fireEvent),
                },
                {
                  description: 'No',
                  execute: async () => void 0,
                },
              ],
            ),
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
    assert(document.tree === root.viewModel.tree);
    assert(root.viewModel.connected);
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
    let edit: Disposable | undefined;
    let endFocus: {node: ViewModelNode; offset: number} | undefined;
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
        // TODO: Capture current focus.
        edit ||= this.node.viewModel.tree.edit();
      },
      keepFocus() {
        if (hostContext.selectionFocus) {
          this.focus(hostContext.selectionFocus, 0);
        } else if (element instanceof MarkdownInline) {
          const selection = element.getSelection();
          const offset = selection?.start.index ?? 0;
          this.focus(this.node, offset);
        } else {
          // TODO: find focus?
          throw new Error('TODO: keep focus called but no target');
        }
      },
      clearSelection() {
        hostContext.clearSelection();
      },
      get selection() {
        return hostContext.selection;
      },
    };
    try {
      return action(context, ...args);
    } finally {
      edit?.[Symbol.dispose]();
      if (edit && !endFocus) {
        // TODO: also check that the focus is still connected
        console.warn(`Edit action: "${action.name}" did not set focus`);
      } else if (endFocus) {
        hostContext.focusNode = endFocus.node;
        hostContext.focusOffset = endFocus.offset;
        endFocus.node.viewModel.observe.notify();
      }
    }
  }
  onInlineLinkClick({detail: {destination}}: CustomEvent<InlineLinkClick>) {
    if (/^(\w)+:/i.test(destination)) {
      window.open(destination);
    } else {
      noAwait(this.navigateByName(destination, true));
    }
  }
  onTitleItemClick({detail}: CustomEvent<ViewModelNode>) {
    this.root = detail;
  }
  onInlineKeyDown(event: CustomEvent<InlineKeyDown>) {
    // This function must only handle key events that do not generate text.
    // So as not to confuse handling here with insertText in onInlineInput.
    const {
      detail: {inline, node, keyboardEvent},
    } = event;
    const hostContext = cast(inline.hostContext);

    assert(inline.node);
    if (this.autocomplete.onInlineKeyDown(event)) {
      return;
    } else if (
      ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(
        keyboardEvent.key,
      )
    ) {
      keyboardEvent.preventDefault();
      const direction = ['ArrowUp', 'ArrowLeft'].includes(keyboardEvent.key)
        ? 'backward'
        : 'forward';
      const alter = keyboardEvent.shiftKey ? 'extend' : 'move';
      const granularity = ['ArrowUp', 'ArrowDown'].includes(keyboardEvent.key)
        ? 'line'
        : keyboardEvent.ctrlKey
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
          node: ViewModelNode,
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
    } else if (keyboardEvent.key === 'Tab') {
      keyboardEvent.preventDefault();
      const mode = keyboardEvent.shiftKey ? 'unindent' : 'indent';
      const blockTarget = getBlockSelectionTarget(inline);
      if (blockTarget) {
        this.runEditAction(blockTarget, editBlockSelectionIndent, mode);
      } else {
        this.runEditAction(inline, editInlineIndent, mode);
      }
    } else if (keyboardEvent.key === 'z' && keyboardEvent.ctrlKey) {
      event.preventDefault();
      this.document?.tree.undo();
    } else if (keyboardEvent.key === 'y' && keyboardEvent.ctrlKey) {
      event.preventDefault();
      this.document?.tree.redo();
    } else if (keyboardEvent.key === 'a' && keyboardEvent.ctrlKey) {
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
          focusNode(hostContext, inline.node);
          hostContext.setSelection(node, node);
        }
      }
    } else if (keyboardEvent.key === 'c' && keyboardEvent.ctrlKey) {
      const {hostContext} = getBlockSelectionTarget(inline) ?? {};
      if (!hostContext) return;
      keyboardEvent.preventDefault();
      noAwait(copyMarkdownToClipboard(serializeSelection(hostContext)));
    } else if (keyboardEvent.key === 'x' && keyboardEvent.ctrlKey) {
      const selectionTarget = getBlockSelectionTarget(inline);
      if (!selectionTarget?.hostContext) return;
      keyboardEvent.preventDefault();
      noAwait(
        copyMarkdownToClipboard(
          serializeSelection(selectionTarget.hostContext),
        ),
      );
      this.runEditAction(selectionTarget, removeSelectedNodes);
    } else if (keyboardEvent.key === 'Escape') {
      hostContext.clearSelection();
    } else if (keyboardEvent.key === 'Backspace') {
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
        const newFocus = insertMarkdown(mdText, node);
        if (newFocus) {
          context.focus(newFocus, Infinity);
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
      inputEvent.inputType === 'deleteContentBackward'
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
    if (inputEvent.inputType === 'deleteContentBackward') {
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
  getCommands(): CommandBundle {
    const {
      inline: activeInline,
      startIndex,
      endIndex,
    } = this.markdownRenderer.getInlineSelection();
    const activeNode = activeInline?.node;
    const inTopLevelDocument =
      activeNode?.viewModel.tree === (this.root?.viewModel.tree ?? false);
    const transclusion =
      activeInline && getContainingTransclusion(activeInline);
    const {hostContext: selectionHostContext} =
      (activeInline && getBlockSelectionTarget(activeInline)) ?? {};
    return new SimpleCommandBundle('Choose command...', [
      {
        description: 'Find, Open, Create...',
        execute: async () => {
          return new BlockCommandBundle(
            'Find, Open, Create',
            this.library,
            async ({document, root}) =>
              void this.navigate(document, root, true),
            async ({name}) => void this.createAndNavigateByName(name, true),
          );
        },
      },
      {
        description: 'Sync all',
        execute: async () => void (await this.library.restore()),
      },
      {
        description: 'Force save',
        execute: async () => void this.document?.save(),
      },
      {
        description: 'Copy all',
        execute: async () => {
          const markdown = serializeToString(this.document!.tree.root);
          await copyMarkdownToClipboard(markdown);
        },
        preview: () => html`<pre>${serializeToString(this.root!)}</pre>`,
      },
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
                    await this.navigateByName('index', true);
                  },
                });
              },
            },
          ]
        : []),
      // TODO: Should this use selectionHostContext?
      ...(activeInline?.hostContext?.hasSelection
        ? [
            {
              description: 'Send to...',
              execute: async () => {
                return new BlockCommandBundle(
                  'Send to',
                  this.library,
                  async (result) =>
                    void sendTo(result, this, activeInline, 'remove'),
                  async (result) =>
                    void sendTo(result, this, activeInline, 'remove'),
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
                    void sendTo(result, this, activeInline, 'transclude'),
                  async (result) =>
                    void sendTo(result, this, activeInline, 'transclude'),
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
                    void sendTo(result, this, activeInline, 'link'),
                  async (result) =>
                    void sendTo(result, this, activeInline, 'link'),
                );
              },
            },
          ]
        : []),
      {
        description: 'Backlinks',
        execute: async () => {
          const action = async (command: Command) =>
            void this.navigateByName(command.description, true);
          const commands = this.library.backLinks
            .getBacklinksByDocument(this.document!, this.library)
            .map((name) => ({
              description: name,
              execute: action,
            }));
          return new SimpleCommandBundle('Open Backlink', commands);
        },
      },
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
            },
          ]
        : []),
      ...(inTopLevelDocument && this.root !== this.document?.tree.root
        ? [
            {
              description: 'Focus on containing block',
              execute: async () => {
                if (this.root?.viewModel.parent)
                  this.root = getLogicalContainingBlock(
                    this.root.viewModel.parent,
                  );
                if (activeNode && activeInline)
                  focusNode(
                    cast(activeInline.hostContext),
                    activeNode,
                    startIndex,
                  );
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
            },
          ]
        : []),
      ...(transclusion
        ? [
            {
              description: 'Delete transclusion',
              execute: async () => {
                using _ = transclusion.node!.viewModel.tree.edit();
                transclusion.node!.viewModel.remove();
                // TODO: focus
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
                  using _ = activeNode.viewModel.tree.edit();
                  const newParagraph = activeNode.viewModel.tree.add({
                    type: 'code-block',
                    info: 'tc',
                    content: name,
                  });
                  newParagraph.viewModel.insertBefore(
                    cast(activeNode.viewModel.parent),
                    activeNode.viewModel.nextSibling,
                  );
                  focusNode(activeInline.hostContext!, newParagraph);
                  return undefined;
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
                using _ = node.viewModel.tree.edit();
                const newParagraph = node.viewModel.tree.add({
                  type: 'paragraph',
                  content: '',
                });
                newParagraph.viewModel.insertBefore(
                  cast(node.viewModel.parent),
                  node,
                );
                focusNode(cast(transclusion.hostContext), newParagraph, 0);
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
                using _ = node.viewModel.tree.edit();
                const newParagraph = node.viewModel.tree.add({
                  type: 'paragraph',
                  content: '',
                });
                newParagraph.viewModel.insertBefore(
                  cast(node.viewModel.parent),
                  node.viewModel.nextSibling,
                );
                focusNode(cast(transclusion.hostContext), newParagraph, 0);
              },
            },
          ]
        : []),
      ...(activeInline?.hostContext?.hasSelection
        ? getLanguageTools(() => serializeSelection(activeInline.hostContext!))
        : []),
      ...debugCommands(this.library),
      ...backupCommands(this.library.backup),
    ]);
  }
}

function performLogicalInsertion(
  context: ViewModelNode,
  nodes: ViewModelNode[],
) {
  let {parent, nextSibling} = nextLogicalInsertionPoint(context);
  if (context.type === 'section') {
    // Insertion into a section is append-only. Mainly so that send-to section
    // is sensible.
    parent = context;
    nextSibling = undefined;
    for (const node of nodes) {
      if (node.type === 'section') {
        const list = parent.viewModel.tree.add({type: 'list'});
        const listItem = parent.viewModel.tree.add({
          type: 'list-item',
          marker: '* ',
        });
        list.viewModel.insertBefore(parent, nextSibling);
        listItem.viewModel.insertBefore(list);
        parent = listItem;
        nextSibling = undefined;
        break;
      }
    }
  } else if (parent.type == 'list') {
    if (nodes.length === 1 && nodes[0].type === 'list') {
      const [node] = nodes;
      nodes = [...children(node)];
    } else {
      const listItem = parent.viewModel.tree.add({
        type: 'list-item',
        // TODO: infer from list
        marker: '* ',
      });
      listItem.viewModel.insertBefore(parent, nextSibling);
      parent = listItem;
      nextSibling = undefined;
    }
  }
  for (const node of nodes) {
    node.viewModel.insertBefore(parent, nextSibling);
  }
}
function nextLogicalInsertionPoint(node: ViewModelNode) {
  if (
    !node.viewModel.nextSibling &&
    node.viewModel.parent?.type === 'list-item'
  ) {
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

async function sendTo(
  {root, name}: {root?: ViewModelNode; name: string},
  editor: Editor,
  element: Element & {hostContext?: HostContext; node?: ViewModelNode},
  mode: 'remove' | 'transclude' | 'link',
) {
  if (!root) {
    root = (await editor.library.newDocument(name)).tree.root;
  }
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
      replacement = focus.viewModel.tree.add({
        type: 'code-block',
        info: 'tc',
        content: targetName,
      });
      break;
    case 'link':
      replacement = focus.viewModel.tree.add({
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
    insertMarkdown(markdown, root.viewModel.lastChild ?? root);
    replacement?.viewModel.insertBefore(cast(focus.viewModel.parent), focus);
    removeSelectedNodes(context);
  });
}

function insertMarkdown(markdown: string, node: ViewModelNode) {
  const {node: root} = parseBlocks(markdown + '\n');
  if (!root) return;
  assert(root.type === 'document' && root.children);
  const newNodes = root.children.map((newNode) =>
    node.viewModel.tree.add<MarkdownNode>(newNode),
  );
  const newFocus = findFinalEditable(newNodes[0]);
  performLogicalInsertion(node, newNodes);
  return newFocus;
}

async function copyMarkdownToClipboard(markdown: string) {
  const textType = 'text/plain';
  const mdType = 'web text/markdown';
  await navigator.clipboard.write([
    new ClipboardItem({
      [textType]: new Blob([markdown], {type: textType}),
      [mdType]: new Blob([markdown], {type: mdType}),
    }),
  ]);
}

function serializeSelection(hostContext: HostContext) {
  // This is complex because:
  // 1. Sections can be disjoint.
  // 2. Expecations of what to serialize is different to the set of selected
  //    nodes. For example, if the selection is a paragaph immediately inside
  //    a list-item, we should serialize the list-item too.
  // The approach here is:
  // 1. Recursively expand the selection to include ancestor nodes, when the
  //    selected node is the first child.
  // 2. Combine the selected nodes when one is an ancestor of another.
  // 3. Clone the selected nodes, removing any inline nodes that were not
  //    part of the original selection.
  // 4. Build a new document, append the clones (triggering normalization)
  // 5. Serialize the new document.
  const expand = (node: ViewModelNode) => {
    let result = node;
    if (node.viewModel.previousSibling) {
      return result;
    }
    for (const ancestor of ancestors(node, cast(hostContext.root))) {
      if (ancestor.type === 'section') {
        break;
      }
      result = ancestor;
      if (ancestor.viewModel.previousSibling) {
        break;
      }
    }
    return result;
  };
  const predicate = (node: ViewModelNode) => {
    switch (node.type) {
      case 'section':
      case 'paragraph':
      case 'code-block':
        return hostContext.selection.has(node);
      case 'unsupported':
        return false;
      default:
        return true;
    }
  };
  const roots = removeDescendantNodes(
    [...hostContext.selection.values()].map(expand),
  ).map((node) => cloneNode(node, predicate));
  const tree = new MarkdownTree({
    type: 'document',
  });
  {
    using _ = tree.edit();
    // The document will have an empty paragraph due to normalization.
    cast(tree.root.children)[0].viewModel.remove();
    for (const root of roots) {
      const node = tree.add<MarkdownNode>(root);
      node.viewModel.insertBefore(tree.root);
    }
  }
  return serializeToString(tree.root);
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-editor': Editor;
  }
  interface HTMLElementEventMap {
    'editor-navigate': CustomEvent<EditorNavigation>;
    'editor-commands': CustomEvent<CommandBundle>;
  }
}

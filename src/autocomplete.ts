// Copyright 2023 Google LLC
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
import './command-palette.js';

import {consume} from '@lit/context';
import {libraryContext} from './app-context.js';
import {css, html, LitElement} from 'lit';
import {property, customElement, query, state} from 'lit/decorators.js';
import {InlineKeyDown} from './markdown/inline-render.js';
import {InlineViewModelNode, viewModel} from './markdown/view-model-node.js';
import {MarkdownInline} from './markdown/inline-render.js';
import {
  SimpleCommandBundle,
  Command,
  CommandPalette,
} from './command-palette.js';
import {Library} from './library.js';
import {BlockCommandBundle} from './block-command-bundle.js';
import {noAwait} from './async.js';
import {EditContext, Editor} from './editor.js';
import {findAncestor} from './markdown/view-model-util.js';
import {findIndentTarget, indent} from './indent-util.js';
import {assert} from './asserts.js';

@customElement('pkm-autocomplete')
export class Autocomplete extends LitElement {
  static override styles = css`
    :host {
      display: none;
    }
    :host([state='active']) {
      display: block;
      position: absolute;
      top: var(--y);
      left: var(--x);
      color: var(--root-color);
      margin-top: 5px;
      background: var(--pkm-dialog-bgcolor);
      border: 3px solid var(--md-accent-color);
      border-radius: 10px;
      width: 500px;
      display: grid;
      padding: 0;
      max-height: 300px;
      overflow: hidden;
    }
  `;
  @query('pkm-command-palette') accessor palette!: CommandPalette;
  @property({reflect: true})
  accessor state: 'active' | 'inactive' = 'inactive';
  node?: InlineViewModelNode;
  startIndex = 0;
  @state()
  accessor endIndex = 0;
  @consume({context: libraryContext, subscribe: true})
  @state()
  accessor library!: Library;
  @property({reflect: false, attribute: false})
  accessor editor!: Editor;
  override render() {
    return html`
      <pkm-command-palette
        @commit=${this.abort}
        collapsed
      ></pkm-command-palette>
    `;
  }
  onInlineKeyDown({detail: {keyboardEvent}}: CustomEvent<InlineKeyDown>) {
    if (this.state !== 'active') return false;
    if (keyboardEvent.key === 'ArrowUp') {
      this.palette.previous();
      keyboardEvent.preventDefault();
      return true;
    } else if (keyboardEvent.key === 'ArrowDown') {
      this.palette.next();
      keyboardEvent.preventDefault();
      return true;
    } else if (['Tab', 'Enter'].includes(keyboardEvent.key)) {
      noAwait(this.palette.commit());
      keyboardEvent.preventDefault();
      return true;
    } else if (
      ['ArrowLeft', 'ArrowRight', 'Escape'].includes(keyboardEvent.key)
    ) {
      this.abort();
    }
    return false;
  }
  private listener = (e: PointerEvent) => {
    for (const target of e.composedPath()) {
      if (target instanceof Element && this.contains(target)) {
        return;
      }
    }
    this.abort();
  };
  abort() {
    this.state = 'inactive';
    this.startIndex = 0;
    this.endIndex = 0;
    this.node = undefined;
    document.removeEventListener('pointerdown', this.listener);
  }
  activate(inline: MarkdownInline, index: number) {
    const {x, y} = inline.getCaretPosition();
    this.style.setProperty('--x', x + 'px');
    this.style.setProperty('--y', y + 'px');
    this.state = 'active';
    this.node = inline.node!;
    this.startIndex = index;
    this.endIndex = index;
    document.addEventListener('pointerdown', this.listener);
  }
  private getLinkInsertionCommand(inline: MarkdownInline): Command {
    const node = inline.node!;
    const action = async ({name: arg}: {name: string}) => {
      this.editor.runEditAction(inline, (context: EditContext) => {
        context.startEditing();
        const newEndIndex = this.startIndex + arg.length;
        node[viewModel].edit({
          startIndex: this.startIndex,
          newEndIndex,
          oldEndIndex: this.endIndex,
          newText: arg,
        });
        context.focus(inline.node!, newEndIndex + 1);
      });
    };
    return {
      description: 'Link...',
      execute: async () => {
        return new BlockCommandBundle('Link', this.library, action, action);
      },
    };
  }
  getSlashCommandWrapper(inline: MarkdownInline, command: Command): Command {
    const node = inline.node!;
    return {
      execute: async (_command, updatePreview) => {
        this.editor.runEditAction(inline, (context: EditContext) => {
          context.startEditing();
          node[viewModel].edit({
            // TODO: numbers are too contextual
            startIndex: this.startIndex - 1,
            newEndIndex: this.startIndex + 2,
            oldEndIndex: this.endIndex,
            newText: '[]',
          });
          this.endIndex = this.startIndex;
          context.focus(node, this.startIndex);
        });
        return command.execute(command, updatePreview);
      },
      description: command.description,
    };
  }

  async onInlineEdit(
    context: EditContext,
    inline: MarkdownInline,
    newText: string,
    cursorIndex: number,
  ) {
    const node = inline.node;
    if (!node) return;
    if (this.node !== node || cursorIndex < this.startIndex) {
      this.abort();
    }
    if (this.state === 'inactive') {
      if (newText === '[') {
        context.startEditing();
        this.activate(inline, cursorIndex);
        node[viewModel].edit({
          startIndex: cursorIndex,
          newEndIndex: cursorIndex + 1,
          oldEndIndex: cursorIndex,
          newText: ']',
        });
        await this.palette.triggerCommand(this.getLinkInsertionCommand(inline));
      } else if (newText === '/') {
        await this.palette.trigger(
          new SimpleCommandBundle('Run command...', [
            this.getSlashCommandWrapper(
              inline,
              this.getLinkInsertionCommand(inline),
            ),
            {
              description: 'Task',
              execute: async () => {
                this.editor.runEditAction(inline, (context: EditContext) => {
                  let target = findIndentTarget(node, context.root);
                  if (target[viewModel].parent?.type !== 'list-item') {
                    indent(node, context.root);
                    target = findIndentTarget(node, context.root);
                  }
                  const listItem = target[viewModel].parent;
                  assert(listItem);
                  assert(listItem.type === 'list-item');
                  context.startEditing();
                  if (listItem.checked === undefined) {
                    listItem[viewModel].updateChecked(false);
                  } else {
                    listItem[viewModel].updateChecked(undefined);
                  }

                  node[viewModel].edit({
                    // TODO: numbers are too contextual
                    startIndex: this.startIndex - 1,
                    newEndIndex: this.startIndex + 2,
                    oldEndIndex: this.endIndex,
                    newText: '',
                  });
                  this.endIndex = this.startIndex;
                  context.focus(node, this.startIndex - 1);
                });
              },
            },
            {
              description: 'Done',
              execute: async () => {
                this.editor.runEditAction(inline, (context: EditContext) => {
                  const {ancestor: target} = findAncestor(
                    node,
                    context.root,
                    'list-item',
                  );
                  if (target) {
                    assert(target.type === 'list-item');
                    target[viewModel].updateChecked(true);
                  }
                  node[viewModel].edit({
                    // TODO: numbers are too contextual
                    startIndex: this.startIndex - 1,
                    newEndIndex: this.startIndex + 2,
                    oldEndIndex: this.endIndex,
                    newText: '',
                  });
                  this.endIndex = this.startIndex;
                  context.focus(node, this.startIndex - 1);
                });
              },
            },
          ]),
        );
        this.activate(inline, cursorIndex);
      }
    } else if (newText === ']') {
      context.startEditing();
      node[viewModel].edit({
        startIndex: cursorIndex - 1,
        newEndIndex: cursorIndex - 1,
        oldEndIndex: cursorIndex,
        newText: '',
      });
      this.abort();
    } else {
      this.endIndex = cursorIndex;
    }
    if (this.state === 'active') {
      await this.palette.setInput(
        node.content.substring(this.startIndex, this.endIndex),
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-autocomplete': Autocomplete;
  }
}

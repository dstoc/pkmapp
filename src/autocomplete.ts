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

import {consume} from './deps/lit-context.js';
import {libraryContext} from './app-context.js';
import {
  css,
  query,
  customElement,
  html,
  LitElement,
  property,
  state,
} from './deps/lit.js';
import {InlineKeyDown} from './markdown/inline-render.js';
import {InlineViewModelNode} from './markdown/view-model-node.js';
import {MarkdownInline} from './markdown/inline-render.js';
import {
  SimpleCommandBundle,
  Command,
  CommandPalette,
} from './command-palette.js';
import {focusNode} from './markdown/host-context.js';
import {Library} from './library.js';
import {BlockCommandBundle} from './block-command-bundle.js';
import {noAwait} from './async.js';
import {EditContext} from './editor.js';

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
  @query('pkm-command-palette') palette!: CommandPalette;
  @property({reflect: true})
  state: 'active' | 'inactive' = 'inactive';
  node?: InlineViewModelNode;
  startIndex = 0;
  @state()
  endIndex = 0;
  @consume({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
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
  abort() {
    this.state = 'inactive';
    this.startIndex = 0;
    this.endIndex = 0;
    this.node = undefined;
  }
  activate(inline: MarkdownInline, index: number) {
    const {x, y} = inline.getCaretPosition();
    this.style.setProperty('--x', x + 'px');
    this.style.setProperty('--y', y + 'px');
    this.state = 'active';
    this.node = inline.node!;
    this.startIndex = index;
    this.endIndex = index;
    document.addEventListener('pointerdown', () => this.abort(), {
      capture: true,
      once: true,
    });
  }
  private getLinkInsertionCommand(inline: MarkdownInline): Command {
    const node = inline.node!;
    const action = async ({name: arg}: {name: string}) => {
      using _ = node.viewModel.tree.edit();
      const newEndIndex = this.startIndex + arg.length;
      node.viewModel.edit({
        startIndex: this.startIndex,
        newEndIndex,
        oldEndIndex: this.endIndex,
        newText: arg,
      });
      focusNode(inline.hostContext!, inline.node!, newEndIndex + 1);
      return undefined;
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
        node.viewModel.edit({
          // TODO: numbers are too contextual
          startIndex: this.startIndex - 1,
          newEndIndex: this.startIndex + 2,
          oldEndIndex: this.endIndex,
          newText: '[]',
        });
        this.endIndex = this.startIndex;
        focusNode(inline.hostContext!, node, this.startIndex);
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
        node.viewModel.edit({
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
          ]),
        );
        this.activate(inline, cursorIndex);
      }
    } else if (newText === ']') {
      context.startEditing();
      node.viewModel.edit({
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

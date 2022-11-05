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

import {css, customElement, html, LitElement, query, state} from './deps/lit.js';

export interface Argument {
  readonly description: string;
  suggestions(): Promise<string[]>;
  validate(argument: string): boolean;
}

export interface Command {
  readonly description: string;
  readonly argument?: Argument;
  execute(argument?: string): Promise<void>;
}

@customElement('pkm-command-palette')
export class CommandPalette extends LitElement {
  @state() activeIndex = 0;
  @query('dialog') dialog!: HTMLDialogElement;
  @query('input') input!: HTMLInputElement;
  static override get styles() {
    return css`
      dialog[open] {
        color: var(--root-color);
        margin-top: 50px;
        background: red;
        background: var(--pkm-dialog-bgcolor);
        border: 3px solid var(--md-accent-color);
        border-radius: 10px;
        width: 700px;
        display: grid;
        padding: 0;
      }
      dialog::backdrop {
        backdrop-filter: blur(3px);
        background: rgba(128,128,128,0.2);
      }
      input, .item {
        border: none;
        color: var(--root-color);
        outline: none;
        background: transparent;
        font-size: 14pt;
        padding-left: 10px;
        font-family: var(--root-font);
      }
      input, #items {
        margin: 10px;
      }
      #separator {
        height: 1px;
        background: var(--md-accent-color);
        opacity: 0.25;
      }
      .item {
        padding-top: 5px;
        padding-bottom: 5px;
      }
      .item[data-active] {
        background: rgba(128,128,128,0.3);
        border-radius: 5px;
      }
      #items {
        max-height: 50vh;
        overflow: scroll;
      }
    `;
  }
  @state() pendingCommand?: Command;
  @state() items: Command[] = [];
  activeSearch?: string;
  activeItems: Command[] = [];
  override render() {
    const search = this.input?.value ?? '';
    if (search != this.activeSearch) {
      this.activeSearch = search;
      this.activeIndex = 0;
    }
    const pattern = new RegExp(
        search.replace(/(.)/g, c => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'),
        'i');
    this.activeItems = this.items.filter(item => {
      return pattern.test(item.description);
    });

    this.activeIndex =
        Math.max(0, Math.min(this.activeIndex, this.activeItems.length - 1));
    return html`
      <dialog>
        <input
            type=text
            @keydown=${this.handleInputKeyDown}
            @input=${() => this.requestUpdate()}
            placeholder=${
        this.pendingCommand?.description ?? 'Search commands...'}></input>
        <div id=separator></div>
        <div id=items>
          ${
        this.activeItems.map(
            (item, idx) => html`
          <div
              class=item
              ?data-active=${idx === this.activeIndex}
              @click=${this.handleItemClick}
              @pointermove=${() => this.activeIndex = idx}>${
                item.description}</div>
          `)}
        </div>
      </dialog>
    `;
  }
  private handleInputKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.activeIndex++;
        return;
      case 'ArrowUp':
        e.preventDefault();
        this.activeIndex--;
        return;
      case 'Enter':
        e.preventDefault();
        this.commit();
        return;
    }
  }
  private reset() {
    this.pendingCommand = undefined;
    this.input.value = '';
    this.activeIndex = 0;
    this.activeSearch = undefined;
    this.activeItems = [];
  }
  private async commit() {
    const selected = this.activeItems[this.activeIndex];
    if (selected?.argument) {
      // Made a selection, need to complete argument.
      const argument = selected.argument;
      this.reset();
      this.pendingCommand = selected;
      this.items = [];
      const items = (await argument.suggestions()).map(description => ({
                                                         description,
                                                         async execute() {},
                                                       }));
      this.items = items;
    } else if (this.pendingCommand) {
      // Argument completion.
      const argument = selected ? selected.description : this.activeSearch;
      if (!this.pendingCommand.argument!.validate(argument ?? '')) return;
      this.pendingCommand.execute(argument);
      this.dialog.close();
    } else if (selected) {
      // Made a selection, no argument needed.
      selected.execute();
      this.dialog.close();
    }
  }
  private handleItemClick() {
    this.commit();
  }
  trigger(commands: Command[]) {
    this.dialog.showModal();
    this.reset();
    this.items = commands;
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-command-palette': CommandPalette;
  }
}

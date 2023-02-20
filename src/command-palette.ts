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

import {css, customElement, html, LitElement, query, state, property} from './deps/lit.js';

export interface Command {
  readonly description: string;
  execute(): Promise<Command[]>;
  readonly executeFreeform?: (argument: string) => Promise<Command[]>;
}

@customElement('pkm-command-palette')
export class CommandPalette extends LitElement {
  @property({attribute: true}) noHeader = false;
  @state() activeIndex = 0;
  @query('input') input!: HTMLInputElement;
  static override get styles() {
    return css`
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
      :host-context([no-header]) input {
        display: none;
      }
      :host-context([no-header]) #separator {
        display: none;
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
        search.replace(
            /(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'),
        'i');
    this.activeItems = this.items.filter((item) => {
      return pattern.test(item.description);
    });

    this.activeIndex =
        Math.max(0, Math.min(this.activeIndex, this.activeItems.length - 1));
    return html`
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
    `;
  }
  private handleInputKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.next();
        return;
      case 'ArrowUp':
        e.preventDefault();
        this.previous();
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
  private handleItemClick() {
    this.commit();
  }
  setInput(input: string) {
    this.input.value = input;
    this.requestUpdate();
  }
  async commit() {
    const selected = this.activeItems[this.activeIndex];
    let next: Command[] = [];
    
    if (selected) {
      next = await selected.execute();
    } else if (this.pendingCommand?.executeFreeform && this.activeSearch !== undefined) {
      next = await this.pendingCommand.executeFreeform(this.activeSearch);
    }
    if (next.length) {
      this.trigger(next, selected);
    } else {
      this.dispatchEvent(new CustomEvent('commit'))
    }
  }
  async triggerArgument(selected: Command) {
    this.trigger(await selected.execute(), selected)
  }
  trigger(commands: Command[], pending?: Command) {
    this.reset();
    this.pendingCommand = pending;
    this.items = commands;
    this.requestUpdate();
  }
  next() {
    this.activeIndex++;
  }
  previous() {
    this.activeIndex--;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-command-palette': CommandPalette;
  }
}

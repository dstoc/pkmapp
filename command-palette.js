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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { css, customElement, html, LitElement, query, state } from './deps/lit.js';
let CommandPalette = class CommandPalette extends LitElement {
    constructor() {
        super(...arguments);
        this.activeIndex = 0;
        this.items = [];
        this.activeItems = [];
    }
    static get styles() {
        return css `
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
    render() {
        const search = this.input?.value ?? '';
        if (search != this.activeSearch) {
            this.activeSearch = search;
            this.activeIndex = 0;
            const pattern = new RegExp(search.replace(/(.)/g, c => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'), 'i');
            this.activeItems = this.items.filter(item => {
                return pattern.test(item.description);
            });
        }
        this.activeIndex =
            Math.max(0, Math.min(this.activeIndex, this.activeItems.length - 1));
        return html `
      <dialog>
        <input
            type=text
            @keydown=${this.handleInputKeyDown}
            @input=${() => this.requestUpdate()}
            placeholder=${this.pendingCommand?.description ?? 'Search commands...'}></input>
        <div id=separator></div>
        <div id=items>
          ${this.activeItems.map((item, idx) => html `
          <div
              class=item
              ?data-active=${idx === this.activeIndex}
              @click=${this.handleItemClick}
              @pointermove=${() => this.activeIndex = idx}>${item.description}</div>
          `)}
        </div>
      </dialog>
    `;
    }
    handleInputKeyDown(e) {
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
    reset() {
        this.pendingCommand = undefined;
        this.input.value = '';
        this.activeIndex = 0;
        this.activeSearch = undefined;
        this.activeItems = [];
    }
    commit() {
        const selected = this.activeItems[this.activeIndex];
        if (selected?.argument) {
            // Made a selection, need to complete argument.
            const argument = selected.argument;
            this.reset();
            this.pendingCommand = selected;
            this.items = argument.suggestions.map(description => ({
                description,
                async execute() { },
            }));
        }
        else if (this.pendingCommand) {
            // Argument completion.
            const argument = selected ? selected.description : this.activeSearch;
            if (!this.pendingCommand.argument.validate(argument ?? ''))
                return;
            this.pendingCommand.execute(argument);
            this.dialog.close();
        }
        else if (selected) {
            // Made a selection, no argument needed.
            selected.execute();
            this.dialog.close();
        }
    }
    handleItemClick() {
        this.commit();
    }
    trigger(commands) {
        this.dialog.showModal();
        this.reset();
        this.items = commands;
        this.requestUpdate();
    }
};
__decorate([
    state()
], CommandPalette.prototype, "activeIndex", void 0);
__decorate([
    query('dialog')
], CommandPalette.prototype, "dialog", void 0);
__decorate([
    query('input')
], CommandPalette.prototype, "input", void 0);
__decorate([
    state()
], CommandPalette.prototype, "pendingCommand", void 0);
__decorate([
    state()
], CommandPalette.prototype, "items", void 0);
CommandPalette = __decorate([
    customElement('pkm-command-palette')
], CommandPalette);
export { CommandPalette };
//# sourceMappingURL=command-palette.js.map
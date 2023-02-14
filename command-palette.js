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
import { css, customElement, html, LitElement, query, state, property } from './deps/lit.js';
let CommandPalette = class CommandPalette extends LitElement {
    constructor() {
        super(...arguments);
        this.noHeader = false;
        this.activeIndex = 0;
        this.items = [];
        this.activeItems = [];
    }
    static get styles() {
        return css `
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
    render() {
        const search = this.input?.value ?? '';
        if (search != this.activeSearch) {
            this.activeSearch = search;
            this.activeIndex = 0;
        }
        const pattern = new RegExp(search.replace(/(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'), 'i');
        this.activeItems = this.items.filter((item) => {
            return pattern.test(item.description);
        });
        this.activeIndex =
            Math.max(0, Math.min(this.activeIndex, this.activeItems.length - 1));
        return html `
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
    `;
    }
    handleInputKeyDown(e) {
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
    reset() {
        this.pendingCommand = undefined;
        this.input.value = '';
        this.activeIndex = 0;
        this.activeSearch = undefined;
        this.activeItems = [];
    }
    handleItemClick() {
        this.commit();
    }
    setInput(input) {
        this.input.value = input;
        this.requestUpdate();
    }
    async commit() {
        const selected = this.activeItems[this.activeIndex];
        if (selected?.argument) {
            // Made a selection, need to complete argument.
            this.triggerArgument(selected);
        }
        else if (this.pendingCommand) {
            // Argument completion.
            const argument = selected ? selected.description : this.activeSearch;
            if (!this.pendingCommand.argument.validate(argument ?? ''))
                return;
            this.pendingCommand.execute(argument);
            this.dispatchEvent(new CustomEvent('commit'));
        }
        else if (selected) {
            // Made a selection, no argument needed.
            selected.execute();
            this.dispatchEvent(new CustomEvent('commit'));
        }
    }
    async triggerArgument(selected) {
        const argument = selected.argument;
        this.reset();
        this.pendingCommand = selected;
        this.items = [];
        const items = (await argument.suggestions()).map((description) => ({
            description,
            async execute() { },
        }));
        this.items = items;
    }
    trigger(commands, pending) {
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
};
__decorate([
    property({ attribute: true })
], CommandPalette.prototype, "noHeader", void 0);
__decorate([
    state()
], CommandPalette.prototype, "activeIndex", void 0);
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
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
import { cast } from './asserts.js';
export class SimpleCommandBundle {
    constructor(description, commands, freeform) {
        this.description = description;
        this.commands = commands;
        this.freeform = freeform;
    }
    async getCommands(input) {
        const pattern = new RegExp(input.replace(/(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'), 'i');
        const commands = this.commands.filter(({ description }) => pattern.test(description));
        if (this.freeform)
            commands.push({ ...this.freeform, description: input });
        return commands;
    }
}
let CommandPalette = class CommandPalette extends LitElement {
    constructor() {
        super(...arguments);
        this.noHeader = false;
        this.activeIndex = 0;
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
        return html `
      <input
          type=text
          @keydown=${this.handleInputKeyDown}
          @input=${() => this.onInput()}
          placeholder=${this.bundle?.description ?? ''}></input>
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
    async onInput() {
        const search = this.input?.value ?? '';
        if (search != this.activeSearch) {
            this.activeSearch = search;
            this.activeIndex = 0;
        }
        this.activeItems = this.bundle ? await this.bundle.getCommands(search, 100) : [];
        this.activeIndex =
            Math.max(0, Math.min(this.activeIndex, this.activeItems.length - 1));
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
    async reset() {
        this.input.value = '';
        this.activeIndex = 0;
        this.activeSearch = undefined;
        this.activeItems = [];
    }
    handleItemClick() {
        this.commit();
    }
    async setInput(input) {
        this.input.value = input;
        await this.onInput();
    }
    async commit() {
        const selected = this.activeItems[this.activeIndex];
        const next = await selected.execute(selected);
        if (next) {
            await this.trigger(next);
        }
        else {
            this.dispatchEvent(new CustomEvent('commit'));
        }
    }
    async trigger(bundle) {
        await this.reset();
        this.bundle = bundle;
        await this.onInput();
    }
    async triggerCommand(command) {
        const bundle = await command.execute(command);
        await this.trigger(cast(bundle));
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
    state()
], CommandPalette.prototype, "bundle", void 0);
__decorate([
    state()
], CommandPalette.prototype, "activeItems", void 0);
__decorate([
    query('input')
], CommandPalette.prototype, "input", void 0);
CommandPalette = __decorate([
    customElement('pkm-command-palette')
], CommandPalette);
export { CommandPalette };
//# sourceMappingURL=command-palette.js.map
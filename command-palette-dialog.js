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
import './command-palette.js';
import { css, customElement, html, LitElement, query } from './deps/lit.js';
let CommandPaletteDialog = class CommandPaletteDialog extends LitElement {
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
    `;
    }
    render() {
        return html `
      <dialog>
        <pkm-command-palette @commit=${this.commit}></pkm-command-palette>
      </dialog>
    `;
    }
    commit() {
        this.dialog.close();
    }
    trigger(commands) {
        this.palette.trigger(commands);
        this.dialog.showModal();
    }
};
__decorate([
    query('dialog')
], CommandPaletteDialog.prototype, "dialog", void 0);
__decorate([
    query('pkm-command-palette')
], CommandPaletteDialog.prototype, "palette", void 0);
CommandPaletteDialog = __decorate([
    customElement('pkm-command-palette-dialog')
], CommandPaletteDialog);
export { CommandPaletteDialog };
//# sourceMappingURL=command-palette-dialog.js.map
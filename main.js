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
import './markdown/block-render.js';
import './editor.js';
import './command-palette.js';
import { libraryContext } from './app-context.js';
import { contextProvider } from './deps/lit-labs-context.js';
import { customElement, html, LitElement, query, render, state } from './deps/lit.js';
import { FileSystemLibrary } from './library.js';
import { styles } from './style.js';
// TODO: why can't we place this in an element's styles?
document.adoptedStyleSheets = [...styles];
let PkmApp = class PkmApp extends LitElement {
    constructor() {
        super();
        document.addEventListener('keydown', (e) => {
            if (e.key === 'p' && e.ctrlKey) {
                e.preventDefault();
                this.commandPalette.trigger([
                    // ...this.getCommands(),
                    ...this.editor.getCommands(),
                ]);
            }
        });
    }
    render() {
        if (!this.library) {
            return html `
        <button id=opendir @click=${this.ensureDirectory}>
          Open directory...
        </button>
      `;
        }
        return html `
      <pkm-editor></pkm-editor>
      <pkm-command-palette></pkm-command-palette>
    `;
    }
    async connectedCallback() {
        super.connectedCallback();
        const url = new URL(location.toString());
        if (url.searchParams.has('opfs')) {
            await this.ensureDirectory();
        }
    }
    async ensureDirectory() {
        if (!this.library) {
            const url = new URL(location.toString());
            if (url.searchParams.has('opfs')) {
                const opfs = await navigator.storage.getDirectory();
                const path = url.searchParams.get('opfs');
                this.library = new FileSystemLibrary(path == '' ? opfs :
                    await opfs.getDirectoryHandle(path, { create: true }));
            }
            else {
                this.library = new FileSystemLibrary(await showDirectoryPicker({ mode: 'readwrite' }));
            }
        }
        return this.library;
    }
};
__decorate([
    query('pkm-editor')
], PkmApp.prototype, "editor", void 0);
__decorate([
    query('pkm-command-palette')
], PkmApp.prototype, "commandPalette", void 0);
__decorate([
    contextProvider({ context: libraryContext }),
    state()
], PkmApp.prototype, "library", void 0);
PkmApp = __decorate([
    customElement('pkm-app')
], PkmApp);
export { PkmApp };
onunhandledrejection = (e) => console.error(e.reason);
onerror = (event, source, lineno, colno, error) => console.error(event, error);
render(html `<pkm-app></pkm-app>`, document.body);
//# sourceMappingURL=main.js.map
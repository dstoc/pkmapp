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
import './command-palette-dialog.js';
import { libraryContext } from './app-context.js';
import { contextProvider } from './deps/lit-labs-context.js';
import { customElement, html, LitElement, query, render, state } from './deps/lit.js';
import { FileSystemLibrary } from './library.js';
import { styles } from './style.js';
import { getDirectory, setDirectory } from './directory-db.js';
import { resolve } from './resolve.js';
// TODO: why can't we place this in an element's styles?
document.adoptedStyleSheets = [...styles];
let PkmApp = class PkmApp extends LitElement {
    constructor() {
        super();
        this.initialLocation = location.toString();
        this.loading = false;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'p' && e.ctrlKey) {
                e.preventDefault();
                this.commandPalette.trigger(this.editor.getCommands());
            }
        });
        window.addEventListener('popstate', (e) => {
            this.editor.navigateByName(e.state);
        });
    }
    render() {
        const url = new URL(this.initialLocation);
        const basePath = new URL(resolve('./')).pathname;
        const defaultName = url.searchParams.has('no-default') ? undefined : decodeURIComponent(url.pathname.substring(basePath.length)) || 'index';
        if (!this.library) {
            return html `pkmapp`;
        }
        return html `
      <pkm-editor
          @editor-navigate=${this.onEditorNavigate}
          @editor-commands=${this.onCommands}
          .defaultName=${defaultName}></pkm-editor>
      <pkm-command-palette-dialog></pkm-command-palette-dialog>
    `;
    }
    async connectedCallback() {
        super.connectedCallback();
        const task = async () => {
            await this.trySetDirectory();
            if (!this.library) {
                setTimeout(task, 100);
            }
        };
        task();
    }
    onCommands({ detail: commands }) {
        this.commandPalette.trigger(commands);
    }
    onEditorNavigate({ detail: navigation }) {
        // TODO: use root name (metadata)
        const name = navigation.document.name;
        document.title = `${name} - pkmapp`;
        const url = new URL(this.initialLocation.toString());
        url.pathname = new URL(resolve('./' + name)).pathname;
        url.searchParams.delete('path');
        if (navigation.kind === 'replace' || !history.state) {
            history.replaceState(name, '', url.toString());
        }
        else {
            history.pushState(name, '', url.toString());
        }
    }
    async trySetDirectory() {
        if (this.library)
            return;
        if (this.loading)
            return;
        this.loading = true;
        try {
            const url = new URL(location.toString());
            let library;
            if (url.searchParams.has('opfs')) {
                const opfs = await navigator.storage.getDirectory();
                const path = url.searchParams.get('opfs');
                library = new FileSystemLibrary(path == '' ? opfs :
                    await opfs.getDirectoryHandle(path, { create: true }));
            }
            else {
                if (!navigator.userActivation?.isActive)
                    return;
                let directory = await getDirectory('default');
                if (!directory) {
                    directory = await showDirectoryPicker({ mode: 'readwrite' });
                }
                await setDirectory('default', directory);
                const status = await directory.requestPermission({ mode: 'readwrite' });
                if (status !== 'granted')
                    return;
                library = new FileSystemLibrary(directory);
            }
            await library.sync();
            this.library = library;
        }
        finally {
            this.loading = false;
        }
    }
};
__decorate([
    query('pkm-editor')
], PkmApp.prototype, "editor", void 0);
__decorate([
    query('pkm-command-palette-dialog')
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
navigator.serviceWorker.register('./serviceworker.js');
//# sourceMappingURL=pkmapp.js.map
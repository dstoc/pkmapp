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

import './markdown/block-render.js';
import './editor.js';
import './command-palette.js';

import {libraryContext} from './app-context.js';
import {CommandPalette} from './command-palette.js';
import {contextProvider} from './deps/lit-labs-context.js';
import {customElement, html, LitElement, query, render, state} from './deps/lit.js';
import {Editor} from './editor.js';
import {FileSystemLibrary, Library} from './library.js';
import {styles} from './style.js';

// TODO: why can't we place this in an element's styles?
document.adoptedStyleSheets = [...styles];

@customElement('pkm-app')
export class PkmApp extends LitElement {
  @query('pkm-editor') editor!: Editor;
  @query('pkm-command-palette') commandPalette!: CommandPalette;
  @contextProvider({context: libraryContext}) @state() library!: Library;
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
  override render() {
    if (!this.library) {
      return html`
        <button id=opendir @click=${this.ensureDirectory}>
          Open directory...
        </button>
      `;
    }
    return html`
      <pkm-editor></pkm-editor>
      <pkm-command-palette></pkm-command-palette>
    `;
  }
  override async connectedCallback() {
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
        const path = url.searchParams.get('opfs')!;
        this.library = new FileSystemLibrary(
            path == '' ? opfs :
                         await opfs.getDirectoryHandle(path, {create: true}));
      } else {
        this.library = new FileSystemLibrary(
            await showDirectoryPicker({mode: 'readwrite'}));
      }
    }
    return this.library;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-app': PkmApp;
  }
}

onunhandledrejection = (e) => console.error(e.reason);
onerror = (event, source, lineno, colno, error) => console.error(event, error);

render(html`<pkm-app></pkm-app>`, document.body);

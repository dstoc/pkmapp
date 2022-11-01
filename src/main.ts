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

import {customElement, html, LitElement, render, state} from './deps/lit.js';
import {FileSystemLibrary, Library} from './library.js';
import {styles} from './style.js';

// TODO: why can't we place this in an element's styles?
document.adoptedStyleSheets = [...styles];

@customElement('pkm-app')
export class PkmApp extends LitElement {
  @state() library?: Library;
  override render() {
    if (!this.library) {
      return html`
        <button id=opendir @click=${this.ensureDirectory}>
          Open directory...
        </button>
      `;
    }
    return html`<pkm-editor .library=${this.library}></pkm-editor>`;
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

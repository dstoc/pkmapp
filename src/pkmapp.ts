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
import './command-palette-dialog.js';

import {libraryContext} from './app-context.js';
import {CommandPaletteDialog} from './command-palette-dialog.js';
import {contextProvider} from './deps/lit-labs-context.js';
import {
  customElement,
  html,
  LitElement,
  query,
  render,
  state,
} from './deps/lit.js';
import {Editor} from './editor.js';
import {FileSystemLibrary, Library} from './library.js';
import {styles} from './style.js';
import {getDirectory, setDirectory} from './directory-db.js';
import {EditorNavigation} from './editor.js';
import {resolve} from './resolve.js';
import {CommandBundle} from './command-palette.js';
import {assert} from './asserts.js';

// TODO: why can't we place this in an element's styles?
document.adoptedStyleSheets = [...styles];

const allowedScripts = ['./serviceworker.js'];
self.trustedTypes?.createPolicy('default', {
  createScriptURL(input: string) {
    assert(allowedScripts.includes(input));
    return input;
  },
});

// BroadcastChannel and WebLocks are used here to ensure all clients
// load in the same process so that the same library instance can be
// shared between them.
const bc = new BroadcastChannel('launch');
const main = await new Promise((resolve) => {
  navigator.locks.request('main', {ifAvailable: true}, async (lock) => {
    resolve(!!lock);
    navigator.locks.request('main', async () => {
      bc.onmessage = (message) => {
        window.open(message.data.location);
      };
      return new Promise(() => {});
    });
  });
});
if (!window.opener && !main) {
  bc.postMessage({location: String(window.location)});
  window.close();
  throw new Error('Requested to reopen window');
}

@customElement('pkm-app')
export class PkmApp extends LitElement {
  @query('pkm-editor') editor!: Editor;
  @query('pkm-command-palette-dialog') commandPalette!: CommandPaletteDialog;
  @contextProvider({context: libraryContext}) @state() library!: Library;
  constructor() {
    super();
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
  private initialLocation = location.toString();
  override render() {
    const url = new URL(this.initialLocation);
    const basePath = new URL(resolve('./')).pathname;
    const defaultName = url.searchParams.has('no-default')
      ? undefined
      : decodeURIComponent(url.pathname.substring(basePath.length)) || 'index';
    if (!this.library) {
      return html`pkmapp`;
    }
    return html`
      <pkm-editor
        @editor-navigate=${this.onEditorNavigate}
        @editor-commands=${this.onCommands}
        .defaultName=${defaultName}
      ></pkm-editor>
      <pkm-command-palette-dialog></pkm-command-palette-dialog>
    `;
  }
  override async connectedCallback() {
    super.connectedCallback();
    const task = async () => {
      await this.trySetDirectory();
      if (!this.library) {
        setTimeout(task, 100);
      }
    };
    task();
  }
  private onCommands({detail: commands}: CustomEvent<CommandBundle>) {
    this.commandPalette.trigger(commands);
  }
  private onEditorNavigate({
    detail: navigation,
  }: CustomEvent<EditorNavigation>) {
    // TODO: use root name (metadata)
    const name = navigation.document.name ?? 'pkmapp';
    document.title = `${name}`;
    const url = new URL(this.initialLocation.toString());
    url.pathname = new URL(resolve('./' + name)).pathname;
    url.searchParams.delete('path');
    if (navigation.kind === 'replace' || !history.state) {
      history.replaceState(name, '', url.toString());
    } else {
      history.pushState(name, '', url.toString());
    }
  }
  loading = false;
  private async trySetDirectory() {
    if (this.library) return;
    if (this.loading) return;
    this.loading = true;
    try {
      const url = new URL(location.toString());
      let library;
      let parent = window.opener?.document.querySelector('pkm-app')?.library;
      if (parent) {
        library = parent;
        console.log('used parent!');
      } else if (url.searchParams.has('opfs')) {
        const opfs = await navigator.storage.getDirectory();
        const path = url.searchParams.get('opfs')!;
        library = new FileSystemLibrary(
          path == ''
            ? opfs
            : await opfs.getDirectoryHandle(path, {create: true}),
        );
      } else {
        if (!navigator.userActivation?.isActive) return;
        let directory = await getDirectory('default');
        if (!directory) {
          directory = await showDirectoryPicker({mode: 'readwrite'});
        }
        await setDirectory('default', directory);
        const status = await directory.requestPermission({mode: 'readwrite'});
        if (status !== 'granted') return;
        library = new FileSystemLibrary(directory);
      }
      await library.sync();
      this.library = library;
    } finally {
      this.loading = false;
    }
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

navigator.serviceWorker.register('./serviceworker.js');

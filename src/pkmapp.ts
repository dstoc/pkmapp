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
import './sidebar.js';
import './backlinks-sidebar.js';
import './command-palette-dialog.js';

import {componentContext, focusContext, libraryContext} from './app-context.js';
import {CommandPaletteDialog} from './command-palette-dialog.js';
import {provide} from '@lit/context';
import {css, html, LitElement} from 'lit';
import {query, state} from 'lit/decorators.js';
import {Editor} from './editor.js';
import {IdbLibrary, Library} from './library.js';
import {styles, loadFonts} from './style.js';
import {EditorNavigation} from './editor.js';
import {
  Command,
  CommandBundle,
  SimpleCommandBundle,
} from './command-palette.js';
import {assert, cast} from './asserts.js';
import {noAwait} from './async.js';
import './backup-sidebar.js';
import {
  InlineViewModelNode,
  ViewModelNode,
  viewModel,
} from './markdown/view-model-node.js';
import {debugCommands} from './debug-commands.js';
import {backupCommands} from './backup-commands.js';
import {CommandContext} from './commands/context.js';
import {Components, ComponentsBuilder} from './components.js';
import {Backup} from './backup.js';
import {ConfigStore} from './config-store.js';
import {BackLinks} from './backlinks.js';

export function injectStyles() {
  document.adoptedStyleSheets = [...styles];
  noAwait(loadFonts());
}

export async function enforceSingleProcess() {
  // BroadcastChannel and WebLocks are used here to ensure all clients
  // load in the same process so that the same library instance can be
  // shared between them.
  const bc = new BroadcastChannel('launch');
  const main = await new Promise((resolve) => {
    noAwait(
      navigator.locks.request('main', {ifAvailable: true}, async (lock) => {
        resolve(!!lock);
        noAwait(
          navigator.locks.request('main', async () => {
            bc.onmessage = (message) => {
              const location: unknown = message.data.location;
              assert(typeof location === 'string');
              window.open(location);
            };
            return new Promise(() => {});
          }),
        );
      }),
    );
  });
  if (!window.opener && !main) {
    bc.postMessage({location: String(window.location)});
    window.close();
    throw new Error('Requested to reopen window');
  }
}

export abstract class PkmAppBase extends LitElement {
  @query('pkm-editor') accessor editor!: Editor;
  @query('pkm-command-palette-dialog')
  accessor commandPalette!: CommandPaletteDialog;
  @provide({context: libraryContext}) @state() accessor library!: Library;
  @provide({context: componentContext})
  @state()
  accessor components!: Components;
  @provide({context: focusContext}) @state() accessor focusNode:
    | InlineViewModelNode
    | undefined;
  constructor() {
    super();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' && e.ctrlKey) {
        e.preventDefault();
        this.onCommands({detail: undefined});
      }
    });
    window.addEventListener('popstate', (e) => {
      const name: unknown = e.state;
      assert(typeof name === 'string');
      noAwait(this.editor.navigateByName(name));
    });
    this.addEventListener('title-item-click', this.onTitleItemClick);
    this.addEventListener('pkm-commands', this.onCommands);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    noAwait(this.initComponents());
  }
  private initialLocation = location.toString();
  static override get styles() {
    return [
      css`
        :host {
          display: flex;
        }
        pkm-sidebar:not([collapsed]) {
          align-self: start;
          position: sticky;
          top: 0;
          min-height: 100dvh;
        }
        pkm-sidebar[collapsed] {
          align-self: flex-start;
          position: fixed;
          top: 0;
          right: 0;
        }
        #main {
          display: flex;
          justify-content: center;
          flex-grow: 1;
        }
        pkm-editor {
          width: 100%;
          max-width: 700px;
          padding: 5px;
        }
      `,
    ];
  }
  override render() {
    const url = new URL(this.initialLocation);
    const defaultName = url.searchParams.has('no-default')
      ? undefined
      : decodeURIComponent(url.pathname.substring(1)) || 'index';
    if (!this.library) {
      return html``;
    }
    return html`
      <div id="main">
        <pkm-editor
          @editor-navigate=${this.onEditorNavigate}
          @md-block-focus=${this.onBlockFocus}
          .defaultName=${defaultName}
        ></pkm-editor>
      </div>
      <pkm-sidebar collapsed>${this.renderSidebarContents()}</pkm-sidebar>
      <pkm-command-palette-dialog></pkm-command-palette-dialog>
    `;
  }
  protected renderSidebarContents(): unknown {
    return html`
      <pkm-backup-sidebar></pkm-backup-sidebar>
      <pkm-backlinks-sidebar></pkm-backlinks-sidebar>
    `;
  }
  protected *getCommands(context: CommandContext): Iterable<Command> {
    yield* this.editor.getCommands();
    yield* debugCommands(context.library);
    yield* backupCommands(this.components.backup);
  }
  private onTitleItemClick({detail: root}: CustomEvent<ViewModelNode>) {
    const document = this.library.getDocumentByTree(root[viewModel].tree);
    assert(document);
    this.editor.navigate(document, root, true);
  }
  private onBlockFocus({detail: node}: CustomEvent<InlineViewModelNode>) {
    this.focusNode = node;
  }
  private onCommands({detail: commands}: {detail: CommandBundle | undefined}) {
    if (!commands) {
      const context = this.editor.getCommandContext();
      commands = new SimpleCommandBundle('Choose Command', [
        ...this.getCommands(context),
      ]);
    }
    this.commandPalette.trigger(commands);
  }
  private onEditorNavigate({
    detail: navigation,
  }: CustomEvent<EditorNavigation>) {
    const name =
      this.components.metadata.getPreferredName(navigation.root) ??
      navigation.document.name ??
      '';
    document.title = `${name}`;
    const url = new URL(this.initialLocation);
    url.pathname = name;
    url.searchParams.delete('path');
    if (navigation.kind === 'replace' || !history.state) {
      history.replaceState(name, '', url.toString());
    } else {
      history.pushState(name, '', url.toString());
    }
  }
  private loading = false;
  private async initComponents() {
    if (this.loading) return;
    if (this.library) return;
    this.loading = true;
    const builder = new ComponentsBuilder();
    try {
      const opener = window.opener as Window | undefined;
      const host = opener?.document.querySelector(this.tagName);
      const parent = (host as typeof this)?.components;
      if (parent) {
        this.components = parent;
      } else {
        await builder.add('library', () => IdbLibrary.init(this.idbPrefix));
        await builder.add('configStore', () =>
          ConfigStore.init(this.idbPrefix),
        );
        await builder.add(
          'metadata',
          async (components) => components.library!.metadata,
        );
        await builder.add(
          'backLinks',
          async (components) => new BackLinks(cast(components.library)),
        );
        await builder.add(
          'backup',
          async (components) =>
            new Backup(cast(components.library), cast(components.configStore)),
        );
        await this.addComponents(builder);
        const components = builder.build(this.verifyComponents);
        await components.library.ready;
        this.components = components;
        this.library = components.library;
      }
    } finally {
      this.loading = false;
    }
  }
  protected abstract verifyComponents(result: Partial<Components>): Components;
  protected abstract idbPrefix: string;
  protected abstract addComponents(builder: ComponentsBuilder): Promise<void>;
}

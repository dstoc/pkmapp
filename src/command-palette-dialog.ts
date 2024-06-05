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

import './command-palette.js';

import {css, html, LitElement} from 'lit';
import {customElement, query} from 'lit/decorators.js';
import {CommandPalette, CommandBundle} from './command-palette.js';
import {noAwait} from './async.js';

@customElement('pkm-command-palette-dialog')
export class CommandPaletteDialog extends LitElement {
  @query('dialog') dialog!: HTMLDialogElement;
  @query('pkm-command-palette') palette!: CommandPalette;
  static override styles = css`
    dialog[open] {
      color: var(--root-color);
      margin: 50px;
      background: red;
      background: var(--pkm-dialog-bgcolor);
      border: 3px solid var(--md-accent-color);
      border-radius: 10px;
      width: auto;
      height: calc(100vh - 100px);
      align-items: center;
      padding: 0;
      overflow: hidden;
      container-type: size;
    }
    dialog::backdrop {
      backdrop-filter: blur(3px);
      background: rgba(128, 128, 128, 0.2);
    }
  `;
  override render() {
    return html`
      <dialog>
        <pkm-command-palette @commit=${this.commit}></pkm-command-palette>
      </dialog>
    `;
  }
  private commit() {
    this.dialog.close();
  }
  trigger(bundle: CommandBundle) {
    noAwait(this.palette.trigger(bundle));
    this.dialog.showModal();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-command-palette-dialog': CommandPaletteDialog;
  }
}

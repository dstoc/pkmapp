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

import {css, html, LitElement, TemplateResult} from 'lit';
import {property, customElement, query, state} from 'lit/decorators.js';
import {assert} from './asserts.js';
import './emoji.js';
import {noAwait} from './async.js';
import CloseIcon from './icons/material-symbols-rounded/close_24dp_FILL1_wght400_GRAD0_opsz24.js';
import {templateContent} from 'lit/directives/template-content.js';

export interface CommandBundle {
  readonly description: string;
  readonly input?: string;
  getCommands(input: string, limit: number): Promise<Command[]>;
}

export interface Command extends FreeformCommandTemplate {
  readonly description: string;
  readonly preview?: () => TemplateResult;
}

export type Execute = (
  command: Command,
  updatePreview: (template: TemplateResult) => void,
) => Promise<CommandBundle | void>;

export interface FreeformCommandTemplate {
  readonly icon?: string;
  execute: Execute;
}

export class InputWrapper implements CommandBundle {
  constructor(
    readonly input: string,
    private bundle: CommandBundle,
  ) {}
  get description() {
    return this.bundle.description;
  }
  getCommands(input: string, limit: number) {
    return this.bundle.getCommands(input, limit);
  }
}

export class SimpleCommandBundle {
  constructor(
    readonly description: string,
    private commands: Command[],
    private freeform?: FreeformCommandTemplate,
    readonly input?: string,
  ) {}
  async execute() {
    return this;
  }
  async getCommands(input: string) {
    const pattern = new RegExp(
      input.replace(/(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'),
      'i',
    );
    const commands = this.commands.filter(({description}) =>
      pattern.test(description),
    );
    if (this.freeform) commands.push({...this.freeform, description: input});
    return commands;
  }
}

@customElement('pkm-command-palette')
export class CommandPalette extends LitElement {
  @property({type: Boolean, attribute: true}) accessor noHeader = false;
  @property({type: Boolean, attribute: true}) accessor collapsed = false;
  @state() accessor activeIndex = 0;
  @state() accessor bundle: CommandBundle | undefined;
  @state() accessor activeItems: Command[] = [];
  @state() accessor previewOverride: TemplateResult | undefined;
  private activeSearch?: string;
  @query('input') accessor input!: HTMLInputElement;
  @query('#items') accessor items!: HTMLElement;
  static override styles = css`
    :host {
      display: grid;
      height: 100%;
    }
    :host-context([collapsed]) {
      /* TODO: not quite correct, use a custom var? */
      max-height: inherit;
    }
    input,
    .item {
      border: none;
      color: var(--root-color);
      outline: none;
      background: transparent;
      font-size: 14pt;
      padding-left: 10px;
      font-family: var(--root-font);
    }
    input,
    #items {
      padding: 10px;
    }
    #separator,
    #preview-separator {
      height: 100%;
      background: var(--md-accent-color);
      opacity: 0.25;
    }
    input {
      grid-area: input;
    }
    #close {
      fill: currentColor;
      grid-area: input;
      justify-self: end;
      display: grid;
      justify-content: center;
      align-content: center;
      aspect-ratio: 1 / 1;
      cursor: pointer;
    }
    #separator {
      grid-area: sep;
    }
    #preview-separator {
      grid-area: psep;
    }
    :host-context([collapsed]) input,
    :host-context([collapsed]) #separator {
      visibility: hidden;
    }
    :host-context([collapsed]) #close,
    :host-context([collapsed]) #preview-separator,
    :host-context([collapsed]) #preview {
      display: none;
    }
    .item {
      padding-top: 5px;
      padding-bottom: 5px;
    }
    .item[data-active] {
      background: rgba(128, 128, 128, 0.3);
      border-radius: 5px;
    }
    #items {
      overflow: auto;
      grid-area: items;
    }
    .icon {
      font-family: 'noto emoji';
    }
    pkm-emoji {
      font-family: 'noto emoji';
      font-size: 200px;
      display: flex;
      height: 100%;
      justify-content: center;
      align-items: center;
    }
    #preview {
      padding: 10px;
      overflow: auto;
      grid-area: preview;
    }
    :host {
      grid-template-rows: min-content 1px 1fr 1px 1fr;
      grid-template-areas:
        'input'
        'sep'
        'items'
        'psep'
        'preview';
    }
    :host-context([collapsed]) {
      grid-template-rows: 0 0 1fr 1px;
    }
    @container (min-width: 800px) {
      :host {
        grid-template-columns: 500px 1px;
        grid-template-rows: min-content 1px 1fr;
        grid-template-areas:
          'input input input'
          'sep   sep   sep'
          'items psep  preview';
      }
      :host-context([collapsed]) {
        grid-template-rows: 0 0 1fr;
      }
    }
  `;
  constructor() {
    super();
    this.addEventListener('pointerdown', (e) => {
      e.preventDefault();
    });
  }
  override render() {
    const preview =
      this.activeItems?.[this.activeIndex]?.preview ??
      (() =>
        html`<pkm-emoji
          .text=${this.activeItems?.[this.activeIndex]?.description ??
          'default'}
        ></pkm-emoji>`);
    return html`
      <input
          type=text
          @keydown=${this.handleInputKeyDown}
          @input=${() => this.onInput()}
          placeholder=${this.bundle?.description ?? ''}></input>
      <div id=close @click=${this.close}>${templateContent(CloseIcon)}</div>
      <div id=separator></div>
      <div id=items>
        ${this.activeItems.map(
          (item, idx) => html`
            <div
              class="item"
              ?data-active=${idx === this.activeIndex}
              @click=${this.handleItemClick}
              @pointermove=${() => (this.activeIndex = idx)}
            >
              <span class="icon">${item.icon}</span>${item.description}
            </div>
          `,
        )}
      </div>
      <div id=preview-separator></div>
      <div id=preview>${this.previewOverride ?? preview?.()}</div>
    `;
  }
  private async onInput() {
    const search = this.input?.value ?? '';
    if (search != this.activeSearch) {
      this.activeSearch = search;
      this.activeIndex = 0;
    }
    this.activeItems = this.bundle
      ? await this.bundle.getCommands(search, 100)
      : [];
    this.activeIndex = Math.max(
      0,
      Math.min(this.activeIndex, this.activeItems.length - 1),
    );
  }
  private handleInputKeyDown(e: KeyboardEvent) {
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
        noAwait(this.commit());
        return;
    }
  }
  private async reset() {
    this.input.value = '';
    this.bundle = undefined;
    this.activeIndex = 0;
    this.activeSearch = undefined;
    this.activeItems = [];
    this.previewOverride = undefined;
  }
  private handleItemClick() {
    noAwait(this.commit());
  }
  async setInput(input: string) {
    this.input.value = input;
    await this.onInput();
  }
  close() {
    this.dispatchEvent(new CustomEvent('commit'));
  }
  async commit() {
    const selected = this.activeItems[this.activeIndex];
    this.requestUpdate();
    const animation = this.input.animate(
      {
        background: [
          'linear-gradient(45deg, transparent, var(--md-accent-color), transparent)',
          'linear-gradient(45deg, transparent, var(--md-accent-color), transparent)',
        ],
        backgroundSize: ['200%', '200%'],
        backgroundPositionX: ['0%', '200%'],
      },
      {
        duration: 1000,
        iterations: Infinity,
        easing: 'ease-in-out',
      },
    );
    const next = await selected.execute(
      selected,
      (template) => (this.previewOverride = template),
    );
    animation.cancel();
    if (next) {
      await this.trigger(next);
    } else {
      this.dispatchEvent(new CustomEvent('commit'));
    }
  }
  async trigger(bundle: CommandBundle) {
    await this.reset();
    this.bundle = bundle;
    if (bundle.input !== undefined) {
      await this.setInput(bundle.input);
    } else {
      await this.onInput();
    }
  }
  async triggerCommand(command: Command) {
    const bundle = await command.execute(
      command,
      (template) => (this.previewOverride = template),
    );
    assert(bundle);
    await this.trigger(bundle);
  }
  next() {
    this.activeIndex = Math.min(
      this.activeItems.length - 1,
      this.activeIndex + 1,
    );
    this.scrollToActiveItem();
  }
  previous() {
    this.activeIndex = Math.max(0, this.activeIndex - 1);
    this.scrollToActiveItem();
  }
  private scrollToActiveItem() {
    const item = this.items.querySelector(`:nth-child(${this.activeIndex})`);
    item?.scrollIntoView({block: 'center'});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-command-palette': CommandPalette;
  }
  interface HTMLElementEventMap {
    'pkm-commands': CustomEvent<CommandBundle | undefined>;
  }
}

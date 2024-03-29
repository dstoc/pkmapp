// Copyright 2023 Google LLC
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

import {
  query,
  customElement,
  html,
  css,
  state,
  LitElement,
  property,
} from '../deps/lit.js';

import {MarkdownRenderer} from './block-render.js';
import {ViewModelNode} from './view-model.js';
import {CodeBlockNode} from './node.js';
import {Library} from '../library.js';
import {libraryContext} from '../app-context.js';
import './block-render.js';
import {contextProvided} from '../deps/lit-labs-context.js';
import {HostContext, hostContext} from './host-context.js';
import {findNextEditable, findFinalEditable} from './view-model-util.js';

@customElement('md-transclusion')
export class MarkdownTransclusion extends LitElement {
  @property({attribute: false}) node:
    | (ViewModelNode & CodeBlockNode)
    | undefined;
  @contextProvided({context: libraryContext, subscribe: true})
  @state()
  library!: Library;

  @contextProvided({context: hostContext, subscribe: true})
  @property({attribute: false})
  hostContext: HostContext | undefined;

  @state()
  root: ViewModelNode | undefined;

  @query('md-block-render') private markdownRenderer!: MarkdownRenderer;

  override update(changedProperties: Map<string, any>) {
    super.update(changedProperties);
    if (changedProperties.has('node')) {
      this.root = undefined;
      if (this.node) this.load(this.node.content.trim());
    }
  }
  override render() {
    return this.root
      ? html`
          ⮴ ${this.node?.content.trim()}
          <md-block-render .block=${this.root}></md-block-render>
        `
      : '';
  }
  static override get styles() {
    return css`
      :host {
        display: block;
        background: var(--md-code-block-bgcolor);
        padding: 10px;
        border-radius: 10px;
      }
    `;
  }
  async load(name: string) {
    // TODO: disambiguate if there's more than one result
    const [{root}] = await this.library.findAll(name);
    this.root = root;
  }
  maybeUpdateFocus() {
    if (!this.isConnected) return;
    if (!this.hostContext) return;
    if (!this.root) return;
    if (this.hostContext.focusNode !== this.node) return;
    const node =
      (this.hostContext.focusOffset ?? -1) >= 0
        ? findNextEditable(this.root, this.root, true)
        : findFinalEditable(this.root, true);
    this.markdownRenderer.hostContext.focusNode = node || undefined;
    this.markdownRenderer.hostContext.focusOffset =
      this.hostContext.focusOffset;
    this.hostContext.focusNode = undefined;
    this.hostContext.focusOffset = undefined;
    node?.viewModel.observe.notify();
  }
  override connectedCallback() {
    super.connectedCallback();
    this.addObserver(this.node);
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeObserver(this.node);
  }
  override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('node')) {
      const oldNode = changedProperties.get('node') as ViewModelNode;
      this.removeObserver(oldNode);
      this.addObserver(this.node);
    }
  }
  private readonly observer = () => {
    this.maybeUpdateFocus();
  };
  private addObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.add(this.observer);
  }
  private removeObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.remove(this.observer);
  }
}

export function getContainingTransclusion(element: Element) {
  const renderShadow = element.getRootNode();
  if (!(renderShadow instanceof ShadowRoot)) return;
  const renderHost = renderShadow.host;
  if (!(renderHost instanceof MarkdownRenderer)) return;
  const shadow = renderHost.getRootNode();
  if (!(shadow instanceof ShadowRoot)) return;
  const transclusion = shadow.host;
  if (!(transclusion instanceof MarkdownTransclusion)) return;
  return transclusion;
}

declare global {
  interface HTMLElementTagNameMap {
    'md-transclusion': MarkdownTransclusion;
  }
}

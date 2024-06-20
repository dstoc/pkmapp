import {componentContext, focusContext} from './app-context.js';
import {getNamedContainingBlock} from './block-util.js';
import {consume} from '@lit/context';
import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {
  InlineViewModelNode,
  ViewModelNode,
} from './markdown/view-model-node.js';
import './markdown/block-render.js';
import './title.js';
import {Components} from './components.js';
import {SignalWatcher} from '@lit-labs/preact-signals';

@customElement('pkm-backlinks-sidebar')
export class BacklinksSidebar extends SignalWatcher(LitElement) {
  static override readonly styles = css`
    :host {
      display: block;
    }
    #title {
      font-weight: bold;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
    #references:empty::after {
      content: 'none.';
    }
  `;

  @consume({context: focusContext, subscribe: true})
  accessor focusNode: InlineViewModelNode | undefined;

  @consume({context: componentContext})
  accessor components!: Components;

  private empty() {
    return html`<div id="title">References</div>
      <div>No target.</div>`;
  }

  override render() {
    if (!this.focusNode) return this.empty();
    const target = getNamedContainingBlock(this.focusNode);
    if (!target) return this.empty();
    const name = this.components.metadata.getPreferredName(target);
    if (!name) return this.empty();
    const description = `References to § ${name}`;
    this.components.backLinks.version.value;
    const backlinks = this.components.backLinks.getBacklinksByName(name);
    return html`<div id="title">${description}</div>
      <div id="references">${repeat(backlinks, this.renderBacklink)}</div>`;
  }
  private renderBacklink(node: ViewModelNode) {
    const named = getNamedContainingBlock(node);
    if (!named) return;
    return html`<pkm-title .simple=${true} .node=${named}></pkm-title>
      <md-block-render .block=${node}></md-block-render> `;
  }
}

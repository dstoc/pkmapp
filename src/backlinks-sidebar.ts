import {focusContext, libraryContext} from './app-context.js';
import {getNamedContainingBlock} from './block-util.js';
import {consume} from '@lit/context';
import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {Library} from './library.js';
import {ViewModelNode} from './markdown/view-model-node.js';
import './markdown/block-render.js';
import './title.js';

@customElement('pkm-backlinks-sidebar')
export class BacklinksSidebar extends LitElement {
  static override readonly styles = css`
    :host {
      display: block;
    }
    #references:empty::after {
      content: 'none.';
    }
  `;

  @consume({context: focusContext, subscribe: true})
  focusNode?: ViewModelNode;

  @consume({context: libraryContext})
  library!: Library;

  private readonly observer = () => {
    this.requestUpdate();
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.library.backLinks.observe.remove(this.observer);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.library.backLinks.observe.add(this.observer);
  }

  override render() {
    if (!this.focusNode) return;
    const target = getNamedContainingBlock(this.focusNode);
    if (!target) return;
    const name = this.library.metadata.getPreferredName(target);
    const backlinks = this.library.backLinks.getBacklinksByName(name);
    return html`References:<br />
      <div id="references">${repeat(backlinks, this.renderBacklink)}</div>`;
  }
  private renderBacklink(node: ViewModelNode) {
    const named = getNamedContainingBlock(node);
    if (!named) return;
    return html`<pkm-title .simple=${true} .node=${named}></pkm-title>
      <md-block-render .block=${node}></md-block-render> `;
  }
}

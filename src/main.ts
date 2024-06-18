import {html, render} from 'lit';
import {PkmAppBase, enforceSingleProcess, injectStyles} from './pkmapp.js';
import {Components, ComponentsBuilder} from './components.js';
import {customElement} from 'lit/decorators.js';
import {cast} from './asserts.js';

onunhandledrejection = (e) => console.error(e.reason);
onerror = (event, _source, _lineno, _colno, error) =>
  console.error(event, error);

injectStyles();
await enforceSingleProcess();

@customElement('pkm-app')
export class PkmApp extends PkmAppBase {
  protected override readonly idbPrefix: string = '';
  protected override verifyComponents(result: Partial<Components>) {
    return {
      library: cast(result.library),
      backLinks: cast(result.backLinks),
      metadata: cast(result.metadata),
      backup: cast(result.backup),
      configStore: cast(result.configStore),
    };
  }
  protected override addComponents(_builder: ComponentsBuilder) {}
}

declare global {
  interface HTMLElementTagNameMap {
    'pkm-app': PkmApp;
  }
}

render(html`<pkm-app></pkm-app>`, document.body);

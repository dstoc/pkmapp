import {componentContext} from './app-context.js';
import {css, html, LitElement} from 'lit';
import {state, customElement} from 'lit/decorators.js';
import {consume} from '@lit/context';
import {backupCommands} from './backup-commands.js';
import {SimpleCommandBundle} from './command-palette.js';
import {Components} from './components.js';
import {SignalWatcher} from '@lit-labs/preact-signals';

@customElement('pkm-backup-sidebar')
export class BackupSidebar extends SignalWatcher(LitElement) {
  @consume({context: componentContext})
  @state()
  accessor components!: Components;
  static override readonly styles = css`
    :host {
      display: block;
    }
  `;
  override render() {
    let status;
    switch (this.components.backup.state.value) {
      case 'idle':
        status = 'Idle.';
        break;
      case 'writing':
        status = '💾';
        break;
      case 'waiting-for-config':
        status = 'Not configured ⚠️';
        break;
      case 'waiting-for-permission':
        status = 'Needs permission ⚠️';
        break;
    }
    return html`Backup: ${status}`;
  }
  override firstUpdated() {
    this.addEventListener('click', this.onClick);
  }
  onClick() {
    if (this.components.backup.state.value === 'waiting-for-permission') {
      this.components.backup.checkForPermission();
    } else {
      this.dispatchEvent(
        new CustomEvent('pkm-commands', {
          detail: new SimpleCommandBundle(
            `Backup options...`,
            backupCommands(this.components.backup),
          ),
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
}

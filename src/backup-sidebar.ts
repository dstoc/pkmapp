import {libraryContext} from './app-context.js';
import {LitElement, customElement, html, state} from './deps/lit.js';
import {consume} from './deps/lit-context.js';
import {Library} from './library.js';
import {backupCommands} from './backup-commands.js';
import {CommandBundle, SimpleCommandBundle} from './command-palette.js';

@customElement('pkm-backup-sidebar')
export class BackupSidebar extends LitElement {
  @consume({context: libraryContext, subscribe: true})
  @state()
  library!: Library;
  override render() {
    let icons = '💾⚠️';
    switch (this.library.backup.state) {
      case 'idle':
        icons = '';
        break;
      case 'writing':
        icons = '💾';
    }
    return html`Backup: ${icons}`;
  }
  override firstUpdated() {
    this.addEventListener('click', this.onClick);
    this.library.backup.observe.add(() => this.requestUpdate());
  }
  onClick() {
    if (this.library.backup.state === 'waiting-for-permission') {
      this.library.backup.checkForPermission();
    } else {
      this.dispatchEvent(
        new CustomEvent('backup-commands', {
          detail: new SimpleCommandBundle(
            `Backup options...`,
            backupCommands(this.library.backup),
          ),
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
}

declare global {
  interface HTMLElementEventMap {
    'backup-commands': CustomEvent<CommandBundle>;
  }
}

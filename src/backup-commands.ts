import {Backup} from './backup.js';
import {type Command} from './command-palette.js';
import {yesNoBundle} from './yes-no-bundle.js';

export function backupCommands(backup: Backup): Command[] {
  return backup.hasConfig()
    ? [
        {
          description: 'Turn off backup',
          execute: async () => {
            return yesNoBundle({
              description: 'Are you sure you want to turn off backup?',
              yes: async () => backup.resetConfiguration(),
            });
          },
        },
      ]
    : [
        {
          description: 'Turn on backup',
          execute: async () => {
            const directory = await showDirectoryPicker({
              mode: 'readwrite',
              id: 'backup',
            });
            await backup.setConfiguration(directory);
          },
        },
      ];
}

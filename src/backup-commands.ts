import {Backup} from './backup.js';
import {type Command} from './command-palette.js';

export function backupCommands(backup: Backup): Command[] {
  return [
    ...(backup.hasConfig()
      ? [
          {
            description: 'Turn off backup',
            execute: async () => {
              // TODO: Confirm yes/no.
              await backup.resetConfiguration();
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
        ]),
  ];
}

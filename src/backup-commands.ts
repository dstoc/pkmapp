import {Backup, Snapshots, formatDate, formatTime} from './backup.js';
import {SimpleCommandBundle, type Command} from './command-palette.js';
import {html} from './deps/lit.js';
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
            function chooseFolderAndFinish(grouping: Snapshots) {
              return async () =>
                new SimpleCommandBundle(`Where do you want to store backups?`, [
                  {
                    description: 'Choose a folder',
                    execute: async () => {
                      const directory = await showDirectoryPicker({
                        mode: 'readwrite',
                        id: 'backup',
                      });
                      await backup.setConfiguration(directory, grouping);
                    },
                  },
                ]);
            }
            return new SimpleCommandBundle(`Do you want to enable snapshots?`, [
              {
                description: 'No',
                execute: chooseFolderAndFinish('none'),
                preview: () =>
                  html`All documents will be backed up to the folder of choice
                  as changes are made.`,
              },
              {
                description: 'Daily shapshots',
                execute: chooseFolderAndFinish('daily'),
                preview: () =>
                  html`Before saving a backup, any existing backup of a document
                    made prior to the current day will be moved to a dated
                    folder.
                    <p>For example:</p>
                    <pre>backup-folder/${formatDate(new Date())}/</pre>`,
              },
              {
                description: 'Hourly snapshots',
                execute: chooseFolderAndFinish('hourly'),
                preview: () =>
                  html` Before saving a backup, any existing backup of a
                    document made prior to the current hour will be moved to a
                    dated folder.
                    <p>For example:</p>
                    <pre>
backup-folder/${formatDate(new Date())}/${formatTime(new Date())}/</pre
                    >`,
              },
            ]);
          },
        },
      ];
}

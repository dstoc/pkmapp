import {Backup, Grouping, formatDate, formatTime} from './backup.js';
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
            function chooseFolderAndFinish(grouping: Grouping) {
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
            return new SimpleCommandBundle(
              `How do you want to group backups?`,
              [
                {
                  description: 'Everything in one folder',
                  execute: chooseFolderAndFinish('none'),
                  preview: () =>
                    html`Each document will be saved to the folder shortly after
                    being modified. This is a good option if you can pick a
                    folder that's synced to Google Drive or is backed up
                    regularly.`,
                },
                {
                  description: 'Daily folders',
                  execute: chooseFolderAndFinish('daily'),
                  preview: () =>
                    html`This option will create a new folder automatically each
                      day as you modify documents. Throughout the day as you
                      make changes, they will be saved to the same folder. You
                      will be able to browse back in time to see earlier
                      revisions of your documents.
                      <p>
                        For example, changes you make today will be saved to:
                      </p>
                      <pre>backup-folder/${formatDate(new Date())}/</pre>`,
                },
                {
                  description: 'Hourly folders',
                  execute: chooseFolderAndFinish('hourly'),
                  preview: () =>
                    html`This option will create new folders automatically each
                      day and hour as you modify documents. You will be able to
                      browse back in time to see earlier revisions of your
                      documents.
                      <p>
                        For example, if you were to make a change right now it
                        would be saved to:
                      </p>
                      <pre>
backup-folder/${formatDate(new Date())}/${formatTime(new Date())}/</pre
                      >`,
                },
              ],
            );
          },
        },
      ];
}

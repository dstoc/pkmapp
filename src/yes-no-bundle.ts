import {
  CommandBundle,
  Execute,
  SimpleCommandBundle,
} from './command-palette.js';

export function yesNoBundle({
  description,
  yes,
  no,
}: {
  description: string;
  yes: Execute;
  no?: Execute;
}): CommandBundle {
  return new SimpleCommandBundle(description, [
    {
      description: 'No',
      execute: no ?? (async () => void 0),
    },
    {
      description: 'Yes',
      execute: yes,
    },
  ]);
}

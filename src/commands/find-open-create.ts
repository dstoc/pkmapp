import {BlockCommandBundle} from '../block-command-bundle.js';
import {Editor} from '../editor.js';

export function findOpenCreateBundle(editor: Editor) {
  const library = editor.library;
  return new BlockCommandBundle(
    'Find, Open, Create',
    library,
    async ({document, root}) => void editor.navigate(document, root, true),
    async ({name}) => void editor.createAndNavigateByName(name, true),
  );
}

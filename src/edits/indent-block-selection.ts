import {cast} from '../asserts.js';
import {EditContext} from '../editor.js';
import {indent, unindent} from '../indent-util.js';

export function editBlockSelectionIndent(
  context: EditContext,
  mode: 'indent' | 'unindent',
) {
  const root = cast(context.root);
  context.startEditing();
  for (const node of context.selection) {
    if (mode === 'unindent') {
      unindent(node, root);
    } else {
      indent(node, root);
    }
  }
  context.keepFocus();
}

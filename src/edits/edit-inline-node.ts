import {assert} from '../asserts.js';
import {EditContext} from '../editor.js';
import {isInlineNode} from '../markdown/node.js';
import {InlineViewModelNode} from '../markdown/view-model-node';
import {findNextEditable} from '../markdown/view-model-util.js';
import {InlineEdit} from '../markdown/view-model.js';

export function editInlineNode(context: EditContext, edit: InlineEdit) {
  assert(isInlineNode(context.node));
  const node = context.node as InlineViewModelNode;
  context.startEditing();
  const newNodes = node.viewModel.edit(edit);
  if (newNodes) {
    // Although normalization has not happened, it will never remove an editable.
    const next = findNextEditable(newNodes[0], context.root, true);
    // TODO: is the focus offset always 0? No, the input text might have been
    // "* abc", in which case it should be 3.
    // if (next) focusNode(hostContext, next, 0);
    // But maybe seeking to the end is OK?
    // TODO: No, it's not. The input might have added a prefix to existing content.
    if (next) {
      context.focus(next, next.content.length);
    }
  } else {
    // TODO: generalize this (inline block mutation)
    const parent = node.viewModel.parent;
    if (
      parent?.type === 'list-item' &&
      parent.checked === undefined &&
      /^\[( |x)] /.test(node.content)
    ) {
      parent.viewModel.updateChecked(node.content[1] === 'x');
      node.viewModel.edit({
        newText: '',
        startIndex: 0,
        newEndIndex: 0,
        oldEndIndex: 4,
      });
    }
    context.focus(node, edit.newEndIndex);
  }
}

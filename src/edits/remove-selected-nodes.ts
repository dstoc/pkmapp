import {cast} from '../asserts.js';
import {EditContext} from '../editor.js';
import {
  children,
  findNextEditable,
  findPreviousEditable,
} from '../markdown/view-model-util.js';
import {viewModel} from '../markdown/view-model-node.js';

export function removeSelectedNodes(context: EditContext) {
  const nodes = context.selection;
  const candidates = [];
  context.startEditing();
  for (const node of nodes) {
    node[viewModel].previousSibling &&
      candidates.push(node[viewModel].previousSibling);
    node[viewModel].parent && candidates.push(node[viewModel].parent);
    if (node.type === 'section' && node[viewModel].parent) {
      for (const child of children(node)) {
        child[viewModel].insertBefore(cast(node[viewModel].parent), node);
      }
    }
    node[viewModel].remove();
  }
  let didFocus = false;
  for (const node of candidates) {
    // TODO: better to sort the nodes (document order) then find previous/next.
    // TODO: this isn't a perfect test that the node is still connected
    if (node[viewModel].parent) {
      const prev = findPreviousEditable(node, context.root, true);
      if (prev) {
        context.focus(prev, -Infinity);
        didFocus = true;
        break;
      }
    }
  }
  if (!didFocus) {
    const next = findNextEditable(context.root, context.root, true);
    if (next) {
      context.focus(next, 0);
      didFocus = true;
    }
  }
  context.clearSelection();
  return true;
}

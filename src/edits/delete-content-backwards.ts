import {assert, cast} from '../asserts';
import {EditContext} from '../editor';
import {InlineNode} from '../markdown/node';
import {
  ViewModelNode,
  isInlineViewModelNode,
} from '../markdown/view-model-node';
import {children, findAncestor, reverseDfs} from '../markdown/view-model-util';
import {viewModel} from '../markdown/view-model-node.js';

export function deleteContentBackwards(context: EditContext): boolean {
  const node = context.node;
  assert(isInlineViewModelNode(node));
  // Turn sections and code-blocks into paragraphs.
  if (node.type === 'section') {
    context.startEditing();
    node[viewModel].updateMarker(
      node.marker.substring(0, node.marker.length - 1),
    );
    if (node.marker === '') {
      const paragraph = node[viewModel].tree.add({
        type: 'paragraph',
        content: node.content,
      });
      paragraph[viewModel].insertBefore(cast(node[viewModel].parent), node);
      // Move all section content out.
      for (const child of children(node)) {
        child[viewModel].insertBefore(cast(node[viewModel].parent), node);
      }
      node[viewModel].remove();
      context.focus(paragraph, 0);
    } else {
      context.focus(node, 0);
    }
    return true;
  } else if (node.type === 'code-block') {
    context.startEditing();
    const paragraph = node[viewModel].tree.add({
      type: 'paragraph',
      content: node.content, // TODO: detect new blocks
    });
    paragraph[viewModel].insertBefore(cast(node[viewModel].parent), node);
    node[viewModel].remove();
    context.focus(paragraph, 0);
    return true;
  }

  // Remove a surrounding block-quote.
  const {ancestor} = findAncestor(node, context.root, 'block-quote');
  if (ancestor) {
    context.startEditing();
    // Unless there's an earlier opportunity to merge into a previous
    // content node.
    for (const prev of reverseDfs(node, ancestor)) {
      if (maybeMergeContentInto(context, node, prev)) return true;
    }
    for (const child of [...children(ancestor)]) {
      child[viewModel].insertBefore(cast(ancestor[viewModel].parent), ancestor);
    }
    ancestor[viewModel].remove();
    // TODO: offset was undefined before
    context.focus(node, 0);
    return true;
  }

  // Merge into a previous content node.
  for (const prev of reverseDfs(node)) {
    if (maybeMergeContentInto(context, node, prev)) return true;
  }

  return false;
}

function maybeMergeContentInto(
  context: EditContext,
  node: InlineNode & ViewModelNode,
  target: ViewModelNode,
): boolean {
  if (
    target.type === 'code-block' ||
    target.type === 'paragraph' ||
    target.type === 'section'
  ) {
    assert(isInlineViewModelNode(target));
    context.startEditing();
    target[viewModel].edit({
      startIndex: target.content.length,
      oldEndIndex: target.content.length,
      newEndIndex: target.content.length + node.content.length,
      newText: node.content,
    });
    node[viewModel].remove();
    context.focus(target, target.content.length);
    return true;
  }
  return false;
}

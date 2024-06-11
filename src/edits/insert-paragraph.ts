import {assert, cast} from '../asserts';
import {EditContext} from '../editor';
import {unindent} from '../indent-util';
import {ParagraphNode} from '../markdown/node';
import {
  InlineViewModelNode,
  ViewModelNode,
  isInlineViewModelNode,
} from '../markdown/view-model-node';
import {
  ancestors,
  cloneNode,
  findAncestor,
  shallowTraverse,
  swapNodes,
} from '../markdown/view-model-util';
import {viewModel} from '../markdown/view-model-node.js';

export function insertParagraph(context: EditContext, index: number) {
  if (
    unindentIfEmptyListItem(context) ||
    splitBlockQuoteOrListItemOnEmptyParagraph(context) ||
    insertParagraphInList(context, index)
  ) {
    return;
  }
  insertSiblingParagraph(context, index);
}

export {insertSiblingParagraph as insertLineBreak};

/**
 * Unindents the immediately containing list-item if `node` is an
 * empty paragraph and the only child of the list-item.
 */
function unindentIfEmptyListItem(context: EditContext): boolean {
  const node = context.node;
  assert(isInlineViewModelNode(node));
  if (node.type !== 'paragraph') return false;
  if (node.content.length > 0) return false;
  const parent = node[viewModel].parent;
  if (!parent || parent.type !== 'list-item' || parent === context.root)
    return false;
  if (parent.children!.length > 1) return false;
  context.startEditing();
  unindent(node, context.root);
  // TODO: 0 was undefined before
  context.focus(node, 0);
  return true;
}

/**
 * Splits the first containing block-quote or list-item if `node` is an
 * empty paragraph. The empty paragraph is moved into a sibling, another
 * subequent sibling is created to hold the tail of items following the
 * empty paragraph but within the container.
 */
function splitBlockQuoteOrListItemOnEmptyParagraph(
  context: EditContext,
): boolean {
  const node = context.node;
  assert(isInlineViewModelNode(node));
  if (node.type !== 'paragraph') return false;
  if (node.content.length > 0) return false;
  if (!node[viewModel].parent) return false;
  const {ancestor} = findAncestor(
    node,
    context.root,
    'list-item',
    'block-quote',
  );
  if (!ancestor) return false;
  if (ancestor === context.root) return false;
  context.startEditing();
  const [_self, ...tail] = shallowTraverse(node, ancestor);
  let target: ViewModelNode;
  if (ancestor.type === 'list-item') {
    // Insert a new list-item to hold the empty paragraph.
    target = node[viewModel].tree.add({
      type: 'list-item',
      marker: ancestor.marker,
    });
    target[viewModel].insertBefore(
      cast(ancestor[viewModel].parent),
      ancestor[viewModel].nextSibling,
    );
    node[viewModel].insertBefore(target);
  } else {
    // Insert the empty paragraph after the block quote.
    assert(ancestor.type === 'block-quote');
    node[viewModel].insertBefore(
      cast(ancestor[viewModel].parent),
      ancestor[viewModel].nextSibling,
    );
    target = node;
  }
  if (tail.length) {
    // Construct a new block-quote or list-item to hold the tail
    // of nodes following the empty paragraph.
    const tailTarget = node[viewModel].tree.add(
      cloneNode(ancestor, () => false),
    );
    tailTarget[viewModel].insertBefore(
      cast(ancestor[viewModel].parent),
      target[viewModel].nextSibling,
    );
    for (const node of tail) {
      node[viewModel].insertBefore(tailTarget);
    }
  }
  context.focus(node, 0);
  return true;
}

function insertSiblingParagraph(context: EditContext, startIndex: number) {
  const node = context.node;
  assert(isInlineViewModelNode(node));
  context.startEditing();
  const newParagraph = node[viewModel].tree.add({
    type: 'paragraph',
    content: '',
  });
  // Sections are a bit special. The section header is kind of a
  // sibling of the section content.
  if (node.type === 'section') {
    if (startIndex === 0) {
      // Inserting before the section is also special. Handle it directly rather than
      // in finishInsertParagraph.
      newParagraph[viewModel].insertBefore(cast(node[viewModel].parent), node);
      context.focus(newParagraph, 0);
      return;
    }
    newParagraph[viewModel].insertBefore(node, node[viewModel].firstChild);
  } else {
    newParagraph[viewModel].insertBefore(
      cast(node[viewModel].parent),
      node[viewModel].nextSibling,
    );
  }
  finishInsertParagraph(context, node, newParagraph, startIndex);
}

/**
 * Inserts a paragraph in a simple-list scenario. That is, when `node`
 * is the first-child of list-item and its next sibling, if any, is
 * a list.
 */
function insertParagraphInList(
  context: EditContext,
  startIndex: number,
): boolean {
  const node = context.node;
  assert(isInlineViewModelNode(node));
  const {ancestor, path} = findAncestor(node, context.root, 'list');
  if (
    !(
      ancestor &&
      node.content.length > 0 &&
      path &&
      path.length === 2 &&
      path[0].type === 'list-item' &&
      path[1].type === 'paragraph' &&
      (path[0].children?.length === 1 ||
        path[1][viewModel].nextSibling?.type === 'list')
    )
  ) {
    // Abort if we're dealing with something other than the simple list
    // scenario.
    return false;
  }
  context.startEditing();
  let targetList;
  let targetListItemNextSibling;
  if (node[viewModel].nextSibling) {
    if (node[viewModel].nextSibling.type === 'list') {
      targetList = node[viewModel].nextSibling;
      targetListItemNextSibling = targetList[viewModel].firstChild;
    } else {
      targetList = node[viewModel].tree.add({
        type: 'list',
      });
      targetList[viewModel].insertBefore(
        cast(node[viewModel].parent),
        node[viewModel].nextSibling,
      );
      targetListItemNextSibling = undefined;
    }
  } else {
    targetList = ancestor;
    targetListItemNextSibling = path[0][viewModel].nextSibling;
  }

  const firstListItem = targetList[viewModel].firstChild;
  // TODO: can't return false here, already started editing above...
  if (firstListItem && firstListItem.type !== 'list-item') return false;
  const newListItem = node[viewModel].tree.add({
    type: 'list-item',
    marker: firstListItem?.marker ?? '* ',
  });
  newListItem[viewModel].insertBefore(targetList, targetListItemNextSibling);
  if (
    newListItem[viewModel].previousSibling?.type === 'list-item' &&
    newListItem[viewModel].previousSibling.checked !== undefined
  ) {
    newListItem[viewModel].updateChecked(false);
  }
  const newParagraph = node[viewModel].tree.add({
    type: 'paragraph',
    content: '',
  });
  newParagraph[viewModel].insertBefore(newListItem);
  finishInsertParagraph(context, node, newParagraph, startIndex);
  return true;
}

function areAncestorAndDescendant(
  node: ViewModelNode,
  node2: ViewModelNode,
  root: ViewModelNode,
) {
  return (
    [...ancestors(node, root)].includes(node2) ||
    [...ancestors(node2, root)].includes(node)
  );
}

function finishInsertParagraph(
  context: EditContext,
  node: InlineViewModelNode,
  newParagraph: ParagraphNode & ViewModelNode,
  startIndex: number,
) {
  assert(isInlineViewModelNode(newParagraph));
  const shouldSwap =
    startIndex === 0 &&
    node.content.length > 0 &&
    !areAncestorAndDescendant(node, newParagraph, context.root);
  if (shouldSwap) {
    swapNodes(node, newParagraph);
  } else {
    newParagraph[viewModel].edit({
      startIndex: 0,
      newEndIndex: 0,
      oldEndIndex: 0,
      newText: node.content.substring(startIndex),
    });

    node[viewModel].edit({
      startIndex,
      oldEndIndex: node.content.length,
      newEndIndex: startIndex,
      newText: '',
    });
  }
  // TODO: Offset was undefined before
  context.focus(newParagraph, 0);
}

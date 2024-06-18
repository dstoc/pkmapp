import {assert, cast} from './asserts.js';
import {parseBlocks} from './markdown/block-parser.js';
import {serializeToString} from './markdown/block-serializer.js';
import {HostContext} from './markdown/host-context.js';
import {MarkdownNode} from './markdown/node.js';
import {MarkdownTree} from './markdown/view-model.js';
import {
  ViewModelNode,
  isInlineViewModelNode,
  viewModel,
} from './markdown/view-model-node.js';
import {
  ancestors,
  cloneNode,
  compareDocumentOrder,
  dfs,
  findFinalEditable,
  performLogicalInsertion,
  removeDescendantNodes,
} from './markdown/view-model-util.js';

export function insertMarkdown(markdown: string, node: ViewModelNode) {
  const {node: root} = parseBlocks(markdown + '\n');
  if (!root) return;
  assert(root.type === 'document' && root.children);
  const newNodes = root.children.map((newNode) =>
    node[viewModel].tree.add<MarkdownNode>(newNode),
  );

  const newInlineNodes = newNodes
    .flatMap((node) => [...dfs(node, node)])
    .filter(isInlineViewModelNode);
  const newFocus = findFinalEditable(newNodes[0]);
  performLogicalInsertion(node, newNodes);
  return {newFocus, newInlineNodes};
}

export async function copyMarkdownToClipboard(markdown: string) {
  const textType = 'text/plain';
  const mdType = 'web text/markdown';
  await navigator.clipboard.write([
    new ClipboardItem({
      [textType]: new Blob([markdown], {type: textType}),
      [mdType]: new Blob([markdown], {type: mdType}),
    }),
  ]);
}

export function serializeSelection(hostContext: HostContext) {
  // This is complex because:
  // 1. Sections can be disjoint.
  // 2. Expecations of what to serialize is different to the set of selected
  //    nodes. For example, if the selection is a paragaph immediately inside
  //    a list-item, we should serialize the list-item too.
  // The approach here is:
  // 1. Recursively expand the selection to include ancestor nodes, when the
  //    selected node is the first child.
  // 2. Combine the selected nodes when one is an ancestor of another.
  // 3. Clone the selected nodes, removing any inline nodes that were not
  //    part of the original selection.
  // 4. Build a new document, append the clones (triggering normalization)
  // 5. Serialize the new document.
  const expand = (node: ViewModelNode) => {
    let result = node;
    if (node[viewModel].previousSibling) {
      return result;
    }
    for (const ancestor of ancestors(node, cast(hostContext.root))) {
      if (ancestor.type === 'section') {
        break;
      }
      result = ancestor;
      if (ancestor[viewModel].previousSibling) {
        break;
      }
    }
    return result;
  };
  const predicate = (node: ViewModelNode) => {
    switch (node.type) {
      case 'section':
      case 'paragraph':
      case 'code-block':
        return hostContext.selection.has(node);
      default:
        return true;
    }
  };
  const roots = removeDescendantNodes(
    [...hostContext.selection.values()].map(expand),
  )
    .toSorted(compareDocumentOrder)
    .map((node) => cloneNode(node, predicate));
  const tree = new MarkdownTree({
    type: 'document',
  });
  {
    tree.edit(() => {
      // The document will have an empty paragraph due to normalization.
      cast(tree.root.children)[0][viewModel].remove();
      for (const root of roots) {
        const node = tree.add<MarkdownNode>(root);
        node[viewModel].insertBefore(tree.root);
      }
      return {};
    });
  }
  return serializeToString(tree.root);
}

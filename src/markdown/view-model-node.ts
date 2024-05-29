import {
  type MarkdownNode,
  type InlineNode,
  isInlineNode,
  DocumentNode,
  ListNode,
  BlockQuoteNode,
  ListItemNode,
  UnsupportedNode,
} from './node.js';
import type {ViewModel, InlineViewModel} from './view-model.js';

interface MaybeViewModelNodeParts {
  viewModel?: ViewModel;
  children?: MarkdownNode[];
}
export type MaybeViewModelNode = MarkdownNode & MaybeViewModelNodeParts;

interface ViewModelNodeParts {
  viewModel: ViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}

interface InlineViewModelNodeParts extends ViewModelNodeParts {
  viewModel: InlineViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}

export type ViewModelNode =
  | ((
      | DocumentNode
      | ListNode
      | BlockQuoteNode
      | ListItemNode
      | UnsupportedNode
    ) &
      ViewModelNodeParts)
  | InlineViewModelNode;

export type InlineViewModelNode = InlineNode & InlineViewModelNodeParts;

export function isInlineViewModelNode(
  node: ViewModelNode,
): node is InlineViewModelNode {
  return isInlineNode(node);
}

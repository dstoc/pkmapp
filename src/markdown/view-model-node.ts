import {
  type MarkdownNode,
  type InlineNode,
  isInlineNode,
  DocumentNode,
  ListNode,
  BlockQuoteNode,
  ListItemNode,
} from './node.js';
import type {ViewModel, InlineViewModel} from './view-model.js';

export const viewModel = Symbol('viewModel');

// eslint-disable-next-line  @typescript-eslint/no-empty-interface
export interface Caches {
  _?: undefined;
}

interface MaybeViewModelNodeParts {
  [viewModel]?: ViewModel;
  children?: MarkdownNode[];
}
export type MaybeViewModelNode = MarkdownNode & MaybeViewModelNodeParts;

interface ViewModelNodeParts {
  [viewModel]: ViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}

interface InlineViewModelNodeParts extends ViewModelNodeParts {
  [viewModel]: InlineViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}

export type ViewModelNode =
  | ((DocumentNode | ListNode | BlockQuoteNode | ListItemNode) &
      ViewModelNodeParts)
  | InlineViewModelNode;

export type InlineViewModelNode = InlineNode & InlineViewModelNodeParts;

export function isInlineViewModelNode(
  node: ViewModelNode,
): node is InlineViewModelNode {
  return isInlineNode(node);
}

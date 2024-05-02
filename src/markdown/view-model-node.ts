import type {MarkdownNode, InlineNode} from './node.js';
import type {ViewModel, InlineViewModel} from './view-model.js';

interface MaybeViewModelNode {
  viewModel?: ViewModel;
  children?: MarkdownNode[];
}
type MaybeViewModelNodeType = MarkdownNode & MaybeViewModelNode;
export {MaybeViewModelNodeType as MaybeViewModelNode};

interface ViewModelNode {
  viewModel: ViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}
type ViewModelNodeType = MarkdownNode & ViewModelNode;
export {ViewModelNodeType as ViewModelNode};

interface InlineViewModelNode extends ViewModelNode {
  viewModel: InlineViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}
type InlineViewModelNodeType = InlineNode & InlineViewModelNode;
export {InlineViewModelNodeType as InlineViewModelNode};

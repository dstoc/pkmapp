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

type InlineViewModelNodeType = InlineNode & InlineViewModelNode;
interface InlineViewModelNode {
  viewModel: InlineViewModel;
  children?: (MarkdownNode & ViewModelNode)[];
}
export {InlineViewModelNodeType as InlineViewModelNode};

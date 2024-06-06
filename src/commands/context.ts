import {MarkdownInline} from '../markdown/inline-render.js';
import {ViewModelNode} from '../markdown/view-model-node.js';
import {Document, Library} from '../library.js';
import {Editor} from '../editor.js';
import {MarkdownTransclusion} from '../markdown/transclusion.js';
import {Command} from '../command-palette.js';
import {BlockSelectionTarget} from '../block-selection-util.js';

export interface CommandContext {
  inlineSelection: {
    inline?: MarkdownInline;
    startIndex?: number;
    endIndex?: number;
  };
  node?: ViewModelNode;
  root?: ViewModelNode;
  document?: Document;
  library: Library;
  editor: Editor;
  transclusion?: MarkdownTransclusion;
  blockSelectionTarget?: BlockSelectionTarget;
}

export type ContextCommands = (context: CommandContext) => Command[];

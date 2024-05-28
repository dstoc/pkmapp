import {InlineEdit} from './view-model';
import {InlineViewModelNode, ViewModelNode} from './view-model-node.js';

export type Op = RemoveOp | InsertOp | EditOp | UpdateMarkerOp | UpdateCheckOp;

export interface Focus {
  node: InlineViewModelNode;
  offset: number;
}

export interface OpBatch {
  ops: Op[];
  timestamp: number;
  startFocus?: Focus;
  endFocus?: Focus;
}

interface RemoveOp {
  type: 'remove';
  node: ViewModelNode;
  parent: ViewModelNode;
  nextSibling?: ViewModelNode;
}

interface InsertOp {
  type: 'insert';
  node: ViewModelNode;
  hadParent: boolean;
  parent: ViewModelNode;
  nextSibling?: ViewModelNode;
}

interface EditOp {
  type: 'edit';
  node: InlineViewModelNode;
  edit: InlineEdit;
  oldText: string;
}

interface UpdateMarkerOp {
  type: 'marker';
  node: ViewModelNode;
  marker: string;
  oldMarker: string;
}

interface UpdateCheckOp {
  type: 'check';
  node: ViewModelNode;
  checked?: boolean;
  oldChecked?: boolean;
}

export function doOp(op: Op) {
  switch (op.type) {
    case 'check':
      op.node.viewModel.updateChecked(op.checked);
      break;
    case 'edit':
      op.node.viewModel.edit(op.edit);
      break;
    case 'insert':
      op.node.viewModel.insertBefore(op.parent, op.nextSibling);
      break;
    case 'marker':
      op.node.viewModel.updateMarker(op.marker);
      break;
    case 'remove':
      op.node.viewModel.remove();
      break;
  }
}

export function undoOp(op: Op) {
  switch (op.type) {
    case 'check':
      op.node.viewModel.updateChecked(op.oldChecked);
      break;
    case 'edit':
      op.node.viewModel.edit({
        startIndex: op.edit.startIndex,
        newEndIndex: op.edit.oldEndIndex,
        oldEndIndex: op.edit.newEndIndex,
        newText: op.oldText,
      });
      break;
    case 'insert':
      if (!op.hadParent) {
        op.node.viewModel.remove();
      }
      break;
    case 'marker':
      op.node.viewModel.updateMarker(op.oldMarker);
      break;
    case 'remove':
      op.node.viewModel.insertBefore(op.parent, op.nextSibling);
      break;
  }
}

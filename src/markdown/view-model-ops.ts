import {InlineEdit} from './view-model';
import {InlineViewModelNode, ViewModelNode} from './view-model-node.js';
import {isAncestorOf} from './view-model-util';

export type Op = RemoveOp | InsertOp | EditOp | UpdateMarkerOp | UpdateCheckOp;

export interface Focus {
  node: InlineViewModelNode;
  offset: number;
  selection?: InlineViewModelNode[];
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

type Classification = 'inside' | 'outside' | 'both';
export function classify(root: ViewModelNode, batch: OpBatch): Classification {
  let result: Classification | undefined;
  function merge(node?: ViewModelNode) {
    if (!node) return;
    if (!node.viewModel.connected) return;
    const value =
      root === node || isAncestorOf(root, node) ? 'inside' : 'outside';
    if (result === undefined) {
      result = value;
    } else if (result !== value) {
      result = 'both';
    }
  }
  for (const op of batch.ops) {
    switch (op.type) {
      case 'check':
      case 'edit':
      case 'marker':
        merge(op.node);
        break;
      case 'insert':
      case 'remove':
        merge(op.node);
        merge(op.parent);
        merge(op.nextSibling);
        break;
    }
  }
  return result ?? 'inside';
}

// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {ViewModelNode} from './markdown/view-model-node.js';
import {cast} from './asserts.js';
import {findAncestor, ancestors} from './markdown/view-model-util.js';
import {viewModel} from './markdown/view-model-node.js';

export function unindent(node: ViewModelNode, root: ViewModelNode) {
  const {ancestor: listItem, path} = findAncestor(node, root, 'list-item');
  if (!listItem || !path) return;
  const target = path[0];
  const nextSibling = listItem[viewModel].nextSibling;
  const list = listItem[viewModel].parent!;
  const targetListItemSibling = list[viewModel].parent!;
  if (targetListItemSibling?.type === 'list-item') {
    listItem[viewModel].insertBefore(
      cast(targetListItemSibling[viewModel].parent),
      targetListItemSibling[viewModel].nextSibling,
    );
  } else {
    target[viewModel].insertBefore(
      cast(list[viewModel].parent),
      list[viewModel].nextSibling,
    );
    listItem[viewModel].remove();
  }
  // Siblings of the undended list-item move to sublist.
  if (nextSibling) {
    let next: ViewModelNode | undefined = nextSibling;
    while (next) {
      if (listItem[viewModel].lastChild?.type !== 'list') {
        listItem[viewModel].tree
          .add({
            type: 'list',
          })
          [viewModel].insertBefore(listItem);
      }
      const targetList = listItem[viewModel].lastChild!;
      const toMove: ViewModelNode = next;
      next = toMove[viewModel].nextSibling;
      toMove[viewModel].insertBefore(targetList);
    }
  }
  // The target might have been removed from the list item. Move any
  // remaining siblings to the same level.
  if (listItem.children?.length && !listItem[viewModel].parent) {
    // TODO: move more than the first child.
    listItem[viewModel].firstChild?.[viewModel].insertBefore(
      cast(target[viewModel].parent),
      target[viewModel].nextSibling,
    );
  }
  if (!list.children?.length) {
    list[viewModel].remove();
  }
}

export function findIndentTarget(node: ViewModelNode, root: ViewModelNode) {
  let target = node;
  for (const ancestor of ancestors(node, root)) {
    if (ancestor.type === 'list-item') {
      break;
    }
    if (ancestor.type === 'document') {
      break;
    }
    if (ancestor.type === 'section') {
      break;
    }
    target = ancestor;
  }
  return target;
}

export function indent(node: ViewModelNode, root: ViewModelNode) {
  const target = findIndentTarget(node, root);
  let listItem: ViewModelNode;
  if (target[viewModel].parent!.type === 'list-item') {
    listItem = target[viewModel].parent!;
  } else {
    listItem = target[viewModel].tree.add({
      type: 'list-item',
      marker: '* ',
    });
    listItem[viewModel].insertBefore(cast(target[viewModel].parent), target);
    target[viewModel].insertBefore(listItem);
  }
  const listItemPreviousSibling = listItem[viewModel].previousSibling;
  if (listItemPreviousSibling?.type === 'list-item') {
    const lastChild = listItemPreviousSibling[viewModel].lastChild;
    if (lastChild?.type === 'list') {
      listItem[viewModel].insertBefore(lastChild);
    } else {
      listItem[viewModel].insertBefore(listItemPreviousSibling);
    }
  } else if (listItemPreviousSibling?.type === 'list') {
    listItem[viewModel].insertBefore(listItemPreviousSibling);
  }
  // Ensure the list-item we may have created is in a list.
  if (listItem[viewModel].parent!.type !== 'list') {
    const list = target[viewModel].tree.add({
      type: 'list',
    });
    list[viewModel].insertBefore(cast(listItem[viewModel].parent), listItem);
    listItem[viewModel].insertBefore(list);
  }
}

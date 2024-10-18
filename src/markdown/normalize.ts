// Copyright 2022 Google LLC
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

import {SectionNode} from './node.js';
import {children, dfs} from './view-model-util.js';
import {MarkdownTree} from './view-model.js';
import {ViewModelNode, viewModel} from './view-model-node.js';
import {cast} from '../asserts.js';

function moveTrailingNodesIntoSections(tree: MarkdownTree) {
  for (const node of dfs(tree.root)) {
    let section: (SectionNode & ViewModelNode) | undefined;
    for (const child of children(node)) {
      if (child.type === 'section') {
        section = child;
      } else if (section) {
        child[viewModel].insertBefore(section);
      }
    }
  }
}

/**
 * Given a contiguous run of sections, update their heirarichy so that it
 * matches their section markers.
 */
function normalizeContiguousSections(
  sections: (SectionNode & ViewModelNode)[],
) {
  const activeSections: (SectionNode & ViewModelNode)[] = [];
  function activeSection() {
    return cast(activeSections.at(-1));
  }
  function contains(
    parent: SectionNode & ViewModelNode,
    node: SectionNode & ViewModelNode,
  ) {
    return (
      (!parent[viewModel].previousSibling &&
        parent[viewModel].parent!.type !== 'section') ||
      node.marker.length > parent.marker.length
    );
  }
  // Note. This logic is quite complex because we want to avoid moving
  // sections if they are already in the correct position. Normalization
  // should not mutate the tree if nothing has changed.
  for (const section of sections) {
    let last: (SectionNode & ViewModelNode) | undefined;
    while (activeSections.length && !contains(activeSection(), section)) {
      // Pop off sections that cannot contain it.
      last = cast(activeSections.pop());
      if (!activeSections.length) {
        // If we run out of sections, insert it as the next
        // sibling of the last one we saw. This happens when we have a
        // run of sections that are not contained by another section.
        section[viewModel].insertBefore(
          last![viewModel].parent!,
          last![viewModel].nextSibling,
        );
      }
    }
    if (activeSections.length && contains(activeSection(), section)) {
      // If the active section can contain this section...
      if (last && last[viewModel].parent === activeSection()) {
        // Place it next to the last section, if that section was also contained
        // by the active section.
        section[viewModel].insertBefore(
          last[viewModel].parent,
          last[viewModel].nextSibling,
        );
      } else {
        // Otherwise ensure it's the first section child of the active
        // section. Find the first section and place it before that. Otherwise,
        // place it at the very end.
        let next: ViewModelNode | undefined;
        for (const child of children(activeSection())) {
          if (child.type === 'section') {
            next = child;
            break;
          }
        }
        section[viewModel].insertBefore(activeSection(), next);
      }
    }
    activeSections.push(section);
  }
}

function normalizeSections(tree: MarkdownTree) {
  moveTrailingNodesIntoSections(tree);
  type Section = SectionNode & ViewModelNode;
  const ranges = new Map<Section, Section[]>();
  for (const node of dfs(tree.root)) {
    if (node.type !== 'section') continue;
    const previousSibling = node[viewModel].previousSibling;
    const parent = node[viewModel].parent;
    let range: Section[];
    if (previousSibling?.type === 'section') {
      range = cast(ranges.get(previousSibling));
    } else if (parent?.type === 'section') {
      range = cast(ranges.get(parent));
    } else {
      range = [];
    }
    range.push(node);
    ranges.set(node, range);
  }
  for (const sections of ranges.values()) {
    normalizeContiguousSections(sections);
  }
}

export function normalizeTree(tree: MarkdownTree) {
  normalizeSections(tree);

  for (const node of dfs(tree.root)) {
    // Merge adjacent lists.
    if (node.type === 'list') {
      while (node[viewModel].nextSibling?.type === 'list') {
        const next = node[viewModel].nextSibling;
        while (next[viewModel].firstChild) {
          next[viewModel].firstChild[viewModel].insertBefore(node);
        }
        next[viewModel].remove();
      }
    }
    // Collapse directly nested lists.
    if (node.type === 'list-item') {
      // Ensure checked is not set, rather than set to undefined
      // since it could serialize as null.
      if (
        node.checked === null ||
        (node.checked === undefined && 'checked' in node)
      ) {
        node[viewModel].updateChecked(undefined);
      }
      if (
        node[viewModel].firstChild?.type === 'list' &&
        node.children?.length === 1
      ) {
        const list = node[viewModel].firstChild;
        while (list[viewModel].firstChild) {
          list[viewModel].firstChild[viewModel].insertBefore(
            cast(node[viewModel].parent),
            node,
          );
        }
        // Note. `node` still contains the empty `list`. They will
        // be removed in the next normalization step below.
      }
    }
  }

  // Remove empty blocks.
  const emptyPredicate = (node?: ViewModelNode) =>
    node &&
    node[viewModel].parent &&
    !node[viewModel].firstChild &&
    ['list-item', 'list', 'block-quote'].includes(node.type);
  for (const empty of [...dfs(tree.root)].filter(emptyPredicate)) {
    let node: ViewModelNode | undefined = empty;
    while (node) {
      const parent: ViewModelNode | undefined = node[viewModel].parent;
      node[viewModel].remove();
      node = emptyPredicate(parent) ? parent : undefined;
    }
  }

  if (!tree.root[viewModel].firstChild) {
    const child = tree.add({
      type: 'paragraph',
      content: '',
    });
    child[viewModel].insertBefore(tree.root);
  }
}

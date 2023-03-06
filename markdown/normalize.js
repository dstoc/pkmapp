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
import { assert } from '../asserts.js';
import { children, dfs } from './view-model-util.js';
import { cast } from '../asserts.js';
function moveTrailingNodesIntoSections(tree) {
    for (const node of dfs(tree.root)) {
        let section;
        for (const child of children(node)) {
            if (child.type === 'section') {
                section = child;
            }
            else if (section) {
                child.viewModel.insertBefore(section);
            }
        }
    }
}
function normalizeContiguousSections(sections) {
    const activeSections = [];
    function activeSection() {
        return activeSections[activeSections.length - 1];
    }
    for (const section of sections) {
        if (activeSections.length) {
            while (section.marker.length < activeSection().marker.length &&
                activeSections.length > 1) {
                activeSections.pop();
            }
            if (section.marker.length <= activeSection().marker.length) {
                if (section.viewModel.previousSibling !== activeSection()) {
                    section.viewModel.insertBefore(activeSection().viewModel.parent, activeSection().viewModel.nextSibling);
                }
                activeSections.pop();
            }
            else {
                assert(section.marker.length > activeSection().marker.length);
                if (section.viewModel.parent !== activeSection()) {
                    // ensure section is first section child of activeSection
                    let next;
                    for (const child of children(activeSection())) {
                        if (child.type === 'section') {
                            next = child;
                            break;
                        }
                    }
                    section.viewModel.insertBefore(activeSection(), next);
                }
            }
        }
        activeSections.push(section);
    }
}
function normalizeSections(tree) {
    moveTrailingNodesIntoSections(tree);
    const ranges = new Map();
    for (const node of dfs(tree.root)) {
        if (node.type !== 'section')
            continue;
        const previousSibling = node.viewModel.previousSibling;
        const parent = node.viewModel.parent;
        let range;
        if (previousSibling?.type === 'section') {
            range = cast(ranges.get(previousSibling));
        }
        else if (parent?.type === 'section') {
            range = cast(ranges.get(parent));
        }
        else {
            range = [];
        }
        range.push(node);
        ranges.set(node, range);
    }
    for (const sections of ranges.values()) {
        normalizeContiguousSections(sections);
    }
}
export function normalizeTree(tree) {
    const emptyPredicate = (node) => node &&
        node.viewModel.parent && !node.viewModel.firstChild &&
        ['list-item', 'list', 'block-quote'].includes(node.type);
    for (const empty of [...dfs(tree.root)].filter(emptyPredicate)) {
        let node = empty;
        while (node) {
            const parent = node.viewModel.parent;
            node.viewModel.remove();
            node = emptyPredicate(parent) ? parent : undefined;
        }
    }
    normalizeSections(tree);
    for (const node of dfs(tree.root)) {
        if (node.type === 'list') {
            while (node.viewModel.nextSibling?.type === 'list') {
                const next = node.viewModel.nextSibling;
                while (next.viewModel.firstChild) {
                    next.viewModel.firstChild.viewModel.insertBefore(node);
                }
                next.viewModel.remove();
            }
        }
    }
    if (!tree.root.viewModel.firstChild) {
        const child = tree.add({
            type: 'paragraph',
            content: '',
        });
        child.viewModel.insertBefore(tree.root);
    }
}
//# sourceMappingURL=normalize.js.map
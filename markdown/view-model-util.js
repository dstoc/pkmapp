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
import { assert, cast } from '../asserts.js';
export function swapNodes(node1, node2) {
    if (node1.viewModel.nextSibling === node2) {
        node2.viewModel.insertBefore(cast(node1.viewModel.parent), node1);
        return;
    }
    if (node2.viewModel.nextSibling === node1) {
        node1.viewModel.insertBefore(cast(node2.viewModel.parent), node2);
        return;
    }
    const node1Parent = node1.viewModel.parent;
    const node1NextSibling = node1.viewModel.nextSibling;
    node1.viewModel.insertBefore(cast(node2.viewModel.parent), node2);
    node2.viewModel.insertBefore(node1Parent, node1NextSibling);
}
export function* ancestors(node) {
    while (node.viewModel.parent) {
        yield node.viewModel.parent;
        node = node.viewModel.parent;
    }
}
export function* reverseDfs(node, limit) {
    function next(next) {
        return next && (node = next);
    }
    do {
        while (next(node.viewModel.previousSibling)) {
            while (next(node.viewModel.lastChild))
                ;
            yield node;
            if (node === limit)
                return;
        }
        if (next(node.viewModel.parent)) {
            yield node;
            if (node === limit)
                return;
            continue;
        }
        return;
    } while (true);
}
export function* dfs(node) {
    function next(next) {
        return next && (node = next);
    }
    do {
        yield node;
        if (next(node.viewModel.firstChild))
            continue;
        if (next(node.viewModel.nextSibling))
            continue;
        do {
            if (!next(node.viewModel.parent))
                return;
        } while (!next(node.viewModel.nextSibling));
    } while (true);
}
export function findAncestor(node, type) {
    const path = [node];
    for (const ancestor of ancestors(node)) {
        if (ancestor.type === type) {
            return {
                ancestor,
                path,
            };
        }
        path.unshift(ancestor);
    }
    return {};
}
export function findNextEditable(node, include = false) {
    const predicate = (node) => ['paragraph', 'code-block', 'section'].includes(node.type);
    if (include && predicate(node))
        return node;
    return findNextDfs(node, predicate);
}
export function findFinalEditable(node, include = false) {
    const predicate = (node) => ['paragraph', 'code-block', 'section'].includes(node.type);
    let result = null;
    if (include && predicate(node))
        result = node;
    for (const next of dfs(node)) {
        if (predicate(next))
            result = next;
    }
    return result;
}
export function findNextDfs(node, predicate) {
    for (const next of dfs(node)) {
        if (next !== node && predicate(next))
            return next;
    }
    return null;
}
export function findPreviousDfs(node, predicate) {
    for (const next of reverseDfs(node)) {
        if (next !== node && predicate(next))
            return next;
    }
    return null;
}
export function* children(node) {
    let next = node.viewModel.firstChild;
    while (next) {
        assert(next.viewModel.parent === node);
        const child = next;
        next = child.viewModel.nextSibling;
        yield child;
    }
}
//# sourceMappingURL=view-model-util.js.map
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
import { getContainingTransclusion } from './markdown/transclusion.js';
import { assert, cast } from './asserts.js';
import { focusNode } from './markdown/host-context.js';
import { findPreviousEditable, findNextEditable } from './markdown/view-model-util.js';
import { children } from './markdown/view-model-util.js';
export function getBlockSelectionTarget(element) {
    if (element.hostContext?.hasSelection)
        return element;
    // Retarget if there's any containing transclusion that has a selection.
    let transclusion;
    do {
        transclusion = getContainingTransclusion(transclusion ?? element);
    } while (transclusion && !cast(transclusion.hostContext).hasSelection);
    if (transclusion && cast(transclusion.hostContext).hasSelection) {
        assert(transclusion.node);
        return transclusion;
    }
    return;
}
export function maybeRemoveSelectedNodes(inline) {
    const { hostContext } = getBlockSelectionTarget(inline) ?? {};
    if (!hostContext)
        return false;
    return maybeRemoveSelectedNodesIn(hostContext);
}
export function maybeRemoveSelectedNodesIn(hostContext) {
    if (!hostContext.hasSelection)
        return false;
    const nodes = hostContext.selection;
    const context = [];
    const root = cast(hostContext.root);
    const finish = root.viewModel.tree.edit();
    try {
        for (const node of nodes) {
            node.viewModel.previousSibling && context.push(node.viewModel.previousSibling);
            node.viewModel.parent && context.push(node.viewModel.parent);
            if (node.type === 'section' && node.viewModel.parent) {
                for (const child of children(node)) {
                    child.viewModel.insertBefore(cast(node.viewModel.parent), node);
                }
            }
            node.viewModel.remove();
        }
        let didFocus = false;
        for (const node of context) {
            // TODO: this isn't a perfect test that the node is still connected
            if (node.viewModel.parent) {
                const prev = findPreviousEditable(node, root, true);
                if (prev) {
                    focusNode(hostContext, prev, -Infinity);
                    didFocus = true;
                    break;
                }
            }
        }
        if (!didFocus) {
            const next = findNextEditable(root, root, true);
            if (next) {
                focusNode(hostContext, next, 0);
                didFocus = true;
            }
        }
    }
    finally {
        finish();
    }
    hostContext.clearSelection();
    return true;
}
//# sourceMappingURL=block-selection-util.js.map
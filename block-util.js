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
export function isLogicalContainingBlock(node) {
    switch (node?.type) {
        case 'section':
            if (!node.viewModel.previousSibling &&
                (node.viewModel.parent?.type === 'list-item' ||
                    node.viewModel.parent?.type === 'document'))
                return false;
            return true;
        case 'list-item':
        case 'document':
            return true;
        default:
            return false;
    }
}
export function getLogicalContainingBlock(node) {
    let next = node?.viewModel.parent;
    while (next) {
        if (isLogicalContainingBlock(next))
            return next;
        next = next.viewModel.parent;
    }
    return;
}
//# sourceMappingURL=block-util.js.map
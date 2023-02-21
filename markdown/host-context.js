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
import { createContext } from '../deps/lit-labs-context.js';
export class HostContext {
    constructor() {
        this.selection = new Set();
    }
    get hasSelection() {
        return !!this.selection.size;
    }
    clearSelection() {
        if (!this.selection.size)
            return;
        const [...selection] = this.selection.values();
        this.selection.clear();
        this.selectionAnchor = undefined;
        this.selectionFocus = undefined;
        for (const node of selection) {
            node.viewModel.observe.notify();
        }
    }
    setSelection(anchor, focus) {
        this.selectionAnchor = anchor;
        this.selectionFocus = focus;
        this.selection.add(anchor);
        this.selection.add(focus);
        anchor.viewModel.observe.notify();
        focus.viewModel.observe.notify();
    }
    extendSelection(from, to) {
        if (this.selection.has(to)) {
            this.selection.delete(from);
            if (this.selectionAnchor === from) {
                this.selectionAnchor = to;
            }
            from.viewModel.observe.notify();
        }
        this.selection.add(to);
        this.selectionFocus = to;
        to.viewModel.observe.notify();
    }
}
;
export const hostContext = createContext('hostContext');
export function focusNode(context, node, offset) {
    context.focusNode = node;
    context.focusOffset = offset;
    node.viewModel.observe.notify();
}
//# sourceMappingURL=host-context.js.map
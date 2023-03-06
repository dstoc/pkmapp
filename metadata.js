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
import { isLogicalContainingBlock } from './block-util.js';
import { assert } from './asserts.js';
class SetBiMap {
    constructor() {
        this.index = new Map;
        this.reverse = new Map;
        this.normalized = new Map();
    }
    values() {
        return this.index.keys();
    }
    getValues(target) {
        return this.reverse.get(target);
    }
    getTargets(value) {
        return this.normalized.get(value.toLowerCase());
    }
    add(target, value) {
        let targets = this.index.get(value);
        if (!targets) {
            targets = new Set();
            this.index.set(value, targets);
        }
        targets.add(target);
        let values = this.reverse.get(target);
        if (!values) {
            values = new Set();
            this.reverse.set(target, values);
        }
        values.add(value);
        const normalizedValue = value.toLowerCase();
        let normalizedTargets = this.normalized.get(normalizedValue);
        if (!normalizedTargets) {
            normalizedTargets = new Set();
            this.normalized.set(normalizedValue, normalizedTargets);
        }
        normalizedTargets.add(target);
    }
    remove(target, value) {
        let targets = this.index.get(value);
        targets?.delete(target);
        if (targets?.size === 0)
            this.index.delete(value);
        let values = this.reverse.get(target);
        values?.delete(value);
        if (values?.size === 0)
            this.reverse.delete(target);
        const normalizedValue = value.toLowerCase();
        let normalizedTargets = this.normalized.get(normalizedValue);
        normalizedTargets?.delete(target);
        if (normalizedTargets?.size === 0)
            this.normalized.delete(normalizedValue);
    }
    update(target, values) {
        const stale = new Set(this.reverse.get(target));
        for (const value of values) {
            this.add(target, value);
            stale.delete(value);
        }
        for (const value of stale) {
            this.remove(target, value);
        }
    }
}
class ProviderMap {
    constructor(changed) {
        this.changed = changed;
        this.values = new Map();
        this.targets = new Map();
    }
    update(provider, target, value) {
        const previousTarget = this.targets.get(provider);
        const previousValue = previousTarget ? this.values.get(previousTarget) : undefined;
        const targetChanged = previousTarget !== target;
        const valueChanged = previousValue !== value;
        if (previousTarget && (targetChanged || value == undefined)) {
            this.targets.delete(provider);
            this.values.delete(previousTarget);
        }
        if (value !== undefined && (targetChanged || valueChanged)) {
            assert(target);
            this.targets.set(provider, target);
            this.values.set(target, value);
        }
        if (targetChanged) {
            if (previousTarget) {
                this.changed(previousTarget, undefined, previousValue);
            }
            if (value !== undefined) {
                assert(target);
                this.changed(target, value, undefined);
            }
        }
        else if (valueChanged) {
            assert(target);
            this.changed(target, value, previousValue);
        }
    }
}
export class Metadata {
    constructor() {
        this.meta = new ProviderMap((target, value) => {
            this.nameMap.update(target, value !== undefined ? [value] : []);
            target.viewModel.observe.notify();
        });
        this.nameMap = new SetBiMap();
        this.sectionNameMap = new SetBiMap();
    }
    getAllNames() {
        return [...this.nameMap.values(), ...this.sectionNameMap.values()];
    }
    getNames(node) {
        if (node.type !== 'section' && node.viewModel.firstChild?.type === 'section') {
            node = node.viewModel.firstChild;
        }
        const result = [...this.nameMap.getValues(node)?.values() ?? []];
        if (node.type === 'section')
            result.push(node.content);
        return result;
    }
    findByName(name) {
        const [section] = this.sectionNameMap.getTargets(name)?.values() ?? [];
        if (section) {
            if (!isLogicalContainingBlock(section)) {
                return section.viewModel.parent;
            }
            return section;
        }
        const [result] = this.nameMap.getTargets(name)?.values() ?? [];
        if (result && !isLogicalContainingBlock(result)) {
            return result.viewModel.parent;
        }
        return result;
    }
    updateSection(node, change) {
        if (change === 'disconnected') {
            this.sectionNameMap.update(node, []);
        }
        else {
            this.sectionNameMap.update(node, [node.content]);
        }
        if (change === 'changed' && !isLogicalContainingBlock(node)) {
            node.viewModel.parent?.viewModel.observe.notify();
        }
    }
    updateCodeblock(node, change) {
        const parent = node.viewModel.parent;
        const isMetadata = change !== 'disconnected' && node.info === 'meta';
        const valid = isMetadata && (isLogicalContainingBlock(parent) || parent?.type === 'section');
        if (valid) {
            this.meta.update(node, parent, node.content);
        }
        else {
            this.meta.update(node);
        }
    }
}
//# sourceMappingURL=metadata.js.map
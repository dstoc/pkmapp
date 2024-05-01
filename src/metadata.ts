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

import type {CodeBlockNode, SectionNode} from './markdown/node.js';
import {InlineViewModelNode, ViewModelNode} from './markdown/view-model.js';
import {dfs} from './markdown/inline-parser.js';
import {
  getLogicalContainingBlock,
  isLogicalContainingBlock,
} from './block-util.js';
import {assert} from './asserts.js';

class SetBiMap<T> {
  private index = new Map<string, Set<T>>();
  private reverse = new Map<T, Set<string>>();
  private normalized = new Map<string, Set<T>>();
  values() {
    return this.index.keys();
  }
  getValues(target: T) {
    return this.reverse.get(target);
  }
  getTargets(value: string) {
    return this.normalized.get(value.toLowerCase());
  }
  add(target: T, value: string) {
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
  remove(target: T, value: string) {
    let targets = this.index.get(value);
    targets?.delete(target);
    if (targets?.size === 0) this.index.delete(value);
    let values = this.reverse.get(target);
    values?.delete(value);
    if (values?.size === 0) this.reverse.delete(target);
    const normalizedValue = value.toLowerCase();
    let normalizedTargets = this.normalized.get(normalizedValue);
    normalizedTargets?.delete(target);
    if (normalizedTargets?.size === 0) this.normalized.delete(normalizedValue);
  }
  update(target: T, values: Iterable<string>) {
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

class ProviderMap<Provider, Target, Value> {
  private values = new Map<Target, Value>();
  private targets = new Map<Provider, Target>();
  constructor(
    readonly changed: (target: Target, value?: Value, newValue?: Value) => void,
  ) {}
  update(provider: Provider, target?: Target, value?: Value) {
    const previousTarget = this.targets.get(provider);
    const previousValue = previousTarget
      ? this.values.get(previousTarget)
      : undefined;
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
    } else if (valueChanged) {
      assert(target);
      this.changed(target, value, previousValue);
    }
  }
}

type Section = ViewModelNode & SectionNode;

export class Metadata {
  private meta = new ProviderMap<ViewModelNode, ViewModelNode, string>(
    (target, value) => {
      this.nameMap.update(target, value !== undefined ? [value] : []);
      target.viewModel.observe.notify();
    },
  );
  private nameMap = new SetBiMap<ViewModelNode>();
  private tagMap = new SetBiMap<InlineViewModelNode>();
  private sectionNameMap = new SetBiMap<Section>();

  getAllNames() {
    return [
      ...this.nameMap.values(),
      ...this.tagMap.values(),
      ...this.sectionNameMap.values(),
    ];
  }
  getPreferredName(node: ViewModelNode) {
    if (
      node.type !== 'section' &&
      node.viewModel.firstChild?.type === 'section'
    ) {
      node = node.viewModel.firstChild;
    }
    if (node.type === 'section') return node.content;
    const [result] = this.nameMap.getValues(node)?.values() ?? [];
    return result;
  }
  getNames(node: ViewModelNode) {
    if (
      node.type !== 'section' &&
      node.viewModel.firstChild?.type === 'section'
    ) {
      node = node.viewModel.firstChild;
    }
    const result = [...(this.nameMap.getValues(node)?.values() ?? [])];
    if (node.type === 'section') result.push(node.content);
    return result;
  }
  findByName(name: string) {
    const sections = [
      ...(this.sectionNameMap.getTargets(name)?.values() ?? []),
    ].map((section) => {
      if (!isLogicalContainingBlock(section)) {
        return section.viewModel.parent!;
      }
      return section;
    });
    const named = [...(this.nameMap.getTargets(name)?.values() ?? [])].map(
      (result) => {
        if (result && !isLogicalContainingBlock(result)) {
          return result.viewModel.parent!;
        }
        return result;
      },
    );
    const tagged = [...(this.tagMap.getTargets(name)?.values() ?? [])].map(
      (node) => getLogicalContainingBlock(node)!,
    );
    return [...sections, ...named, ...tagged];
  }
  updateSection(
    node: Section,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    if (change === 'disconnected') {
      this.sectionNameMap.update(node, []);
    } else {
      this.sectionNameMap.update(node, [node.content]);
    }
    if (change === 'changed' && !isLogicalContainingBlock(node)) {
      node.viewModel.parent?.viewModel.observe.notify();
    }
  }
  updateCodeblock(
    node: ViewModelNode & CodeBlockNode,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    const parent = node.viewModel.parent;
    const isMetadata = change !== 'disconnected' && node.info === 'meta';
    const valid =
      isMetadata &&
      (isLogicalContainingBlock(parent) || parent?.type === 'section');
    if (valid) {
      this.meta.update(node, parent, node.content);
    } else {
      this.meta.update(node);
    }
  }
  updateInlineNode(
    node: InlineViewModelNode,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    if (change === 'disconnected') {
      this.tagMap.update(node, []);
    } else {
      const tags = new Set<string>();
      for (const next of dfs(node.viewModel.inlineTree.rootNode)) {
        if (next.type !== 'tag') continue;
        tags.add(next.text);
      }
      this.tagMap.update(node, tags);
    }
  }
}

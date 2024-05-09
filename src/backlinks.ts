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

import {dfs} from './markdown/inline-parser.js';
import {InlineViewModelNode} from './markdown/view-model-node.js';
import {Library, Document} from './library.js';

export class BackLinks {
  private links = new Map<InlineViewModelNode, Set<string>>();
  private backLinks = new Map<string, Set<InlineViewModelNode>>();

  private getBacklinksByName(name: string) {
    return [...(this.backLinks.get(name)?.values() ?? [])].map(
      (node) => node.viewModel.tree,
    );
  }
  getBacklinksByDocument(document: Document, library: Library) {
    const sources = new Set<string>();
    for (const name of document.allNames) {
      for (const tree of this.getBacklinksByName(name)) {
        const source = library.getDocumentByTree(tree)?.name;
        if (source == null) continue;
        sources.add(source);
      }
    }
    // TODO: maybe sort by last edit time
    // TODO: return block rather than string?
    return [...sources.values()];
  }
  postEditUpdate(
    node: InlineViewModelNode,
    change: 'connected' | 'disconnected' | 'changed',
  ) {
    if (change === 'disconnected') {
      const links = this.links.get(node);
      if (links) {
        for (const target of links) {
          this.backLinks.get(target)?.delete(node);
        }
        this.links.delete(node);
      }
    } else {
      let links = this.links.get(node);
      const preLinks = new Set(links?.values() ?? []);
      for (const next of dfs(node.viewModel.inlineTree.rootNode)) {
        if (next.type === 'inline_link' || next.type === 'shortcut_link') {
          const text =
            next.namedChildren.find((node) => node.type === 'link_text')
              ?.text ?? '';
          const destination =
            next.namedChildren.find((node) => node.type === 'link_destination')
              ?.text ?? text;
          if (!links) {
            links = new Set();
            this.links.set(node, links);
          }
          links.add(destination);
          let backLinks = this.backLinks.get(destination);
          if (!backLinks) {
            backLinks = new Set();
            this.backLinks.set(destination, backLinks);
          }
          backLinks.add(node);
          preLinks.delete(destination);
        }
      }
      for (const target of preLinks) {
        this.backLinks.get(target)?.delete(node);
        this.links.get(node)?.delete(target);
      }
    }
  }
}

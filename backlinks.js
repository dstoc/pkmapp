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
import { dfs } from './markdown/inline-parser.js';
export class BackLinks {
    constructor() {
        this.links = new Map();
        this.backLinks = new Map();
    }
    getBacklinksByName(name) {
        return [...(this.backLinks.get(name)?.values() ?? [])].map((node) => node.viewModel.tree);
    }
    getBacklinksByDocument(document, library) {
        const sources = new Set();
        for (const name of document.allNames) {
            for (const tree of this.getBacklinksByName(name)) {
                const source = library.getDocumentByTree(tree)?.name;
                if (source == null)
                    continue;
                sources.add(source);
            }
        }
        // TODO: maybe sort by last edit time
        // TODO: return block rather than string?
        return [...sources.values()];
    }
    postEditUpdate(node, change) {
        const ivmn = node;
        if (change === 'disconnected') {
            const links = this.links.get(ivmn);
            if (links) {
                for (const target of links) {
                    this.backLinks.get(target)?.delete(ivmn);
                }
                this.links.delete(ivmn);
            }
        }
        else {
            let links = this.links.get(ivmn);
            const preLinks = new Set(links?.values() ?? []);
            for (const next of dfs(ivmn.viewModel.inlineTree.rootNode)) {
                if (next.type === 'inline_link' || next.type === 'shortcut_link') {
                    const text = next.namedChildren.find((node) => node.type === 'link_text')
                        ?.text ?? '';
                    const destination = next.namedChildren.find((node) => node.type === 'link_destination')
                        ?.text ?? text;
                    if (!links) {
                        links = new Set();
                        this.links.set(ivmn, links);
                    }
                    links.add(destination);
                    let backLinks = this.backLinks.get(destination);
                    if (!backLinks) {
                        backLinks = new Set();
                        this.backLinks.set(destination, backLinks);
                    }
                    backLinks.add(ivmn);
                    preLinks.delete(destination);
                }
            }
            for (const target of preLinks) {
                this.backLinks.get(target)?.delete(ivmn);
                this.links.get(ivmn)?.delete(target);
            }
        }
    }
}
//# sourceMappingURL=backlinks.js.map
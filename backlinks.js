import { dfs } from './markdown/inline-parser.js';
export class BackLinks {
    constructor() {
        this.links = new Map();
        this.backLinks = new Map();
    }
    getBacklinksByName(name) {
        return [...(this.backLinks.get(name)?.values() ?? [])].map(node => node.viewModel.tree);
    }
    getBacklinksByDocument(document, library) {
        const sources = new Set();
        for (const name of document.aliases) {
            for (const tree of this.getBacklinksByName(name)) {
                const source = library.getDocumentByTree(tree)?.aliases[0];
                if (source == null)
                    continue;
                sources.add(source);
            }
        }
        // TODO: maybe sort by last edit time
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
                    const text = next.namedChildren.find((node) => node.type === 'link_text')?.text ??
                        '';
                    const destination = next.namedChildren.find((node) => node.type === 'link_destination')?.text ??
                        text;
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
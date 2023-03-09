import { getLogicalContainingBlock } from './block-util.js';
import { cast } from './asserts.js';
import { html } from './deps/lit.js';
import './markdown/block-render.js';
export class BlockCommandBundle {
    constructor(description, library, action, freeformAction) {
        this.description = description;
        this.library = library;
        this.action = action;
        this.freeformAction = freeformAction;
    }
    async getCommands(input) {
        const names = await this.library.getAllNames();
        const parts = input.split('/');
        const constraints = [];
        for (let i = 0; i < parts.length; i++) {
            const filter = getFilter(parts[i]);
            constraints[i] = (await Promise.all(names.filter(filter).map(async (name) => {
                const blocks = await this.library.findAll(name);
                return blocks.map(item => ({
                    ...item,
                    name: this.library.metadata.getNames(item.root)[0] ?? item.document.name,
                    description: name,
                }));
            }))).flat();
            if (i > 0) {
                constraints[i] = constraints[i].filter(item => {
                    let next;
                    do {
                        next = getLogicalContainingBlock(next ?? item.root);
                        if (next) {
                            const prev = constraints[i - 1].find(({ root }) => root === next);
                            if (prev) {
                                item.name = prev.name + '/' + item.name;
                                item.description = prev.description + '/' + item.description;
                                return true;
                            }
                        }
                    } while (next);
                    return false;
                });
            }
        }
        const commands = constraints[constraints.length - 1].map(item => ({
            description: item.description,
            execute: async () => this.action(item),
            icon: kindIcon(item),
            preview: () => html `<md-block-render inert .block=${item.root}></md-block-render>`
        }));
        if (this.freeformAction && parts.length == 1 && parts[0].length) {
            // TODO: don't add if there's a matching name
            commands.push({
                description: input,
                icon: '🆕 ',
                execute: () => cast(this.freeformAction)({ name: input }),
            });
        }
        return commands;
    }
}
function kindIcon(item) {
    if (item.root.type === 'document')
        return '📚 ';
    else
        return '📄 ';
}
function getFilter(input) {
    const pattern = new RegExp(input.replace(/(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'), 'i');
    return (name) => pattern.test(name);
}
//# sourceMappingURL=block-command-bundle.js.map
import type {CommandBundle} from './command-palette.js';
import type {Library, Document} from './library.js';
import type {ViewModelNode} from './markdown/view-model.js';
import {getLogicalContainingBlock} from './block-util.js';
import {cast} from './asserts.js';

type Result = {document: Document, root: ViewModelNode, name: string};

export class BlockCommandBundle implements CommandBundle {
  constructor(
    readonly description: string,
    private library: Library,
    private action: (result: Result) => Promise<CommandBundle|undefined>,
    private readonly freeformAction?: (result: {name: string}) => Promise<CommandBundle|undefined>) {
  }
  async getCommands(input: string) {
    const names = await this.library.getAllNames();
    const parts = input.split('/');
    const constraints: Result[][] = [];
    for (let i = 0; i < parts.length; i++) {
      const filter = getFilter(parts[i]);
      constraints[i] = (await Promise.all(names.filter(filter).map(async name => {
        const blocks = await this.library.findAll(name);
        return blocks.map(item => ({
          ...item,
          name: this.library.metadata.getNames(item.root)[0] ?? item.document.name,
        }));
      }))).flat();
      if (i > 0) {
        constraints[i] = constraints[i].filter(item => {
          let next: ViewModelNode|undefined;
          do {
            next = getLogicalContainingBlock(next ?? item.root);
            if (next) {
              const prev = constraints[i - 1].find(({root}) => root === next);
              if (prev) {
                item.name = prev.name + '/' + item.name;
                return true;
              }
            }
          } while (next);
          return false;
        });
      }
    }
    const commands = constraints[constraints.length - 1].map(item => ({
      description: item.name,
      execute: async () => this.action(item),
    }));
    if (this.freeformAction && parts.length == 1) {
      // TODO: don't add if there's a matching name
      commands.push({
        description: input,
        execute: () => cast(this.freeformAction)({name: input}),
      });
    } 
    return commands;
  }
}

function getFilter(input: string) {
  const pattern = new RegExp(
      input.replace(
          /(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'),
      'i');
  return (name: string) => pattern.test(name);
}


import type {Command, CommandBundle} from './command-palette.js';
import type {Library, Document} from './library.js';
import type {ViewModelNode} from './markdown/view-model-node.js';
import {getLogicalContainingBlock} from './block-util.js';
import {cast} from './asserts.js';
import {html} from './deps/lit.js';
import './markdown/block-render.js';
import './title.js';
import {expandPrefixToAlias, resolveDateAlias} from './date-aliases.js';

interface Result {
  document: Document;
  root: ViewModelNode;
  name: string;
  description: string;
}

export class BlockCommandBundle implements CommandBundle {
  constructor(
    readonly description: string,
    private library: Library,
    private action: (result: Result) => Promise<CommandBundle | undefined>,
    private readonly freeformAction?: (result: {
      name: string;
    }) => Promise<CommandBundle | undefined>,
  ) {}
  async getCommands(input: string) {
    const names = await this.library.getAllNames();
    const parts = input.split('/');
    const constraints: Result[][] = [];
    for (let i = 0; i < parts.length; i++) {
      const filter = getFilter(parts[i]);
      constraints[i] = (
        await Promise.all(
          names.filter(filter).map(async (name) => {
            const blocks = await this.library.findAll(name);
            return blocks.map((item) => ({
              ...item,
              name: this.library.metadata.getNames(item.root)[0] ?? name,
              description: this.library.metadata.getNames(item.root)[0] ?? name,
            }));
          }),
        )
      ).flat();
      if (i > 0) {
        constraints[i] = constraints[i].filter((item) => {
          let next: ViewModelNode | undefined;
          do {
            next = getLogicalContainingBlock(next ?? item.root);
            if (next) {
              const prev = constraints[i - 1].find(({root}) => root === next);
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
    const seen = new Set<ViewModelNode>();
    function once(item: Result) {
      if (seen.has(item.root)) return false;
      seen.add(item.root);
      return true;
    }
    const commands: Command[] = constraints[constraints.length - 1]
      .filter(once)
      .map((item) => ({
        description: item.description,
        execute: async () => this.action(item),
        icon: blockIcon(item),
        preview: () => blockPreview(item),
      }));
    if (this.freeformAction && parts.length == 1 && parts[0].length) {
      const resolved = resolveDateAlias(input);
      if (resolved) {
        commands.push({
          description: resolved,
          icon: '🆕 ',
          execute: () => cast(this.freeformAction)({name: resolved}),
        });
      } else {
        commands.push({
          description: input,
          icon: '🆕 ',
          execute: () => cast(this.freeformAction)({name: input}),
        });
      }
    }
    return commands;
  }
}

export function blockPreview({root}: {root: ViewModelNode}) {
  return html`
    <pkm-title .node=${root}></pkm-title>
    <md-block-render .block=${root}></md-block-render>
  `;
}

export function blockIcon({root, name}: {root: ViewModelNode; name: string}) {
  if (name.startsWith('#')) return '🏷️ ';
  if (root.type === 'document') return '📚 ';
  else return '📄 ';
}

function getFilter(input: string) {
  const pattern = new RegExp(
    input.replace(/(.)/g, (c) => c.replace(/[^a-zA-Z0-9]/, '\\$&') + '.*?'),
    'i',
  );
  return (name: string) => {
    return (
      expandPrefixToAlias(input)
        // TODO: not sure why lowercase is needed here.
        // `name` for a week includes a lower case 'w', but why?
        .map((alias) => resolveDateAlias(alias)?.toLowerCase())
        .filter((value) => value !== undefined)
        .includes(name) || pattern.test(name)
    );
  };
}

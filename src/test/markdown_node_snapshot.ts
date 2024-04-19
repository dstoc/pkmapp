import {expect} from 'vitest';
import {serializeToString} from '../markdown/block-serializer.js';
import {MarkdownNode} from '../markdown/node.js';

expect.addSnapshotSerializer({
  serialize(val, _config, indentation, _depth, _refs, _printer) {
    const target = val as MarkdownNode;
    return serializeToString(target, undefined, indentation);
  },
  test(val: unknown) {
    return (
      val !== null &&
      typeof val === 'object' &&
      Symbol.for('markdown-tree') in val
    );
  },
});

import {expect, test, describe} from 'vitest';
import {assert} from '../asserts.js';
import {parseBlocks} from './block-parser.js';

describe('parseBlocks', () => {
  test('should extract front matter into the document metadata', async () => {
    const {node: result} = parseBlocks(`---
a: 1
---

hello`);
    assert(result && result.type === 'document');
    expect(result.metadata).toEqual('a: 1');
  });
});

import {expect} from '@wdio/globals';
import {assert} from '../asserts.js';
import {parseBlocks} from './block-parser.js';

describe('parseBlocks', () => {
  it('should extract front matter into the document metadata', async () => {
    const {node: result} = parseBlocks(`---
a: 1
---

hello`);
    assert(result && result.type === 'document');
    expect(result.metadata).toEqual('a: 1');
  });
});

import {beforeEach} from 'vitest';

export function testState<T>(makeState: () => T | Promise<T>): T {
  const result = {};
  beforeEach(async () => {
    Object.assign(result, await makeState());
  });
  return result as T;
}

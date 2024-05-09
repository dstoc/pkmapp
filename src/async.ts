import {assert} from './asserts.js';

export function noAwait(promise: Promise<unknown>) {
  assert(promise);
}

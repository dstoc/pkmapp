// Copyright 2022 Google LLC
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

import {assert, cast} from './asserts.js';
import {noAwait} from './async.js';

export class Observe<T, V = void, D = unknown> {
  private observers = new Set<(target: T, value: V) => void>();
  private state: 'active' | 'suspended' | 'delegated';
  private resumed?: Promise<void>;
  constructor(
    readonly target?: T,
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    private delegate?: Observe<D, any, unknown>,
  ) {
    this.state = delegate ? 'delegated' : 'active';
  }
  suspend() {
    assert(this.state === 'active');
    this.state = 'suspended';
    let result: () => void;
    this.resumed = new Promise(
      (resolve) =>
        (result = () => {
          this.state = 'active';
          this.resumed = undefined;
          resolve();
        }),
    );
    return result!;
  }
  notify(value: V, target = cast(this.target)) {
    if ((this.delegate?.state ?? this.state) === 'suspended') {
      // TODO: coalesce
      noAwait(
        cast(this.delegate?.resumed ?? this.resumed).then(() =>
          this.notify(value, target),
        ),
      );
      return;
    }
    for (const observer of this.observers.values()) {
      observer(target, value);
    }
  }
  add(observer: (target: T, value: V) => void) {
    this.observers.add(observer);
  }
  remove(observer: (target: T, value: V) => void) {
    this.observers.delete(observer);
  }
}

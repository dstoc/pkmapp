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

export class Observe<T> {
  private observers = new Set<(target: T) => void>();
  private state: 'active' | 'suspended' | 'delegated';
  private resumed?: Promise<void>;
  constructor(
    readonly target: T,
    private delegate?: Observe<any>,
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
  notify() {
    if ((this.delegate?.state ?? this.state) === 'suspended') {
      // TODO: coalesce
      cast(this.delegate?.resumed ?? this.resumed).then(() => this.notify());
      return;
    }
    for (const observer of this.observers.values()) {
      observer(this.target);
    }
  }
  add(observer: (node: T) => void) {
    this.observers.add(observer);
  }
  remove(observer: (node: T) => void) {
    this.observers.delete(observer);
  }
}

export class Observer<T, O> {
  constructor(
    private target: () => T,
    private add: (target: T, observer: (value: O) => void) => void,
    private remove: (target: T, observer: (value: O) => void) => void,
    private observer: (value: O) => void,
  ) {}
  private cache?: T;
  update(clear = false) {
    const oldCache = this.cache;
    if (clear) {
      this.cache = undefined;
    } else {
      this.cache = this.target();
    }
    if (this.cache !== oldCache) {
      if (oldCache !== undefined) {
        this.remove(oldCache, this.observer);
      }
      if (this.cache !== undefined) {
        this.add(this.cache, this.observer);
      }
    }
  }
}

export class Observers {
  constructor(...observers: Observer<any, any>[]) {
    this.observers = observers;
  }
  private observers: Observer<any, any>[];
  update(clear = false) {
    for (const observer of this.observers) observer.update(clear);
  }
  clear() {
    this.update(true);
  }
}

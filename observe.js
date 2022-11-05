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
export class Observe {
    constructor(target) {
        this.target = target;
        this.observers = new Set();
    }
    notify() {
        for (const observer of this.observers.values()) {
            observer(this.target);
        }
    }
    add(observer) {
        this.observers.add(observer);
    }
    remove(observer) {
        this.observers.delete(observer);
    }
}
export class Observer {
    constructor(target, add, remove, observer) {
        this.target = target;
        this.add = add;
        this.remove = remove;
        this.observer = observer;
    }
    update(clear = false) {
        const oldCache = this.cache;
        if (clear) {
            this.cache = undefined;
        }
        else {
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
    constructor(...observers) {
        this.observers = observers;
    }
    update(clear = false) {
        for (const observer of this.observers)
            observer.update(clear);
    }
}
//# sourceMappingURL=observe.js.map
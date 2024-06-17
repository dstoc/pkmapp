import {effect} from '@preact/signals-core';

export interface SigpropHost {
  effect(): void;
  effectDispose?: () => void;
}

export function sigprop<This extends SigpropHost, Return>(
  target: ClassAccessorDecoratorTarget<This, Return>,
  _context: ClassAccessorDecoratorContext<This, Return>,
) {
  const result: ClassAccessorDecoratorResult<This, Return> = {
    get(this: This) {
      // eslint-disable-next-line  @typescript-eslint/no-unsafe-return
      return target.get.call(this);
    },
    set(this: This, value: Return) {
      if (target.get.call(this) === value) return;
      target.set.call(this, value);
      this.effectDispose?.();
      this.effectDispose = effect(() => {
        this.effect();
      });
    },
  };

  return result;
}

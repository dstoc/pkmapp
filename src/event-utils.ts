export interface TypedEventTarget<Target, EventMap> {
  addEventListener<K extends keyof EventMap>(
    type: K,
    listener: (this: Target, ev: EventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof EventMap>(
    type: K,
    listener: (this: Target, ev: EventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  dispatchEvent<K extends keyof EventMap>(
    event: EventMap[K] & Event & {type: K},
  ): boolean;
}

export type TypedEventTargetConstructor<Target, EventMap> =
  new () => TypedEventTarget<Target, EventMap>;

export const TypedCustomEvent = CustomEvent as {
  prototype: CustomEvent;
  new <T, K extends string>(
    type: K,
    eventInitDict?: CustomEventInit<T>,
  ): CustomEvent<T> & {type: K};
};

type IsAny<T> = 0 extends 1 & T ? true : false;
type ConvertAny<T> =
  IsAny<T> extends true
    ? unknown
    : T extends (infer K)[]
      ? IsAny<K> extends true
        ? unknown[]
        : T
      : T extends readonly (infer K)[]
        ? IsAny<K> extends true
          ? readonly unknown[]
          : T
        : T;

export function wrap<T>(request: IDBRequest<T>) {
  return new Promise<IDBRequest<ConvertAny<T>>>(
    (resolve, reject) => (
      (request.onsuccess = () => resolve(request as IDBRequest<ConvertAny<T>>)),
      (request.onerror = reject)
    ),
  );
}

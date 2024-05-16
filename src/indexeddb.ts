export function wrap<T>(request: IDBRequest<T>) {
  return new Promise<IDBRequest<T>>(
    (resolve, reject) => (
      (request.onsuccess = () => resolve(request)), (request.onerror = reject)
    ),
  );
}

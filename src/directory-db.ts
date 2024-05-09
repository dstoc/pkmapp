// Copyright 2023 Google LLC
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

import {assert} from './asserts.js';

function wrap<T extends IDBRequest>(request: T) {
  return new Promise<T>(
    (resolve, reject) => (
      (request.onsuccess = () => resolve(request)), (request.onerror = reject)
    ),
  );
}

async function getDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open('pkmapp-directories');
  request.onupgradeneeded = () => {
    const database = request.result;
    database.createObjectStore('directories');
  };
  return (await wrap(request)).result;
}

export async function getDirectory(
  key: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await getDatabase();
  const result: unknown = (
    await wrap(
      db
        .transaction('directories', 'readwrite')
        .objectStore('directories')
        .get(key),
    )
  ).result;
  assert(result instanceof FileSystemDirectoryHandle || result === undefined);
  return result;
}

export async function setDirectory(
  key: string,
  directory: FileSystemDirectoryHandle,
) {
  const db = await getDatabase();
  await wrap(
    db
      .transaction('directories', 'readwrite')
      .objectStore('directories')
      .put(directory, key),
  );
}

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

self.addEventListener('fetch', (event: any) => {
  const basePath = new URL(self.location.toString()).pathname.replace(
    '/serviceworker.js',
    ''
  );
  const target = new URL(event.request.url);
  if (target.origin !== self.origin) return;
  if (target.pathname === '/') return;
  if (target.pathname.endsWith('/pkmapp.js')) {
    const path = basePath + '/pkmapp.js';
    if (path === target.pathname) return;
    event.respondWith(Response.redirect(path));
    return;
  }
  if (target.pathname.includes('.')) return;
  event.respondWith(fetch(basePath + '/index.html'));
  return;
});

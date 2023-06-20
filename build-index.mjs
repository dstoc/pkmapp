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

import {Generator} from '@jspm/generator';
import {
  existsSync,
  rmSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import {pathToFileURL} from 'url';
import {join, dirname} from 'path';

const generator = new Generator({
  defaultProvider: 'nodemodules',
  mapUrl: import.meta.url,
  env: ['production', 'browser', 'module'],
});

const packages = [
  'lit',
  'lit/decorators.js',
  'lit/directives/repeat.js',
  '@lit-labs/context',
];

await generator.install(packages);

const base = pathToFileURL('.').href;
const deps = (await generator.extractMap(packages)).staticDeps;
if (existsSync('build/node_modules')) {
  rmSync('build/node_modules', {recursive: true});
}
for (const dep of deps) {
  const file = dep.substring(base.length + 1);
  const target = join('build', file);
  mkdirSync(dirname(target), {recursive: true});
  copyFileSync(file, target);
}

const inputHtml = readFileSync('index.html').toString();
const outputHtml = await generator.htmlInject(inputHtml, {
  esModuleShims: false,
});
writeFileSync('build/index.html', outputHtml);

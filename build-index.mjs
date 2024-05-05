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
import prettier from 'prettier';

const generator = new Generator({
  defaultProvider: 'nodemodules',
  mapUrl: import.meta.url,
  env: ['production', 'browser', 'module'],
});

const packages = [
  'lit',
  'lit-html',
  '@lit/reactive-element/css-tag.js',
  'lit/decorators.js',
  'lit/directives/repeat.js',
  '@lit/context',
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

generator.importMap.imports['web-tree-sitter'] = './deps/tree-sitter.js';
const {map} = await generator.extractMap(generator.traceMap.pins);
map.imports['web-tree-sitter'] = './deps/tree-sitter.js';
const importMap = await prettier.format(JSON.stringify(map), { parser: "json" });
const outputHtml = `<!DOCTYPE html>
<title>pkmapp</title>
<script type="importmap">
${importMap}
</script>
<link rel=manifest href="manifest.json">
<script type="module" src="./pkmapp.js"></script>
<script type="module" src="./serviceworker.js"></script>
`;
writeFileSync('build/index.html', outputHtml);
copyFileSync('src/manifest.json', 'build/manifest.json');

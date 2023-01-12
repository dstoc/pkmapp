import {Generator} from '@jspm/generator';
import {readFileSync, writeFileSync} from 'fs';

const generator = new Generator({
  mapUrl: import.meta.url,
  env: ['production', 'browser', 'module'],
});

await generator.install('lit');
await generator.install('lit/decorators.js');
await generator.install('lit/directives/repeat.js');
await generator.install('@lit-labs/context');

const inputHtml = readFileSync('index.html').toString();
const outputHtml = await generator.htmlInject(inputHtml, {esModuleShims: false});

writeFileSync('build/index.html', outputHtml);

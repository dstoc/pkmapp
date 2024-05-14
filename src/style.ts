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

import {css} from './deps/lit.js';

export const styles = [
  css`
    :root {
      color: var(--root-color);
      --root-font: 'Noto Sans';
      background-color: var(--root-background-color);
      font-family: var(--root-font);
      --md-block-quote-border: solid var(--root-background-color) 1px;
      --md-code-block-border: solid var(--root-background-color) 1px;
    }
    :root {
      color-scheme: light;
      --md-code-font-family: 'Fira Code VF', 'noto sans mono', monospace;
      --md-block-quote-bgcolor: #f2f2f2;
      --md-code-block-bgcolor: #f2f2f2;
      --md-code-span-bgcolor: #e2e2e2;
      --md-block-selection-bgcolor: #ccc;
      --md-accent-color: #67f;
      --md-active-block-color: #fafafa;
      --pkm-dialog-bgcolor: #f2f2f2;
      --root-color: black;
      --root-background-color: white;
      --md-tag-bgcolor: var(--md-accent-color);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --md-block-quote-bgcolor: #3e3e3e;
        --md-code-block-bgcolor: #3e3e3e;
        --md-code-span-bgcolor: #4e4e4e;
        --md-accent-color: #56e;
        --md-block-selection-bgcolor: #888;
        --md-active-block-color: #303030;
        --pkm-dialog-bgcolor: #191919;
        --root-color: white;
        --root-background-color: rgb(40, 40, 40);
      }
    }
  `.styleSheet!,
];

export async function loadFonts() {
  // TODO: this is fragile, returns a CSSStyleSheet in vite dev,
  // but a string in vite build. Only injects into head in vite
  // build.
  const [{default: fira}, {default: noto}] = await Promise.all([
    import('./deps/firacode/fira_code.css', {
      with: {type: 'css'},
    }),
    import('./deps/noto-emoji/400.css', {
      with: {type: 'css'},
    }),
  ]);
  if (!import.meta.env?.PROD) {
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets,
      fira as unknown as CSSStyleSheet,
      noto as unknown as CSSStyleSheet,
    ];
  }
}

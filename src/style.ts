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

import {fira, opensans} from './deps/fonts.js';
import {css} from './deps/lit.js';

export const styles = [
  css`
    :root {
      color: var(--root-color);
      background-color: var(--root-background-color);
      font-family: 'Noto Sans';
    }
    :root {
      --md-code-font-family: 'Fira Code VF', 'noto sans mono', monospace;
      --md-block-quote-bgcolor: rgba(0, 0, 0, 0.05);
      --md-code-block-bgcolor: rgba(0, 0, 0, 0.05);
      --md-accent-color: #67f;
      --root-color: black;
      --root-background-color: white;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --md-block-quote-bgcolor: rgba(255, 255, 255, 0.10);
        --md-code-block-bgcolor: rgba(255, 255, 255, 0.10);
        --md-accent-color: #56e;
        --root-color: white;
        --root-background-color: rgb(40, 40, 40);
      }
    }
  `.styleSheet!,
  fira,
];
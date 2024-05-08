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

import {type Keyboard} from '@playwright/test';

export function removeLeadingWhitespace(input: string, leading?: string) {
  if (leading == undefined) {
    leading = /(\n +)/.exec(input)?.[1];
  }
  return leading ? input.replace(new RegExp(leading, 'g'), '\n') : input;
}

export type KeyboardSequence = (keyboard: Keyboard) => Promise<void>;

export function input(
  strings: TemplateStringsArray,
  ...keys: string[][]
): KeyboardSequence {
  const leading = /(\n +)/.exec(strings.join(''))?.[1];
  const steps: ((keyboard: Keyboard) => Promise<void>)[] = [];
  for (let i = 0; i < strings.length; i++) {
    steps.push((keyboard) =>
      keyboard.type(removeLeadingWhitespace(strings[i], leading)),
    );
    for (const key of keys[i] ?? []) {
      steps.push((keyboard) => keyboard.press(key));
    }
  }
  return async (keyboard) => {
    for (const step of steps) await step(keyboard);
  };
}

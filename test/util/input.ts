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

export function removeLeadingWhitespace(input: string, leading?: string) {
  if (leading == undefined) {
    leading = /(\n +)/.exec(input)?.[1];
  }
  return leading ? input.replace(new RegExp(leading, 'g'), '\n') : input;
}

export function input(
  strings: TemplateStringsArray,
  ...keys: string[][]
): string[] {
  const leading = /(\n +)/.exec(strings.join(''))?.[1];
  const result: string[] = [];
  for (let i = 0; i < strings.length; i++) {
    result.push(...removeLeadingWhitespace(strings[i], leading).split(''));
    result.push(...(keys[i] ?? []));
  }
  return result;
}

export function control(...keys: string[]) {
  return ['Control', ...keys, 'Control'];
}

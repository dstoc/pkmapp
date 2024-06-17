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

import {noAwait} from './async.js';
import {html, LitElement} from 'lit';
import {state, customElement, property} from 'lit/decorators.js';

async function getConsistentEmoji(value: string) {
  const sha1 = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(value),
  );
  const index = new Uint8Array(sha1)[0];
  const emoji = [
    '☕',
    '✌️',
    '✨',
    '🌟',
    '🌭',
    '🍔',
    '🍕',
    '🍛',
    '🍜',
    '🍝',
    '🍟',
    '🍠',
    '🍣',
    '🍤',
    '🍦',
    '🍦',
    '🍧',
    '🍨',
    '🍩',
    '🍪',
    '🍫',
    '🍬',
    '🍭',
    '🍮',
    '🍯',
    '🍰',
    '🍱',
    '🍲',
    '🍳',
    '🍴',
    '🍵',
    '🍶',
    '🍷',
    '🍸',
    '🍹',
    '🍺',
    '🍻',
    '🍼',
    '🍽️',
    '🍾',
    '🍿',
    '🎁',
    '🎂',
    '🎆',
    '🎇',
    '🎈',
    '🎉',
    '🎊',
    '🐣',
    '💥',
    '💫',
    '🔥',
    '🚀',
    '🥂',
    '🥃',
    '🥄',
    '🥗',
    '🥘',
    '🥙',
    '🥟',
    '🥠',
    '🥡',
    '🥢',
    '🥤',
    '🥨',
    '🥪',
    '🥫',
    '🧀',
    '🧂',
    '🩴',
  ];
  return emoji[index % emoji.length];
}

@customElement('pkm-emoji')
export class Emoji extends LitElement {
  @property() accessor text: string | undefined;
  @state() private accessor emoji: string | undefined;
  override shouldUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('text')) {
      noAwait(this.updateEmoji());
    }
    return changedProperties.has('emoji');
  }
  override render() {
    return html`${this.emoji ?? ''}`;
  }
  async updateEmoji() {
    if (this.text !== undefined) {
      this.emoji = await getConsistentEmoji(this.text);
    } else {
      this.emoji = undefined;
    }
  }
}

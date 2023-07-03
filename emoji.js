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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { customElement, html, LitElement, state, property } from './deps/lit.js';
async function getConsistentEmoji(value) {
    const sha1 = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
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
export let Emoji = class Emoji extends LitElement {
    shouldUpdate(changedProperties) {
        if (changedProperties.has('text')) {
            this.updateEmoji();
        }
        return changedProperties.has('emoji');
    }
    render() {
        return html `${this.emoji ?? ''}`;
    }
    async updateEmoji() {
        if (this.text !== undefined) {
            this.emoji = await getConsistentEmoji(this.text);
        }
        else {
            this.emoji = undefined;
        }
    }
};
__decorate([
    property()
], Emoji.prototype, "text", void 0);
__decorate([
    state()
], Emoji.prototype, "emoji", void 0);
Emoji = __decorate([
    customElement('pkm-emoji')
], Emoji);
//# sourceMappingURL=emoji.js.map
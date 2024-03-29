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

import {contextProvided} from '../deps/lit-labs-context.js';
import {
  css,
  customElement,
  html,
  LitElement,
  property,
  query,
  queryAll,
  repeat,
  TemplateResult,
} from '../deps/lit.js';
import Parser from '../deps/tree-sitter.js';
import {cast} from '../asserts.js';

import {HostContext, hostContext} from './host-context.js';
import {InlineViewModelNode, ViewModelNode} from './view-model.js';

export interface InlineInputPoint {
  span?: MarkdownSpan;
  index: number;
}

export interface InlineInput {
  inline: MarkdownInline;
  node: ViewModelNode;
  content: string;
  inputEvent: InputEvent;
  inputStart: InlineInputPoint;
  inputEnd: InlineInputPoint;
}

export interface InlineKeyDown {
  inline: MarkdownInline;
  node: ViewModelNode;
  keyboardEvent: KeyboardEvent;
  inputEvent: InputEvent;
}

export interface InlineLinkClick {
  type: string;
  destination: string;
}

declare global {
  interface HTMLElementEventMap {
    'inline-input': CustomEvent<InlineInput>;
    'inline-keydown': CustomEvent<InlineInput>;
    'inline-link-click': CustomEvent<InlineLinkClick>;
  }
}

@customElement('md-inline')
export class MarkdownInline extends LitElement {
  static override get styles() {
    return [
      css`
        md-inline {
          display: block;
          outline: none;
        }
        md-inline[active] {
          white-space: pre;
          --focus-invalid: --;
        }
        md-inline[active] * {
          white-space: pre-wrap;
        }
        md-span a,
        md-span {
          visibility: visible;
          font-size: 16px;
        }
        md-span[type='backslash_escape']::first-letter {
          font-size: 0;
        }
        md-span[type='link_destination'],
        md-span[type='link_title'],
        md-span[type='code_span_delimiter'],
        md-span[type='emphasis_delimiter'] {
          display: var(--focus-invalid, none);
        }
        md-span[type='inline_link'],
        md-span[type='image'],
        md-span[type='shortcut_link'] {
          visibility: var(--focus-invalid, collapse);
          font-size: var(--focus-invalid, 0);
        }
        a,
        md-span[type='shortcut_link'],
        md-span[type='uri_autolink'],
        md-span[type='inline_link'] {
          color: blue;
          cursor: pointer;
          text-decoration: inherit;
        }
        md-span[type='emphasis'] {
          font-style: italic;
        }
        md-span[type='strong_emphasis'] {
          font-weight: bold;
        }
        md-span[type='strikethrough'] {
          text-decoration: line-through;
        }
        md-span[type='code_span'] {
          white-space: pre;
          font-family: monospace;
        }
      `,
    ];
  }
  constructor() {
    super();
    this.addEventListener('beforeinput', this.onBeforeInput, {capture: true});
    this.addEventListener('keydown', this.onKeyDown, {capture: true});
    this.addEventListener('pointerdown', this.onPointerDown);
    this.addEventListener('pointerup', () => {
      if (this.hasFocus) {
        this.active = true;
      }
    });
    this.addEventListener('focus', () => {
      this.hasFocus = true;
    });
    this.addEventListener('blur', () => {
      this.active = false;
      this.hasFocus = false;
    });
  }
  @contextProvided({context: hostContext, subscribe: true})
  @property({attribute: false})
  hostContext: HostContext | undefined;
  @property({type: Object, reflect: false}) node:
    | InlineViewModelNode
    | undefined;
  @property({type: Boolean, reflect: true}) contenteditable = true;
  @property({type: Boolean, reflect: true}) active = false;
  @query('md-span') span!: MarkdownSpan;
  hasFocus = false;

  override render() {
    if (!this.node) return;
    return html`<md-span
      .node=${this.node.viewModel.inlineTree!.rootNode}
      .active=${this.active}
    ></md-span>`;
  }
  override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('node')) {
      const oldNode = changedProperties.get('node') as ViewModelNode;
      this.removeObserver(oldNode);
      this.addObserver(this.node);
    }
  }
  override updated() {
    this.maybeSetFocus();
  }
  async maybeSetFocus() {
    if (this.hostContext?.focusNode !== this.node) return;
    // Wait for the nested md-span (and all of the decendant md-spans to
    // update).
    await this.span.updateComplete;
    if (this.hostContext?.focusNode !== this.node) return;
    if (!this.isConnected) return;
    const selection = (this.getRootNode()! as Document).getSelection()!;
    const range = document.createRange();
    range.setStart(this, 0);
    selection.removeAllRanges();
    selection.addRange(range);
    this.active = true;
    let focusOffset = this.hostContext?.focusOffset;
    if (focusOffset !== undefined) {
      if (focusOffset < 0 || Object.is(focusOffset, -0)) {
        let index = NaN;
        let last = NaN;
        do {
          last = index;
          selection.modify('move', 'forward', 'line');
          ({
            start: {index},
          } = MarkdownInline.getSelectionRange(selection));
        } while (index !== last);
        selection.modify('move', 'backward', 'lineboundary');
        focusOffset = -focusOffset;
      }
      if (focusOffset === Infinity) {
        selection.modify('move', 'forward', 'lineboundary');
      } else {
        // TODO: Check for overrun first line, but note that this conflicts
        // with the edit/setFocus case.
        for (let i = 0; i < focusOffset; i++) {
          selection.modify('move', 'forward', 'character');
        }
      }
      this.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
    // TODO: Avoid this by always maintaining accurate values?
    setTimeout(() => {
      this.hostContext!.focusNode = undefined;
      this.hostContext!.focusOffset = undefined;
    });
  }
  protected override createRenderRoot() {
    return this;
  }
  /**
   * Given a `node` and an `offset` in that node, find the containing md-span and the
   * index within that span.
   */
  static nodeOffsetToInputPoint(node: Node, offset: number): InlineInputPoint {
    if (node instanceof MarkdownInline) {
      return {index: 0};
    }
    let parent = node.parentElement;
    while (!(parent instanceof MarkdownSpan)) {
      parent = parent?.parentElement!;
    }
    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    walker.currentNode = node;
    let previous = walker.previousNode();
    while (
      previous &&
      previous !== parent &&
      !(previous instanceof MarkdownSpan)
    ) {
      if (previous.nodeType === Node.TEXT_NODE) {
        offset += (previous as Text).length;
      }
      previous = walker.previousNode();
    }
    let index = (cast(previous) as MarkdownSpan).node!.startIndex + offset;
    return {
      span: parent as MarkdownSpan,
      index,
    };
  }
  static getSelectionRange(selection: Selection) {
    const start = MarkdownInline.nodeOffsetToInputPoint(
      selection.anchorNode!,
      selection.anchorOffset,
    );
    const end = MarkdownInline.nodeOffsetToInputPoint(
      selection.focusNode!,
      selection.focusOffset,
    );
    return start.index <= end.index ? {start, end} : {start: end, end: start};
  }
  moveCaret(
    alter: 'move' | 'extend',
    direction: 'backward' | 'forward',
    granularity: 'line' | 'character' | 'word',
  ): true | number {
    const selection = (this.getRootNode()! as Document).getSelection()!;
    const focusNode = selection.focusNode!;
    const focusOffset = selection.focusOffset;
    const initial = MarkdownInline.nodeOffsetToInputPoint(
      selection.focusNode!,
      selection.focusOffset,
    );
    const focus = document.createRange();
    focus.setStart(selection.focusNode!, selection.focusOffset);
    focus.collapse(true);
    const anchor = document.createRange();
    anchor.setStart(selection.anchorNode!, selection.anchorOffset);
    anchor.collapse(true);

    // Create a selection that spans the current line.
    selection.removeAllRanges();
    selection.addRange(focus);
    selection.modify('move', 'backward', 'lineboundary');
    selection.modify('extend', 'forward', 'lineboundary');
    const line = MarkdownInline.getSelectionRange(selection);

    // Find the end of the inline.
    selection.modify('move', 'forward', 'documentboundary');
    const end = MarkdownInline.nodeOffsetToInputPoint(
      selection.focusNode!,
      selection.focusOffset,
    );

    // Reset the selection to the initial state, then modify it based on the arguments.
    selection.removeAllRanges();
    selection.addRange(anchor);
    selection.extend(focusNode, focusOffset);
    selection.modify(alter, direction, granularity);
    const result = MarkdownInline.nodeOffsetToInputPoint(
      selection.focusNode!,
      selection.focusOffset,
    );

    if (granularity === 'line') {
      if (direction == 'backward') {
        return (
          result.index < line.start.index || initial.index - line.start.index
        );
      } else {
        return (
          result.index > line.end.index ||
          (result.index !== end.index && result.index == line.end.index) ||
          initial.index - line.start.index
        );
      }
    } else {
      return (
        result.index !== initial.index ||
        (direction === 'backward' ? Infinity : 0)
      );
    }
  }
  getSelection() {
    const selection: Selection = (
      this.getRootNode()! as Document
    ).getSelection()!;
    if (!selection.focusNode) return;
    return MarkdownInline.getSelectionRange(selection);
  }
  getCaretPosition() {
    let {x, y, height} = (this.getRootNode()! as Document)
      .getSelection()!
      .getRangeAt(0)
      .getBoundingClientRect();
    if (x === 0 && y === 0) {
      ({x, y, height} = this.getBoundingClientRect());
    }
    return {x, y: y + height};
  }
  onKeyDown(e: KeyboardEvent) {
    const inlineKeydown = {
      inline: this,
      node: this.node!,
      keyboardEvent: e,
    };
    this.dispatchEvent(
      new CustomEvent('inline-keydown', {
        detail: inlineKeydown,
        bubbles: true,
        composed: true,
      }),
    );
  }
  onBeforeInput(e: InputEvent) {
    if (!this.node) return;
    e.preventDefault();
    const selection: Selection = (
      this.getRootNode()! as Document
    ).getSelection()!;
    const {start: inputStart, end: inputEnd} =
      MarkdownInline.getSelectionRange(selection);
    const inlineInput: InlineInput = {
      inline: this,
      node: this.node!,
      inputEvent: e,
      inputStart,
      inputEnd,
      content: this.node.content,
    };

    this.dispatchEvent(
      new CustomEvent('inline-input', {
        detail: inlineInput,
        bubbles: true,
        composed: true,
      }),
    );
  }
  onPointerDown(event: PointerEvent) {
    this.hostContext?.clearSelection();
  }
  private readonly observer = (node: ViewModelNode) => {
    if (node !== this.node) {
      this.removeObserver(node);
      return;
    }
    this.requestUpdate();
  };
  private addObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.add(this.observer);
  }
  private removeObserver(node: ViewModelNode | undefined) {
    node?.viewModel.observe.remove(this.observer);
  }
}

@customElement('md-span')
export class MarkdownSpan extends LitElement {
  @property({type: Boolean, reflect: true}) active = false;
  @property({type: Boolean, reflect: true}) formatting = false;
  @property({type: String, reflect: true}) type = '';

  @property({attribute: false}) node?: Parser.SyntaxNode;
  @queryAll('md-span') spans!: NodeListOf<MarkdownSpan>;
  nodeIds = new NodeIds();

  constructor() {
    super();
    this.addEventListener('pointerdown', (e) => {
      this.handlePointerDown(e);
    });
    this.addEventListener('click', (e) => {
      this.handleClick(e);
    });
  }
  override async performUpdate() {
    await super.performUpdate();
    await Promise.all(
      Array.from(this.spans).map((span) => span.updateComplete),
    );
  }

  override shouldUpdate(changed: Map<string, unknown>) {
    let result = false;
    if (changed.has('node')) {
      const oldSyntaxNode = changed.get('node') as
        | Parser.SyntaxNode
        | undefined;
      const newSyntaxNode = this.node;
      if (
        newSyntaxNode &&
        (!oldSyntaxNode || oldSyntaxNode.id !== newSyntaxNode.id)
      ) {
        result = true;
        this.nodeIds?.migrate(oldSyntaxNode, newSyntaxNode);
      }
    }
    if (changed.has('active')) {
      result = true;
    }
    return result;
  }
  protected override createRenderRoot() {
    return this;
  }
  private handlePointerDown(event: Event) {
    if (this.active) return;
    const node = this.node;
    if (!node) return;
    if (
      event.target instanceof HTMLAnchorElement ||
      node.type === 'inline_link' ||
      node.type === 'shortcut_link' ||
      node.type === 'uri_autolink'
    ) {
      // Prevent focus before link click.
      event.preventDefault();
    }
  }
  private handleClick(event: Event) {
    if (this.active) return;
    const node = this.node;
    if (!node) return;
    let inlineLinkClick: InlineLinkClick;
    if (event.target instanceof HTMLAnchorElement) {
      inlineLinkClick = {
        type: 'magic_link',
        destination: event.target.href,
      };
    } else {
      if (
        node.type !== 'inline_link' &&
        node.type !== 'shortcut_link' &&
        node.type !== 'uri_autolink'
      )
        return;
      const text =
        node.namedChildren.find((node) => node.type === 'link_text')?.text ??
        '';
      const destination =
        node.namedChildren.find((node) => node.type === 'link_destination')
          ?.text ??
        (node.type === 'uri_autolink' ? node.text.slice(1, -1) : null) ??
        text;
      inlineLinkClick = {
        type: this.node!.type,
        destination,
      };
    }
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('inline-link-click', {
        detail: inlineLinkClick,
        bubbles: true,
        composed: true,
      }),
    );
  }
  override render() {
    const node = this.node;
    if (!node) return html``;
    if (typeof node === 'string') {
      this.type = '';
      return html`${node}`;
    }
    this.type = node.type;
    this.formatting = isFormatting(node);
    let index = node.startIndex;
    interface Result {
      node?: Parser.SyntaxNode;
      result: TemplateResult;
    }
    const results: Result[] = [];
    const children = [...node.namedChildren];
    while (index < node.endIndex) {
      const child = children.shift();
      if (child) {
        if (index < child.startIndex) {
          const text = node.text.substring(
            index - node.startIndex,
            child.startIndex - node.startIndex,
          );
          results.push({result: html`${text}`});
        }
        index = child.endIndex;
        results.push({
          node: child,
          result: html`<md-span
            .node=${child}
            .active=${this.active}
          ></md-span>`,
        });
      } else {
        const text = node.text.substring(
          index - node.startIndex,
          node.endIndex - node.startIndex,
        );
        results.push({result: this.renderText(text)});
        index = node.endIndex;
      }
    }
    let nextId = -Number.MAX_SAFE_INTEGER;
    const key = (result: Result) => {
      if (!result.node) return nextId++;
      return this.nodeIds!.get(result.node);
    };
    const content = repeat(results, key, (item) => {
      return item.result;
    });
    return content;
  }
  private renderText(content: string): TemplateResult {
    // TODO: skip if the parent (ancestor?) is already a link
    // TODO: Prefixes should come from configuration.
    const parts = content.split(/(\b(?:https?:\/|go|b|cl)\/[^\s]*[\w\/=?])/u);
    if (parts.length === 0) {
      return html`${parts[0]}`;
    }
    return html`${parts.map((value, index) => {
      if (index % 2 === 0) {
        return html`${value}`;
      } else {
        const target = value.startsWith('http') ? value : `http://${value}`;
        return html`<a href=${target} target="_blank" rel="noopener noreferrer"
          >${value}</a
        >`;
      }
    })}`;
  }
}

class NodeIds {
  private idMap: Map<number, number> = new Map();
  private nextId = 0;
  get(node: Parser.SyntaxNode) {
    return this.idMap.get(node.id)!;
  }
  migrate(oldNode: Parser.SyntaxNode | undefined, newNode: Parser.SyntaxNode) {
    const posMap = new Map<number, number>();
    function key(node: Parser.SyntaxNode) {
      return node.startIndex;
    }
    for (const node of childNodes(oldNode)) {
      posMap.set(key(node), this.idMap.get(node.id)!);
    }
    this.idMap = new Map();
    for (const node of childNodes(newNode)) {
      this.idMap.set(node.id, posMap.get(key(node)) ?? this.nextId++);
    }
    return this.idMap.size;
  }
}

function* childNodes(node?: Parser.SyntaxNode) {
  if (!node) return;
  const next = (next: Parser.SyntaxNode | null) => {
    if (next) node = next;
    return !!next;
  };
  if (next(node.firstChild)) {
    do {
      yield node;
    } while (next(node.nextSibling));
  }
}

function isFormatting(node: Parser.SyntaxNode) {
  return [
    'block_continuation',
    'list_marker_star',
    'list_marker_minus',
    'list_marker_dot',
    'code_span_delimiter',
    'fenced_code_block_delimiter',
    'info_string',
    'block_quote_marker',
    'emphasis_delimiter',
    'setext_h1_underline',
  ].includes(node.type);
}

declare global {
  interface Selection {
    modify(
      alter: 'move' | 'extend',
      direction: 'forward' | 'backward',
      granularity: 'character' | 'lineboundary' | 'line',
    ): void;
  }
  interface HTMLElementTagNameMap {
    'md-inline': MarkdownInline;
    'md-span': MarkdownSpan;
  }
}

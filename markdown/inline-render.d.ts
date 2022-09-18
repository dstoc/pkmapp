import { TemplateResult, LitElement } from '../deps/lit.js';
import { InlineNode } from './node.js';
import { ViewModelNode } from './view-model.js';
import Parser from '../deps/tree-sitter.js';
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
export interface InlineEdit {
    newText: string;
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
}
export interface InlineKeyDown {
    inline: MarkdownInline;
    node: ViewModelNode;
    keyboardEvent: KeyboardEvent;
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
export declare class MarkdownInline extends LitElement {
    static get styles(): import("@lit/reactive-element/css-tag.js").CSSResult[];
    constructor();
    node: (InlineNode & ViewModelNode) | undefined;
    contenteditable: boolean;
    active: boolean;
    hasFocus: boolean;
    tree?: Parser.Tree;
    lastNode?: ViewModelNode;
    render(): TemplateResult<1> | undefined;
    willUpdate(changedProperties: Map<string, unknown>): void;
    updated(): void;
    protected createRenderRoot(): this;
    static nodeOffsetToInputPoint(node: Node, offset: number): InlineInputPoint;
    edit({ startIndex, newEndIndex, oldEndIndex, newText }: InlineEdit, setFocus: boolean): void;
    onKeyDown(e: KeyboardEvent): void;
    onBeforeInput(e: InputEvent): void;
    private readonly observer;
    private addObserver;
    private removeObserver;
}
export declare class MarkdownSpan extends LitElement {
    active: boolean;
    formatting: boolean;
    type: string;
    node?: Parser.SyntaxNode;
    nodeIds: NodeIds;
    constructor();
    shouldUpdate(changed: Map<string, unknown>): boolean;
    protected createRenderRoot(): this;
    private onLinkClick;
    render(): unknown;
}
declare class NodeIds {
    private idMap;
    private nextId;
    get(node: Parser.SyntaxNode): number;
    migrate(oldNode: Parser.SyntaxNode | undefined, newNode: Parser.SyntaxNode): number;
}
declare global {
    interface HTMLElementTagNameMap {
        'md-inline': MarkdownInline;
        'md-span': MarkdownSpan;
    }
}
export {};

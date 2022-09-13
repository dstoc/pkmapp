import { LitElement } from '../deps/lit.js';
import { ViewModelNode } from './view-model.js';
export declare class MarkdownBlock extends LitElement {
    type: string;
    node: ViewModelNode | undefined;
    connectedCallback(): void;
    disconnectedCallback(): void;
    willUpdate(changedProperties: Map<string, unknown>): void;
    render(): import("lit-html").TemplateResult<1> | import("lit-html").TemplateResult<1>[] | undefined;
    protected createRenderRoot(): this;
    private readonly observer;
    private addObserver;
    private removeObserver;
}
export declare class MarkdownRenderer extends LitElement {
    static get styles(): import("@lit/reactive-element/css-tag.js").CSSResult[];
    block: ViewModelNode;
    render(): import("lit-html").TemplateResult<1>;
}

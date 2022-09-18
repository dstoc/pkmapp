import { LitElement } from './deps/lit.js';
import { MarkdownRenderer } from './markdown/block-render.js';
import { InlineInput, InlineKeyDown, InlineLinkClick } from './markdown/inline-render.js';
import './markdown/block-render.js';
import { MarkdownTree } from './markdown/view-model.js';
import { HostContext } from './markdown/host-context.js';
export declare class TestHost extends LitElement {
    blockRender: MarkdownRenderer;
    fileInput: HTMLInputElement;
    tree: MarkdownTree | undefined;
    directory?: FileSystemDirectoryHandle;
    hostContext: HostContext;
    render(): import("lit-html").TemplateResult<1>;
    ensureDirectory(): Promise<FileSystemDirectoryHandle>;
    load(): Promise<void>;
    save(): Promise<void>;
    onInlineLinkClick({ detail: { type, destination }, }: CustomEvent<InlineLinkClick>): void;
    onInlineKeyDown({ detail: { inline, node, keyboardEvent }, }: CustomEvent<InlineKeyDown>): void;
    onInlineInput({ detail: { inline, inputEvent, inputStart, inputEnd }, }: CustomEvent<InlineInput>): void;
}

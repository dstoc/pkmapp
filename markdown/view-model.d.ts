import type { MarkdownNode } from './node.js';
declare class Observe<T> {
    readonly target: T;
    private observers;
    constructor(target: T);
    notify(): void;
    add(observer: (node: T) => void): void;
    remove(observer: (node: T) => void): void;
}
declare class ViewModel {
    readonly self: ViewModelNode;
    readonly tree: MarkdownTree;
    parent?: ViewModelNode | undefined;
    constructor(self: ViewModelNode, tree: MarkdownTree, parent?: ViewModelNode | undefined, childIndex?: number);
    private initialize;
    firstChild?: ViewModelNode;
    lastChild?: ViewModelNode;
    nextSibling?: ViewModelNode;
    previousSibling?: ViewModelNode;
    readonly observe: Observe<ViewModelNode>;
    remove(): void;
    insertBefore(parent: ViewModelNode, nextSibling?: ViewModelNode): void;
}
export declare class MarkdownTree {
    constructor(root: MarkdownNode);
    root: ViewModelNode;
    readonly observe: Observe<this>;
    import(node: MarkdownNode): ViewModelNode;
    private addDom;
    serialize(node?: ViewModelNode): MarkdownNode;
}
export declare type MaybeViewModelNode = MarkdownNode & {
    viewModel?: ViewModel;
    children?: MarkdownNode[];
};
export declare type ViewModelNode = MarkdownNode & {
    viewModel: ViewModel;
    children?: ViewModelNode[];
};
export {};

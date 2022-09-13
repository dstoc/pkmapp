export declare type MarkdownNode = ContainerNode | ParagraphNode | MarkedNode | HeadingNode | CodeBlockNode;
export declare type InlineNode = ParagraphNode | CodeBlockNode | HeadingNode;
interface Node {
    children?: MarkdownNode[];
}
export declare type ContainerNode = Node & {
    type: 'document' | 'list' | 'section';
};
export declare type ParagraphNode = Node & {
    type: 'paragraph';
    content: string;
};
export declare type MarkedNode = Node & {
    type: 'list-item' | 'block-quote';
    marker: string;
};
export declare type HeadingNode = Node & {
    type: 'heading';
    marker: string;
    content: string;
};
export declare type CodeBlockNode = Node & {
    type: 'code-block';
    info: string | null;
    content: string;
};
export {};

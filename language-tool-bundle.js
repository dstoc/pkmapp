import { SimpleCommandBundle } from './command-palette.js';
import { html } from './deps/lit.js';
import './markdown/block-render.js';
import { parseBlocks } from './markdown/block-parser.js';
import { MarkdownTree } from './markdown/view-model.js';
import { assert } from './asserts.js';
export function getLanguageTools(getSelection) {
    return [new SimpleCommandBundle("Analyze with LLM", Object.entries(analyzePrompts).map(([description, suffix]) => ({
            description,
            async execute(_command, updatePreview) {
                const loader = new StreamingLoader('');
                const prompt = `${getSelection()}END\n\n${analyzePrefix} ${suffix}`;
                const preview = () => html `<md-block-render .block=${loader.tree.root}></md-block-render>`;
                for await (const chunk of openAiChat(prompt)) {
                    loader.append(chunk);
                    updatePreview(preview());
                }
                return new SimpleCommandBundle("what?", [{
                        description: 'Replace selection',
                        async execute() {
                        },
                        preview,
                    }, {
                        description: 'Append after selection',
                        async execute() {
                        },
                        preview,
                        // TODO: is type inference broken?
                    }, {
                        description: 'Copy to clipboard',
                        async execute() {
                        },
                        preview,
                        // TODO: is type inference broken?
                    }]);
            },
        })))];
}
/**
 * Loads a markdown tree with streamed (appended) content in a not completely
 * inefficient way. The tree should not be modified other than by calling
 * `append`.
 */
class StreamingLoader {
    constructor(content) {
        this.content = content;
        const { node, tree: parserTree } = parseBlocks(this.content);
        this.parserTree = parserTree;
        assert(node && node.type === 'document');
        this.tree = new MarkdownTree(node);
    }
    append(newContent) {
        const startIndex = this.content.length;
        const oldEndIndex = this.content.length;
        this.content += newContent;
        const newEndIndex = this.content.length;
        const edit = {
            startIndex,
            oldEndIndex,
            newEndIndex,
            startPosition: indexToPosition(this.content, startIndex),
            oldEndPosition: indexToPosition(this.content, oldEndIndex),
            newEndPosition: indexToPosition(this.content, newEndIndex),
        };
        const { node, tree: parserTree } = parseBlocks(this.content, this.parserTree, edit);
        this.parserTree = parserTree;
        assert(node && node.type === 'document');
        this.tree.setRoot(this.tree.add(node));
    }
}
function indexToPosition(text, index) {
    let row = 1;
    let column = 1;
    for (let i = 0; i < index; i++) {
        if (text[i] === '\n') {
            row++;
            column = 1;
        }
        else {
            column++;
        }
    }
    return { row, column };
}
async function* openAiChat(prompt) {
    let buffer = '';
    const key = localStorage.getItem('openai-key');
    if (!key)
        throw new Error('`openai-key` not in localStorage');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            stream: true,
            messages: [{
                    role: 'user',
                    content: prompt,
                }]
        }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        }
    });
    const stream = response.body;
    if (!stream)
        return;
    for await (const chunk of iterateStream(stream.pipeThrough(new TextDecoderStream()))) {
        buffer += chunk;
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const part of parts) {
            if (part.startsWith('data: ')) {
                const value = part.substring(6);
                if (value === '[DONE]')
                    return;
                const content = JSON.parse(value).choices[0].delta.content;
                if (content != null) {
                    yield content;
                }
            }
        }
    }
}
function iterateStream(stream) {
    return {
        [Symbol.asyncIterator]: async function* () {
            const reader = stream.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        return;
                    yield value;
                }
            }
            finally {
                reader.releaseLock();
            }
        }
    };
}
const analyzePrefix = `Analyze all text above and`;
const analyzePrompts = {
    'Elaborate': `Elaborate with 3-5 bullet point statements that expand by relating additional information not in the original text.`,
    'Capture the essence': `Rewrite in a simple paragraph that captures the essence.`,
    'Defeat': `List 3-5 reasons why it might not work as bullet point statements.`,
    'Reflect': `Complete the following prompts:
1. That's interesting because...
2. That reminds me of...
3. It's similar because...
4. It's different because...
5. It's important because...`,
};
//# sourceMappingURL=language-tool-bundle.js.map
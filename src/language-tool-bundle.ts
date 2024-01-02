import {Command, SimpleCommandBundle} from './command-palette.js';
import {html} from './deps/lit.js';
import './markdown/block-render.js';
import {parseBlocks, Tree} from './markdown/block-parser.js';
import {DocumentNode} from './markdown/node.js';
import {MarkdownTree} from './markdown/view-model.js';
import {assert} from './asserts.js';

export function getLanguageTools(getSelection: () => string): Command[] {
  return [
    new SimpleCommandBundle(
      'Analyze with LLM',
      Object.entries(analyzePrompts).map(([description, suffix]) => ({
        description,
        async execute(_command, updatePreview) {
          const loader = new StreamingLoader('');
          const prompt = `${getSelection()}END\n\n${analyzePrefix} ${suffix}`;
          const preview = () =>
            html`<md-block-render
              .block=${loader.tree.root}
            ></md-block-render>`;

          for await (const chunk of palm(prompt)) {
            loader.append(chunk);
            updatePreview(preview());
          }

          return new SimpleCommandBundle('what?', [
            {
              description: 'Replace selection',
              async execute() {},
              preview,
            } as Command,
            {
              description: 'Append after selection',
              async execute() {},
              preview,
              // TODO: is type inference broken?
            } as Command,
            {
              description: 'Copy to clipboard',
              async execute() {},
              preview,
              // TODO: is type inference broken?
            } as Command,
          ]);
        },
      })),
    ),
  ];
}

/**
 * Loads a markdown tree with streamed (appended) content in a not completely
 * inefficient way. The tree should not be modified other than by calling
 * `append`.
 */
class StreamingLoader {
  readonly tree: MarkdownTree;
  private parserTree: Tree;
  constructor(private content: string) {
    const {node, tree: parserTree} = parseBlocks(this.content);
    this.parserTree = parserTree;
    assert(node && node.type === 'document');
    this.tree = new MarkdownTree(node);
  }
  append(newContent: string) {
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
    const {node, tree: parserTree} = parseBlocks(
      this.content,
      this.parserTree,
      edit,
    );
    this.parserTree = parserTree;
    assert(node && node.type === 'document');
    this.tree.setRoot(this.tree.add<DocumentNode>(node));
  }
}

function indexToPosition(text: string, index: number) {
  let row = 1;
  let column = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      row++;
      column = 1;
    } else {
      column++;
    }
  }
  return {row, column};
}

async function* palm(prompt: string): AsyncGenerator<string> {
  const key = localStorage.getItem('palm-key');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${key}&alt=sse`,
    {
      method: 'post',
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    },
  );
  const stream = response.body;
  if (!stream) return;
  let buffer = '';
  for await (const chunk of iterateStream(
    stream.pipeThrough(new TextDecoderStream()),
  )) {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop()!;
    for (const part of parts) {
      if (part.startsWith('data: ')) {
        const value = part.substring(6);
        if (value === '[DONE]') return;
        const content = JSON.parse(value).candidates[0].content.parts[0].text;
        if (content != null) {
          yield content;
        }
      }
    }
  }
}

export async function* openAiChat(prompt: string): AsyncGenerator<string> {
  let buffer = '';
  const key = localStorage.getItem('openai-key');
  if (!key) throw new Error('`openai-key` not in localStorage');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
  });
  const stream = response.body;
  if (!stream) return;
  for await (const chunk of iterateStream(
    stream.pipeThrough(new TextDecoderStream()),
  )) {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop()!;
    for (const part of parts) {
      if (part.startsWith('data: ')) {
        const value = part.substring(6);
        if (value === '[DONE]') return;
        const content = JSON.parse(value).choices[0].delta.content;
        if (content != null) {
          yield content;
        }
      }
    }
  }
}

function iterateStream(stream: ReadableStream) {
  return {
    [Symbol.asyncIterator]: async function* () {
      const reader = stream.getReader();
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

const analyzePrefix = `Analyze all text above and`;
const analyzePrompts = {
  Elaborate: `Elaborate with 3-5 bullet point statements that expand by relating additional information not in the original text.`,
  'Capture the essence': `Rewrite in a simple paragraph that captures the essence.`,
  Defeat: `In bullet point statements, list 3-5 reasons why it might not work.`,
  Reflect: `Complete the following prompts:
1. That's interesting because...
2. That reminds me of...
3. It's similar because...
4. It's different because...
5. It's important because...`,
};

import { getWordRange } from '../context.js';

export const wordProvider = {
  id: 'word',
  languages: ['markdown', 'text'],
  priority: 10,
  triggerCharacters: [],
  provide({ model, position }) {
    const source = model.getValue();
    const range = getWordRange(model, position);
    const current = model.getWordUntilPosition(position).word.toLowerCase();
    const words = new Set();
    for (const match of source.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
      const word = match[0];
      if (word.toLowerCase() === current) continue;
      words.add(word);
      if (words.size >= 250) break;
    }
    return {
      suggestions: [...words].map((word) => ({
        label: word,
        kind: 0, // Monaco CompletionItemKind.Text
        detail: '文档单词',
        insertText: word,
        range,
        sortText: `9${word}`,
      })),
    };
  },
};

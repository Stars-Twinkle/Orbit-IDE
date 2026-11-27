import { CompletionRegistry } from './registry.js';
import { keywordProvider } from './providers/keyword.js';
import { snippetProvider } from './providers/snippet.js';
import { wordProvider } from './providers/word.js';
import { lspProvider } from './providers/lsp.js';

const registry = new CompletionRegistry([
  lspProvider,
  keywordProvider,
  snippetProvider,
  wordProvider,
]);

window.__orbitCompletionRegistry = registry;

const timer = setInterval(() => {
  if (registry.install()) clearInterval(timer);
}, 200);

setTimeout(() => clearInterval(timer), 20000);

let statusPromise = null;

function getStatus() {
  if (!statusPromise) {
    statusPromise = window.orbit?.invoke('lsp:status').catch(() => ({ available: {} })) || Promise.resolve({ available: {} });
  }
  return statusPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export const lspProvider = {
  id: 'lsp',
  languages: ['cpp', 'c', 'python', 'javascript', 'typescript', 'java', 'go', 'rust', 'yaml', 'shell'],
  priority: 100,
  triggerCharacters: ['.', '>', ':', '/'],
  async provide({ model, position, language, triggerKind, triggerCharacter }) {
    const status = await getStatus();
    if (!status?.available?.[language]) return { suggestions: [] };

    let path = model.uri?.path || '';
    try {
      path = decodeURIComponent(path);
    } catch {
      // 保持原路径。
    }
    path = path.replace(/^\/+/, '');
    const word = model.getWordUntilPosition(position);
    const request = window.orbit.invoke('lsp:completion', {
      path,
      language,
      content: model.getValue(),
      version: model.getVersionId(),
      line: position.lineNumber,
      column: position.column,
      triggerKind,
      triggerCharacter,
      wordStart: word.startColumn,
      wordEnd: word.endColumn,
    });
    const result = await withTimeout(request, 2500);
    if (!result) return { suggestions: [] };
    const suggestions = Array.isArray(result) ? result : result.items || [];
    return {
      suggestions,
      incomplete: Boolean(result?.isIncomplete),
    };
  },
};

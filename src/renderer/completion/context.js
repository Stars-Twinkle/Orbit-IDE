export function getWordRange(model, position) {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

const TYPE_SPECIFIERS = new Set([
  'const', 'volatile', 'static', 'extern', 'register', 'inline', 'constexpr', 'consteval', 'constinit',
  'mutable', 'thread_local', 'typename', 'signed', 'unsigned', 'long', 'struct', 'class', 'enum', 'union',
]);

const COMPLETE_TYPES = new Set([
  'void', 'bool', 'char', 'wchar_t', 'char8_t', 'char16_t', 'char32_t', 'short', 'int', 'float', 'double', 'auto',
]);

export function isVariableDeclarationContext(model, position, keywords) {
  const line = model.getLineContent(position.lineNumber);
  const word = model.getWordUntilPosition(position);
  const before = line
    .slice(0, Math.max(0, word.startColumn - 1))
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*$/, '');
  const stripped = before.replace(/[\s*&]+$/, '');

  if (/[>]\s*$/.test(stripped) && /(?:^|[;{}(,])\s*(?:[A-Za-z_]\w*::)*[A-Za-z_]\w*\s*<.*>$/.test(stripped)) {
    return true;
  }
  if (
    /(?:^|\s)(?:unsigned\s+)?long\s+long$/.test(stripped) ||
    /(?:^|\s)long\s+double$/.test(stripped) ||
    /(?:^|\s)(?:unsigned|signed)\s+long$/.test(stripped)
  ) {
    return true;
  }

  const match = stripped.match(/([A-Za-z_]\w*)$/);
  if (!match) return false;
  const token = match[1];
  if (TYPE_SPECIFIERS.has(token)) return false;
  if (COMPLETE_TYPES.has(token)) return true;
  if (keywords.has(token)) return false;
  return true;
}

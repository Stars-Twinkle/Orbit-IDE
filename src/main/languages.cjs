'use strict';

const path = require('node:path');

const LANGUAGES = {
  cpp: {
    id: 'cpp',
    label: 'C++',
    monaco: 'cpp',
    kind: 'cpp',
    runnable: true,
    extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h'],
    icon: 'cpp',
    color: '#6ea8fe',
  },
  c: {
    id: 'c',
    label: 'C',
    monaco: 'c',
    kind: 'c',
    runnable: true,
    extensions: ['.c'],
    icon: 'c',
    color: '#7dd3fc',
  },
  python: {
    id: 'python',
    label: 'Python',
    monaco: 'python',
    kind: 'python',
    runnable: true,
    extensions: ['.py', '.pyw'],
    icon: 'python',
    color: '#facc15',
  },
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    monaco: 'javascript',
    kind: 'node',
    runnable: true,
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    icon: 'js',
    color: '#f7df1e',
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    monaco: 'typescript',
    kind: 'typescript',
    runnable: false,
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    icon: 'ts',
    color: '#60a5fa',
  },
  java: {
    id: 'java',
    label: 'Java',
    monaco: 'java',
    kind: 'java',
    runnable: true,
    extensions: ['.java'],
    icon: 'java',
    color: '#f87171',
  },
  go: {
    id: 'go',
    label: 'Go',
    monaco: 'go',
    kind: 'go',
    runnable: true,
    extensions: ['.go'],
    icon: 'go',
    color: '#67e8f9',
  },
  rust: {
    id: 'rust',
    label: 'Rust',
    monaco: 'rust',
    kind: 'rust',
    runnable: true,
    extensions: ['.rs'],
    icon: 'rust',
    color: '#fb923c',
  },
  json: {
    id: 'json',
    label: 'JSON',
    monaco: 'json',
    kind: null,
    runnable: false,
    extensions: ['.json', '.jsonc'],
    icon: 'json',
    color: '#fbbf24',
  },
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    monaco: 'markdown',
    kind: null,
    runnable: false,
    extensions: ['.md', '.markdown'],
    icon: 'markdown',
    color: '#94a3b8',
  },
  html: {
    id: 'html',
    label: 'HTML',
    monaco: 'html',
    kind: null,
    runnable: false,
    extensions: ['.html', '.htm'],
    icon: 'html',
    color: '#fb7185',
  },
  css: {
    id: 'css',
    label: 'CSS',
    monaco: 'css',
    kind: null,
    runnable: false,
    extensions: ['.css', '.scss', '.less'],
    icon: 'css',
    color: '#818cf8',
  },
  yaml: {
    id: 'yaml',
    label: 'YAML',
    monaco: 'yaml',
    kind: null,
    runnable: false,
    extensions: ['.yml', '.yaml'],
    icon: 'yaml',
    color: '#a3e635',
  },
  shell: {
    id: 'shell',
    label: 'Shell',
    monaco: 'shell',
    kind: null,
    runnable: false,
    extensions: ['.sh', '.bash', '.bat', '.cmd', '.ps1'],
    icon: 'shell',
    color: '#a7f3d0',
  },
  text: {
    id: 'text',
    label: '纯文本',
    monaco: 'plaintext',
    kind: null,
    runnable: false,
    extensions: ['.txt', '.log', '.in', '.out', '.csv'],
    icon: 'text',
    color: '#94a3b8',
  },
};

const OI_EXTENSIONS = new Set(['.cpp', '.cc', '.cxx', '.c++', '.c', '.h', '.hpp', '.hh', '.hxx']);

function extname(filePath) {
  return path.extname(filePath).toLowerCase();
}

function languageForPath(filePath) {
  const ext = extname(filePath);
  for (const lang of Object.values(LANGUAGES)) {
    if (lang.extensions.includes(ext)) return lang;
  }
  return LANGUAGES.text;
}

function languageById(id) {
  return LANGUAGES[id] || LANGUAGES.text;
}

function isOiAllowed(filePath) {
  return OI_EXTENSIONS.has(extname(filePath));
}

function kindLabel(kind) {
  return (
    {
      cpp: 'C++ 编译器',
      c: 'C 编译器',
      python: 'Python 解释器',
      node: 'Node.js 运行时',
      java: 'Java 工具链',
      go: 'Go 工具链',
      rust: 'Rust 工具链',
      typescript: 'TypeScript',
    }[kind] || kind || '工具链'
  );
}

function defaultFileName(languageId) {
  return {
    cpp: 'main.cpp',
    c: 'main.c',
    python: 'main.py',
    javascript: 'main.js',
    typescript: 'main.ts',
    java: 'Main.java',
    go: 'main.go',
    rust: 'main.rs',
    json: 'data.json',
    markdown: 'README.md',
    html: 'index.html',
    css: 'style.css',
    yaml: 'config.yml',
    shell: 'script.sh',
    text: 'notes.txt',
  }[languageId] || 'untitled.txt';
}

function newFileTemplate(languageId) {
  if (languageId === 'cpp') {
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n`;
  }
  if (languageId === 'c') {
    return `#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n`;
  }
  if (languageId === 'python') {
    return `def solve() -> None:\n    pass\n\n\nif __name__ == "__main__":\n    solve()\n`;
  }
  if (languageId === 'javascript') {
    return `function solve() {\n  \n}\n\nsolve();\n`;
  }
  if (languageId === 'typescript') {
    return `function solve(): void {\n  \n}\n\nsolve();\n`;
  }
  if (languageId === 'java') {
    return `public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n`;
  }
  if (languageId === 'go') {
    return `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, Orbit")\n}\n`;
  }
  if (languageId === 'rust') {
    return `fn main() {\n    println!("Hello, Orbit");\n}\n`;
  }
  if (languageId === 'markdown') {
    return `# 新文档\n\n在这里开始书写。\n`;
  }
  if (languageId === 'html') {
    return `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Orbit</title>\n</head>\n<body>\n  \n</body>\n</html>\n`;
  }
  return '';
}

module.exports = {
  LANGUAGES,
  OI_EXTENSIONS,
  languageForPath,
  languageById,
  isOiAllowed,
  kindLabel,
  defaultFileName,
  newFileTemplate,
  extname,
};

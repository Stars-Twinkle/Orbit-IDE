'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_FILES = 1600;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_WORDS = 20000;
const CACHE_VERSION = 2;
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// 只解析 C/C++ 标准头文件，避免把 Windows SDK、COM、调试接口等
// 大量无关符号（Field15_GetChunk、IDebugStackFrameSniffer 等）带入补全。
const C_HEADERS = new Set([
  'assert.h', 'complex.h', 'ctype.h', 'errno.h', 'fenv.h', 'float.h', 'inttypes.h', 'iso646.h',
  'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h', 'stdalign.h', 'stdarg.h', 'stdatomic.h',
  'stdbool.h', 'stddef.h', 'stdint.h', 'stdio.h', 'stdlib.h', 'stdnoreturn.h', 'string.h', 'tgmath.h',
  'threads.h', 'time.h', 'uchar.h', 'wchar.h', 'wctype.h', 'stdckdint.h', 'stdbit.h', 'stdcountof.h',
]);

const RESERVED = new Set([
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break', 'case', 'catch',
  'char', 'char16_t', 'char32_t', 'class', 'compl', 'concept', 'const', 'consteval', 'constexpr', 'constinit',
  'const_cast', 'continue', 'co_await', 'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double',
  'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'final', 'float', 'for', 'friend',
  'goto', 'if', 'import', 'inline', 'int', 'long', 'module', 'mutable', 'namespace', 'new', 'noexcept', 'not',
  'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'override', 'private', 'protected', 'public', 'register',
  'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast',
  'struct', 'switch', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename',
  'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq',
  'define', 'defined', 'elif', 'endif', 'error', 'ifdef', 'ifndef', 'include', 'line', 'pragma', 'undef',
  'if', 'else', 'for', 'while', 'switch', 'return', 'sizeof', 'alignof', 'decltype', 'static_assert',
]);

function isUsableHeader(name) {
  if (/\.(tcc|def|inl|o|a|so|dll|exe|md|txt|json)$/i.test(name)) return false;
  return path.extname(name) === '' || /\.(h|hh|hpp|hxx|inc)$/i.test(name);
}

function isRelevantHeader(dir, name) {
  const normalized = dir.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/include/c++/') || normalized.endsWith('/include/c++')) {
    // C++ 标准库大量头文件没有扩展名，例如 vector、algorithm、bits/stdc++.h。
    return !/\.(tcc|def|inl|md|txt|json)$/i.test(name);
  }
  return C_HEADERS.has(name.toLowerCase());
}

function dedupeExisting(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const resolved = path.resolve(dir);
    if (seen.has(resolved.toLowerCase())) continue;
    if (!fs.existsSync(resolved)) continue;
    seen.add(resolved.toLowerCase());
    out.push(resolved);
  }
  return out;
}

function fallbackIncludeDirs(executable) {
  const bin = path.dirname(executable);
  const root = path.resolve(bin, '..');
  const dirs = [
    path.join(root, 'x86_64-w64-mingw32', 'include'),
    path.join(root, 'include'),
    path.join(root, 'lib', 'gcc', 'x86_64-w64-mingw32', 'include'),
  ];
  const gccRoot = path.join(root, 'lib', 'gcc');
  try {
    for (const target of fs.readdirSync(gccRoot, { withFileTypes: true })) {
      if (!target.isDirectory()) continue;
      const targetDir = path.join(gccRoot, target.name);
      for (const version of fs.readdirSync(targetDir, { withFileTypes: true })) {
        if (!version.isDirectory()) continue;
        dirs.push(path.join(targetDir, version.name, 'include'));
        dirs.push(path.join(targetDir, version.name, 'include-fixed'));
        dirs.push(path.join(targetDir, version.name, 'include', 'c++'));
      }
    }
  } catch {
    // 没有 GCC 目录时忽略。
  }
  return dirs;
}

function compilerIncludeDirs(executable) {
  const dirs = [];
  try {
    const result = spawnSync(
      executable,
      ['-x', 'c++', '-E', '-v', '-'],
      {
        input: '',
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    const start = output.indexOf('#include <...> search starts here:');
    const end = output.indexOf('End of search list.', start);
    if (start >= 0) {
      const block = output.slice(start + '#include <...> search starts here:'.length, end > start ? end : undefined);
      for (const line of block.split(/\r?\n/)) {
        const value = line.trim();
        if (!value || value.startsWith('(')) continue;
        dirs.push(value);
      }
    }
  } catch {
    // 编译器不支持 -v 时使用目录推断。
  }
  dirs.push(...fallbackIncludeDirs(executable));
  return dedupeExisting(dirs);
}

async function collectHeaders(dirs) {
  const files = [];
  let totalBytes = 0;
  const visit = async (dir, depth) => {
    if (depth > 4 || files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^(\.git|node_modules|__pycache__)$/i.test(entry.name)) continue;
        await visit(full, depth + 1);
      } else if (entry.isFile() && isUsableHeader(entry.name) && isRelevantHeader(dir, entry.name)) {
        try {
          const stat = await fsp.stat(full);
          if (stat.size > 2 * 1024 * 1024) continue;
          if (totalBytes + stat.size > MAX_TOTAL_BYTES) continue;
          totalBytes += stat.size;
          files.push(full);
        } catch {
          // 忽略无法读取的头文件。
        }
      }
    }
  };
  for (const dir of dirs) await visit(dir, 0);
  return files;
}

function headerWords(text) {
  const words = new Set();
  const add = (name) => {
    if (!name || name.length < 2 || name.length > 64) return;
    if (RESERVED.has(name)) return;
    if (/^\d/.test(name)) return;
    // 跳过标准库实现内部的以下划线开头符号和 Windows/COM 代理符号。
    if (name.startsWith('_')) return;
    if (/^Field\d+_/.test(name) || /_(Proxy|Stub)$/i.test(name)) return;
    words.add(name);
  };
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\r\n]*/g, ' ');

  for (const match of clean.matchAll(/\btypedef\b[^;{}]{0,400}?\b([A-Za-z_]\w*)\s*;/g)) add(match[1]);
  for (const match of clean.matchAll(/\busing\s+([A-Za-z_]\w*)\s*=/g)) add(match[1]);
  for (const match of clean.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)/gm)) add(match[1]);
  for (const match of clean.matchAll(/\b(?:class|struct|union|enum(?:\s+class)?)\s+([A-Za-z_]\w*)/g)) add(match[1]);
  for (const match of clean.matchAll(/(?:^|[;{}])\s*(?:[A-Za-z_][\w:<>,\s*&]*?)\b([A-Za-z_]\w*)\s*\([^;{}]{0,300}\)\s*(?:const\s*)?;/gm)) {
    add(match[1]);
  }
  for (const match of clean.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) add(match[1]);
  return words;
}

async function collectCompletionWords(options = {}) {
  const executable = options.executable;
  const userData = options.userData;
  if (!executable || !fs.existsSync(executable)) {
    return { words: [], includeDirs: [], files: 0, error: '没有可用的 C++ 编译器' };
  }
  const dirs = compilerIncludeDirs(executable);
  let signature = executable;
  try {
    const stat = fs.statSync(executable);
    signature += `|${stat.mtimeMs}|${stat.size}`;
  } catch {
    // 忽略。
  }
  signature += `|${dirs.join(';')}|v${CACHE_VERSION}`;

  const cachePath = path.join(userData, 'completion-words.json');
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (
      !options.force &&
      cache.version === CACHE_VERSION &&
      cache.signature === signature &&
      Date.now() - Number(cache.generatedAt || 0) < CACHE_MAX_AGE &&
      Array.isArray(cache.words)
    ) {
      return { ...cache, cached: true };
    }
  } catch {
    // 无缓存或缓存损坏。
  }

  const files = await collectHeaders(dirs);
  const words = new Set();
  for (const file of files) {
    try {
      const text = await fsp.readFile(file, 'utf8');
      for (const word of headerWords(text)) words.add(word);
      if (words.size >= MAX_WORDS) break;
    } catch {
      // 忽略读取失败的头文件。
    }
  }

  const result = {
    version: CACHE_VERSION,
    signature,
    generatedAt: Date.now(),
    compiler: executable,
    includeDirs: dirs,
    files: files.length,
    words: [...words].sort((a, b) => a.localeCompare(b)).slice(0, MAX_WORDS),
  };
  try {
    await fsp.mkdir(userData, { recursive: true });
    await fsp.writeFile(cachePath, JSON.stringify(result), 'utf8');
  } catch {
    // 缓存失败不影响使用。
  }
  return result;
}

module.exports = { collectCompletionWords, compilerIncludeDirs, headerWords };

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const IS_WIN = process.platform === 'win32';

const EXE_SUFFIXES = IS_WIN ? ['.exe', '.cmd', '.bat'] : [''];

const CPP_STANDARDS = [
  { id: 'c++98', label: 'C++98', aliases: ['c++98'], level: 1998 },
  { id: 'c++03', label: 'C++03', aliases: ['c++03'], level: 2003 },
  { id: 'c++11', label: 'C++11', aliases: ['c++11', 'c++0x'], level: 2011 },
  { id: 'c++14', label: 'C++14', aliases: ['c++14', 'c++1y'], level: 2014 },
  { id: 'c++17', label: 'C++17', aliases: ['c++17', 'c++1z'], level: 2017 },
  { id: 'c++20', label: 'C++20', aliases: ['c++20', 'c++2a'], level: 2020 },
  { id: 'c++23', label: 'C++23', aliases: ['c++23', 'c++2b'], level: 2023 },
  { id: 'c++26', label: 'C++26', aliases: ['c++26', 'c++2c'], level: 2026 },
];

const C_STANDARDS = [
  { id: 'c89', label: 'C89', aliases: ['c89'], level: 1989 },
  { id: 'c99', label: 'C99', aliases: ['c99'], level: 1999 },
  { id: 'c11', label: 'C11', aliases: ['c11'], level: 2011 },
  { id: 'c17', label: 'C17', aliases: ['c17', 'c18'], level: 2017 },
  { id: 'c23', label: 'C23', aliases: ['c23', 'c2x'], level: 2023 },
];

const MSVC_CPP_STANDARDS = [
  { id: 'c++14', label: 'C++14', aliases: ['c++14'], level: 2014 },
  { id: 'c++17', label: 'C++17', aliases: ['c++17'], level: 2017 },
  { id: 'c++20', label: 'C++20', aliases: ['c++20'], level: 2020 },
  { id: 'c++latest', label: 'C++ 最新', aliases: ['c++latest'], level: 2026 },
];

const CANDIDATE_COMMANDS = [
  { command: 'g++', kind: 'cpp', family: 'gcc' },
  { command: 'clang++', kind: 'cpp', family: 'clang' },
  { command: 'gcc', kind: 'c', family: 'gcc' },
  { command: 'clang', kind: 'c', family: 'clang' },
  { command: 'cl', kind: 'cpp', family: 'msvc' },
  { command: 'python', kind: 'python', family: 'python' },
  { command: 'python3', kind: 'python', family: 'python' },
  { command: 'node', kind: 'node', family: 'node' },
  { command: 'javac', kind: 'java', family: 'java' },
  { command: 'go', kind: 'go', family: 'go' },
  { command: 'rustc', kind: 'rust', family: 'rust' },
];

const STANDARD_ID = {
  cpp: {
    '199711': 'c++98',
    '199711L': 'c++98',
    '201103': 'c++11',
    '201402': 'c++14',
    '201703': 'c++17',
    '202002': 'c++20',
    '202302': 'c++23',
  },
};

function hashId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

function normalizePath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function addPath(set, value) {
  if (!value) return;
  set.add(normalizePath(value));
}

function expandKnownDirs() {
  const dirs = new Set();
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    if (!entry) continue;
    if (entry.toLowerCase().includes('windowsapps')) continue;
    dirs.add(entry);
  }
  const env = process.env;
  const known = [
    'C:\\msys64\\mingw64\\bin',
    'C:\\msys64\\ucrt64\\bin',
    'C:\\msys64\\clang64\\bin',
    'C:\\MinGW\\bin',
    'C:\\mingw64\\bin',
    'C:\\TDM-GCC-64\\bin',
    'D:\\msys64\\mingw64\\bin',
    'D:\\msys64\\ucrt64\\bin',
    'D:\\mingw64\\bin',
    'D:\\TDM-GCC-64\\bin',
    path.join(env.ProgramFiles || 'C:\\Program Files', 'LLVM', 'bin'),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'Go', 'bin'),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'Java'),
    path.join(env.LOCALAPPDATA || '', 'Programs', 'Python'),
    path.join(env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
    path.join(env.USERPROFILE || '', 'scoop', 'shims'),
    path.join(env.USERPROFILE || '', '.cargo', 'bin'),
    path.join(env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python'),
  ];
  for (const dir of known) if (dir) dirs.add(dir);
  // 展开 Java / Python 常见版本目录，避免递归全盘扫描。
  for (const base of [
    path.join(env.ProgramFiles || '', 'Java'),
    path.join(env.ProgramFiles || '', 'Eclipse Adoptium'),
    path.join(env.ProgramFiles || '', 'Microsoft'),
    path.join(env.LOCALAPPDATA || '', 'Programs', 'Python'),
  ]) {
    try {
      for (const name of fs.readdirSync(base)) {
        const bin = path.join(base, name, 'bin');
        if (fs.existsSync(bin)) dirs.add(bin);
      }
    } catch {
      // 目录不存在时忽略。
    }
  }
  return [...dirs];
}

function expandUserScanDirs(roots) {
  const dirs = new Set();
  const add = (dir) => {
    if (!dir) return;
    try {
      if (fs.statSync(dir).isDirectory()) dirs.add(path.resolve(dir));
    } catch {
      // 忽略不存在的目录。
    }
  };
  const visit = (dir, depth) => {
    add(dir);
    if (depth > 2 || dirs.size > 240) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (/^bin$/i.test(entry.name)) add(child);
      if (depth < 2) visit(child, depth + 1);
    }
  };
  for (const root of roots || []) {
    if (!root) continue;
    visit(root, 0);
    add(path.join(root, 'bin'));
  }
  return [...dirs];
}

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function findOnPath(command, extraDirs = []) {
  const dirs = [...expandKnownDirs(), ...extraDirs];
  const found = [];
  const names = [];
  for (const suffix of EXE_SUFFIXES) names.push(`${command}${suffix}`);
  if (/^python3?$/i.test(command)) {
    for (const version of ['313', '312', '311', '310']) {
      names.push(`python${version}.exe`);
    }
  }
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutable(candidate)) found.push(candidate);
    }
  }
  return found;
}

function findMsvc() {
  if (!IS_WIN) return [];
  const results = [];
  const programFiles = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = path.join(programFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  let installs = [];
  if (fs.existsSync(vswhere)) {
    try {
      const output = require('node:child_process').execFileSync(
        vswhere,
        ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
        { encoding: 'utf8', timeout: 5000, windowsHide: true }
      );
      installs = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch {
      // vswhere 失败时继续尝试常规目录。
    }
  }
  const roots = [
    ...installs,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft Visual Studio', '2022'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft Visual Studio', '2019'),
  ];
  for (const root of roots) {
    const vcvarsCandidates = [
      path.join(root, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat'),
      path.join(root, 'Build', 'VC', 'Auxiliary', 'Build', 'vcvars64.bat'),
    ].filter((item) => fs.existsSync(item));
    if (!vcvarsCandidates.length) continue;
    const toolsRoot = path.join(root, 'VC', 'Tools', 'MSVC');
    let versions = [];
    try {
      versions = fs.readdirSync(toolsRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {
      versions = [];
    }
    for (const version of versions) {
      const cl = path.join(toolsRoot, version, 'bin', 'Hostx64', 'x64', 'cl.exe');
      if (fs.existsSync(cl)) {
        results.push({ executable: cl, envScript: vcvarsCandidates[0], installRoot: root, toolsVersion: version });
        break;
      }
    }
  }
  return results;
}

function quoteCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function runCommand(executable, args, options = {}) {
  const {
    timeout = 8000,
    input = null,
    cwd,
    envScript = null,
    env = process.env,
  } = options;
  return new Promise((resolve) => {
    let command = executable;
    let commandArgs = args;
    if (envScript) {
      const line = `call ${quoteCmd(envScript)} >nul 2>nul && ${quoteCmd(executable)} ${args
        .map((arg) => quoteCmd(arg))
        .join(' ')}`;
      command = 'cmd.exe';
      commandArgs = ['/d', '/s', '/c', line];
    }
    let child;
    try {
      child = spawn(command, commandArgs, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(error.message || error), timedOut: false });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (IS_WIN && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        else child.kill('SIGKILL');
      } catch {
        // 忽略终止失败。
      }
    }, timeout);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: stderr + String(error.message || error), timedOut });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut });
    });
    if (input !== null && input !== undefined) {
      child.stdin.end(String(input));
    } else {
      child.stdin.end();
    }
  });
}

function firstLine(text) {
  return String(text || '').split(/\r?\n/).find((line) => line.trim())?.trim() || '';
}

function parseVersion(text) {
  const match = String(text || '').match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
  return match ? match[1] : '';
}

async function getFileFingerprint(executable) {
  try {
    const stat = await fsp.stat(executable);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '0:0';
  }
}

async function probeStandards(executable, family, kind, file, envScript) {
  const isCpp = kind === 'cpp';
  if (family === 'msvc') {
    const standards = [];
    const obj = file.replace(/\.(cpp|c)$/i, '.obj');
    for (const standard of MSVC_CPP_STANDARDS) {
      if (!isCpp) continue;
      const result = await runCommand(
        executable,
        ['/nologo', `/std:${standard.id}`, '/EHsc', '/c', `/Fo:${obj}`, file],
        { timeout: 12000, envScript }
      );
      if (result.code === 0) standards.push({ id: standard.id, label: standard.label, flag: `/std:${standard.id}`, level: standard.level });
    }
    return standards;
  }
  const candidates = isCpp ? CPP_STANDARDS : C_STANDARDS;
  const results = await Promise.all(
    candidates.map(async (standard) => {
      for (const alias of standard.aliases) {
        const flag = `-std=${alias}`;
        const result = await runCommand(executable, [flag, '-fsyntax-only', file], {
          timeout: 12000,
          envScript,
        });
        if (result.code === 0) {
          const draftAlias = alias !== standard.id;
          return {
            id: alias,
            label: draftAlias ? `${standard.label}（${alias}）` : standard.label,
            flag,
            level: standard.level,
            draft: draftAlias,
          };
        }
      }
      return null;
    })
  );
  return results.filter(Boolean).sort((a, b) => a.level - b.level);
}

async function detectDefaultStandard(executable, family, envScript) {
  if (family === 'msvc') return null;
  const result = await runCommand(executable, ['-dM', '-E', '-x', 'c++', '-'], {
    timeout: 8000,
    input: '',
    envScript,
  });
  if (result.code !== 0) return null;
  const match = result.stdout.match(/#define\s+__cplusplus\s+(\d{4,6})L?/);
  if (!match) return null;
  return STANDARD_ID.cpp[match[1]] || null;
}

function classifyVersion(family, version, target) {
  if (family === 'gcc') {
    const isMingw = /mingw|windows|win32/i.test(target || '') || IS_WIN;
    return {
      name: `GCC ${version || ''}`.trim(),
      toolchain: isMingw ? 'MinGW-w64' : 'GCC',
      vendor: 'GNU',
    };
  }
  if (family === 'clang') {
    return {
      name: `Clang ${version || ''}`.trim(),
      toolchain: /windows|msvc/i.test(target || '') ? 'LLVM/Windows' : 'LLVM',
      vendor: 'LLVM',
    };
  }
  if (family === 'msvc') return { name: `MSVC ${version || ''}`.trim(), toolchain: 'Visual Studio', vendor: 'Microsoft' };
  if (family === 'python') return { name: `Python ${version || ''}`.trim(), toolchain: 'CPython', vendor: 'Python' };
  if (family === 'node') return { name: `Node.js ${version || ''}`.trim(), toolchain: 'V8', vendor: 'Node.js' };
  if (family === 'java') return { name: version ? `Java ${version}` : 'Java', toolchain: 'JDK', vendor: 'Java' };
  if (family === 'go') return { name: `Go ${version || ''}`.trim(), toolchain: 'Go', vendor: 'Go' };
  if (family === 'rust') return { name: `Rust ${version || ''}`.trim(), toolchain: 'rustc', vendor: 'Rust' };
  return { name: family, toolchain: family, vendor: family };
}

class CompilerManager {
  constructor(settings, emit) {
    this.settings = settings;
    this.emit = emit || (() => {});
    this.compilers = Array.isArray(settings.get('compilerCache', [])) ? settings.get('compilerCache', []) : [];
    this.scanning = false;
    this.lastScanAt = settings.get('compilerScanAt', null);
    this.cache = new Map(this.compilers.map((item) => [item.id, item]));
    this.error = null;
  }

  list() {
    return this.compilers.map(({ _mtime, _size, ...item }) => item);
  }

  get scanningState() {
    return { scanning: this.scanning, lastScanAt: this.lastScanAt, error: this.error };
  }

  byId(id) {
    return this.compilers.find((item) => item.id === id) || null;
  }

  forKind(kind) {
    return this.compilers.filter((item) => item.kind === kind);
  }

  select(language, compilerId) {
    const compiler = this.byId(compilerId);
    if (!compiler) throw new Error('未找到指定编译器');
    const allowedKind = language === 'javascript' ? 'node' : language;
    if (compiler.kind !== allowedKind) throw new Error('编译器类型与语言不匹配');
    this.settings.data.selectedCompilers[language] = compilerId;
    this.settings.save();
    this.emit({ type: 'compiler-selection', language, compilerId });
    return this.resolve(language);
  }

  selectStandard(compilerId, standardId) {
    const compiler = this.byId(compilerId);
    if (!compiler) throw new Error('未找到指定编译器');
    if (!(compiler.standards || []).some((standard) => standard.id === standardId)) {
      throw new Error('该编译器不支持所选标准');
    }
    this.settings.data.selectedStandards[compilerId] = standardId;
    this.settings.save();
    this.emit({ type: 'standard-selection', compilerId, standardId });
    return standardId;
  }

  resolve(language) {
    const kind = language === 'javascript' ? 'node' : language;
    const candidates = this.forKind(kind);
    if (!candidates.length) return { compiler: null, standard: null };
    const selectedId = this.settings.data.selectedCompilers?.[language];
    let compiler = candidates.find((item) => item.id === selectedId) || null;
    if (!compiler) {
      compiler = [...candidates].sort((a, b) => {
        const score = (item) => {
          let value = Number.parseFloat(item.version) || 0;
          if (item.family === 'gcc') value += 0.4;
          if (item.family === 'clang') value += 0.3;
          return value;
        };
        return score(b) - score(a);
      })[0];
      this.settings.data.selectedCompilers[language] = compiler.id;
      this.settings.save();
    }
    let standard = null;
    if (compiler.standards?.length) {
      const key = language === 'cpp' || language === 'c' || language === 'javascript' ? compiler.id : language;
      const saved = this.settings.data.selectedStandards?.[compiler.id] || this.settings.data.selectedStandards?.[key];
      standard = compiler.standards.find((item) => item.id === saved) || null;
      if (!standard) {
        const oi = this.settings.get('mode') === 'oi' && language === 'cpp';
        const preferred = oi
          ? compiler.standards.find((item) => item.id === 'c++17') || compiler.standards.find((item) => item.id === 'c++14')
          : null;
        standard =
          preferred ||
          compiler.standards.find((item) => item.id === compiler.recommendedStandard) ||
          compiler.standards[compiler.standards.length - 1];
      }
    }
    return { compiler, standard };
  }

  async addCustom(executablePath) {
    if (!executablePath || !isExecutable(executablePath)) throw new Error('可执行文件不存在');
    const names = [
      { test: /cl\.exe$/i, kind: 'cpp', family: 'msvc' },
      { test: /(clang\+\+|clang\+\+-[\d.]+)(\.exe)?$/i, kind: 'cpp', family: 'clang' },
      { test: /(g\+\+|g\+\+-[\d.]+)(\.exe)?$/i, kind: 'cpp', family: 'gcc' },
      { test: /(clang|clang-[\d.]+)(\.exe)?$/i, kind: 'c', family: 'clang' },
      { test: /(gcc|gcc-[\d.]+)(\.exe)?$/i, kind: 'c', family: 'gcc' },
      { test: /python/i, kind: 'python', family: 'python' },
      { test: /node(\.exe)?$/i, kind: 'node', family: 'node' },
      { test: /javac(\.exe)?$/i, kind: 'java', family: 'java' },
      { test: /(^|\\)go(\.exe)?$/i, kind: 'go', family: 'go' },
      { test: /rustc(\.exe)?$/i, kind: 'rust', family: 'rust' },
    ];
    const basename = path.basename(executablePath);
    const matched = names.find((item) => item.test.test(basename));
    if (!matched) throw new Error('无法识别该可执行文件的类型');
    const envScript = matched.family === 'msvc' ? this.findEnvScriptFor(executablePath) : null;
    const compiler = await this.probe({
      executable: normalizePath(executablePath),
      kind: matched.kind,
      family: matched.family,
      envScript,
      custom: true,
    });
    const existing = this.compilers.findIndex((item) => item.executable.toLowerCase() === compiler.executable.toLowerCase());
    if (existing >= 0) this.compilers[existing] = compiler;
    else this.compilers.push(compiler);
    const custom = new Set(this.settings.get('customCompilers', []));
    custom.add(compiler.executable);
    this.settings.set('customCompilers', [...custom]);
    this.persist();
    this.emit({ type: 'compilers', compilers: this.list(), state: this.scanningState });
    return compiler;
  }

  findEnvScriptFor(executable) {
    let dir = path.dirname(executable);
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.join(dir, '..', '..', '..', 'Auxiliary', 'Build', 'vcvars64.bat');
      if (fs.existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
    return null;
  }

  persist() {
    this.lastScanAt = Date.now();
    this.settings.patch({
      compilerCache: this.compilers,
      compilerScanAt: this.lastScanAt,
    });
  }

  async scan({ force = false } = {}) {
    if (this.scanning) return this.list();
    this.scanning = true;
    this.error = null;
    this.emit({ type: 'scan-start' });
    const previous = new Map(this.compilers.map((item) => [item.executable.toLowerCase(), item]));
    try {
      const found = new Map();
      const extraDirs = expandUserScanDirs(this.settings.get('compilerScanDirs', []) || []);
      for (const candidate of CANDIDATE_COMMANDS) {
        const paths = findOnPath(candidate.command, extraDirs);
        for (const executable of paths) {
          if (found.has(executable.toLowerCase())) continue;
          if (candidate.family === 'python' && /\\windowsapps\\/i.test(executable)) continue;
          found.set(executable.toLowerCase(), { ...candidate, executable });
        }
      }
      for (const msvc of findMsvc()) {
        if (!found.has(msvc.executable.toLowerCase())) {
          found.set(msvc.executable.toLowerCase(), {
            command: 'cl',
            kind: 'cpp',
            family: 'msvc',
            executable: msvc.executable,
            envScript: msvc.envScript,
          });
        }
      }
      for (const customPath of this.settings.get('customCompilers', []) || []) {
        if (!isExecutable(customPath)) continue;
        const lower = customPath.toLowerCase();
        if (found.has(lower)) continue;
        const basename = path.basename(customPath).toLowerCase();
        let candidate = null;
        if (/^cl\.exe$/.test(basename)) candidate = { kind: 'cpp', family: 'msvc' };
        else if (/^clang\+\+/.test(basename)) candidate = { kind: 'cpp', family: 'clang' };
        else if (/^g\+\+/.test(basename)) candidate = { kind: 'cpp', family: 'gcc' };
        else if (/^clang/.test(basename)) candidate = { kind: 'c', family: 'clang' };
        else if (/^gcc/.test(basename)) candidate = { kind: 'c', family: 'gcc' };
        else if (/^python/.test(basename)) candidate = { kind: 'python', family: 'python' };
        else if (/^node/.test(basename)) candidate = { kind: 'node', family: 'node' };
        else if (/^javac/.test(basename)) candidate = { kind: 'java', family: 'java' };
        else if (/^go\.exe$/.test(basename) || basename === 'go') candidate = { kind: 'go', family: 'go' };
        else if (/^rustc/.test(basename)) candidate = { kind: 'rust', family: 'rust' };
        if (candidate) found.set(lower, { ...candidate, executable: customPath, custom: true });
      }
      const probed = [];
      const entries = [...found.values()];
      const limit = 4;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
        while (cursor < entries.length) {
          const current = entries[cursor];
          cursor += 1;
          const old = previous.get(current.executable.toLowerCase()) || null;
          try {
            const compiler = await this.probe(current, { previous: old, force });
            probed.push(compiler);
          } catch (error) {
            console.warn('[compilers] 探测失败', current.executable, error.message);
          }
        }
      });
      await Promise.all(workers);
      // Python 安装目录里通常同时提供 python.exe / python3.exe，只保留一个入口。
      const seenPython = new Set();
      const deduped = [];
      for (const item of probed) {
        if (item.kind === 'python') {
          const key = `${path.dirname(item.executable).toLowerCase()}|${item.version}`;
          if (seenPython.has(key)) continue;
          seenPython.add(key);
        }
        deduped.push(item);
      }
      probed.length = 0;
      probed.push(...deduped);
      probed.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return String(b.version).localeCompare(String(a.version), undefined, { numeric: true });
      });
      this.compilers = probed;
      this.cache = new Map(probed.map((item) => [item.id, item]));
      this.persist();
      this.lastScanAt = Date.now();
      this.emit({ type: 'compilers', compilers: this.list(), state: this.scanningState });
      return this.list();
    } catch (error) {
      this.error = error.message;
      this.emit({ type: 'compilers', compilers: this.list(), state: this.scanningState, error: error.message });
      return this.list();
    } finally {
      this.scanning = false;
      this.emit({ type: 'scan-end', state: this.scanningState });
    }
  }

  async probe(candidate, { previous = null, force = false } = {}) {
    const { executable, kind, family } = candidate;
    const fingerprint = await getFileFingerprint(executable);
    const envScript = candidate.envScript || previous?.envScript || null;
    let versionInfo = null;
    let reference = '';
    let target = '';
    if (family === 'msvc') {
      const result = await runCommand(executable, [], { timeout: 10000, envScript, input: '' });
      reference = firstLine(result.stdout || result.stderr);
      const match = reference.match(/Version\s+(\d+\.\d+(?:\.\d+)?)/i);
      versionInfo = match ? match[1] : parseVersion(reference);
      target = 'x64';
    } else if (kind === 'python') {
      const result = await runCommand(executable, ['-c', 'import sys; print(sys.version.split()[0])'], { timeout: 8000 });
      reference = firstLine(result.stdout);
      versionInfo = parseVersion(reference || result.stderr);
    } else if (kind === 'java') {
      const result = await runCommand(executable, ['-version'], { timeout: 8000 });
      reference = firstLine(result.stdout || result.stderr);
      versionInfo = parseVersion(reference);
    } else if (kind === 'go') {
      const result = await runCommand(executable, ['version'], { timeout: 8000 });
      reference = firstLine(result.stdout);
      const match = reference.match(/go(\d+\.\d+(?:\.\d+)?)/);
      versionInfo = match ? match[1] : parseVersion(reference);
    } else {
      const result = await runCommand(executable, ['--version'], { timeout: 8000, envScript });
      reference = firstLine(result.stdout || result.stderr);
      versionInfo = parseVersion(reference);
      if ((kind === 'cpp' || kind === 'c') && family !== 'msvc') {
        const targetResult = await runCommand(executable, ['-dumpmachine'], { timeout: 8000, envScript });
        target = firstLine(targetResult.stdout);
      }
    }
    if (!reference) throw new Error('无法获取版本信息');
    const info = classifyVersion(family, versionInfo, target);
    const id = hashId(`${kind}|${family}|${executable.toLowerCase()}`);
    let standards = [];
    let defaultStandard = null;
    if (kind === 'cpp' || kind === 'c') {
      const cacheKey = `${executable.toLowerCase()}|${fingerprint}|${family}`;
      const cached =
        !force && previous && previous._probeKey === cacheKey && Array.isArray(previous.standards)
          ? previous
          : null;
      if (cached) {
        standards = cached.standards;
        defaultStandard = cached.defaultStandard || null;
      } else {
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'orbit-probe-'));
        const source = path.join(tmpDir, kind === 'cpp' ? 'probe.cpp' : 'probe.c');
        await fsp.writeFile(source, 'int main(void){return 0;}\n', 'utf8');
        try {
          standards = await probeStandards(executable, family, kind, source, envScript);
          if (kind === 'cpp' && family !== 'msvc') defaultStandard = await detectDefaultStandard(executable, family, envScript);
        } finally {
          await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
    const levels = standards.map((item) => item.level);
    const recommendedStandard = standards.length ? standards[standards.length - 1].id : null;
    const oiStandard =
      standards.find((item) => item.id === 'c++17')?.id ||
      standards.find((item) => item.id === 'c++14')?.id ||
      recommendedStandard;
    let javaPath = null;
    if (kind === 'java') {
      const candidateJava = path.join(path.dirname(executable), IS_WIN ? 'java.exe' : 'java');
      if (fs.existsSync(candidateJava)) javaPath = candidateJava;
    }
    return {
      id,
      kind,
      family,
      name: info.name,
      toolchain: info.toolchain,
      vendor: info.vendor,
      version: versionInfo || '',
      target: target || '',
      executable,
      envScript: envScript || null,
      javaPath,
      standards,
      recommendedStandard,
      oiStandard,
      defaultStandard,
      custom: Boolean(candidate.custom),
      discoveredAt: Date.now(),
      _probeKey: `${executable.toLowerCase()}|${fingerprint}|${family}`,
      _mtime: fingerprint,
      _size: standards.length,
    };
  }
}

module.exports = {
  CompilerManager,
  CPP_STANDARDS,
  C_STANDARDS,
  MSVC_CPP_STANDARDS,
  runCommand,
  quoteCmd,
};

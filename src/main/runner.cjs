'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { quoteCmd } = require('./compilers.cjs');
const { languageForPath, isOiAllowed } = require('./languages.cjs');

const IS_WIN = process.platform === 'win32';
const MAX_OUTPUT = 2 * 1024 * 1024;

function nowId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeOutput(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (IS_WIN && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    try {
      child.kill();
    } catch {
      // 进程可能已经退出。
    }
  }
}

function parseDiagnostics(output, root) {
  const diagnostics = [];
  const seen = new Set();
  const add = (file, line, column, severityRaw, message) => {
    let normalized = file;
    if (root && file) {
      try {
        const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
        const relative = path.relative(root, absolute);
        if (!relative.startsWith('..')) normalized = relative.split(path.sep).join('/');
      } catch {
        // 保留原始路径。
      }
    }
    const key = `${normalized}:${line}:${column}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    let severity = 'info';
    if (/error/i.test(severityRaw)) severity = 'error';
    else if (/warning/i.test(severityRaw)) severity = 'warning';
    diagnostics.push({
      file: normalized || null,
      line: Number(line) || 1,
      column: Number(column) || 1,
      severity,
      message: String(message || '').trim(),
    });
  };
  const gcc = /^(.*?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.*)$/gm;
  let match;
  while ((match = gcc.exec(output))) add(match[1], match[2], match[3], match[4], match[5]);
  const msvc = /^(.*?)\((\d+)(?:,(\d+))?\):\s*(fatal error|error|warning|note)\s+([A-Z]+\d+):\s*(.*)$/gm;
  while ((match = msvc.exec(output))) add(match[1], match[2], match[3], match[4], `${match[5]}: ${match[6]}`);
  const javac = /^(.*?\.java):(\d+):\s*(error|warning):\s*(.*)$/gm;
  while ((match = javac.exec(output))) add(match[1], match[2], '1', match[3], match[4]);
  const rust = /^(?:error|warning)(?:\[[^\]]+\])?:\s*(.*)\n\s*-->\s*(.*?):(\d+):(\d+)/gm;
  while ((match = rust.exec(output))) add(match[2], match[3], match[4], match[0].startsWith('error') ? 'error' : 'warning', match[1]);
  return diagnostics.slice(0, 300);
}

function createProcess(executable, args, options = {}) {
  const { cwd, env, timeout = 30_000, stdin = null, keepStdinOpen = false, onData = () => {} } = options;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        ok: false,
        code: -1,
        stdout: '',
        stderr: String(error.message || error),
        output: String(error.message || error),
        timedOut: false,
        durationMs: 0,
        truncated: false,
        child: null,
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const started = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    const push = (stream, chunk) => {
      const text = chunk.toString('utf8');
      if (stream === 'stdout') {
        if (stdout.length + text.length > MAX_OUTPUT) {
          stdout += text.slice(0, Math.max(0, MAX_OUTPUT - stdout.length));
          truncated = true;
        } else stdout += text;
      } else if (stderr.length + text.length > MAX_OUTPUT) {
        stderr += text.slice(0, Math.max(0, MAX_OUTPUT - stderr.length));
        truncated = true;
      } else stderr += text;
      onData({ stream, data: text });
    };
    child.stdout.on('data', (chunk) => push('stdout', chunk));
    child.stderr.on('data', (chunk) => push('stderr', chunk));
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        ok: code === 0 && !timedOut,
        code,
        signal: signal || null,
        stdout,
        stderr,
        output: stderr && stdout ? `${stdout}\n${stderr}` : stderr || stdout,
        timedOut,
        durationMs: Date.now() - started,
        truncated,
        child,
      };
      resolve(result);
    };
    child.on('error', (error) => {
      if (!stderr) stderr = String(error.message || error);
      finish(-1, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
    if (stdin !== null && stdin !== undefined) {
      child.stdin.end(String(stdin));
    } else if (!keepStdinOpen) {
      child.stdin.end();
    }
  });
}

class Runner {
  constructor({ settings, workspace, compilers, emit }) {
    this.settings = settings;
    this.workspace = workspace;
    this.compilers = compilers;
    this.emit = emit || (() => {});
    this.active = new Map();
    this.lastProblems = [];
  }

  async buildDir() {
    let dir;
    if (this.workspace.isOpen) {
      dir = this.workspace.resolve('.orbit/build');
    } else {
      dir = path.join(os.tmpdir(), 'orbit-ide', 'build');
    }
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  }

  resolveSource(inputPath) {
    if (!this.workspace.isOpen) throw new Error('请先打开工作区');
    const source = this.workspace.resolve(inputPath, { allowMissing: false });
    if (!fs.statSync(source).isFile()) throw new Error('目标不是文件');
    return source;
  }

  compilerFor(language, compilerId, standardId) {
    if (compilerId) {
      const explicit = this.compilers.byId(compilerId);
      if (!explicit) throw new Error('指定编译器不存在');
      const standard =
        (standardId ? explicit.standards?.find((item) => item.id === standardId) : null) ||
        explicit.standards?.find((item) => item.id === this.settings.data.selectedStandards?.[explicit.id]) ||
        explicit.standards?.find((item) => item.id === explicit.recommendedStandard) ||
        null;
      return { compiler: explicit, standard };
    }
    const resolved = this.compilers.resolve(language);
    if (standardId && resolved.compiler) {
      const explicit = resolved.compiler.standards?.find((item) => item.id === standardId);
      if (explicit) return { compiler: resolved.compiler, standard: explicit };
    }
    return resolved;
  }

  async build(inputPath, options = {}) {
    const source = this.resolveSource(inputPath);
    const language = languageForPath(source);
    const mode = this.settings.get('mode');
    if (mode === 'oi' && !isOiAllowed(source)) {
      throw new Error('OI 模式仅支持编译 C/C++ 文件');
    }
    if (!language.runnable) throw new Error(`${language.label} 文件无需编译运行`);
    const cwd = this.workspace.isOpen ? this.workspace.root : path.dirname(source);
    const buildDir = await this.buildDir();
    const base = path.basename(source, path.extname(source)).replace(/[^\w.-]+/g, '_') || 'program';
    const token = nowId();
    const exeSuffix = IS_WIN ? '.exe' : '';
    const outputBase = path.join(buildDir, `${base}-${token}`);
    const { compiler, standard } = this.compilerFor(language.id, options.compilerId, options.standard);
    let executable = null;
    let args = [];
    let commandLine = '';
    let timeout = 60_000;
    const diagnosticsSource = [];

    const addText = (text) => {
      if (!text) return;
      diagnosticsSource.push(text);
      this.emit({ type: 'build-output', text });
    };

    if (language.id === 'cpp' || language.id === 'c') {
      if (!compiler) throw new Error(`未检测到可用的 ${language.label} 编译器，请打开“编译器”面板扫描或手动添加`);
      const isMsvc = compiler.family === 'msvc';
      const optimizeO2 = this.settings.get('o2Optimization', true) !== false;
      if (isMsvc) {
        executable = path.join(buildDir, `${base}-${token}${exeSuffix}`);
        args = [
          '/nologo',
          '/EHsc',
          ...(optimizeO2 ? ['/O2'] : []),
          `/std:${standard?.id || 'c++17'}`,
          `/Fe:${executable}`,
          source,
        ];
        commandLine = `cl ${args.map(quoteCmd).join(' ')}`;
        const result = await this.spawnCompiler(compiler, args, cwd, timeout, addText);
        const diagnostics = parseDiagnostics(result.output, cwd);
        this.lastProblems = diagnostics;
        return {
          success: result.code === 0,
          language: language.id,
          compiler: this.compilerPublic(compiler),
          standard: standard?.id || null,
          executable,
          output: result.output,
          diagnostics,
          durationMs: result.durationMs,
          commandLine,
        };
      }
      executable = outputBase + exeSuffix;
      const sourceText = fs.readFileSync(source, 'utf8');
      const usesBitsHeader = /#include\s*[<"]bits\/stdc\+\+\.h[>"]/.test(sourceText);
      const buildArgs = (std) => [
        source,
        '-o',
        executable,
        ...(std?.id ? [`-std=${std.id}`] : []),
        ...(optimizeO2 ? ['-O2'] : []),
        '-pipe',
        '-Wall',
        '-Wextra',
        '-fdiagnostics-color=never',
      ];
      let selectedStandard = standard;
      args = buildArgs(selectedStandard);
      commandLine = `${compiler.executable} ${args.map(quoteCmd).join(' ')}`;
      let result = await this.spawnCompiler(compiler, args, cwd, timeout, () => {});
      let autoFallback = null;
      const gccMajor = Number.parseInt(compiler.version, 10) || 0;
      const compatibilityFailure = /bits\/stdc\+\+\.h|filesystem|fs_path\.h/i.test(result.output || '');
      const canFallback =
        result.code !== 0 &&
        usesBitsHeader &&
        compatibilityFailure &&
        (language.id === 'cpp') &&
        (selectedStandard?.level || 0) >= 2017 &&
        compiler.family === 'gcc' &&
        gccMajor > 0 &&
        gccMajor < 9;
      if (canFallback) {
        const fallback =
          compiler.standards?.find((item) => item.id === 'c++14') ||
          compiler.standards?.find((item) => item.id === 'c++11');
        if (fallback) {
          const message = `检测到 GCC ${compiler.version} 的 <bits/stdc++.h> 与 ${selectedStandard.id} 存在兼容问题，已自动回退到 ${fallback.label} 重新编译。\n`;
          addText(message);
          await fsp.rm(executable, { force: true }).catch(() => {});
          selectedStandard = fallback;
          args = buildArgs(selectedStandard);
          commandLine = `${compiler.executable} ${args.map(quoteCmd).join(' ')}`;
          const firstDuration = result.durationMs;
          result = await this.spawnCompiler(compiler, args, cwd, timeout, () => {});
          result.durationMs += firstDuration;
          autoFallback = {
            from: standard?.id || null,
            to: fallback.id,
            reason: 'GCC 8 的 bits/stdc++.h 与 C++17 不兼容',
          };
        }
      }
      if (result.output) addText(result.output);
      const diagnostics = parseDiagnostics(result.output, cwd);
      if (autoFallback) {
        diagnostics.unshift({
          file: this.workspace.relative(source),
          line: 1,
          column: 1,
          severity: 'warning',
          message: `已自动将标准从 ${autoFallback.from} 回退到 ${autoFallback.to}：${autoFallback.reason}`,
        });
      }
      this.lastProblems = diagnostics;
      return {
        success: result.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        standard: selectedStandard?.id || null,
        executable: result.code === 0 ? executable : null,
        output: result.output,
        diagnostics,
        durationMs: result.durationMs,
        commandLine,
        autoFallback,
      };
    }

    if (language.id === 'python') {
      if (!compiler) throw new Error('未检测到 Python 解释器，请打开“编译器”面板扫描或手动添加');
      const check = await createProcess(compiler.executable, ['-m', 'py_compile', source], {
        cwd,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
        timeout: 15_000,
        onData: ({ data }) => addText(data),
      });
      const diagnostics = parseDiagnostics(check.output, cwd);
      this.lastProblems = diagnostics;
      return {
        success: check.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        executable: compiler.executable,
        interpreter: true,
        output: check.output,
        diagnostics,
        durationMs: check.durationMs,
        commandLine: `${compiler.executable} -m py_compile ${quoteCmd(source)}`,
      };
    }

    if (language.id === 'javascript') {
      if (!compiler) throw new Error('未检测到 Node.js，请打开“编译器”面板扫描或手动添加');
      const check = await createProcess(compiler.executable, ['--check', source], {
        cwd,
        timeout: 15_000,
        onData: ({ data }) => addText(data),
      });
      const diagnostics = parseDiagnostics(check.output, cwd);
      this.lastProblems = diagnostics;
      return {
        success: check.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        executable: compiler.executable,
        interpreter: true,
        output: check.output,
        diagnostics,
        durationMs: check.durationMs,
        commandLine: `${compiler.executable} --check ${quoteCmd(source)}`,
      };
    }

    if (language.id === 'java') {
      if (!compiler) throw new Error('未检测到 JDK（javac），请打开“编译器”面板扫描或手动添加');
      const classes = path.join(buildDir, `classes-${token}`);
      await fsp.mkdir(classes, { recursive: true });
      args = ['-encoding', 'UTF-8', '-d', classes, source];
      commandLine = `javac ${args.map(quoteCmd).join(' ')}`;
      const result = await createProcess(compiler.executable, args, {
        cwd,
        timeout,
        onData: ({ data }) => addText(data),
      });
      const diagnostics = parseDiagnostics(result.output, cwd);
      this.lastProblems = diagnostics;
      return {
        success: result.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        executable: result.code === 0 ? compiler.javaPath || path.join(path.dirname(compiler.executable), 'java.exe') : null,
        classDir: classes,
        className: path.basename(source, '.java'),
        output: result.output,
        diagnostics,
        durationMs: result.durationMs,
        commandLine,
      };
    }

    if (language.id === 'go') {
      if (!compiler) throw new Error('未检测到 Go 工具链，请打开“编译器”面板扫描或手动添加');
      executable = outputBase + exeSuffix;
      args = ['build', '-o', executable, source];
      commandLine = `go ${args.map(quoteCmd).join(' ')}`;
      const result = await createProcess(compiler.executable, args, {
        cwd,
        timeout,
        onData: ({ data }) => addText(data),
      });
      const diagnostics = parseDiagnostics(result.output, cwd);
      this.lastProblems = diagnostics;
      return {
        success: result.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        executable: result.code === 0 ? executable : null,
        output: result.output,
        diagnostics,
        durationMs: result.durationMs,
        commandLine,
      };
    }

    if (language.id === 'rust') {
      if (!compiler) throw new Error('未检测到 Rust 工具链，请打开“编译器”面板扫描或手动添加');
      executable = outputBase + exeSuffix;
      args = [source, '-O', '-o', executable];
      commandLine = `rustc ${args.map(quoteCmd).join(' ')}`;
      const result = await createProcess(compiler.executable, args, {
        cwd,
        timeout,
        onData: ({ data }) => addText(data),
      });
      const diagnostics = parseDiagnostics(result.output, cwd);
      this.lastProblems = diagnostics;
      return {
        success: result.code === 0,
        language: language.id,
        compiler: this.compilerPublic(compiler),
        executable: result.code === 0 ? executable : null,
        output: result.output,
        diagnostics,
        durationMs: result.durationMs,
        commandLine,
      };
    }

    throw new Error(`暂不支持运行 ${language.label}`);
  }

  compilerPublic(compiler) {
    if (!compiler) return null;
    return {
      id: compiler.id,
      name: compiler.name,
      family: compiler.family,
      toolchain: compiler.toolchain,
      executable: compiler.executable,
      version: compiler.version,
    };
  }

  spawnCompiler(compiler, args, cwd, timeout, addText) {
    if (compiler.family === 'msvc' && compiler.envScript) {
      const line = `call ${quoteCmd(compiler.envScript)} >nul 2>nul && ${quoteCmd(compiler.executable)} ${args
        .map((arg) => quoteCmd(arg))
        .join(' ')}`;
      return createProcess('cmd.exe', ['/d', '/s', '/c', line], {
        cwd,
        timeout,
        onData: ({ data }) => addText(data),
      });
    }
    return createProcess(compiler.executable, args, {
      cwd,
      timeout,
      onData: ({ data }) => addText(data),
    });
  }

  async execute(buildResult, options = {}) {
    if (!buildResult?.success || !buildResult.executable) {
      return {
        ok: false,
        skipped: true,
        output: '',
        stdout: '',
        stderr: '',
        code: null,
        durationMs: 0,
        message: '编译未通过',
      };
    }
    const cwd = this.workspace.isOpen ? this.workspace.root : path.dirname(buildResult.executable);
    const runId = options.runId || nowId();
    let executable = buildResult.executable;
    let args = [];
    let env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
    if (buildResult.language === 'python') {
      args = [buildResult.sourcePath || options.sourcePath];
    } else if (buildResult.language === 'javascript') {
      args = [buildResult.sourcePath || options.sourcePath];
    } else if (buildResult.language === 'java') {
      executable = buildResult.executable;
      args = ['-Dfile.encoding=UTF-8', '-cp', buildResult.classDir, buildResult.className];
    }
    if (buildResult.language === 'python' || buildResult.language === 'javascript') {
      if (options.sourcePath) args = [this.workspace.resolve(options.sourcePath)];
    }
    const timeout = Math.max(500, Math.min(Number(options.timeoutMs) || (this.settings.get('mode') === 'oi' ? 5000 : 30_000), 300_000));
    const interactive = Boolean(options.interactive);
    const onData = options.onData || (() => {});
    const started = Date.now();
    const result = await createProcess(executable, args, {
      cwd,
      env,
      timeout,
      stdin: interactive ? null : options.stdin ?? '',
      keepStdinOpen: interactive,
      onData,
    });
    return {
      ...result,
      runId,
      durationMs: result.durationMs || Date.now() - started,
      exitCode: result.code,
    };
  }

  async run(inputPath, options = {}) {
    const buildResult = await this.build(inputPath, options);
    buildResult.sourcePath = inputPath;
    if (!buildResult.success) {
      this.emit({ type: 'run-problems', problems: buildResult.diagnostics || [] });
      return { build: buildResult, run: null };
    }
    const run = await this.execute(buildResult, {
      ...options,
      sourcePath: inputPath,
    });
    this.emit({ type: 'run-problems', problems: buildResult.diagnostics || [] });
    return { build: buildResult, run };
  }

  async runInteractive(inputPath, options = {}) {
    const buildResult = await this.build(inputPath, options);
    buildResult.sourcePath = inputPath;
    if (!buildResult.success) {
      this.emit({ type: 'run-problems', problems: buildResult.diagnostics || [] });
      return { build: buildResult, run: null };
    }
    const runId = nowId();
    const active = { id: runId, child: null, startedAt: Date.now(), stopped: false };
    const completion = new Promise((resolve) => {
      active.resolve = resolve;
    });
    const cwd = this.workspace.isOpen ? this.workspace.root : path.dirname(inputPath);
    const language = buildResult.language;
    let executable = buildResult.executable;
    let args = [];
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
    if (language === 'python' || language === 'javascript') {
      args = [this.workspace.resolve(inputPath)];
    } else if (language === 'java') {
      args = ['-Dfile.encoding=UTF-8', '-cp', buildResult.classDir, buildResult.className];
    }
    const onData = (event) => {
      this.emit({ type: 'run-output', runId, ...event });
    };
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      return { build: buildResult, runId: null, error: String(error.message || error) };
    }
    active.child = child;
    this.active.set(runId, active);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = Math.max(1000, Math.min(Number(options.timeoutMs) || 60_000, 600_000));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    const push = (stream, chunk) => {
      const text = chunk.toString('utf8');
      if (stdout.length + stderr.length < MAX_OUTPUT) {
        if (stream === 'stdout') stdout += text;
        else stderr += text;
      }
      this.emit({ type: 'run-output', runId, stream, data: text });
    };
    child.stdout.on('data', (chunk) => push('stdout', chunk));
    child.stderr.on('data', (chunk) => push('stderr', chunk));
    const finish = (code, signal) => {
      clearTimeout(timer);
      this.active.delete(runId);
      const run = {
        ok: code === 0 && !timedOut,
        code,
        signal: signal || null,
        stdout,
        stderr,
        output: stderr && stdout ? `${stdout}\n${stderr}` : stderr || stdout,
        timedOut,
        durationMs: Date.now() - active.startedAt,
        truncated: stdout.length + stderr.length >= MAX_OUTPUT,
        runId,
      };
      this.emit({ type: 'run-exit', run });
      active.resolve(run);
    };
    child.on('close', (code, signal) => finish(code, signal));
    child.on('error', (error) => {
      if (!stderr) stderr += String(error.message || error);
      finish(-1, null);
    });
    this.emit({ type: 'run-started', runId, build: buildResult });
    // 返回一个完成 Promise，调用方可以选择等待。
    active.completion = completion;
    return { build: buildResult, runId, completion };
  }

  writeStdin(runId, data) {
    const active = this.active.get(runId);
    if (!active?.child) return false;
    try {
      active.child.stdin.write(String(data));
      return true;
    } catch {
      return false;
    }
  }

  stop(runId) {
    if (runId) {
      const active = this.active.get(runId);
      if (active) {
        killTree(active.child);
        return true;
      }
      return false;
    }
    for (const active of this.active.values()) killTree(active.child);
    this.active.clear();
    return true;
  }

  async runTests(inputPath, options = {}) {
    let cases = Array.isArray(options.cases) ? options.cases : [];
    if (!cases.length && options.testStore) {
      const stored = await options.testStore.read();
      cases = stored.cases;
    }
    cases = cases.filter((item) => item.enabled !== false);
    if (!cases.length) throw new Error('没有可运行的测试点');
    const buildResult = await this.build(inputPath, options);
    if (!buildResult.success) {
      return { build: buildResult, results: [], passed: 0, total: cases.length };
    }
    buildResult.sourcePath = inputPath;
    const results = [];
    for (const testCase of cases) {
      const run = await this.execute(buildResult, {
        sourcePath: inputPath,
        stdin: testCase.input ?? '',
        timeoutMs: options.timeoutMs || 5000,
      });
      const actual = normalizeOutput(run.stdout);
      const expected = normalizeOutput(testCase.expected);
      const hasExpected = expected.length > 0;
      let status;
      if (run.timedOut) status = 'timeout';
      else if (run.code !== 0) status = 'runtime-error';
      else if (!hasExpected) status = 'no-expected';
      else status = actual === expected ? 'passed' : 'wrong-answer';
      results.push({
        id: testCase.id,
        name: testCase.name || '测试点',
        status,
        passed: status === 'passed' || status === 'no-expected',
        input: testCase.input ?? '',
        expected,
        actual,
        stderr: run.stderr,
        timeMs: run.durationMs,
        exitCode: run.code,
        timedOut: run.timedOut,
      });
      this.emit({ type: 'test-case-result', result: results[results.length - 1] });
    }
    const passed = results.filter((item) => item.status === 'passed').length;
    return {
      build: buildResult,
      results,
      passed,
      total: results.length,
      allPassed: passed === results.length,
    };
  }

  async exec(command, options = {}) {
    if (!command || !String(command).trim()) throw new Error('命令不能为空');
    const cwd = options.cwd
      ? this.workspace.resolve(options.cwd)
      : this.workspace.isOpen
        ? this.workspace.root
        : process.cwd();
    const timeout = Math.max(1000, Math.min(Number(options.timeoutMs) || 30_000, 300_000));
    const started = Date.now();
    const shell = IS_WIN
      ? { exe: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', String(command)] }
      : { exe: '/bin/sh', args: ['-c', String(command)] };
    const result = await createProcess(shell.exe, shell.args, {
      cwd,
      timeout,
      env: { ...process.env, PYTHONUTF8: '1' },
    });
    return {
      command: String(command),
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      durationMs: Date.now() - started,
      timedOut: result.timedOut,
      ok: result.code === 0 && !result.timedOut,
    };
  }
}

module.exports = { Runner, parseDiagnostics, normalizeOutput };

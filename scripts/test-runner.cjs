'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Runner } = require('../src/main/runner.cjs');
const { CompilerManager } = require('../src/main/compilers.cjs');

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-test-'));
  const settingsData = {
    mode: 'oi',
    selectedCompilers: {},
    selectedStandards: {},
    compilerCache: [],
    customCompilers: [],
    oiPanelHeight: 268,
  };
  const settings = {
    data: settingsData,
    get(key, fallback) { return this.data[key] === undefined ? fallback : this.data[key]; },
    set(key, value) { this.data[key] = value; },
    patch(patch) { Object.assign(this.data, patch); },
    save() {},
  };
  const workspace = {
    root,
    isOpen: true,
    resolve(rel, opts = {}) {
      const full = path.resolve(root, rel);
      if (opts.allowMissing === false && !fs.existsSync(full)) throw new Error('不存在');
      return full;
    },
    relative(full) { return path.relative(root, full).replace(/\\/g, '/'); },
  };
  const manager = new CompilerManager(settings, () => {});
  await manager.scan();
  const events = [];
  const runner = new Runner({ settings, workspace, compilers: manager, emit: (e) => events.push(e) });

  await fsp.writeFile(path.join(root, 'main.cpp'), '#include <bits/stdc++.h>\nusing namespace std;\nint main(){ long long a,b; cin>>a>>b; cout<<a+b<<"\\n"; }\n');
  const run = await runner.run('main.cpp', { stdin: '2 3\n', timeoutMs: 5000 });
  console.log('C++ compile:', run.build.success, run.build.compiler?.name, run.build.standard, 'fallback', JSON.stringify(run.build.autoFallback));
  console.log('C++ compile tail:', run.build.output?.slice(-400));
  console.log('C++ output:', JSON.stringify(run.run?.stdout), 'exit', run.run?.exitCode, 'ms', run.run?.durationMs);
  if (run.run?.stdout.trim() !== '5') throw new Error('C++ 运行结果不正确');

  const tests = await runner.runTests('main.cpp', {
    cases: [
      { id: 'a', name: 'A', input: '1 2\n', expected: '3\n' },
      { id: 'b', name: 'B', input: '2 2\n', expected: '5\n' },
    ],
    timeoutMs: 4000,
  });
  console.log('Tests:', tests.passed, '/', tests.total, tests.results.map((r) => r.status).join(','));

  const py = manager.resolve('python').compiler;
  if (py) {
    settings.data.mode = 'dev';
    await fsp.writeFile(path.join(root, 'hello.py'), 'name = input()\nprint("hi", name)\n');
    const pyRun = await runner.run('hello.py', { stdin: 'orbit\n', timeoutMs: 5000 });
    console.log('Python:', pyRun.build.success, JSON.stringify(pyRun.run?.stdout), pyRun.run?.exitCode);
  } else {
    console.log('Python: 未检测到');
  }

  await fsp.writeFile(path.join(root, 'bad.cpp'), 'int main() { this is invalid; }\n');
  const bad = await runner.build('bad.cpp');
  console.log('Bad compile:', bad.success, 'diagnostics', bad.diagnostics.length, bad.diagnostics[0]?.message);

  const term = await runner.exec('echo orbit-terminal');
  console.log('Terminal:', term.exitCode, JSON.stringify(term.stdout.trim()));

  console.log('Events:', [...new Set(events.map((e) => e.type))].join(','));
  await fsp.rm(root, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

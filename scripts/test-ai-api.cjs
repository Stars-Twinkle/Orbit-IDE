'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AIServer } = require('../src/main/ai-server.cjs');

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'orbit-ai-test-'));
  await fsp.writeFile(path.join(root, 'main.cpp'), '#include <iostream>\nint main(){return 0;}\n');
  const settingsData = {
    mode: 'oi',
    aiPort: 37931,
    trustedClients: [],
    selectedCompilers: {},
    selectedStandards: {},
  };
  const settings = {
    data: settingsData,
    get(key, fallback) { return this.data[key] === undefined ? fallback : this.data[key]; },
    set(key, value) { this.data[key] = value; },
    patch(patch) { Object.assign(this.data, patch); },
    save() {},
    all() { return this.data; },
  };
  const workspace = {
    root,
    isOpen: true,
    resolve(rel, opts = {}) {
      const target = path.resolve(root, rel);
      if (opts.allowMissing === false && !fs.existsSync(target)) throw new Error('不存在');
      return target;
    },
    relative(target) { return path.relative(root, target).replace(/\\/g, '/'); },
    assertOiPolicy(target) {
      if (settings.data.mode === 'oi' && !/\.(c|cc|cpp|cxx|h|hpp)$/i.test(target)) throw new Error('OI 模式仅支持 C/C++');
    },
    async tree() { return { name: 'test', path: root, children: [{ type: 'file', name: 'main.cpp', path: 'main.cpp', language: 'cpp' }] }; },
    async flatFiles() { return [{ path: 'main.cpp', name: 'main.cpp', language: 'cpp' }]; },
    async read(rel) {
      const target = this.resolve(rel, { allowMissing: false });
      return { path: rel, name: path.basename(target), content: fs.readFileSync(target, 'utf8'), language: 'cpp' };
    },
    async write(rel, content) {
      const target = this.resolve(rel);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content);
      return { path: rel, size: content.length };
    },
    async create(rel, kind, content) { await this.write(rel, content); return { path: rel, type: 'file' }; },
    async mkdir(rel) { await fsp.mkdir(this.resolve(rel), { recursive: true }); return { path: rel, type: 'dir' }; },
    async rename(from, to) { await fsp.rename(this.resolve(from), this.resolve(to)); return { from, to }; },
    async remove(rel) { await fsp.rm(this.resolve(rel), { force: true }); return { path: rel }; },
  };
  const tests = { async read() { return { cases: [] }; }, async write(data) { return data; } };
  const compilers = {
    list() { return [{ id: 'gcc', kind: 'cpp', name: 'GCC' }]; },
    scanningState: { scanning: false },
    resolve() { return { compiler: { id: 'gcc', name: 'GCC' }, standard: { id: 'c++17' } }; },
    byId() { return { id: 'gcc', name: 'GCC', standards: [{ id: 'c++17' }] }; },
    async scan() { return this.list(); },
    select() { return this.resolve(); },
    selectStandard() {},
    async addCustom() { return { id: 'gcc', name: 'GCC' }; },
  };
  const runner = { lastProblems: [], async build() { return { success: true, diagnostics: [] }; }, async run() { return { build: { success: true }, run: { ok: true, stdout: 'ok' } }; }, async runTests() { return { passed: 0, total: 0, results: [] }; }, async exec() { return { stdout: 'ok', exitCode: 0 }; } };
  let rendererHandler = null;
  const bridge = {
    broadcast() {},
    focusWindow() {},
    async call(action, payload) {
      if (action === 'editor.get') return { path: 'main.cpp', name: 'main.cpp', content: 'int main(){}', dirty: false, line: 1, column: 1 };
      if (action === 'editor.isDirty') return { dirty: false };
      if (rendererHandler) return rendererHandler(action, payload);
      return { ok: true };
    },
  };
  const server = new AIServer({
    settings,
    workspace,
    tests,
    compilers,
    runner,
    bridge,
    appVersion: '1.0.0-test',
    onModeChange: async (mode) => { settings.data.mode = mode; return { mode }; },
    onSettingsChange() {},
    onCompilersChanged() {},
  });
  const info = await server.start();
  console.log('server:', info.running, info.endpoint);
  if (!info.running) throw new Error('AI server 未启动');
  const base = info.endpoint;

  const loginResponse = await fetch(`${base}/v1/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientName: 'Test Agent', clientId: 'test-client-1', scopes: ['read', 'write', 'editor', 'run'] }),
  });
  const login = await loginResponse.json();
  console.log('login:', loginResponse.status, login.status, login.requestId?.slice(0, 8));
  if (loginResponse.status !== 202) throw new Error('登录未进入待审批');
  const pending = server.info().pending;
  if (!pending.length) throw new Error('IDE 端没有待审批请求');
  server.respond(login.requestId, true, { remember: true });
  const poll = await (await fetch(`${base}/v1/login/${login.requestId}`)).json();
  console.log('token:', Boolean(poll.token), 'scopes:', poll.scopes?.join(','));
  if (!poll.token) throw new Error('未取得令牌');
  const headers = { authorization: `Bearer ${poll.token}`, 'content-type': 'application/json' };

  const state = await (await fetch(`${base}/v1/state`, { headers })).json();
  console.log('state mode:', state.mode, 'editor:', state.editor?.path);
  const file = await (await fetch(`${base}/v1/file?path=main.cpp`, { headers })).json();
  console.log('file read:', file.file?.path, file.file?.content?.length);
  const write = await fetch(`${base}/v1/file`, { method: 'PUT', headers, body: JSON.stringify({ path: 'main.cpp', content: 'int main(){return 1;}\n' }) });
  console.log('file write:', write.status);
  if (write.status !== 200) throw new Error(`写入失败 ${await write.text()}`);
  const audit = await (await fetch(`${base}/v1/audit`, { headers })).json();
  console.log('audit entries:', audit.audit?.length);
  const ops = await (await fetch(`${base}/v1/operations`, { headers })).json();
  console.log('operations:', ops.operations?.length);

  const readOnlyLogin = await (await fetch(`${base}/v1/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientName: 'Read Only', clientId: 'read-only-1', scopes: ['read'] }),
  })).json();
  server.respond(readOnlyLogin.requestId, true, {});
  const readOnlyPoll = await (await fetch(`${base}/v1/login/${readOnlyLogin.requestId}`)).json();
  const denied = await fetch(`${base}/v1/file`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${readOnlyPoll.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path: 'main.cpp', content: 'bad' }),
  });
  console.log('scope enforcement:', denied.status);
  if (denied.status !== 403) throw new Error('scope 没有生效');

  const trustedLogin = await (await fetch(`${base}/v1/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientName: 'Test Agent', clientId: 'test-client-1', scopes: ['read'] }),
  })).json();
  console.log('trusted auto-login:', trustedLogin.status, Boolean(trustedLogin.token));
  if (trustedLogin.status !== 'approved') throw new Error('受信任客户端未自动登录');

  const docs = await (await fetch(`${base}/v1/docs`)).text();
  console.log('docs bytes:', docs.length);
  await server.stop();
  console.log('PASS');
  await fsp.rm(root, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

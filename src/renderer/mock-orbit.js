/* 娴忚鍣ㄩ瑙堢敤鐨勮交閲?Mock 妗ャ€備粎鍦?Electron preload 涓嶅瓨鍦ㄦ椂鍚敤銆?*/

const listeners = new Map();
let currentMode = 'oi';
let currentSettings = {
  mode: 'oi',
  fontSize: 14,
  tabSize: 4,
  wordWrap: 'off',
  minimap: true,
  autoSave: false,
  fontLigatures: true,
  oiPanelHeight: 340,
  recentWorkspaces: ['C:/Users/Administrator/Documents/OrbitIDE/Playground'],
  trustedClients: [],
};

const cppMain = `// Orbit IDE 路 OI 妯″紡绀轰緥
// 鎸?F5 杩愯锛屾垨鍦ㄤ笅鏂广€屾祴璇曠偣銆嶄腑鎵归噺璇勬祴銆?#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << '\\n';
    }
    return 0;
}
`;

const files = {
  'main.cpp': cppMain,
  'README.md': `# 娆㈣繋浣跨敤 Orbit IDE

- 宸︿笂瑙掑彲浠ュ湪 **OI 妯″紡** 涓?**寮€鍙戞ā寮?* 涔嬮棿闅忔椂鍒囨崲銆?- OI 妯″紡浠呮敮鎸?C/C++锛屽唴缃祴璇曠偣璇勬祴涓庣紪璇戝櫒鏍囧噯鑷姩鍖归厤銆?- 寮€鍙戞ā寮忛澶栨敮鎸?Python銆丣avaScript銆乀ypeScript銆丣ava銆丟o銆丷ust 绛夎瑷€銆?
## 蹇嵎閿?
| 鎿嶄綔 | 蹇嵎閿?|
| --- | --- |
| 淇濆瓨 | Ctrl+S |
| 杩愯 | F5 |
| 鍛戒护闈㈡澘 | Ctrl+Shift+P |
`,
  'examples/hello.py': `def solve() -> None:\n    print("Hello from Orbit")\n\n\nif __name__ == "__main__":\n    solve()\n`,
  'examples/note.json': `{\n  "name": "orbit",\n  "version": "1.0.0"\n}\n`,
};

const tree = {
  name: 'Playground',
  path: 'C:/Users/Administrator/Documents/OrbitIDE/Playground',
  children: [
    {
      type: 'dir',
      name: 'examples',
      path: 'examples',
      children: [
        { type: 'file', name: 'hello.py', path: 'examples/hello.py', language: 'python', languageLabel: 'Python', color: '#facc15', size: 74 },
        { type: 'file', name: 'note.json', path: 'examples/note.json', language: 'json', languageLabel: 'JSON', color: '#fbbf24', size: 45 },
      ],
    },
    { type: 'file', name: 'main.cpp', path: 'main.cpp', language: 'cpp', languageLabel: 'C++', color: '#6ea8fe', size: cppMain.length },
    { type: 'file', name: 'README.md', path: 'README.md', language: 'markdown', languageLabel: 'Markdown', color: '#94a3b8', size: 390, locked: currentMode === 'oi' },
  ],
};

const cppStandards = [
  { id: 'c++98', label: 'C++98', flag: '-std=c++98', level: 1998 },
  { id: 'c++03', label: 'C++03', flag: '-std=c++03', level: 2003 },
  { id: 'c++11', label: 'C++11', flag: '-std=c++11', level: 2011 },
  { id: 'c++14', label: 'C++14', flag: '-std=c++14', level: 2014 },
  { id: 'c++17', label: 'C++17', flag: '-std=c++17', level: 2017 },
  { id: 'c++2a', label: 'C++20锛坈++2a锛?, flag: '-std=c++2a', level: 2020, draft: true },
];

let compilers = [
  {
    id: 'cpp-gcc-8', kind: 'cpp', family: 'gcc', name: 'GCC 8.1.0', toolchain: 'MinGW-w64', vendor: 'GNU', version: '8.1.0',
    target: 'x86_64-w64-mingw32', executable: 'D:\\mingw64\\bin\\g++.exe', standards: cppStandards,
    recommendedStandard: 'c++2a', oiStandard: 'c++17', defaultStandard: 'c++17',
  },
  {
    id: 'c-gcc-8', kind: 'c', family: 'gcc', name: 'GCC 8.1.0', toolchain: 'MinGW-w64', vendor: 'GNU', version: '8.1.0',
    target: 'x86_64-w64-mingw32', executable: 'D:\\mingw64\\bin\\gcc.exe',
    standards: [
      { id: 'c89', label: 'C89', flag: '-std=c89', level: 1989 },
      { id: 'c99', label: 'C99', flag: '-std=c99', level: 1999 },
      { id: 'c11', label: 'C11', flag: '-std=c11', level: 2011 },
      { id: 'c17', label: 'C17', flag: '-std=c17', level: 2017 },
    ],
    recommendedStandard: 'c17', oiStandard: 'c17',
  },
  { id: 'python-315', kind: 'python', family: 'python', name: 'Python 3.15.1', toolchain: 'CPython', vendor: 'Python', version: '3.15.1', executable: 'C:\\Python315\\python.exe', standards: [] },
  { id: 'node-26', kind: 'node', family: 'node', name: 'Node.js 26.8.1', toolchain: 'V8', vendor: 'Node.js', version: '26.8.1', executable: 'C:\\Program Files\\nodejs\\node.exe', standards: [] },
  { id: 'java-18', kind: 'java', family: 'java', name: 'Java 18.0.2', toolchain: 'JDK', vendor: 'Java', version: '18.0.2', executable: 'C:\\Java\\bin\\javac.exe', standards: [] },
];

let selected = {
  cpp: { compilerId: 'cpp-gcc-8', standard: 'c++17' },
  c: { compilerId: 'c-gcc-8', standard: 'c17' },
  python: { compilerId: 'python-315', standard: null },
  javascript: { compilerId: 'node-26', standard: null },
  java: { compilerId: 'java-18', standard: null },
  go: null,
  rust: null,
};

let tests = {
  cases: [
    { id: 'case-1', name: '鏍蜂緥 1', input: '1 2\n', expected: '3\n', enabled: true },
    { id: 'case-2', name: '鏍蜂緥 2', input: '1000000000 2000000000\n', expected: '3000000000\n', enabled: true },
  ],
};

let ai = {
  running: true,
  status: 'running',
  host: '127.0.0.1',
  port: 37821,
  endpoint: 'http://127.0.0.1:37821',
  apiVersion: '1.0',
  appVersion: '1.0.0',
  sessions: [
    {
      id: 'sess-1',
      clientName: 'Claude Code',
      scopes: ['read', 'write', 'editor', 'run'],
      createdAt: Date.now() - 1000 * 60 * 12,
      expiresAt: Date.now() + 1000 * 60 * 60 * 12,
      remoteAddress: '127.0.0.1',
    },
  ],
  pending: [],
  trusted: [],
  scopes: [
    { id: 'read', label: '璇诲彇宸ヤ綔鍖轰笌鐘舵€? },
    { id: 'write', label: '鍒涘缓銆佷慨鏀逛笌鍒犻櫎鏂囦欢' },
    { id: 'editor', label: '鎺у埗缂栬緫鍣ㄥ唴瀹逛笌鍏夋爣' },
    { id: 'run', label: '缂栬瘧骞惰繍琛屼唬鐮? },
    { id: 'terminal', label: '鎵ц缁堢鍛戒护' },
    { id: 'mode', label: '鍒囨崲 OI / 寮€鍙戞ā寮? },
    { id: 'compilers', label: '鎵弿涓庨€夋嫨缂栬瘧鍣? },
    { id: 'settings', label: '淇敼 IDE 璁剧疆' },
    { id: 'ui', label: '鎺у埗 IDE 鐣岄潰涓庨€氱煡' },
  ],
};

const audit = [
  { at: Date.now() - 1000 * 42, kind: 'api', clientName: 'Claude Code', summary: '宸茶鍙栧伐浣滃尯鏂囦欢鏍?, status: 200 },
  { at: Date.now() - 1000 * 96, kind: 'api', clientName: 'Claude Code', summary: '宸叉墦寮€ main.cpp', status: 200 },
  { at: Date.now() - 1000 * 60 * 4, kind: 'api', clientName: 'Claude Code', summary: '缂栬瘧鎴愬姛锛岀敤鏃?342 ms', status: 200 },
  { at: Date.now() - 1000 * 60 * 12, kind: 'login', clientName: 'Claude Code', summary: 'AI 鐧诲綍宸叉壒鍑?, status: 'approved' },
];

function emit(channel, payload) {
  for (const callback of listeners.get(channel) || []) callback(payload);
}

function addListener(channel, callback) {
  if (!listeners.has(channel)) listeners.set(channel, []);
  listeners.get(channel).push(callback);
  return () => {
    const list = listeners.get(channel) || [];
    const index = list.indexOf(callback);
    if (index >= 0) list.splice(index, 1);
  };
}

function refreshTreeLocks() {
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.type === 'file') {
        const ext = node.name.slice(node.name.lastIndexOf('.')).toLowerCase();
        node.locked = currentMode === 'oi' && !['.cpp', '.cc', '.cxx', '.c++', '.c', '.h', '.hpp', '.hh', '.hxx'].includes(ext);
      } else walk(node.children);
    }
  };
  walk(tree.children);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invoke(channel, ...args) {
  const arg = args[0];
  switch (channel) {
    case 'app:init':
      return {
        workspace: { name: 'Playground', path: tree.path },
        tree,
        initialFile: 'main.cpp',
        appVersion: '1.0.0',
        platform: 'win32',
        isDev: true,
        settings: currentSettings,
        compilers,
        compilerState: { scanning: false, lastScanAt: Date.now() - 60000, error: null },
        selected,
        ai,
        docs: null,
        paths: { userData: 'C:/Users/Administrator/AppData/Roaming/Orbit IDE', home: 'C:/Users/Administrator', documents: 'C:/Users/Administrator/Documents' },
      };
    case 'window:state':
      return { maximized: false };
    case 'window:minimize':
    case 'window:toggleMaximize':
    case 'window:close':
    case 'window:forceClose':
    case 'app:openUserData':
    case 'app:openExternal':
    case 'workspace:reveal':
    case 'editor:pushState':
    case 'editor:pushProblems':
      return true;
    case 'file:read': {
      const path = String(arg).replace(/\\/g, '/');
      if (!(path in files)) throw new Error('鏂囦欢涓嶅瓨鍦?);
      const language = path.endsWith('.py') ? 'python' : path.endsWith('.md') ? 'markdown' : path.endsWith('.json') ? 'json' : path.endsWith('.c') ? 'c' : 'cpp';
      return { path, name: path.split('/').pop(), content: files[path], language, languageLabel: language, size: files[path].length, mtime: Date.now(), locked: false };
    }
    case 'file:write': {
      const path = String(arg?.path || '').replace(/\\/g, '/');
      files[path] = String(arg?.content ?? '');
      return { path, size: files[path].length, mtime: Date.now() };
    }
    case 'file:create': {
      const path = String(arg?.path || '').replace(/\\/g, '/');
      files[path] = String(arg?.content ?? '');
      return { path, type: 'file' };
    }
    case 'file:mkdir':
      return { path: arg, type: 'dir' };
    case 'file:rename': {
      const from = String(arg?.from || '').replace(/\\/g, '/');
      const to = String(arg?.to || '').replace(/\\/g, '/');
      files[to] = files[from] || '';
      delete files[from];
      emit('workspace:renamed', { from, to });
      return { from, to };
    }
    case 'file:delete': {
      const path = String(arg || '').replace(/\\/g, '/');
      delete files[path];
      emit('workspace:removed', { path });
      return { path, type: 'file' };
    }
    case 'file:template':
      return '';
    case 'workspace:tree':
      return tree;
    case 'workspace:files':
      return Object.keys(files).map((path) => ({ path, name: path.split('/').pop(), language: path.endsWith('.py') ? 'python' : 'cpp' }));
    case 'workspace:choose':
      return null;
    case 'workspace:setActiveFile':
      return true;
    case 'mode:get':
      return currentMode;
    case 'mode:set': {
      const next = String(arg);
      if (next === currentMode) return { mode: next, closedTabs: [] };
      currentMode = next;
      currentSettings.mode = next;
      refreshTreeLocks();
      emit('mode:changed', { mode: next, source: 'user' });
      return { mode: next, closedTabs: [] };
    }
    case 'compilers:list':
      return { compilers, state: { scanning: false }, selected };
    case 'compilers:scan':
      await delay(900);
      return { compilers, state: { scanning: false }, selected };
    case 'compilers:select': {
      const language = arg?.language;
      const compiler = compilers.find((item) => item.id === arg?.compilerId);
      if (!compiler) throw new Error('缂栬瘧鍣ㄤ笉瀛樺湪');
      selected[language] = {
        compilerId: compiler.id,
        standard: compiler.standards?.length ? compiler.recommendedStandard : null,
      };
      emit('compilers:changed', { compilers, selected });
      return { compiler, standard: compiler.standards?.[0] || null, selected };
    }
    case 'compilers:standard': {
      const compiler = compilers.find((item) => item.id === arg?.compilerId);
      const language = compiler?.kind === 'cpp' ? 'cpp' : 'c';
      if (selected[language]) selected[language].standard = arg?.standard;
      emit('compilers:changed', { compilers, selected });
      return selected;
    }
    case 'compilers:browse':
    case 'compilers:add':
      return null;
    case 'tests:read':
      return tests;
    case 'tests:write':
      tests = { cases: arg?.cases || [] };
      return tests;
    case 'tests:run': {
      await delay(750);
      stateResults = tests.cases.map((item, index) => ({
        id: item.id,
        name: item.name,
        status: index === 0 ? 'passed' : index === 2 ? 'wrong-answer' : 'passed',
        passed: index !== 2,
        expected: item.expected,
        actual: index === 2 ? '0\n' : item.expected,
        stderr: '',
        timeMs: 18 + index * 6,
        exitCode: 0,
        timedOut: false,
      }));
      return {
        build: { success: true, output: '', diagnostics: [], compiler: { name: 'GCC 8.1.0' }, standard: 'c++17', durationMs: 342 },
        results: stateResults,
        passed: stateResults.filter((item) => item.passed).length,
        total: stateResults.length,
        allPassed: false,
      };
    }
    case 'run:build':
      await delay(650);
      emit('run:event', { type: 'build-output', text: '' });
      return { success: true, durationMs: 342, compiler: { name: 'GCC 8.1.0' }, standard: 'c++17', diagnostics: [], output: '', commandLine: 'g++ main.cpp -std=c++17 -O2 -o main.exe' };
    case 'run:start': {
      const runId = 'run-demo';
      setTimeout(() => {
        emit('run:event', { type: 'run-started', runId, build: { compiler: { name: 'GCC 8.1.0' }, standard: 'c++17', commandLine: 'g++ main.cpp -std=c++17 -O2 -o main.exe' } });
      }, 320);
      setTimeout(() => emit('run:event', { type: 'run-output', runId, stream: 'stdout', data: '3\n' }), 760);
      setTimeout(() => emit('run:event', { type: 'run-exit', run: { runId, ok: true, exitCode: 0, stdout: '3\n', stderr: '', output: '3\n', timedOut: false, durationMs: 24, truncated: false } }), 1100);
      await delay(300);
      return { build: { success: true, diagnostics: [], compiler: { name: 'GCC 8.1.0' }, standard: 'c++17' }, runId };
    }
    case 'run:input':
      return true;
    case 'run:stop':
      emit('run:event', { type: 'run-exit', run: { runId: arg, ok: false, exitCode: 1, stdout: '', stderr: '', output: '', timedOut: false, durationMs: 500 } });
      return true;
    case 'run:command':
      return { build: { success: true }, run: { ok: true, stdout: '3\n', stderr: '', exitCode: 0, durationMs: 20 } };
    case 'terminal:exec':
      await delay(300);
      return { command: arg?.command, cwd: tree.path, stdout: `Orbit terminal mock\n> ${arg?.command}\n`, stderr: '', exitCode: 0, durationMs: 24, timedOut: false, ok: true };
    case 'settings:get':
      return currentSettings;
    case 'settings:patch':
      currentSettings = { ...currentSettings, ...arg };
      emit('settings:changed', currentSettings);
      return currentSettings;
    case 'ai:status':
      return ai;
    case 'ai:audit':
      return { audit, sessions: ai.sessions, trusted: ai.trusted };
    case 'ai:respond': {
      const request = ai.pending.find((item) => item.requestId === arg?.requestId);
      if (request) {
        request.status = arg?.approved ? 'approved' : 'denied';
        if (arg?.approved) {
          ai.sessions.push({ id: `sess-${Date.now()}`, clientName: request.clientName, scopes: request.scopes, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
          audit.unshift({ at: Date.now(), kind: 'login', clientName: request.clientName, summary: 'AI 鐧诲綍宸叉壒鍑?, status: 'approved' });
        }
        ai.pending = ai.pending.filter((item) => item.requestId !== arg.requestId);
        emit('ai:status', ai);
        emit('ai:login-resolved', { requestId: arg.requestId, status: arg?.approved ? 'approved' : 'denied' });
      }
      return { ok: true };
    }
    case 'ai:revoke': {
      ai.sessions = ai.sessions.filter((item) => item.id !== arg);
      emit('ai:status', ai);
      return true;
    }
    case 'ai:revokeTrusted':
      return true;
    case 'ai:openDocs':
    case 'ai:copyEndpoint':
      return true;
    case 'app:version':
      return '1.0.0';
    case 'app:notify':
    case 'app:command':
      return true;
    default:
      console.warn('[mock] 鏈疄鐜?IPC:', channel, arg);
      return null;
  }
}

let stateResults = [];

window.orbit = {
  invoke,
  on: addListener,
  onRendererCall(handler) {
    window.__rendererHandler = handler;
  },
  platform: 'win32',
  versions: { electron: '33.4.11', chrome: '130.0.0', node: '20.18.0' },
};

window.__orbitMock = {
  triggerLogin() {
    const request = {
      requestId: 'req-demo',
      clientName: 'Cursor Agent',
      clientId: 'cursor-demo',
      scopes: ['read', 'write', 'editor', 'run'],
      remoteAddress: '127.0.0.1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 120000,
      status: 'pending',
    };
    ai.pending.push(request);
    emit('ai:status', ai);
    emit('ai:login-request', request);
  },
  openAI() {
    document.querySelector('#aiPill')?.click();
  },
  setDev() {
    document.querySelector('.mode-btn[data-mode="dev"]')?.click();
  },
  setOI() {
    document.querySelector('.mode-btn[data-mode="oi"]')?.click();
  },
  openCompilerView() {
    document.querySelector('.activity-btn[data-activity="compilers"]')?.click();
  },
  openSettings() {
    document.querySelector('.activity-btn[data-activity="settings"]')?.click();
  },
  openProblems() {
    document.querySelector('.panel-tab[data-panel="problems"]')?.click();
  },
  openTerminal() {
    document.querySelector('.panel-tab[data-panel="terminal"]')?.click();
  },
  run() {
    document.querySelector('#btn-run')?.click();
  },
  getState() {
    return { mode: currentMode, tests, selected, ai };
  },
};

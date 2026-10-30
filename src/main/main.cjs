'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { SettingsStore } = require('./settings.cjs');
const { WorkspaceService, TestStore } = require('./workspace.cjs');
const { CompilerManager } = require('./compilers.cjs');
const { Runner } = require('./runner.cjs');
const { AIServer } = require('./ai-server.cjs');
const { newFileTemplate, isOiAllowed } = require('./languages.cjs');
const { collectCompletionWords } = require('./headers.cjs');
const APP_VERSION = app.getVersion();
const DEV_URL = process.env.VITE_DEV_SERVER_URL || '';
const isDev = Boolean(DEV_URL);

// 部分 Windows 显卡驱动会在 Chromium 初始化 GPU 进程时直接崩溃（0xc0000005）。
// Orbit 是文本 IDE，关闭硬件加速不会影响日常使用，却能显著提高启动兼容性。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-sandbox');

app.setName('Orbit IDE');
app.setAppUserModelId('com.orbitlabs.ide');
Menu.setApplicationMenu(null);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let settings = null;
let workspace = null;
let tests = null;
let compilers = null;
let runner = null;
let aiServer = null;
let isQuitting = false;
let allowClose = false;

const pendingCalls = new Map();
const appState = {
  editor: null,
  problems: [],
  lastActivePath: null,
};

function startupLog(message) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'startup.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8'
    );
  } catch {
    // 日志失败不影响主流程。
  }
}

let workspaceWatcher = null;
let workspaceWatchTimer = null;

function stopWorkspaceWatcher() {
  if (workspaceWatcher) {
    try {
      workspaceWatcher.close();
    } catch {
      // 已关闭。
    }
    workspaceWatcher = null;
  }
  clearTimeout(workspaceWatchTimer);
  workspaceWatchTimer = null;
}

function startWorkspaceWatcher() {
  stopWorkspaceWatcher();
  if (!workspace?.isOpen) return;
  const root = workspace.root;
  try {
    workspaceWatcher = fs.watch(root, { recursive: true, persistent: false }, (eventType, filename) => {
      const name = String(filename || '').replace(/\\/g, '/');
      if (!name) return;
      if (/(^|\/)(\.git|node_modules|\.orbit|\.chrome-.*|dist|release)(\/|$)/i.test(name)) return;
      if (eventType === 'change') {
        broadcast('workspace:file-changed', { path: name, source: 'watch' });
      }
      clearTimeout(workspaceWatchTimer);
      workspaceWatchTimer = setTimeout(() => {
        workspaceWatchTimer = null;
        broadcast('workspace:refresh', { source: 'watch', path: name });
      }, 220);
    });
    workspaceWatcher.on('error', (error) => {
      startupLog(`workspace watcher error: ${error?.message || error}`);
      stopWorkspaceWatcher();
      setTimeout(() => startWorkspaceWatcher(), 800);
    });
    startupLog(`workspace watcher started root=${root}`);
  } catch (error) {
    startupLog(`workspace watcher failed: ${error?.message || error}`);
  }
}

function broadcast(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function callRenderer(action, payload = {}, timeout = 15_000) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.reject(new Error('界面尚未就绪'));
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`界面操作超时：${action}`));
    }, timeout);
    pendingCalls.set(id, { resolve, reject, timer, action });
    mainWindow.webContents.send('app:call', { id, action, payload });
  });
}

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.flashFrame(true);
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
  }, 3000);
}

function serializeSettings() {
  return {
    mode: settings.get('mode'),
    fontSize: settings.get('fontSize'),
    tabSize: settings.get('tabSize'),
    wordWrap: settings.get('wordWrap'),
    minimap: settings.get('minimap'),
    autoSave: settings.get('autoSave'),
    theme: settings.get('theme'),
    fontLigatures: settings.get('fontLigatures'),
    autoComplete: settings.get('autoComplete'),
    o2Optimization: settings.get('o2Optimization'),
    aiActivityEnabled: settings.get('aiActivityEnabled'),
    aiActivityAutoOpen: settings.get('aiActivityAutoOpen'),
    aiAutoSwitch: settings.get('aiAutoSwitch'),
    aiDiffFlash: settings.get('aiDiffFlash'),
    aiDiffFlashDuration: settings.get('aiDiffFlashDuration'),
    compilerScanDirs: settings.get('compilerScanDirs'),
    aiPort: settings.get('aiPort'),
    oiPanelHeight: settings.get('oiPanelHeight'),
    recentWorkspaces: settings.get('recentWorkspaces'),
    trustedClients: settings.get('trustedClients'),
  };
}

async function applyMode(mode, { source = 'user' } = {}) {
  if (mode !== 'oi' && mode !== 'dev') throw new Error('无效模式');
  if (settings.get('mode') === mode) {
    return { mode, closedTabs: [], unchanged: true };
  }
  let result = { closedTabs: [] };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      result = (await callRenderer('mode.apply', { mode, source }, 60_000)) || result;
    } catch (error) {
      console.warn('[mode] 界面准备失败', error.message);
      throw error;
    }
  }
  if (result.cancelled) return { mode: settings.get('mode'), closedTabs: [], cancelled: true };
  settings.set('mode', mode);
  broadcast('mode:changed', { mode, source });
  broadcast('workspace:refresh', {});
  writeEndpointInfo();
  return { mode, closedTabs: result.closedTabs || [] };
}

function findFirstCppFile(node) {
  if (!node) return null;
  for (const child of node.children || []) {
    if (child.type === 'file' && isOiAllowed(child.name)) return child.path;
  }
  const recursive = (nodes) => {
    for (const child of nodes || []) {
      if (child.type === 'file' && isOiAllowed(child.name)) return child.path;
      if (child.type === 'dir') {
        const hit = recursive(child.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return recursive(node.children);
}

function writeEndpointInfo(status = 'running') {
  try {
    if (!aiServer) return;
    const info = aiServer.info();
    const payload = {
      app: 'Orbit IDE',
      version: APP_VERSION,
      apiVersion: info.apiVersion,
      status,
      running: status === 'running' && info.running,
      endpoint: info.endpoint,
      port: info.port,
      pid: process.pid,
      mode: settings?.get('mode') || 'oi',
      workspace: workspace?.isOpen ? workspace.root : null,
      login: info.endpoint ? `${info.endpoint}/v1/login` : null,
      docs: info.endpoint ? `${info.endpoint}/v1/docs` : null,
      startedAt: info.startedAt,
      updatedAt: Date.now(),
    };
    const body = JSON.stringify(payload, null, 2);
    const targets = [path.join(app.getPath('userData'), 'ai-endpoint.json')];
    if (workspace?.isOpen) targets.push(path.join(workspace.root, '.orbit', 'ai-endpoint.json'));
    for (const target of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body, 'utf8');
    }
  } catch (error) {
    console.warn('[ai] 写入 endpoint 信息失败', error.message);
  }
}

async function initialFileForWorkspace() {
  if (!workspace.isOpen) return null;
  const last = settings.get('lastOpenFile');
  if (last) {
    try {
      const target = workspace.resolve(last, { allowMissing: false });
      if (fs.statSync(target).isFile()) {
        if (settings.get('mode') !== 'oi' || isOiAllowed(target)) return workspace.relative(target);
      }
    } catch {
      // 忽略失效路径。
    }
  }
  const tree = await workspace.tree();
  return findFirstCppFile(tree);
}

async function workspacePayload() {
  if (!workspace.isOpen) return { workspace: null, tree: null, initialFile: null };
  return {
    workspace: { name: path.basename(workspace.root), path: workspace.root },
    tree: await workspace.tree(),
    initialFile: await initialFileForWorkspace(),
  };
}

async function ensurePlayground() {
  const base = path.join(app.getPath('documents'), 'OrbitIDE', 'Playground');
  await fsp.mkdir(base, { recursive: true });
  const mainFile = path.join(base, 'main.cpp');
  if (!fs.existsSync(mainFile)) {
    await fsp.writeFile(
      mainFile,
      `// Orbit IDE · OI 模式示例\n// 按 F5 运行，或在下方「测试点」中批量评测。\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long a, b;\n    if (cin >> a >> b) {\n        cout << a + b << '\\n';\n    }\n    return 0;\n}\n`,
      'utf8'
    );
  }
  const readme = path.join(base, 'README.md');
  if (!fs.existsSync(readme)) {
    await fsp.writeFile(
      readme,
      `# 欢迎使用 Orbit IDE\n\n- 左上角可以在 **OI 模式** 与 **开发模式** 之间随时切换。\n- OI 模式仅支持 C/C++，内置测试点评测与编译器标准自动匹配。\n- 开发模式额外支持 Python、JavaScript、TypeScript、Java、Go、Rust 等语言。\n- 按 \`F5\` 运行，\`Ctrl+Shift+B\` 编译，\`Ctrl+Shift+P\` 打开命令面板。\n- 侧边栏「AI 接入」可以查看本地 API 地址，并批准外部 AI 客户端的操作请求。\n\n## 快捷键\n\n| 操作 | 快捷键 |\n| --- | --- |\n| 保存 | Ctrl+S |\n| 运行 | F5 |\n| 编译 | Ctrl+Shift+B |\n| 命令面板 | Ctrl+Shift+P |\n| 快速打开 | Ctrl+P |\n| 新建文件 | Ctrl+N |\n| 关闭标签 | Ctrl+W |\n| 终端 | Ctrl+\` |\n`,
      'utf8'
    );
  }
  const orbitDir = path.join(base, '.orbit');
  const testsFile = path.join(orbitDir, 'tests.json');
  if (!fs.existsSync(testsFile)) {
    await fsp.mkdir(orbitDir, { recursive: true });
    await fsp.writeFile(
      testsFile,
      JSON.stringify(
        {
          version: 1,
          cases: [],
        },
        null,
        2
      ),
      'utf8'
    );
  }
  return base;
}

async function initializeWorkspace() {
  let root = settings.get('workspace');
  if (root) {
    try {
      const stat = fs.statSync(root);
      if (!stat.isDirectory()) root = null;
    } catch {
      root = null;
    }
  }
  if (!root) root = await ensurePlayground();
  try {
    await workspace.open(root);
  } catch {
    root = await ensurePlayground();
    await workspace.open(root);
  }
  startWorkspaceWatcher();
}

function registerAppProtocol() {
  const distDir = path.join(__dirname, '..', '..', 'dist');
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.map': 'application/json; charset=utf-8',
  };
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (!pathname || pathname === '/') pathname = '/index.html';
      const target = path.resolve(distDir, `.${pathname}`);
      const distLower = distDir.toLowerCase();
      if (!target.toLowerCase().startsWith(distLower + path.sep) && target.toLowerCase() !== distLower) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fsp.readFile(target);
      const ext = path.extname(target).toLowerCase();
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime[ext] || 'application/octet-stream',
          'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function createWindow() {
  const saved = settings.get('windowBounds', null) || {};
  const width = Math.min(Math.max(Number(saved.width) || 1440, 1120), 2560);
  const height = Math.min(Math.max(Number(saved.height) || 900, 700), 1600);
  const win = new BrowserWindow({
    width,
    height,
    x: Number.isInteger(saved.x) ? saved.x : undefined,
    y: Number.isInteger(saved.y) ? saved.y : undefined,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0a0e14',
    title: 'Orbit IDE',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      devTools: true,
    },
  });
  mainWindow = win;
  startupLog(`createWindow url=${isDev ? DEV_URL : 'app://orbit/index.html'}`);
  if (isDev) {
    win.loadURL(DEV_URL);
    if (process.env.ORBIT_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL('app://orbit/index.html');
  }
  win.webContents.on('did-finish-load', () => startupLog('renderer did-finish-load'));
  win.webContents.on('did-fail-load', (event, code, description, url) => {
    startupLog(`renderer did-fail-load code=${code} desc=${description} url=${url}`);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    startupLog(`renderer gone reason=${details?.reason} exitCode=${details?.exitCode}`);
  });
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) startupLog(`renderer console[${level}] ${message} (${sourceId}:${line})`);
  });
  // 即使渲染层加载失败，也保证窗口可见，避免用户看到“什么都没发生”。
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      startupLog('renderer not ready; forcing window visible');
      win.show();
    }
  }, 4000);
  win.once('ready-to-show', () => {
    win.show();
    if (process.env.ORBIT_CAPTURE) {
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          await fsp.writeFile(process.env.ORBIT_CAPTURE, image.toPNG());
          console.log('[capture] 截图已保存', process.env.ORBIT_CAPTURE);
        } catch (error) {
          console.error('[capture] 截图失败', error);
        }
      }, Number(process.env.ORBIT_CAPTURE_DELAY || 4500));
    }
  });
  win.on('resize', saveBoundsDebounced);
  win.on('move', saveBoundsDebounced);
  win.on('maximize', () => broadcast('window:state', { maximized: true }));
  win.on('unmaximize', () => broadcast('window:state', { maximized: false }));
  win.on('close', (event) => {
    if (allowClose || isQuitting) return;
    event.preventDefault();
    callRenderer('app.confirmClose', {}, 120_000)
      .then((canClose) => {
        if (canClose) {
          allowClose = true;
          win.close();
        }
      })
      .catch(() => {
        allowClose = true;
        win.close();
      });
  });
  win.on('closed', () => {
    mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith(DEV_URL)) return;
    if (url.startsWith('app://orbit/')) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
  });
  win.webContents.on('did-finish-load', () => {
    broadcast('app:ready', {});
  });
  return win;
}

let boundsTimer = null;
function saveBoundsDebounced() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    const bounds = mainWindow.getBounds();
    settings.set('windowBounds', bounds);
  }, 400);
}

function registerIpc() {
  ipcMain.on('app:call-result', (event, message) => {
    const pending = pendingCalls.get(message?.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCalls.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || '界面操作失败'));
  });

  ipcMain.handle('app:init', async () => {
    const payload = await workspacePayload();
    return {
      ...payload,
      appVersion: APP_VERSION,
      platform: process.platform,
      isDev,
      settings: serializeSettings(),
      compilers: compilers.list(),
      compilerState: compilers.scanningState,
      selected: allResolved(),
      ai: aiServer.info(),
      endpointInfo: path.join(app.getPath('userData'), 'ai-endpoint.json'),
      docs: null,
      paths: {
        userData: app.getPath('userData'),
        home: app.getPath('home'),
        documents: app.getPath('documents'),
      },
    };
  });

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('window:forceClose', () => {
    allowClose = true;
    mainWindow?.close();
  });
  ipcMain.handle('window:state', () => ({ maximized: Boolean(mainWindow?.isMaximized()) }));

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('workspace:open', async (event, rootPath) => {
    const opened = await workspace.open(rootPath);
    startWorkspaceWatcher();
    settings.set('lastOpenFile', null);
    writeEndpointInfo();
    broadcast('workspace:changed', { ...(await workspacePayload()), root: opened.root });
    return workspacePayload();
  });

  ipcMain.handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await workspace.open(result.filePaths[0]);
    startWorkspaceWatcher();
    settings.set('lastOpenFile', null);
    writeEndpointInfo();
    const payload = await workspacePayload();
    broadcast('workspace:changed', payload);
    return payload;
  });

  ipcMain.handle('workspace:tree', async () => workspace.tree());
  ipcMain.handle('workspace:files', async () => workspace.flatFiles());
  ipcMain.handle('workspace:reveal', async (event, relPath) => {
    const target = workspace.resolve(relPath, { allowMissing: false });
    shell.showItemInFolder(target);
  });
  ipcMain.handle('workspace:setActiveFile', async (event, relPath) => {
    if (relPath) settings.set('lastOpenFile', relPath);
  });

  ipcMain.handle('file:read', async (event, relPath) => workspace.read(relPath));
  ipcMain.handle('file:write', async (event, { path: relPath, content }) => {
    const result = await workspace.write(relPath, content);
    return result;
  });
  ipcMain.handle('file:create', async (event, { path: relPath, kind, content }) => {
    const result = await workspace.create(relPath, kind, content ?? '');
    broadcast('workspace:refresh', {});
    return result;
  });
  ipcMain.handle('file:mkdir', async (event, relPath) => {
    const result = await workspace.mkdir(relPath);
    broadcast('workspace:refresh', {});
    return result;
  });
  ipcMain.handle('file:rename', async (event, { from, to }) => {
    const result = await workspace.rename(from, to);
    broadcast('workspace:refresh', {});
    return result;
  });
  ipcMain.handle('file:delete', async (event, relPath) => {
    const result = await workspace.remove(relPath);
    broadcast('workspace:refresh', {});
    return result;
  });
  ipcMain.handle('file:template', async (event, languageId) => newFileTemplate(languageId));

  ipcMain.handle('mode:get', () => settings.get('mode'));
  ipcMain.handle('mode:set', async (event, mode) => applyMode(mode, { source: 'user' }));

  ipcMain.handle('compilers:list', () => ({
    compilers: compilers.list(),
    state: compilers.scanningState,
    selected: {
      cpp: pickResolved('cpp'),
      c: pickResolved('c'),
      python: pickResolved('python'),
      javascript: pickResolved('javascript'),
      java: pickResolved('java'),
      go: pickResolved('go'),
      rust: pickResolved('rust'),
    },
  }));
  ipcMain.handle('compilers:scan', async (event, options = {}) => {
    const list = await compilers.scan({ force: Boolean(options.force) });
    return { compilers: list, state: compilers.scanningState, selected: allResolved() };
  });
  ipcMain.handle('compilers:chooseScanDirs', async () => {
    const existing = settings.get('compilerScanDirs', []) || [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择编译器扫描目录',
      buttonLabel: '添加目录',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return existing;
    const merged = [...new Set([...existing, ...result.filePaths.map((item) => path.resolve(item))])];
    settings.set('compilerScanDirs', merged);
    return merged;
  });
  ipcMain.handle('compilers:select', async (event, { language, compilerId }) => {
    const resolved = compilers.select(language, compilerId);
    broadcast('compilers:changed', { selected: allResolved(), compilers: compilers.list() });
    return { compiler: resolved.compiler, standard: resolved.standard, selected: allResolved() };
  });
  ipcMain.handle('compilers:standard', async (event, { compilerId, standard }) => {
    compilers.selectStandard(compilerId, standard);
    broadcast('compilers:changed', { selected: allResolved(), compilers: compilers.list() });
    return allResolved();
  });
  ipcMain.handle('compilers:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择编译器或解释器可执行文件',
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const compiler = await compilers.addCustom(result.filePaths[0]);
    broadcast('compilers:changed', { compilers: compilers.list(), selected: allResolved() });
    return { compiler, compilers: compilers.list(), selected: allResolved() };
  });
  ipcMain.handle('compilers:add', async (event, executablePath) => {
    const compiler = await compilers.addCustom(executablePath);
    broadcast('compilers:changed', { compilers: compilers.list(), selected: allResolved() });
    return { compiler, compilers: compilers.list(), selected: allResolved() };
  });

  ipcMain.handle('run:build', async (event, options = {}) => {
    const target = options.path || appState.editor?.path;
    if (!target) throw new Error('没有可编译的文件');
    const build = await runner.build(target, options);
    broadcast('run:problems', { problems: build.diagnostics || [] });
    return build;
  });
  ipcMain.handle('run:start', async (event, options = {}) => {
    const target = options.path || appState.editor?.path;
    if (!target) throw new Error('没有可运行的文件');
    const result = await runner.runInteractive(target, {
      timeoutMs: options.timeoutMs,
      compilerId: options.compilerId,
      standard: options.standard,
    });
    return { build: result.build, runId: result.runId || null, error: result.error || null };
  });
  ipcMain.handle('run:input', (event, { runId, data }) => runner.writeStdin(runId, data));
  ipcMain.handle('run:stop', (event, runId) => runner.stop(runId));
  ipcMain.handle('run:command', async (event, { path: target, stdin, timeoutMs }) => {
    return runner.run(target, { stdin, timeoutMs });
  });

  ipcMain.handle('terminal:exec', async (event, { command, cwd, timeoutMs }) => runner.exec(command, { cwd, timeoutMs }));

  ipcMain.handle('tests:read', async () => tests.read());
  ipcMain.handle('completion:words', async (event, options = {}) => {
    const resolved = compilers.resolve('cpp');
    const executable = resolved.compiler?.executable;
    startupLog(`completion scan compiler=${executable || 'none'}`);
    return collectCompletionWords({
      executable,
      userData: app.getPath('userData'),
      force: Boolean(options.force),
    });
  });
  ipcMain.handle('tests:write', async (event, data) => {
    const stored = await tests.write(data);
    broadcast('tests:changed', stored);
    return stored;
  });
  ipcMain.handle('tests:run', async (event, options = {}) => {
    const target = options.path || appState.editor?.path;
    if (!target) throw new Error('没有可评测的文件');
    const result = await runner.runTests(target, { ...options, testStore: tests });
    broadcast('tests:results', result);
    if (result.build?.diagnostics) broadcast('run:problems', { problems: result.build.diagnostics });
    return result;
  });

  ipcMain.handle('settings:get', () => serializeSettings());
  ipcMain.handle('settings:patch', async (event, patch) => {
    const allowed = ['fontSize', 'tabSize', 'wordWrap', 'minimap', 'autoSave', 'theme', 'fontLigatures', 'autoComplete', 'o2Optimization', 'aiActivityEnabled', 'aiActivityAutoOpen', 'aiAutoSwitch', 'aiDiffFlash', 'aiDiffFlashDuration', 'oiPanelHeight'];
    const clean = {};
    for (const key of allowed) if (key in patch) clean[key] = patch[key];
    if ('fontSize' in clean) clean.fontSize = Math.max(10, Math.min(32, Number(clean.fontSize) || 14));
    if ('tabSize' in clean) clean.tabSize = Math.max(1, Math.min(8, Number(clean.tabSize) || 4));
    if ('wordWrap' in clean) clean.wordWrap = ['on', 'off', 'bounded'].includes(clean.wordWrap) ? clean.wordWrap : 'off';
    if ('minimap' in clean) clean.minimap = Boolean(clean.minimap);
    if ('autoSave' in clean) clean.autoSave = Boolean(clean.autoSave);
    if ('theme' in clean) clean.theme = ['dark', 'light', 'system'].includes(clean.theme) ? clean.theme : 'dark';
    if ('fontLigatures' in clean) clean.fontLigatures = Boolean(clean.fontLigatures);
    if ('autoComplete' in clean) clean.autoComplete = Boolean(clean.autoComplete);
    if ('o2Optimization' in clean) clean.o2Optimization = Boolean(clean.o2Optimization);
    if ('aiActivityEnabled' in clean) clean.aiActivityEnabled = Boolean(clean.aiActivityEnabled);
    if ('aiActivityAutoOpen' in clean) clean.aiActivityAutoOpen = Boolean(clean.aiActivityAutoOpen);
    if ('aiAutoSwitch' in clean) clean.aiAutoSwitch = Boolean(clean.aiAutoSwitch);
    if ('aiDiffFlash' in clean) clean.aiDiffFlash = Boolean(clean.aiDiffFlash);
    if ('aiDiffFlashDuration' in clean) clean.aiDiffFlashDuration = Math.max(300, Math.min(3000, Number(clean.aiDiffFlashDuration) || 900));
    if ('oiPanelHeight' in clean) clean.oiPanelHeight = Math.max(140, Math.min(600, Number(clean.oiPanelHeight) || 260));
    settings.patch(clean);
    broadcast('settings:changed', serializeSettings());
    return serializeSettings();
  });

  ipcMain.handle('ai:status', () => aiServer.info());
  ipcMain.handle('ai:audit', () => ({
    audit: aiServer.audit.slice(-100).reverse(),
    sessions: aiServer.publicSessions(),
    trusted: (settings.get('trustedClients', []) || []).map(({ id, clientName, clientId, scopes, approvedAt }) => ({
      id,
      clientName,
      clientId,
      scopes,
      approvedAt,
    })),
  }));
  ipcMain.handle('ai:respond', (event, { requestId, approved, remember }) => aiServer.respond(requestId, approved, { remember }));
  ipcMain.handle('ai:revoke', (event, sessionId) => aiServer.revoke(sessionId));
  ipcMain.handle('ai:revokeTrusted', (event, id) => aiServer.revokeTrusted(id));
  ipcMain.handle('ai:openDocs', async () => {
    const info = aiServer.info();
    if (info.endpoint) await shell.openExternal(`${info.endpoint}/v1/docs`);
  });
  ipcMain.handle('ai:copyEndpoint', () => aiServer.info().endpoint);

  ipcMain.handle('editor:pushState', (event, state) => {
    appState.editor = state;
    if (state?.path) appState.lastActivePath = state.path;
  });
  ipcMain.handle('editor:pushProblems', (event, problems) => {
    appState.problems = Array.isArray(problems) ? problems : [];
    runner.lastProblems = appState.problems;
  });

  ipcMain.handle('app:notify', (event, payload) => broadcast('app:notify', payload));
  ipcMain.handle('app:command', (event, command) => broadcast('app:command', command));
  ipcMain.handle('app:openExternal', async (event, url) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('app:openUserData', async () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:version', () => APP_VERSION);
}

function pickResolved(language) {
  const resolved = compilers.resolve(language);
  return resolved.compiler
    ? { compilerId: resolved.compiler.id, standard: resolved.standard?.id || null }
    : null;
}

function allResolved() {
  const result = {};
  for (const language of ['cpp', 'c', 'python', 'javascript', 'java', 'go', 'rust']) {
    result[language] = pickResolved(language);
  }
  return result;
}

async function main() {
  settings = new SettingsStore(app.getPath('userData'));
  startupLog(`main start userData=${app.getPath('userData')} settings=${settings.file}`);
  workspace = new WorkspaceService(settings);
  tests = new TestStore(workspace);
  compilers = new CompilerManager(settings, (event) => {
    broadcast('compilers:changed', {
      ...event,
      compilers: compilers.list(),
      selected: allResolved(),
      state: compilers.scanningState,
    });
  });
  runner = new Runner({
    settings,
    workspace,
    compilers,
    emit: (event) => broadcast('run:event', event),
  });
  await initializeWorkspace();
  startupLog(`workspace ready root=${workspace.root}`);
  registerIpc();
  registerAppProtocol();

  aiServer = new AIServer({
    settings,
    workspace,
    tests,
    compilers,
    runner,
    appVersion: APP_VERSION,
    bridge: {
      call: callRenderer,
      broadcast,
      focusWindow,
    },
    onModeChange: applyMode,
    onSettingsChange: (patch) => broadcast('settings:changed', serializeSettings()),
    onCompilersChanged: () =>
      broadcast('compilers:changed', { compilers: compilers.list(), selected: allResolved(), state: compilers.scanningState }),
  });
  await aiServer.start();
  startupLog(`ai server status=${aiServer.status} port=${aiServer.port}`);
  writeEndpointInfo();

  createWindow();
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  setTimeout(() => {
    compilers.scan().catch((error) => console.warn('[compilers] 初始扫描失败', error.message));
  }, 1200);
}

app.whenReady().then(main).catch((error) => {
  startupLog(`main failed: ${error?.stack || error}`);
  try {
    dialog.showErrorBox('Orbit IDE 启动失败', `${error?.message || error}\n\n日志：${path.join(app.getPath('userData'), 'startup.log')}`);
  } catch {
    // 忽略对话框失败。
  }
  app.quit();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  isQuitting = true;
  allowClose = true;
  stopWorkspaceWatcher();
  runner?.stop();
  writeEndpointInfo('stopped');
  aiServer?.stop();
});
app.on('activate', () => {
  if (!mainWindow) createWindow();
});

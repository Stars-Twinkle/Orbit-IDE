import './styles.css';
import { icon, hydrateIcons } from './icons.js';
import { EditorHost, monaco } from './editor.js';

if (!window.orbit && new URLSearchParams(location.search).has('mock')) {
  await import('./mock-orbit.js');
}

const api = window.orbit;

const LANGUAGES = {
  cpp: { label: 'C++', badge: 'C++', color: '#6ea8fe', runnable: true },
  c: { label: 'C', badge: 'C', color: '#7dd3fc', runnable: true },
  python: { label: 'Python', badge: 'PY', color: '#facc15', runnable: true },
  javascript: { label: 'JavaScript', badge: 'JS', color: '#f7df1e', runnable: true },
  typescript: { label: 'TypeScript', badge: 'TS', color: '#60a5fa', runnable: false },
  java: { label: 'Java', badge: 'JAVA', color: '#f87171', runnable: true },
  go: { label: 'Go', badge: 'GO', color: '#67e8f9', runnable: true },
  rust: { label: 'Rust', badge: 'RS', color: '#fb923c', runnable: true },
  json: { label: 'JSON', badge: '{}', color: '#fbbf24', runnable: false },
  markdown: { label: 'Markdown', badge: 'MD', color: '#94a3b8', runnable: false },
  html: { label: 'HTML', badge: '<>', color: '#fb7185', runnable: false },
  css: { label: 'CSS', badge: '{;}', color: '#818cf8', runnable: false },
  yaml: { label: 'YAML', badge: 'YML', color: '#a3e635', runnable: false },
  shell: { label: 'Shell', badge: 'SH', color: '#a7f3d0', runnable: false },
  text: { label: '绾枃鏈?, badge: 'TXT', color: '#94a3b8', runnable: false },
};

const EXT_LANGUAGE = {
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c++': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp', '.h': 'cpp',
  '.c': 'c',
  '.py': 'python', '.pyw': 'python',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.json': 'json', '.jsonc': 'json', '.md': 'markdown', '.markdown': 'markdown',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.less': 'css',
  '.yml': 'yaml', '.yaml': 'yaml', '.sh': 'shell', '.bash': 'shell', '.bat': 'shell', '.cmd': 'shell', '.ps1': 'shell',
};

const OI_EXTENSIONS = new Set(['.cpp', '.cc', '.cxx', '.c++', '.c', '.h', '.hpp', '.hh', '.hxx']);
const DEFAULT_EXT = {
  cpp: '.cpp', c: '.c', python: '.py', javascript: '.js', typescript: '.ts', java: '.java', go: '.go', rust: '.rs',
  json: '.json', markdown: '.md', html: '.html', css: '.css', yaml: '.yml', shell: '.sh', text: '.txt',
};
const NEW_FILE_LANGS = ['cpp', 'c', 'python', 'javascript', 'typescript', 'java', 'go', 'rust', 'json', 'markdown', 'html', 'css', 'text'];
const TOOL_LANGUAGES = [
  { id: 'cpp', kind: 'cpp', label: 'C++', hint: 'C++ 缂栬瘧鍣? },
  { id: 'c', kind: 'c', label: 'C', hint: 'C 缂栬瘧鍣? },
  { id: 'python', kind: 'python', label: 'Python', hint: '瑙ｉ噴鍣? },
  { id: 'javascript', kind: 'node', label: 'JavaScript', hint: 'Node.js' },
  { id: 'java', kind: 'java', label: 'Java', hint: 'JDK' },
  { id: 'go', kind: 'go', label: 'Go', hint: 'Go 宸ュ叿閾? },
  { id: 'rust', kind: 'rust', label: 'Rust', hint: 'rustc' },
];

const state = {
  booted: false,
  appVersion: '',
  isDev: false,
  mode: 'oi',
  settings: {
    fontSize: 14,
    tabSize: 4,
    wordWrap: 'off',
    minimap: true,
    autoSave: false,
    fontLigatures: true,
    oiPanelHeight: 340,
  },
  workspace: null,
  tree: null,
  files: [],
  tabs: [],
  activePath: null,
  collapsedDirs: new Set(),
  compilers: [],
  compilerState: { scanning: false },
  selected: {},
  problems: [],
  tests: { cases: [] },
  expandedCases: new Set(),
  testResults: new Map(),
  testRunning: false,
  panel: 'tests',
  activity: 'explorer',
  ai: { running: false, sessions: [], pending: [], scopes: [], trusted: [] },
  audit: [],
  aiSnippetTab: 'curl',
  loginQueue: [],
  handledLogins: new Set(),
  currentLoginId: null,
  loginModalOpen: false,
  activeRunId: null,
  running: false,
  activeModal: null,
  launcher: null,
  modeSwitching: false,
  terminalHistory: [],
  terminalHistoryIndex: -1,
  terminalBusy: false,
  snippetTimer: null,
  testsSaveTimer: null,
  editorPushTimer: null,
  auditTimer: null,
  autoSaveTimers: new Map(),
  lastWorkspaceApplyAt: 0,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const dom = {
  boot: $('#boot'),
  bootStatus: $('#bootStatus'),
  app: $('#app'),
  titlebar: $('#titlebar'),
  modeSwitch: $('#modeSwitch'),
  modeGlider: $('#modeGlider'),
  modeBtns: $$('.mode-btn'),
  aiPill: $('#aiPill'),
  aiPillText: $('#aiPillText'),
  aiActivityBadge: $('#aiActivityBadge'),
  winMin: $('#win-min'),
  winMax: $('#win-max'),
  winClose: $('#win-close'),
  activitybar: $('#activitybar'),
  activityBtns: $$('.activity-btn'),
  sidebar: $('#sidebar'),
  workspaceName: $('#workspaceName'),
  workspacePath: $('#workspacePath'),
  fileTree: $('#fileTree'),
  fileCount: $('#fileCount'),
  treeScroll: $('#treeScroll'),
  compilerPanel: $('#compilerPanel'),
  tabs: $('#tabs'),
  breadcrumbs: $('#breadcrumbs'),
  editorContainer: $('#editor'),
  welcome: $('#welcome'),
  bottomPanel: $('#bottomPanel'),
  panelTabs: $$('.panel-tab'),
  panelViews: $$('.panel-view'),
  outputMeta: $('#outputMeta'),
  outputPre: $('#outputPre'),
  problemsList: $('#problemsList'),
  problemsCount: $('#problemsCount'),
  testsCount: $('#testsCount'),
  testsSummary: $('#testsSummary'),
  stdinRow: $('#stdinRow'),
  stdinInput: $('#stdinInput'),
  panelResizer: $('#panelResizer'),
  sidebarResizer: $('#sidebarResizer'),
  caseList: $('#caseList'),
  runTestsBtn: $('#btn-run-tests'),
  terminalPre: $('#terminalPre'),
  terminalInput: $('#terminalInput'),
  terminalPrompt: $('#terminalPrompt'),
  aiDrawer: $('#aiDrawer'),
  aiPanel: $('#aiPanel'),
  statusMode: $('#statusMode'),
  statusCompiler: $('#statusCompiler'),
  statusCompilerName: $('#statusCompilerName'),
  statusStandardWrap: $('#statusStandardWrap'),
  statusStandard: $('#statusStandard'),
  statusStandardLabel: $('#statusStandardLabel'),
  statusProblems: $('#statusProblems'),
  statusProblemsText: $('#statusProblemsText'),
  statusCursor: $('#statusCursor'),
  statusIndent: $('#statusIndent'),
  statusLang: $('#statusLang'),
  statusBuild: $('#statusBuild'),
  statusAI: $('#statusAI'),
  statusAIText: $('#statusAIText'),
  modalRoot: $('#modalRoot'),
  toastRoot: $('#toastRoot'),
  contextMenu: $('#contextMenu'),
  runBtn: $('#btn-run'),
  stopBtn: $('#btn-stop'),
};

let editorHost = null;

/* 鈹€鈹€ 宸ュ叿鍑芥暟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function basename(filePath) {
  return String(filePath || '').split('/').pop();
}

function dirname(filePath) {
  const parts = String(filePath || '').split('/');
  parts.pop();
  return parts.join('/');
}

function extname(filePath) {
  const name = basename(filePath);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function languageForPath(filePath) {
  return EXT_LANGUAGE[extname(filePath)] || 'text';
}

function languageMeta(id) {
  return LANGUAGES[id] || LANGUAGES.text;
}

function isOiAllowed(filePath) {
  return OI_EXTENSIONS.has(extname(filePath));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '鍒氬垰';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 鍒嗛挓鍓峘;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 灏忔椂鍓峘;
  return `${Math.floor(diff / 86_400_000)} 澶╁墠`;
}

function timeText(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function badgeFor(tab) {
  const meta = languageMeta(tab.language);
  return { text: meta.badge, class: tab.language };
}

function activeTab() {
  return state.tabs.find((tab) => tab.path === state.activePath) || null;
}

function findTab(path) {
  return state.tabs.find((tab) => tab.path === path) || null;
}

function iconSpan(name, className = '') {
  return `<span class="ico-wrap ${className}">${icon(name)}</span>`;
}

function toast(message, type = 'info', timeout = 3600) {
  if (!message) return;
  const icons = { success: 'check', error: 'error', warning: 'warning', info: 'info' };
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(icons[type] || 'info')}<div>${esc(message)}</div>`;
  dom.toastRoot.append(node);
  const remove = () => {
    if (!node.isConnected) return;
    node.classList.add('hide');
    setTimeout(() => node.remove(), 220);
  };
  setTimeout(remove, timeout);
  node.addEventListener('click', remove);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    toast('宸插鍒跺埌鍓创鏉?, 'success', 1800);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      document.execCommand('copy');
      toast('宸插鍒跺埌鍓创鏉?, 'success', 1800);
      return true;
    } catch {
      toast('澶嶅埗澶辫触锛岃鎵嬪姩閫夋嫨鏂囨湰', 'error');
      return false;
    }
  }
}

function truncate(text, length = 60) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length)}鈥 : value;
}

/* 鈹€鈹€ 鍚姩 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

async function boot() {
  hydrateIcons();
  bindWindowControls();
  bindActivity();
  bindModeSwitch();
  bindTabsActions();
  bindExplorer();
  bindCompilerActions();
  bindPanel();
  bindWelcome();
  bindEditorFloats();
  bindTerminal();
  bindTests();
  bindAI();
  bindKeyboard();
  bindEvents();
  bindResizers();

  try {
    const init = await api.invoke('app:init');
    state.appVersion = init.appVersion;
    state.isDev = init.isDev;
    state.mode = init.settings.mode || 'oi';
    state.settings = { ...state.settings, ...init.settings };
    state.workspace = init.workspace;
    state.tree = init.tree;
    state.compilers = init.compilers || [];
    state.selected = init.selected || {};
    state.compilerState = init.compilerState || { scanning: false };
    state.ai = init.ai || state.ai;

    setupEditor();
    applyModeVisual(state.mode, { initial: true });
    applySettingsVisual();
    if (init.settings.trustedClients) state.settings.trustedClients = init.settings.trustedClients;
    renderWorkspaceHeader();
    renderTree();
    renderCompilers();
    renderTabs();
    renderBreadcrumbs();
    renderStatus();
    renderAI();
    updateAIChrome();
    await refreshFiles();
    await loadTests();

    if (init.initialFile) {
      await openFile(init.initialFile, { silent: true });
    } else if (state.mode === 'oi') {
      const first = firstCppFromTree();
      if (first) await openFile(first, { silent: true });
    }

    if (state.mode === 'oi') openPanel('tests', { silent: true });
    else openPanel('output', { silent: true });

    const windowState = await api.invoke('window:state').catch(() => ({}));
    updateMaxIcon(windowState.maximized);

    if (!activeTab()) renderWelcome();
    state.booted = true;
    setTimeout(() => {
      dom.boot.classList.add('hidden');
      document.body.classList.remove('booting');
    }, 420);

    for (const pending of init.ai?.pending || []) enqueueLogin(pending);
    setTimeout(() => refreshAudit(), 900);
  } catch (error) {
    console.error('[boot]', error);
    dom.bootStatus.textContent = `鍚姩澶辫触锛?{error.message || error}`;
    dom.bootStatus.style.color = '#fb7185';
  }
}

function setupEditor() {
  if (editorHost) return;
  editorHost = new EditorHost(dom.editorContainer, {
    onSave: () => saveActive(),
    onSaveAll: () => saveAll(),
    onRun: () => runActive(),
    onBuild: () => buildActive(),
    onQuickOpen: () => openQuickOpen(),
    onCommandPalette: () => openCommandPalette(),
    onChange: (model) => {
      const tab = state.tabs.find((item) => item.model === model);
      if (!tab) return;
      const dirty = model.getAlternativeVersionId() !== tab.savedVersion;
      if (tab.dirty !== dirty) {
        tab.dirty = dirty;
        renderTabs();
        updateWindowTitle();
      }
      scheduleEditorState();
      if (state.settings.autoSave && dirty) {
        clearTimeout(state.autoSaveTimers.get(tab.path));
        state.autoSaveTimers.set(
          tab.path,
          setTimeout(() => saveTab(tab, { silent: true }).catch(() => {}), 900)
        );
      }
    },
    onCursor: (position, selection) => {
      updateCursorStatus(position, selection);
      scheduleEditorState();
    },
    onSelection: () => updateCursorStatus(editorHost.getPosition(), editorHost.getSelection()),
    onFocus: () => {
      // 淇濇寔鐢ㄦ埛褰撳墠閫夋嫨鐨勪晶杈规爮瑙嗗浘锛屼笉鍥犵紪杈戝櫒鑱氱劍鑰岃烦杞€?    },
  });
  editorHost.setOptions(state.settings);
}

/* 鈹€鈹€ 妯″紡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function applyModeVisual(mode, options = {}) {
  state.mode = mode;
  document.body.classList.toggle('mode-oi', mode === 'oi');
  document.body.classList.toggle('mode-dev', mode === 'dev');
  for (const button of dom.modeBtns) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  editorHost?.setMode(mode);
  renderStatus();
  if (!activeTab()) renderWelcome();
  if (!options.silent) hydrateIcons();
}

async function switchMode(target) {
  if (state.modeSwitching || target === state.mode) return;
  state.modeSwitching = true;
  dom.modeBtns.forEach((button) => (button.disabled = true));
  try {
    const result = await api.invoke('mode:set', target);
    if (result?.cancelled) {
      toast('宸插彇娑堟ā寮忓垏鎹?, 'info', 2000);
      return;
    }
    if (state.mode !== target) {
      applyModeVisual(target);
      await afterModeChanged(target, 'user');
    }
  } catch (error) {
    toast(error.message || '鍒囨崲妯″紡澶辫触', 'error');
  } finally {
    state.modeSwitching = false;
    dom.modeBtns.forEach((button) => (button.disabled = false));
  }
}

async function afterModeChanged(mode, source) {
  await refreshTree();
  try {
    const data = await api.invoke('compilers:list');
    state.compilers = data.compilers || state.compilers;
    state.selected = data.selected || state.selected;
    state.compilerState = data.state || state.compilerState;
  } catch {
    // 缂栬瘧鍣ㄧ姸鎬佸埛鏂板け璐ユ椂淇濈暀褰撳墠閫夋嫨銆?  }
  renderCompilers();
  renderStatus();
  await loadTests();
  if (mode === 'oi') {
    openPanel('tests', { silent: true });
    await ensureCppTab();
    toast('宸茶繘鍏?OI 妯″紡 路 浠呮敮鎸?C/C++锛岀紪璇戝櫒鏍囧噯宸茶嚜鍔ㄥ尮閰?, 'info', 3800);
  } else {
    if (state.panel === 'tests') openPanel('output', { silent: true });
    toast('宸茶繘鍏ュ紑鍙戞ā寮?路 宸插惎鐢ㄥ璇█鏀寔涓庡畬鏁村伐鍏烽摼', 'info', 3200);
  }
  if (source === 'ai') refreshAudit();
  renderWelcome();
  renderStatus();
}

async function ensureCppTab() {
  const current = activeTab();
  if (current && (current.language === 'cpp' || current.language === 'c')) return;
  const cppTab = state.tabs.find((tab) => tab.language === 'cpp' || tab.language === 'c');
  if (cppTab) {
    await activateTab(cppTab);
    return;
  }
  const first = firstCppFromTree();
  if (first) {
    await openFile(first, { silent: true });
    return;
  }
  try {
    const result = await api.invoke('file:create', { path: 'main.cpp', kind: 'file', content: cppTemplate() });
    await refreshTree();
    await refreshFiles();
    await openFile(result.path, { silent: true });
    toast('宸插垱寤?main.cpp锛屽紑濮嬩綘鐨?OI 涔嬫梾', 'success');
  } catch (error) {
    toast(`鏃犳硶鍒涘缓 C++ 鏂囦欢锛?{error.message}`, 'error');
  }
}

function cppTemplate() {
  return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    \n    return 0;\n}\n`;
}

/* 鈹€鈹€ 璁剧疆 / 鐘舵€佹爮 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function applySettingsVisual() {
  editorHost?.setOptions(state.settings);
  document.documentElement.style.setProperty('--panel-height', `${state.settings.oiPanelHeight || 268}px`);
  dom.statusIndent.textContent = String(state.settings.tabSize || 4);
  renderStatus();
}

async function patchSettings(patch, { render = true } = {}) {
  try {
    const updated = await api.invoke('settings:patch', patch);
    state.settings = { ...state.settings, ...updated };
    applySettingsVisual();
    if (render) renderSettingsIfOpen();
  } catch (error) {
    toast(error.message || '璁剧疆鏇存柊澶辫触', 'error');
  }
}

function updateCursorStatus(position, selection) {
  if (!position) return;
  const selected =
    selection && (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn);
  if (selected) {
    const lines = Math.abs(selection.endLineNumber - selection.startLineNumber) + 1;
    const chars = Math.abs(selection.endColumn - selection.startColumn);
    dom.statusCursor.textContent = `琛?${position.lineNumber}锛屽垪 ${position.column} 路 閫変腑 ${lines > 1 ? `${lines} 琛宍 : `${chars} 瀛楃`}`;
  } else {
    dom.statusCursor.textContent = `琛?${position.lineNumber}锛屽垪 ${position.column}`;
  }
}

function updateActiveCompiler() {
  const tab = activeTab();
  const language = tab?.language || 'cpp';
  const selection = state.selected?.[language];
  const compiler = selection ? state.compilers.find((item) => item.id === selection.compilerId) : null;
  const meta = languageMeta(language);
  dom.statusLang.textContent = meta.label;

  if (!selection || !compiler) {
    dom.statusCompilerName.textContent = `${meta.label} 宸ュ叿閾炬湭妫€娴嬪埌`;
    dom.statusCompiler.classList.add('missing');
    dom.statusStandardWrap.style.display = 'none';
    return;
  }
  dom.statusCompiler.classList.remove('missing');
  const shortName = compiler.name.replace(/\s+/g, ' ');
  dom.statusCompilerName.textContent = shortName;
  dom.statusCompiler.title = `${compiler.name}\n${compiler.toolchain} 路 ${compiler.executable}`;

  if (compiler.standards?.length) {
    const standard = compiler.standards.find((item) => item.id === selection.standard) || compiler.standards[compiler.standards.length - 1];
    dom.statusStandardWrap.style.display = '';
    dom.statusStandardLabel.textContent = standard?.label || standard?.id || '';
    dom.statusStandard.innerHTML = '';
    for (const item of [...compiler.standards].reverse()) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      option.selected = item.id === standard?.id;
      dom.statusStandard.append(option);
    }
    dom.statusStandard.dataset.compilerId = compiler.id;
  } else {
    dom.statusStandardWrap.style.display = 'none';
  }
}

function renderStatus() {
  dom.statusMode.innerHTML = `${icon('orbit')}<b>${state.mode === 'oi' ? 'OI' : 'DEV'}</b>`;
  dom.statusMode.title = state.mode === 'oi' ? '褰撳墠锛歄I 妯″紡锛堜粎 C/C++锛? : '褰撳墠锛氬紑鍙戞ā寮忥紙澶氳瑷€锛?;
  updateActiveCompiler();
  updateProblemsStatus();
  updateAIChrome();
  if (state.activePath) {
    const tab = activeTab();
    if (tab) dom.statusLang.textContent = languageMeta(tab.language).label;
  }
}

function setBuildStatus(text, className = '') {
  dom.statusBuild.textContent = text;
  dom.statusBuild.className = `status-item status-build ${className}`.trim();
}

function updateProblemsStatus() {
  const errors = state.problems.filter((item) => item.severity === 'error').length;
  const warnings = state.problems.filter((item) => item.severity === 'warning').length;
  dom.problemsCount.textContent = String(state.problems.length);
  dom.problemsCount.classList.toggle('has-errors', errors > 0);
  dom.statusProblemsText.textContent = String(errors + warnings);
  dom.statusProblems.classList.toggle('has-errors', errors > 0);
  dom.statusProblems.title = `${errors} 涓敊璇紝${warnings} 涓鍛奰;
}

function updateWindowTitle() {
  const tab = activeTab();
  document.title = tab ? `${tab.dirty ? '鈼?' : ''}${tab.name} 鈥?Orbit IDE` : 'Orbit IDE';
}

/* 鈹€鈹€ 宸ヤ綔鍖?/ 鏂囦欢鏍?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function renderWorkspaceHeader() {
  if (!state.workspace) {
    dom.workspaceName.textContent = '鏈墦寮€鏂囦欢澶?;
    dom.workspacePath.textContent = '鎵撳紑涓€涓枃浠跺す寮€濮?;
    return;
  }
  dom.workspaceName.textContent = state.workspace.name;
  dom.workspacePath.textContent = state.workspace.path;
  dom.workspacePath.title = state.workspace.path;
  dom.terminalPrompt.textContent = 'PS>';
  dom.terminalPrompt.title = state.workspace.path;
}

function applyWorkspacePayload(payload, { openInitial = true } = {}) {
  const now = Date.now();
  if (
    payload?.workspace &&
    state.workspace?.path === payload.workspace.path &&
    now - state.lastWorkspaceApplyAt < 700
  ) {
    return;
  }
  state.lastWorkspaceApplyAt = now;
  state.workspace = payload.workspace || null;
  state.tree = payload.tree || null;
  for (const tab of [...state.tabs]) closeTab(tab.path, { force: true, activate: false, silent: true });
  state.tabs = [];
  state.activePath = null;
  editorHost?.editor.setModel(null);
  state.collapsedDirs.clear();
  state.tests = { cases: [] };
  state.testResults.clear();
  state.expandedCases.clear();
  renderWorkspaceHeader();
  renderTree();
  renderTabs();
  renderBreadcrumbs();
  renderWelcome();
  refreshFiles();
  loadTests();
  if (openInitial) {
    if (payload.initialFile) openFile(payload.initialFile, { silent: true });
    else if (state.mode === 'oi') {
      const first = firstCppFromTree();
      if (first) openFile(first, { silent: true });
    }
  }
}

async function refreshTree() {
  if (!state.workspace) {
    state.tree = null;
    renderTree();
    return;
  }
  try {
    state.tree = await api.invoke('workspace:tree');
    renderTree();
  } catch (error) {
    console.warn('鍒锋柊鏂囦欢鏍戝け璐?, error);
  }
}

async function refreshFiles() {
  if (!state.workspace) {
    state.files = [];
    return;
  }
  try {
    state.files = await api.invoke('workspace:files');
  } catch {
    state.files = [];
  }
}

function countFiles(node) {
  if (!node) return 0;
  let total = 0;
  for (const child of node.children || []) {
    if (child.type === 'file') total += 1;
    else total += countFiles(child);
  }
  return total;
}

function renderTree() {
  dom.fileTree.innerHTML = '';
  if (!state.tree) {
    dom.fileTree.innerHTML = `<div class="empty-state">${icon('folder')}<div>灏氭湭鎵撳紑鏂囦欢澶?/div></div>`;
    dom.fileCount.textContent = '0 鏂囦欢';
    return;
  }
  dom.fileCount.textContent = `${countFiles(state.tree)} 鏂囦欢`;
  const rows = document.createElement('div');
  renderTreeNodes(state.tree.children || [], rows, 0);
  dom.fileTree.append(rows);
  updateTreeActive();
}

function renderTreeNodes(nodes, container, depth) {
  for (const node of nodes) {
    const row = document.createElement('div');
    const isDir = node.type === 'dir';
    const collapsed = isDir && state.collapsedDirs.has(node.path);
    row.className = `tree-row${collapsed ? ' collapsed' : ''}${node.locked ? ' locked' : ''}`;
    row.dataset.path = node.path;
    row.dataset.type = node.type;
    row.style.paddingLeft = `${Math.min(depth, 10) * 13 + 2}px`;
    row.title = node.path;

    if (isDir) {
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.innerHTML = icon('chevron-down');
      row.append(chevron);
      const folderIcon = document.createElement('span');
      folderIcon.className = 'tree-folder-icon';
      folderIcon.innerHTML = icon('folder');
      row.append(folderIcon);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-chevron';
      row.append(spacer);
      const meta = languageMeta(node.language);
      const badge = document.createElement('span');
      badge.className = `tree-badge ${node.language}`;
      badge.textContent = meta.badge;
      row.append(badge);
    }

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    row.append(name);

    if (node.locked) {
      const lock = document.createElement('span');
      lock.className = 'tree-lock';
      lock.innerHTML = icon('lock');
      row.append(lock);
    }

    row.addEventListener('click', () => {
      if (isDir) {
        if (state.collapsedDirs.has(node.path)) state.collapsedDirs.delete(node.path);
        else state.collapsedDirs.add(node.path);
        renderTree();
      } else if (node.locked) {
        toast('OI 妯″紡浠呮敮鎸?C/C++ 鏂囦欢锛屽垏鎹㈠埌寮€鍙戞ā寮忓悗鍙墦寮€璇ユ枃浠?, 'warning', 3800);
      } else {
        openFile(node.path);
      }
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showTreeContextMenu(event, node);
    });
    container.append(row);

    if (isDir && !collapsed && node.children?.length) {
      renderTreeNodes(node.children, container, depth + 1);
    }
  }
}

function updateTreeActive() {
  $$('.tree-row', dom.fileTree).forEach((row) => {
    row.classList.toggle('active', row.dataset.path === state.activePath);
  });
}

function firstCppFromTree() {
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.type === 'file' && (node.language === 'cpp' || node.language === 'c') && !node.locked) return node.path;
      if (node.type === 'dir') {
        const hit = walk(node.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(state.tree?.children);
}

function showTreeContextMenu(event, node) {
  const items = [];
  if (node.type === 'file') {
    items.push({
      label: node.locked ? '鏂囦欢琚?OI 妯″紡閿佸畾' : '鎵撳紑',
      icon: 'file',
      disabled: node.locked,
      action: () => openFile(node.path),
    });
    items.push({ separator: true });
  }
  items.push({ label: '鏂板缓鏂囦欢', icon: 'plus', action: () => promptNewFile(node.type === 'dir' ? node.path : dirname(node.path)) });
  if (node.type === 'dir') items.push({ label: '鏂板缓鏂囦欢澶?, icon: 'folder-plus', action: () => promptNewFolder(node.path) });
  items.push({ separator: true });
  items.push({ label: '閲嶅懡鍚?, icon: 'edit', action: () => promptRename(node.path) });
  items.push({ label: '鍒犻櫎', icon: 'trash', danger: true, action: () => promptDelete(node.path, node.type) });
  items.push({ separator: true });
  items.push({ label: '澶嶅埗鐩稿璺緞', icon: 'copy', action: () => copyText(node.path) });
  items.push({ label: '鍦ㄨ祫婧愮鐞嗗櫒涓樉绀?, icon: 'external', action: () => api.invoke('workspace:reveal', node.path).catch(() => {}) });
  showContextMenu(event.clientX, event.clientY, items);
}

/* 鈹€鈹€ 鏍囩椤?/ 缂栬緫 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

async function openFile(filePath, options = {}) {
  if (!filePath) return null;
  if (state.mode === 'oi' && !isOiAllowed(filePath)) {
    toast('OI 妯″紡浠呮敮鎸?C/C++ 鏂囦欢銆傚垏鎹㈠埌寮€鍙戞ā寮忓嵆鍙紪杈戝叾浠栬瑷€銆?, 'warning', 4200);
    return null;
  }
  const normalized = filePath.replace(/\\/g, '/');
  const existing = findTab(normalized);
  if (existing) {
    await activateTab(existing);
    if (options.line) editorHost.reveal(options.line, options.column || 1);
    return existing;
  }
  try {
    const file = await api.invoke('file:read', normalized);
    if (file.locked) {
      toast('璇ユ枃浠跺湪 OI 妯″紡涓嬩笉鍙紪杈?, 'warning');
      return null;
    }
    const tab = {
      path: file.path,
      name: file.name || basename(file.path),
      language: file.language || languageForPath(file.path),
      content: file.content,
      model: null,
      savedVersion: 0,
      dirty: false,
      viewState: null,
      size: file.size,
      mtime: file.mtime,
    };
    if (tab.language === 'text') tab.language = languageForPath(tab.path);
    tab.model = editorHost.createModel(tab);
    tab.savedVersion = tab.model.getAlternativeVersionId();
    state.tabs.push(tab);
    renderTabs();
    await activateTab(tab);
    if (options.line) editorHost.reveal(options.line, options.column || 1);
    return tab;
  } catch (error) {
    toast(`鏃犳硶鎵撳紑 ${basename(filePath)}锛?{error.message}`, 'error', 4500);
    return null;
  }
}

async function activateTab(tab) {
  if (!tab) return;
  const previous = activeTab();
  if (previous && previous.model) editorHost.saveViewState(previous);
  state.activePath = tab.path;
  editorHost.showTab(tab);
  renderTabs();
  renderBreadcrumbs();
  updateTreeActive();
  renderWelcome();
  updateActiveCompiler();
  updateCursorStatus(editorHost.getPosition(), editorHost.getSelection());
  setBuildStatus('灏辩华');
  applyProblemsToModels();
  api.invoke('workspace:setActiveFile', tab.path).catch(() => {});
  scheduleEditorState();
  updateWindowTitle();
  if (state.settings.autoSave) {
    // 鑷姩淇濆瓨鐢辩紪杈戝彉鏇磋Е鍙戯紝杩欓噷鏃犻渶棰濆鍔ㄤ綔銆?  }
}

function renderTabs() {
  dom.tabs.innerHTML = '';
  for (const tab of state.tabs) {
    const badge = badgeFor(tab);
    const node = document.createElement('button');
    node.className = `tab${tab.path === state.activePath ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
    node.title = tab.path;
    node.dataset.path = tab.path;
    node.innerHTML = `<span class="tab-badge ${badge.class}">${esc(badge.text)}</span><span class="tab-name"></span><span class="tab-dirty"></span><span class="tab-close">${icon('close')}</span>`;
    $('.tab-name', node).textContent = tab.name;
    node.addEventListener('click', () => activateTab(tab));
    node.addEventListener('mousedown', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        closeTab(tab.path);
      }
    });
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showTabContextMenu(event, tab);
    });
    $('.tab-close', node).addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.path);
    });
    dom.tabs.append(node);
  }
  const activeNode = $('.tab.active', dom.tabs);
  activeNode?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  dom.welcome.classList.toggle('hidden', state.tabs.length > 0);
  document.body.classList.toggle('no-tabs', state.tabs.length === 0);
  updateTreeActive();
  updateWindowTitle();
}

function renderBreadcrumbs() {
  const tab = activeTab();
  dom.breadcrumbs.innerHTML = '';
  if (!tab) {
    dom.breadcrumbs.innerHTML = '<span class="crumb-muted">鏈墦寮€鏂囦欢</span>';
    return;
  }
  const parts = tab.path.split('/');
  parts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '鈥?;
      dom.breadcrumbs.append(sep);
    }
    const span = document.createElement('span');
    span.className = index === parts.length - 1 ? 'crumb-file' : 'crumb';
    span.textContent = part;
    dom.breadcrumbs.append(span);
  });
  const tag = document.createElement('span');
  tag.className = 'crumb-tag';
  tag.textContent = languageMeta(tab.language).label;
  dom.breadcrumbs.append(tag);
  if (state.mode === 'oi') {
    const oi = document.createElement('span');
    oi.className = 'crumb-tag';
    oi.textContent = 'OI 路 C/C++';
    dom.breadcrumbs.append(oi);
  }
  const spacer = document.createElement('span');
  spacer.className = 'crumb-spacer';
  dom.breadcrumbs.append(spacer);
  const hint = document.createElement('span');
  hint.className = 'crumb-hint';
  hint.textContent = state.settings.autoSave ? '鑷姩淇濆瓨' : 'Ctrl+S 淇濆瓨';
  dom.breadcrumbs.append(hint);
}

async function saveTab(tab, options = {}) {
  if (!tab?.model) return false;
  const content = tab.model.getValue();
  try {
    await api.invoke('file:write', { path: tab.path, content });
    tab.savedVersion = tab.model.getAlternativeVersionId();
    tab.content = content;
    tab.size = content.length;
    if (tab.dirty) {
      tab.dirty = false;
      renderTabs();
    }
    if (!options.silent) {
      toast(`宸蹭繚瀛?${tab.name}`, 'success', 1600);
      setBuildStatus('宸蹭繚瀛?, 'ok');
      setTimeout(() => setBuildStatus('灏辩华'), 1800);
    }
    return true;
  } catch (error) {
    toast(`淇濆瓨澶辫触锛?{error.message}`, 'error', 4500);
    return false;
  }
}

async function saveActive(options = {}) {
  const tab = activeTab();
  if (!tab) return false;
  return saveTab(tab, options);
}

async function saveAll(options = {}) {
  const dirtyTabs = state.tabs.filter((tab) => tab.dirty);
  let success = true;
  for (const tab of dirtyTabs) {
    const ok = await saveTab(tab, { silent: true });
    if (!ok) success = false;
  }
  if (!options.silent) {
    if (success) toast(dirtyTabs.length ? `宸蹭繚瀛?${dirtyTabs.length} 涓枃浠禶 : '娌℃湁闇€瑕佷繚瀛樼殑淇敼', 'success', 1800);
    else toast('閮ㄥ垎鏂囦欢淇濆瓨澶辫触', 'error');
  }
  return success;
}

async function askSave(tab) {
  if (!tab?.dirty) return 'discard';
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const modal = showModal({
      title: '淇濆瓨瀵规枃浠剁殑淇敼锛?,
      subtitle: `${tab.name} 鏈夋湭淇濆瓨鐨勪慨鏀广€傚叧闂墠鏄惁淇濆瓨锛焋,
      iconName: 'save',
      dismissible: true,
      onClose: () => finish('cancel'),
      body: `<div class="field-hint">閫夋嫨銆屼笉淇濆瓨銆嶅皢涓㈠け鏈淇敼銆?/div>`,
      buttons: [
        { label: '鍙栨秷', onClick: () => { finish('cancel'); return true; } },
        { label: '涓嶄繚瀛?, onClick: () => { finish('discard'); return true; } },
        { label: '淇濆瓨', class: 'primary', onClick: async () => { const ok = await saveTab(tab); finish(ok ? 'save' : 'cancel'); return ok; } },
      ],
    });
    if (!modal) finish('cancel');
  });
}

async function closeTab(filePath, options = {}) {
  const tab = findTab(filePath);
  if (!tab) return true;
  if (!options.force && tab.dirty) {
    const choice = await askSave(tab);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const ok = await saveTab(tab);
      if (!ok) return false;
    }
  }
  const index = state.tabs.indexOf(tab);
  if (tab.model) editorHost.disposeModel(tab);
  state.tabs.splice(index, 1);
  clearTimeout(state.autoSaveTimers.get(tab.path));
  state.autoSaveTimers.delete(tab.path);
  if (state.activePath === tab.path) {
    const next = state.tabs[Math.min(index, state.tabs.length - 1)] || null;
    if (next) {
      await activateTab(next);
    } else {
      state.activePath = null;
      editorHost.editor.setModel(null);
      renderTabs();
      renderBreadcrumbs();
      renderWelcome();
      updateWindowTitle();
      renderStatus();
    }
  } else {
    renderTabs();
    updateTreeActive();
  }
  if (!options.silent) setBuildStatus('灏辩华');
  return true;
}

async function closeAllTabs(options = {}) {
  for (const tab of [...state.tabs]) {
    const closed = await closeTab(tab.path, { force: options.force, silent: true });
    if (!closed) return false;
  }
  return true;
}

function showTabContextMenu(event, tab) {
  showContextMenu(event.clientX, event.clientY, [
    { label: '鍏抽棴', icon: 'close', shortcut: 'Ctrl+W', action: () => closeTab(tab.path) },
    { label: '鍏抽棴鍏朵粬', icon: 'close', action: () => closeOtherTabs(tab.path) },
    { label: '鍏ㄩ儴鍏抽棴', icon: 'close', action: () => closeAllTabs() },
    { separator: true },
    { label: '澶嶅埗鐩稿璺緞', icon: 'copy', action: () => copyText(tab.path) },
    { label: '鍦ㄨ祫婧愮鐞嗗櫒涓樉绀?, icon: 'external', action: () => api.invoke('workspace:reveal', tab.path).catch(() => {}) },
  ]);
}

async function closeOtherTabs(keepPath) {
  for (const tab of [...state.tabs]) {
    if (tab.path === keepPath) continue;
    const closed = await closeTab(tab.path, { silent: true });
    if (!closed) break;
  }
}

/* 鈹€鈹€ 闂 / 鏍囪 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function setProblems(problems) {
  state.problems = Array.isArray(problems) ? problems : [];
  updateProblemsStatus();
  renderProblems();
  applyProblemsToModels();
  if (state.problems.some((item) => item.severity === 'error')) setBuildStatus('缂栬瘧澶辫触', 'err');
}

function applyProblemsToModels() {
  if (!editorHost) return;
  for (const tab of state.tabs) {
    if (tab.model) editorHost.setMarkers(tab.model, state.problems);
  }
}

function renderProblems() {
  dom.problemsList.innerHTML = '';
  if (!state.problems.length) {
    dom.problemsList.innerHTML = `<div class="empty-state">${icon('check')}<div>娌℃湁鍙戠幇闂</div><div class="muted" style="margin-top:4px">缂栬瘧鍚庯紝閿欒涓庤鍛婁細鏄剧ず鍦ㄨ繖閲?/div></div>`;
    return;
  }
  for (const problem of state.problems) {
    const row = document.createElement('div');
    row.className = `problem-row ${problem.severity}`;
    row.innerHTML = `${icon(problem.severity === 'error' ? 'error' : problem.severity === 'warning' ? 'warning' : 'info')}<span class="problem-msg"></span><span class="problem-loc"></span>`;
    $('.problem-msg', row).textContent = problem.message;
    $('.problem-loc', row).textContent = problem.file ? `${problem.file}:${problem.line}:${problem.column}` : '';
    row.title = problem.message;
    row.addEventListener('click', async () => {
      if (!problem.file) return;
      let target = problem.file.replace(/\\/g, '/');
      if (target.startsWith('/') && state.workspace?.path) {
        target = target.replace(state.workspace.path.replace(/\\/g, '/'), '').replace(/^\/+/, '');
      }
      if (!findTab(target) && !state.files.some((file) => file.path === target)) {
        target = basename(target);
      }
      await openFile(target, { line: problem.line, column: problem.column });
      openPanel('problems', { silent: true });
    });
    dom.problemsList.append(row);
  }
}

/* 鈹€鈹€ 缂栬瘧鍣ㄩ潰鏉?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function renderCompilers() {
  dom.compilerPanel.innerHTML = '';
  if (state.compilerState?.scanning) {
    const banner = document.createElement('div');
    banner.className = 'scan-banner';
    banner.innerHTML = `<span class="spinner"></span><span>姝ｅ湪鎵弿绯荤粺宸ュ叿閾惧苟鎺㈡祴 C++ 鏍囧噯鈥?/span>`;
    dom.compilerPanel.append(banner);
  }

  for (const language of TOOL_LANGUAGES) {
    const candidates = state.compilers.filter((item) => item.kind === language.kind);
    const isCpp = language.kind === 'cpp';
    if (!candidates.length && !(state.selected?.[language.id])) {
      if (isCpp) {
        const empty = document.createElement('div');
        empty.className = 'compiler-empty';
        empty.innerHTML = `鏈娴嬪埌 C++ 缂栬瘧鍣?br><span style="font-size:9px">璇峰畨瑁?MinGW / LLVM锛屾垨鎵嬪姩娣诲姞</span>`;
        dom.compilerPanel.append(empty);
        const actions = document.createElement('div');
        actions.className = 'compiler-actions';
        const scanBtn = document.createElement('button');
        scanBtn.className = 'mini-btn accent';
        scanBtn.innerHTML = `${icon('refresh')} 閲嶆柊鎵弿`;
        scanBtn.addEventListener('click', () => scanCompilers());
        const addBtn = document.createElement('button');
        addBtn.className = 'mini-btn';
        addBtn.innerHTML = `${icon('plus')} 鎵嬪姩娣诲姞`;
        addBtn.addEventListener('click', () => browseCompiler());
        actions.append(scanBtn, addBtn);
        dom.compilerPanel.append(actions);
      }
      continue;
    }

    const card = document.createElement('div');
    card.className = `compiler-card${state.selected?.[language.id] ? ' current' : ''}`;
    const head = document.createElement('div');
    head.className = 'cc-head';
    head.innerHTML = `<span class="cc-lang">${esc(language.label)}</span><span class="cc-status">${candidates.length} 涓彲鐢?/span>`;
    card.append(head);

    const select = document.createElement('select');
    select.className = 'cc-select';
    for (const compiler of candidates) {
      const option = document.createElement('option');
      option.value = compiler.id;
      option.textContent = `${compiler.name} 路 ${compiler.toolchain || compiler.vendor}`;
      option.selected = state.selected?.[language.id]?.compilerId === compiler.id;
      select.append(option);
    }
    if (!candidates.length) {
      const option = document.createElement('option');
      option.textContent = '鏈娴嬪埌';
      option.value = '';
      select.append(option);
      select.disabled = true;
    }
    select.title = '閫夋嫨璇ヨ瑷€浣跨敤鐨勫伐鍏烽摼';
    select.addEventListener('change', async () => {
      try {
        const result = await api.invoke('compilers:select', { language: language.id, compilerId: select.value });
        state.selected = result.selected;
        state.compilers = result.compilers || state.compilers;
        renderCompilers();
        renderStatus();
        toast(`宸蹭负 ${language.label} 閫夋嫨 ${result.compiler?.name}`, 'success', 2200);
        if (language.id === 'cpp' || language.id === 'c') {
          const compiler = state.compilers.find((item) => item.id === select.value);
          if (compiler?.standards?.length) {
            toast(`鑷姩鍖归厤鍒?${compiler.standards.length} 涓?C++ 鏍囧噯`, 'info', 2600);
          }
        }
      } catch (error) {
        toast(error.message || '閫夋嫨缂栬瘧鍣ㄥけ璐?, 'error');
      }
    });
    card.append(select);

    const selectedId = state.selected?.[language.id]?.compilerId;
    const compiler = state.compilers.find((item) => item.id === selectedId);
    if (compiler) {
      const meta = document.createElement('div');
      meta.className = 'cc-meta';
      meta.textContent = compiler.executable;
      meta.title = compiler.executable;
      card.append(meta);
    }

    if (compiler?.standards?.length) {
      const standards = document.createElement('div');
      standards.className = 'cc-standards';
      const activeStd = state.selected[language.id]?.standard;
      standards.innerHTML = `<div class="cc-std-label"><b>${compiler.standards.length} 涓爣鍑?/b><span>路 鐢辩紪璇戝櫒瀹為檯鎺㈡祴</span></div>`;
      const chips = document.createElement('div');
      chips.className = 'std-chips';
      for (const standard of [...compiler.standards].reverse()) {
        const chip = document.createElement('button');
        chip.className = `std-chip${standard.id === activeStd ? ' active' : ''}`;
        chip.textContent = standard.label;
        chip.title = `${standard.label} 路 ${standard.flag || `-std=${standard.id}`}`;
        chip.addEventListener('click', async () => {
          try {
            state.selected = await api.invoke('compilers:standard', { compilerId: compiler.id, standard: standard.id });
            renderCompilers();
            renderStatus();
            toast(`C++ 鏍囧噯宸插垏鎹负 ${standard.label}`, 'success', 1800);
          } catch (error) {
            toast(error.message || '鍒囨崲鏍囧噯澶辫触', 'error');
          }
        });
        chips.append(chip);
      }
      standards.append(chips);
      card.append(standards);
    }

    if (language.id === 'cpp' && compiler) {
      const auto = document.createElement('div');
      auto.className = 'cc-meta';
      auto.style.color = 'var(--dim)';
      auto.textContent = compiler.defaultStandard
        ? `缂栬瘧鍣ㄩ粯璁ゆ爣鍑嗭細${compiler.defaultStandard} 路 宸茶嚜鍔ㄩ€夋嫨${state.mode === 'oi' ? ' OI 鎺ㄨ崘鏍囧噯' : '鏈€鏂板彲鐢ㄦ爣鍑?}`
        : `宸茶嚜鍔ㄥ尮閰嶅叏閮?${compiler.standards?.length || 0} 涓爣鍑哷;
      card.append(auto);
    }

    dom.compilerPanel.append(card);
  }

  const footer = document.createElement('div');
  footer.className = 'compiler-actions';
  const scan = document.createElement('button');
  scan.className = 'mini-btn';
  scan.innerHTML = `${icon('refresh')} 鎵弿`;
  scan.addEventListener('click', () => scanCompilers());
  const add = document.createElement('button');
  add.className = 'mini-btn';
  add.innerHTML = `${icon('plus')} 娣诲姞`;
  add.addEventListener('click', () => browseCompiler());
  const open = document.createElement('button');
  open.className = 'mini-btn';
  open.innerHTML = `${icon('terminal')} 缁堢`;
  open.addEventListener('click', () => openPanel('terminal'));
  footer.append(scan, add, open);
  dom.compilerPanel.append(footer);

  const note = document.createElement('div');
  note.className = 'ai-security';
  note.style.marginTop = '12px';
  note.innerHTML = `${icon('info')}<div>Orbit 浼氭壂鎻?PATH 涓庡父瑙佸畨瑁呯洰褰曪紝骞堕€愪釜灏濊瘯缂栬瘧鏉ョ‘璁ょ紪璇戝櫒鐪熸鏀寔鐨?C/C++ 鏍囧噯銆傚垏鎹㈢紪璇戝櫒鍚庯紝鏍囧噯浼氳嚜鍔ㄥ尮閰嶃€?/div>`;
  dom.compilerPanel.append(note);
}

async function scanCompilers() {
  if (state.compilerState?.scanning) return;
  state.compilerState = { ...state.compilerState, scanning: true };
  renderCompilers();
  toast('姝ｅ湪閲嶆柊鎵弿缂栬瘧鍣ㄢ€?, 'info', 2000);
  try {
    const result = await api.invoke('compilers:scan', {});
    state.compilers = result.compilers;
    state.selected = result.selected;
    state.compilerState = result.state;
    renderCompilers();
    renderStatus();
    toast(`鎵弿瀹屾垚锛屾娴嬪埌 ${result.compilers.length} 涓伐鍏烽摼`, 'success');
  } catch (error) {
    toast(error.message || '鎵弿澶辫触', 'error');
    state.compilerState = { ...state.compilerState, scanning: false };
    renderCompilers();
  }
}

async function browseCompiler() {
  try {
    const result = await api.invoke('compilers:browse');
    if (!result) return;
    state.compilers = result.compilers;
    state.selected = result.selected;
    renderCompilers();
    renderStatus();
    toast(`宸叉坊鍔?${result.compiler.name}`, 'success');
  } catch (error) {
    toast(error.message || '娣诲姞缂栬瘧鍣ㄥけ璐?, 'error');
  }
}

/* 鈹€鈹€ 闈㈡澘 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function openPanel(panel, options = {}) {
  if (panel === 'tests' && state.mode !== 'oi') panel = 'output';
  state.panel = panel;
  document.body.classList.remove('panel-closed');
  for (const tab of dom.panelTabs) tab.classList.toggle('active', tab.dataset.panel === panel);
  for (const view of dom.panelViews) view.classList.toggle('active', view.dataset.panelView === panel);
  if (!options.silent) {
    if (panel === 'tests') loadTests();
    if (panel === 'problems') renderProblems();
    if (panel === 'terminal') setTimeout(() => dom.terminalInput.focus(), 50);
  }
}

function togglePanel() {
  document.body.classList.toggle('panel-closed');
  if (!document.body.classList.contains('panel-closed')) openPanel(state.panel, { silent: true });
  setTimeout(() => editorHost?.layout(), 220);
}

function closePanel() {
  document.body.classList.add('panel-closed');
  setTimeout(() => editorHost?.layout(), 220);
}

/* 鈹€鈹€ 杩愯 / 杈撳嚭 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function appendOutput(text, className = 'out-stdout') {
  if (!text) return;
  const nearBottom = dom.outputPre.scrollHeight - dom.outputPre.scrollTop - dom.outputPre.clientHeight < 70;
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  dom.outputPre.append(span);
  if (nearBottom) dom.outputPre.scrollTop = dom.outputPre.scrollHeight;
}

function appendOutputLine(text, className = 'out-system') {
  appendOutput(`${text}\n`, className);
}

function resetOutput(text = '灏辩华 路 鎸?F5 缂栬瘧骞惰繍琛屽綋鍓嶆枃浠?, dot = 'ready') {
  dom.outputPre.innerHTML = '';
  dom.outputMeta.innerHTML = `<span class="dot ${dot}"></span><span>${esc(text)}</span>`;
}

function setOutputMeta(text, dot = 'ready') {
  dom.outputMeta.innerHTML = `<span class="dot ${dot}"></span><span>${esc(text)}</span>`;
}

function setRunning(running, runId = null) {
  state.running = running;
  state.activeRunId = runId;
  dom.runBtn.disabled = running;
  dom.stopBtn.disabled = !running;
  dom.stdinRow.classList.toggle('show', running);
  if (running) {
    setBuildStatus('杩愯涓?, 'busy');
    setOutputMeta('绋嬪簭杩愯涓?路 鍙湪涓嬫柟杈撳叆 stdin', 'running');
  } else {
    setBuildStatus('灏辩华');
    dom.stdinInput.value = '';
  }
}

async function runActive() {
  const tab = activeTab();
  if (!tab) {
    toast('璇峰厛鎵撳紑涓€涓彲杩愯鐨勬枃浠?, 'warning');
    return;
  }
  const meta = languageMeta(tab.language);
  if (!meta.runnable) {
    toast(`${meta.label} 鏆備笉鏀寔鐩存帴杩愯`, 'warning');
    return;
  }
  if (tab.dirty) {
    const ok = await saveTab(tab, { silent: true });
    if (!ok) return;
  }
  openPanel('output');
  resetOutput(`姝ｅ湪缂栬瘧 ${tab.name}鈥, 'running');
  appendOutputLine(`鈻?${tab.path}`, 'out-meta');
  appendOutputLine(`  缂栬瘧骞惰繍琛?路 ${new Date().toLocaleTimeString('zh-CN')}`, 'out-meta');
  setRunning(true);
  try {
    const result = await api.invoke('run:start', {
      path: tab.path,
      timeoutMs: state.mode === 'oi' ? 15_000 : 60_000,
    });
    if (result?.error) {
      appendOutputLine(`鍚姩澶辫触锛?{result.error}`, 'out-error');
      setRunning(false);
      return;
    }
    if (result?.build && !result.build.success) {
      appendOutputLine('缂栬瘧澶辫触锛岃鏌ョ湅闂闈㈡澘銆?, 'out-error');
      setBuildStatus('缂栬瘧澶辫触', 'err');
      setRunning(false);
      if (result.build.diagnostics?.length) setProblems(result.build.diagnostics);
      openPanel('problems');
      return;
    }
    if (!result?.runId) {
      setRunning(false);
    } else if (!state.activeRunId) {
      setRunning(true, result.runId);
    }
  } catch (error) {
    appendOutputLine(`杩愯澶辫触锛?{error.message}`, 'out-error');
    setBuildStatus('杩愯澶辫触', 'err');
    setRunning(false);
    toast(error.message || '杩愯澶辫触', 'error');
  }
}

async function buildActive() {
  const tab = activeTab();
  if (!tab) {
    toast('璇峰厛鎵撳紑鏂囦欢', 'warning');
    return;
  }
  if (tab.dirty) {
    const ok = await saveTab(tab, { silent: true });
    if (!ok) return;
  }
  openPanel('output');
  resetOutput(`姝ｅ湪缂栬瘧 ${tab.name}鈥, 'running');
  setBuildStatus('缂栬瘧涓?, 'busy');
  appendOutputLine(`鈻?缂栬瘧 ${tab.path}`, 'out-meta');
  try {
    const build = await api.invoke('run:build', { path: tab.path });
    if (build.success) {
      appendOutputLine(`鉁?缂栬瘧鎴愬姛 路 ${build.durationMs} ms`, 'out-success');
      if (build.compiler) {
        appendOutputLine(`  ${build.compiler.name}${build.standard ? ` 路 ${build.standard}` : ''}`, 'out-meta');
      }
      if (build.autoFallback) {
        appendOutputLine(`  ${build.autoFallback.reason}锛屽凡鑷姩浣跨敤 ${build.autoFallback.to}`, 'out-stderr');
        toast(`宸茶嚜鍔ㄥ洖閫€鍒?${build.autoFallback.to}`, 'warning', 4000);
      }
      setBuildStatus('缂栬瘧鎴愬姛', 'ok');
      toast(`缂栬瘧鎴愬姛锛岀敤鏃?${build.durationMs} ms`, 'success', 2200);
    } else {
      appendOutputLine('鉁?缂栬瘧澶辫触', 'out-error');
      setBuildStatus('缂栬瘧澶辫触', 'err');
      openPanel('problems');
      if (build.diagnostics?.length) setProblems(build.diagnostics);
    }
  } catch (error) {
    appendOutputLine(`缂栬瘧澶辫触锛?{error.message}`, 'out-error');
    setBuildStatus('缂栬瘧澶辫触', 'err');
    toast(error.message || '缂栬瘧澶辫触', 'error');
  }
}

async function stopRun() {
  if (!state.activeRunId) return;
  try {
    await api.invoke('run:stop', state.activeRunId);
    appendOutputLine('\n鈻?宸插仠姝㈣繍琛?, 'out-system');
    setRunning(false);
  } catch (error) {
    toast(error.message || '鍋滄澶辫触', 'error');
  }
}

function sendStdin() {
  if (!state.activeRunId) return;
  const value = dom.stdinInput.value;
  api.invoke('run:input', { runId: state.activeRunId, data: `${value}\n` });
  appendOutput(`${value}\n`, 'out-stdin');
  dom.stdinInput.value = '';
}

function handleRunEvent(event) {
  if (!event) return;
  switch (event.type) {
    case 'build-output':
      appendOutput(event.text, /error:/i.test(event.text) ? 'out-stderr' : 'out-meta');
      break;
    case 'run-started': {
      setRunning(true, event.runId);
      if (event.build) {
        const compiler = event.build.compiler?.name || '';
        const standard = event.build.standard ? ` 路 ${event.build.standard}` : '';
        appendOutputLine(`鈻?${compiler}${standard}`, 'out-meta');
        if (event.build.commandLine) appendOutputLine(event.build.commandLine, 'out-command');
        appendOutputLine('鈹€'.repeat(52), 'out-meta');
        if (event.build.autoFallback) {
          appendOutputLine(`! ${event.build.autoFallback.reason}锛屽凡鑷姩浣跨敤 ${event.build.autoFallback.to}銆俙, 'out-stderr');
          toast(`宸茶嚜鍔ㄥ洖閫€鍒?${event.build.autoFallback.to}锛?{event.build.autoFallback.reason}`, 'warning', 5000);
        }
      }
      break;
    }
    case 'run-output':
      appendOutput(event.data, event.stream === 'stderr' ? 'out-stderr' : 'out-stdout');
      break;
    case 'run-exit': {
      const code = event.run.exitCode;
      if (event.run.timedOut) {
        appendOutputLine(`\n鈻?杩愯瓒呮椂锛?{event.run.durationMs} ms锛塦, 'out-error');
      } else {
        appendOutputLine(`\n鈻?杩涚▼缁撴潫 路 閫€鍑虹爜 ${code} 路 ${event.run.durationMs} ms`, code === 0 ? 'out-success' : 'out-error');
      }
      setOutputMeta(`杩愯缁撴潫 路 閫€鍑虹爜 ${code}`, code === 0 ? 'ready' : 'error');
      setRunning(false);
      break;
    }
    case 'run-problems':
      setProblems(event.problems || []);
      break;
    case 'test-case-result':
      if (event.result) {
        state.testResults.set(event.result.id, event.result);
        renderCaseList();
      }
      break;
    default:
      break;
  }
}

/* 鈹€鈹€ 娴嬭瘯鐐?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

async function loadTests() {
  if (!state.workspace) {
    state.tests = { cases: [] };
    renderTests();
    return;
  }
  try {
    const data = await api.invoke('tests:read');
    state.tests = data && Array.isArray(data.cases) ? data : { cases: [] };
    const ids = new Set(state.tests.cases.map((item) => item.id));
    for (const id of [...state.expandedCases]) if (!ids.has(id)) state.expandedCases.delete(id);
    if (!state.expandedCases.size && state.tests.cases[0]) state.expandedCases.add(state.tests.cases[0].id);
    renderTests();
  } catch (error) {
    console.warn('鍔犺浇娴嬭瘯鐐瑰け璐?, error);
  }
}

function renderTests() {
  dom.testsCount.textContent = String(state.tests.cases.length);
  renderCaseList();
}

function testVerdict(result, running) {
  if (!result) return running ? { className: 'run', label: 'RUN' } : { className: '', label: '' };
  return {
    passed: { className: 'ac', label: 'AC' },
    'wrong-answer': { className: 'wa', label: 'WA' },
    timeout: { className: 'tle', label: 'TLE' },
    'runtime-error': { className: 're', label: 'RE' },
    'no-expected': { className: 'ok', label: 'OK' },
    running: { className: 'run', label: 'RUN' },
  }[result.status] || { className: '', label: String(result.status || '').toUpperCase() };
}

function statusLabel(status) {
  return {
    passed: '閫氳繃',
    'wrong-answer': '绛旀閿欒',
    'runtime-error': '杩愯閿欒',
    timeout: '瓒呮椂',
    'no-expected': '杩愯鎴愬姛',
    running: '杩愯涓?,
  }[status] || status;
}

function renderCaseList() {
  dom.caseList.innerHTML = '';
  const cases = state.tests.cases;
  const passed = cases.filter((item) => state.testResults.get(item.id)?.status === 'passed').length;
  if (dom.testsSummary) {
    dom.testsSummary.textContent = state.testRunning
      ? `${cases.length} tests 路 running鈥
      : `${cases.length} tests 路 ${passed}/${cases.length} AC`;
  }
  if (!cases.length) {
    const empty = document.createElement('div');
    empty.className = 'cph-empty';
    empty.innerHTML = `${icon('flask')}<b>杩樻病鏈夋祴璇曠偣</b><span>鐐瑰嚮涓嬫柟鈥滄坊鍔犳祴璇曠偣鈥濓紝鎴栫洿鎺ヨ繍琛岀▼搴?/span>`;
    dom.caseList.append(empty);
    const addRow = document.createElement('div');
    addRow.className = 'cph-add-row';
    addRow.innerHTML = `<button class="cph-add-btn">${icon('plus')} 娣诲姞娴嬭瘯鐐?/button>`;
    addRow.querySelector('button').addEventListener('click', addTestCase);
    dom.caseList.append(addRow);
    return;
  }

  cases.forEach((testCase, index) => {
    const result = state.testResults.get(testCase.id);
    const verdict = testVerdict(result, state.testRunning);
    const expanded = state.expandedCases.has(testCase.id);
    const card = document.createElement('div');
    card.className = `cph-case${verdict.className ? ` ${verdict.className}` : ''}${expanded ? ' expanded' : ''}`;
    card.dataset.id = testCase.id;

    const head = document.createElement('div');
    head.className = 'cph-case-head';
    head.innerHTML = `
      <span class="cph-case-idx">#${index + 1}</span>
      ${verdict.label ? `<span class="cph-verdict">${esc(verdict.label)}</span>` : ''}
      <span class="cph-case-name"></span>
      ${result && Number.isFinite(result.timeMs) ? `<span class="cph-meta-chip">${Math.round(result.timeMs)} ms</span>` : ''}
      <div class="cph-case-actions">
        <button class="cph-icon-btn run" title="杩愯姝ゆ祴璇曠偣" ${state.testRunning ? 'disabled' : ''}>${icon('play')}</button>
        <button class="cph-icon-btn del" title="鍒犻櫎娴嬭瘯鐐?>${icon('trash')}</button>
        <span class="cph-chevron">${icon('chevron-down')}</span>
      </div>
    `;
    head.querySelector('.cph-case-name').textContent = testCase.name;
    head.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (state.expandedCases.has(testCase.id)) state.expandedCases.delete(testCase.id);
      else state.expandedCases.add(testCase.id);
      renderCaseList();
    });
    head.querySelector('.cph-icon-btn.run').addEventListener('click', (event) => {
      event.stopPropagation();
      runSingleTest(testCase.id);
    });
    head.querySelector('.cph-icon-btn.del').addEventListener('click', (event) => {
      event.stopPropagation();
      deleteTestCase(testCase.id);
    });
    card.append(head);

    if (expanded) {
      const body = document.createElement('div');
      body.className = 'cph-case-body';
      const io = document.createElement('div');
      io.className = 'cph-io-grid';
      io.innerHTML = `
        <label class="cph-io-field">
          <span class="cph-io-label">杈撳叆 <small>stdin</small></span>
          <textarea data-field="input" spellcheck="false" placeholder="绋嬪簭鐨勬爣鍑嗚緭鍏?></textarea>
        </label>
        <label class="cph-io-field">
          <span class="cph-io-label">鏈熸湜杈撳嚭 <small>answer</small></span>
          <textarea data-field="expected" spellcheck="false" placeholder="鐣欑┖鍒欏彧妫€鏌ユ槸鍚︽甯歌繍琛?></textarea>
        </label>
      `;
      io.querySelector('[data-field="input"]').value = testCase.input || '';
      io.querySelector('[data-field="expected"]').value = testCase.expected || '';
      for (const textarea of io.querySelectorAll('textarea')) {
        textarea.addEventListener('input', () => {
          testCase[textarea.dataset.field] = textarea.value;
          state.testResults.delete(testCase.id);
          updateCaseCardState(testCase.id);
          scheduleSaveTests();
        });
      }
      body.append(io);

      if (result) {
        const resultBlock = document.createElement('div');
        resultBlock.className = 'cph-result-block';
        const stdoutClass = result.status === 'wrong-answer' ? 'fail' : 'pass';
        const stderrText = result.stderr || (result.timedOut ? '杩愯瓒呮椂' : '');
        resultBlock.innerHTML = `
          <div class="cph-output-field">
            <span>STDOUT</span>
            <pre class="${stdoutClass}"></pre>
          </div>
          <div class="cph-output-field">
            <span>STDERR</span>
            <pre class="${stderrText ? 'fail' : ''}"></pre>
          </div>
        `;
        resultBlock.querySelectorAll('pre')[0].textContent = result.actual || result.stdout || '(绌?';
        resultBlock.querySelectorAll('pre')[1].textContent = stderrText || '(绌?';
        body.append(resultBlock);
      }
      card.append(body);
    }
    dom.caseList.append(card);
  });

  const addRow = document.createElement('div');
  addRow.className = 'cph-add-row';
  addRow.innerHTML = `<button class="cph-add-btn">${icon('plus')} 娣诲姞娴嬭瘯鐐?/button>`;
  addRow.querySelector('button').addEventListener('click', addTestCase);
  dom.caseList.append(addRow);
}

function updateCaseCardState(id) {
  const card = [...dom.caseList.querySelectorAll('.cph-case')].find((node) => node.dataset.id === id);
  if (!card) return;
  const result = state.testResults.get(id);
  const verdict = testVerdict(result, false);
  for (const cls of ['ac', 'wa', 'tle', 're', 'ok', 'run']) card.classList.remove(cls);
  if (verdict.className) card.classList.add(verdict.className);
  const old = card.querySelector('.cph-verdict');
  if (verdict.label) {
    if (old) old.textContent = verdict.label;
    else {
      const chip = document.createElement('span');
      chip.className = 'cph-verdict';
      chip.textContent = verdict.label;
      card.querySelector('.cph-case-idx').after(chip);
    }
  } else old?.remove();
  const meta = card.querySelector('.cph-meta-chip');
  if (result && Number.isFinite(result.timeMs)) {
    if (meta) meta.textContent = `${Math.round(result.timeMs)} ms`;
  } else meta?.remove();
}

function scheduleSaveTests() {
  clearTimeout(state.testsSaveTimer);
  state.testsSaveTimer = setTimeout(async () => {
    try {
      await api.invoke('tests:write', { cases: state.tests.cases });
    } catch (error) {
      toast(`淇濆瓨娴嬭瘯鐐瑰け璐ワ細${error.message}`, 'error');
    }
  }, 500);
}

function addTestCase() {
  const number = state.tests.cases.length + 1;
  const testCase = {
    id: `case-${Date.now().toString(36)}`,
    name: `娴嬭瘯鐐?${number}`,
    input: '',
    expected: '',
    enabled: true,
  };
  state.tests.cases.push(testCase);
  state.expandedCases.add(testCase.id);
  state.testResults.delete(testCase.id);
  renderTests();
  scheduleSaveTests();
  setTimeout(() => {
    const textarea = dom.caseList.querySelector(`.cph-case[data-id="${testCase.id}"] textarea`);
    textarea?.focus();
  }, 30);
}

async function deleteTestCase(id) {
  const testCase = state.tests.cases.find((item) => item.id === id);
  if (!testCase) return;
  const confirmed = await confirmDialog({
    title: '鍒犻櫎娴嬭瘯鐐?,
    message: `纭畾鍒犻櫎銆?{testCase.name}銆嶅悧锛焋,
    confirmLabel: '鍒犻櫎',
    danger: true,
  });
  if (!confirmed) return;
  state.tests.cases = state.tests.cases.filter((item) => item.id !== id);
  state.testResults.delete(id);
  state.expandedCases.delete(id);
  renderTests();
  scheduleSaveTests();
}

async function clearTestCases() {
  if (!state.tests.cases.length) return;
  const confirmed = await confirmDialog({
    title: '娓呯┖娴嬭瘯鐐?,
    message: `纭畾鍒犻櫎鍏ㄩ儴 ${state.tests.cases.length} 涓祴璇曠偣鍚楋紵`,
    confirmLabel: '鍏ㄩ儴鍒犻櫎',
    danger: true,
  });
  if (!confirmed) return;
  state.tests.cases = [];
  state.testResults.clear();
  state.expandedCases.clear();
  renderTests();
  scheduleSaveTests();
}

async function resolveTestTarget() {
  const tab = activeTab();
  let target = tab && (tab.language === 'cpp' || tab.language === 'c') ? tab : null;
  if (!target) {
    const first = firstCppFromTree();
    if (first) target = await openFile(first, { silent: true });
  }
  if (!target) {
    toast('OI 妯″紡闇€瑕佸厛鎵撳紑 C/C++ 鏂囦欢', 'warning');
    return null;
  }
  if (state.mode === 'oi' && target.language !== 'cpp' && target.language !== 'c') {
    toast('OI 妯″紡浠呮敮鎸?C/C++ 璇勬祴', 'warning');
    return null;
  }
  if (target.dirty) {
    const ok = await saveTab(target, { silent: true });
    if (!ok) return null;
  }
  return target;
}

async function executeTestCases(cases, label = '娴嬭瘯') {
  if (state.testRunning) return;
  const list = (cases || []).filter((item) => item.enabled !== false);
  if (!list.length) {
    toast('璇峰厛娣诲姞鑷冲皯涓€涓祴璇曠偣', 'warning');
    return;
  }
  const target = await resolveTestTarget();
  if (!target) return;
  const single = list.length === 1;
  state.testRunning = true;
  if (!single) state.testResults.clear();
  dom.runTestsBtn.disabled = true;
  dom.runTestsBtn.innerHTML = `<span class="cph-running-spinner"></span> Running鈥;
  renderCaseList();
  setBuildStatus('璇勬祴涓?, 'busy');
  openPanel('tests', { silent: true });
  try {
    const result = await api.invoke('tests:run', {
      path: target.path,
      cases: list,
      timeoutMs: 5000,
    });
    if (result?.build?.success === false) {
      appendOutputLine('娴嬭瘯缂栬瘧澶辫触锛岃鏌ョ湅闂闈㈡澘銆?, 'out-error');
      if (result.build.diagnostics?.length) setProblems(result.build.diagnostics);
      openPanel('problems');
      toast('缂栬瘧澶辫触锛屾棤娉曡瘎娴?, 'error');
    }
    applyTestResults(result, { merge: single });
    if (single && result?.results?.[0]) {
      const one = result.results[0];
      toast(`${one.name}锛?{statusLabel(one.status)}`, one.passed ? 'success' : 'error', 2600);
    } else if (result?.allPassed) {
      toast(`${label}鍏ㄩ儴閫氳繃 路 ${result.passed}/${result.total}`, 'success');
      appendOutputLine(`鍏ㄩ儴娴嬭瘯閫氳繃锛?{result.passed}/${result.total}`, 'out-success');
    } else if (result) {
      appendOutputLine(`${label}瀹屾垚锛氶€氳繃 ${result.passed}/${result.total}`, 'out-error');
    }
  } catch (error) {
    toast(error.message || '璇勬祴澶辫触', 'error');
    appendOutputLine(`璇勬祴澶辫触锛?{error.message}`, 'out-error');
  } finally {
    state.testRunning = false;
    dom.runTestsBtn.disabled = false;
    dom.runTestsBtn.innerHTML = `${icon('play')} Run All`;
    setBuildStatus('灏辩华');
    renderCaseList();
  }
}

async function runTests() {
  await executeTestCases(state.tests.cases, '娴嬭瘯');
}

async function runSingleTest(id) {
  const testCase = state.tests.cases.find((item) => item.id === id);
  if (!testCase) return;
  state.expandedCases.add(id);
  await executeTestCases([testCase], `#${state.tests.cases.indexOf(testCase) + 1} `);
}

function applyTestResults(result, options = {}) {
  if (!result?.results) return;
  if (!options.merge) state.testResults.clear();
  for (const item of result.results) state.testResults.set(item.id, item);
  renderCaseList();
  if (result.build?.diagnostics) setProblems(result.build.diagnostics);
}

/* 鈹€鈹€ 缁堢 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function appendTerminal(text, className = '') {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  dom.terminalPre.append(span);
  dom.terminalPre.scrollTop = dom.terminalPre.scrollHeight;
}

async function executeTerminal(command) {
  if (state.terminalBusy || !command.trim()) return;
  appendTerminal(`\nPS ${state.workspace?.path || ''}> ${command}\n`, 'out-command');
  state.terminalHistory.push(command);
  state.terminalHistoryIndex = state.terminalHistory.length;
  if (command.trim() === 'clear' || command.trim() === 'cls') {
    dom.terminalPre.innerHTML = '';
    return;
  }
  state.terminalBusy = true;
  try {
    const result = await api.invoke('terminal:exec', { command });
    if (result.stdout) appendTerminal(result.stdout, 'out-stdout');
    if (result.stderr) appendTerminal(result.stderr, 'out-stderr');
    if (result.timedOut) appendTerminal(`\n[鍛戒护瓒呮椂锛屽凡缁堟]\n`, 'out-error');
    else if (result.exitCode !== 0) appendTerminal(`\n[閫€鍑虹爜 ${result.exitCode} 路 ${result.durationMs} ms]\n`, 'out-meta');
  } catch (error) {
    appendTerminal(`\n[鎵ц澶辫触] ${error.message}\n`, 'out-error');
  } finally {
    state.terminalBusy = false;
  }
}

/* 鈹€鈹€ AI 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function updateAIChrome() {
  const running = state.ai?.running;
  const sessions = state.ai?.sessions?.length || 0;
  const pending = state.ai?.pending?.length || 0;
  dom.aiPill.classList.toggle('online', Boolean(running && sessions));
  dom.aiPill.classList.toggle('pending', pending > 0);
  dom.aiPillText.textContent = pending ? `${pending} 涓緟瀹℃壒` : sessions ? `${sessions} 涓?AI 鍦ㄧ嚎` : running ? 'AI 寰呮帴鍏? : 'AI 鏈嶅姟鏈惎鍔?;
  dom.statusAI.classList.toggle('online', Boolean(running && sessions));
  dom.statusAI.classList.toggle('pending', pending > 0);
  dom.statusAIText.textContent = pending ? '绛夊緟瀹℃壒' : sessions ? `${sessions} AI 鍦ㄧ嚎` : 'AI 寰呮帴鍏?;
  if (pending > 0) {
    dom.aiActivityBadge.textContent = String(pending);
    dom.aiActivityBadge.classList.add('show');
  } else {
    dom.aiActivityBadge.classList.remove('show');
  }
}

function renderAI() {
  const info = state.ai || {};
  const previousScroll = dom.aiPanel.scrollTop;
  const endpoint = info.endpoint || 'http://127.0.0.1:37821';
  const sessions = info.sessions || [];
  const pending = info.pending || [];
  const scopes = info.scopes || [];
  const scopeLabel = (id) => scopes.find((item) => item.id === id)?.label || id;
  const trusted =
    (Array.isArray(info.trusted) && info.trusted.length ? info.trusted : state.settings.trustedClients) || [];
  const audit = state.audit || [];

  const hero = `
    <div class="ai-hero">
      <div class="ai-hero-head">
        <div class="ai-orb">${icon('sparkles')}</div>
        <div class="ai-hero-title">
          <b>${info.running ? '鏈湴鎺у埗鏈嶅姟杩愯涓? : '鏈湴鎺у埗鏈嶅姟鏈惎鍔?}</b>
          <span>浠呯洃鍚?127.0.0.1 路 Bearer 浠ょ墝 路 24 灏忔椂鏈夋晥</span>
        </div>
      </div>
      <div class="endpoint-box">
        <span title="${esc(endpoint)}">${esc(endpoint)}</span>
        <button class="icon-btn" data-ai-action="copy-endpoint" title="澶嶅埗鍦板潃">${icon('copy')}</button>
      </div>
      <div class="ai-stats">
        <div class="ai-stat"><b>${sessions.length}</b><span>鍦ㄧ嚎瀹㈡埛绔?/span></div>
        <div class="ai-stat"><b>${pending.length}</b><span>寰呭鎵硅姹?/span></div>
        <div class="ai-stat"><b>${trusted.length}</b><span>鍙椾俊浠?/span></div>
      </div>
    </div>
  `;

  const pendingHtml = pending.length
    ? `<div class="ai-section">
        <div class="ai-section-title">${icon('key')} 绛夊緟浣犵殑鎵瑰噯 <span class="spacer"></span><span style="color:var(--warn)">${pending.length}</span></div>
        ${pending
          .map(
            (request) => `
          <div class="pending-card">
            ${icon('user')}
            <div style="flex:1;min-width:0">
              <b>${esc(request.clientName)}</b>
              <small>${esc(request.remoteAddress || 'localhost')} 路 ${relativeTime(request.createdAt)}</small>
              <small style="display:block;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(request.source || request.userAgent || '鏈湴杩涚▼')}</small>
            </div>
            <button class="mini-btn accent" data-ai-action="review" data-id="${esc(request.requestId)}">瀹￠槄</button>
          </div>`
          )
          .join('')}
      </div>`
    : '';

  const sessionsHtml = sessions.length
    ? `<div class="ai-section">
        <div class="ai-section-title">${icon('link')} 宸茶繛鎺?<span class="spacer"></span><span>${sessions.length}</span></div>
        ${sessions
          .map(
            (session) => `
          <div class="client-card">
            <div class="client-name"><span class="client-dot"></span>${esc(session.clientName)}</div>
            <div class="client-meta">${relativeTime(session.createdAt)}杩炴帴 路 ${new Date(session.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 杩囨湡</div>
            <div class="scope-chips">${(session.scopes || []).map((scope) => `<span class="scope-chip">${esc(scope)}</span>`).join('')}</div>
            <button class="revoke-btn" data-ai-action="revoke" data-id="${esc(session.id)}">鎾ら攢璁块棶</button>
          </div>`
          )
          .join('')}
      </div>`
    : '';

  const trustedHtml = trusted.length
    ? `<div class="ai-section">
        <div class="ai-section-title">${icon('shield')} 鍙椾俊浠诲鎴风 <span class="spacer"></span><span>${trusted.length}</span></div>
        ${trusted
          .map(
            (client) => `
          <div class="client-card">
            <div class="client-name" style="color:var(--text-soft)">${esc(client.clientName)}</div>
            <div class="client-meta">宸茶浣?路 ${relativeTime(client.approvedAt)}鎺堟潈</div>
            <button class="revoke-btn" data-ai-action="revoke-trusted" data-id="${esc(client.id)}">绉婚櫎淇′换</button>
          </div>`
          )
          .join('')}
      </div>`
    : '';

  const curl = `curl -X POST ${endpoint}/v1/login \\
  -H "Content-Type: application/json" \\
  -d '{"clientName":"My Agent","scopes":["read","write","editor","run"]}'`;
  const python = `import requests, time

BASE = "${endpoint}"
r = requests.post(f"{BASE}/v1/login", json={
    "clientName": "My Agent",
    "scopes": ["read", "write", "editor", "run"],
})
req = r.json()
print("璇峰湪 Orbit IDE 涓壒鍑?", req["requestId"])

while req["status"] == "pending":
    time.sleep(1.5)
    req = requests.get(f"{BASE}{req['poll']}").json()

token = req["token"]
requests.get(f"{BASE}/v1/state", headers={
    "Authorization": f"Bearer {token}"
}).json()`;
  const snippet = state.aiSnippetTab === 'python' ? python : curl;

  const auditHtml = audit.length
    ? audit
        .slice(0, 8)
        .map(
          (item) => `
      <div class="audit-item">
        <span class="audit-time">${timeText(item.at)}</span>
        <span class="audit-text"><b>${esc(item.clientName || '绯荤粺')}</b> 路 ${esc(item.summary || item.path || item.kind || '')}</span>
        <span class="audit-status${item.status && item.status >= 400 ? ' err' : ''}"></span>
      </div>`
        )
        .join('')
    : `<div class="empty-state" style="padding:14px 4px">鏆傛棤 AI 鎿嶄綔璁板綍</div>`;

  dom.aiPanel.innerHTML = `
    ${hero}
    ${pendingHtml}
    ${sessionsHtml}
    ${trustedHtml}
    <div class="ai-section">
      <div class="ai-section-title">${icon('terminal')} 杩炴帴鏂瑰紡 <span class="spacer"></span><button class="link-btn" data-ai-action="open-docs">API 鏂囨。</button></div>
      <div class="code-tabs">
        <button class="code-tab ${state.aiSnippetTab === 'curl' ? 'active' : ''}" data-ai-action="tab" data-tab="curl">cURL</button>
        <button class="code-tab ${state.aiSnippetTab === 'python' ? 'active' : ''}" data-ai-action="tab" data-tab="python">Python</button>
      </div>
      <div class="code-block">
        <button class="copy-code" data-ai-action="copy-code" title="澶嶅埗">${icon('copy')}</button>
        <pre></pre>
      </div>
      <div class="field-hint" style="margin-top:7px">鍙戦€佺櫥褰曡姹傚悗锛孖DE 鍐呬細寮瑰嚭瀹℃壒绐楀彛銆傛壒鍑嗗悗鍗冲彲璋冪敤鍏ㄩ儴鎿嶄綔銆?/div>
    </div>
    <div class="ai-section">
      <div class="ai-section-title">${icon('clock')} 杩戞湡娲诲姩 <span class="spacer"></span><button class="link-btn" data-ai-action="refresh-audit">鍒锋柊</button></div>
      ${auditHtml}
    </div>
    <div class="ai-security">${icon('shield')}<div>AI 鏈嶅姟鍙粦瀹氭湰鏈哄洖鐜湴鍧€銆傛瘡涓鎴风棣栨杩炴帴閮介渶瑕佷綘鍦?IDE 鍐呯‘璁わ紱浠ょ墝涓庝俊浠诲叧绯诲彲闅忔椂鎾ら攢銆?/div></div>
  `;
  const code = $('.code-block pre', dom.aiPanel);
  if (code) code.textContent = snippet;
  hydrateIcons(dom.aiPanel);
  dom.aiPanel.scrollTop = previousScroll;
}

async function refreshAudit() {
  try {
    const data = await api.invoke('ai:audit');
    state.audit = data.audit || [];
    if (data.trusted) state.settings.trustedClients = data.trusted;
    if (document.body.classList.contains('ai-open')) renderAI();
  } catch {
    // 蹇界暐瀹¤鍒锋柊閿欒銆?  }
}

function scheduleAuditRefresh() {
  clearTimeout(state.auditTimer);
  state.auditTimer = setTimeout(refreshAudit, 450);
}

function openAIDrawer() {
  document.body.classList.add('ai-open');
  updateActivity();
  renderAI();
  refreshAudit();
  setTimeout(() => editorHost?.layout(), 320);
}

function closeAIDrawer() {
  document.body.classList.remove('ai-open');
  updateActivity();
  setTimeout(() => editorHost?.layout(), 320);
}

function toggleAIDrawer() {
  if (document.body.classList.contains('ai-open')) closeAIDrawer();
  else openAIDrawer();
}

function enqueueLogin(request) {
  if (!request?.requestId) return;
  if (state.handledLogins.has(request.requestId)) return;
  if (state.currentLoginId === request.requestId) return;
  if (state.loginQueue.some((item) => item.requestId === request.requestId)) return;
  state.loginQueue.push(request);
  updateAIChrome();
  maybeShowLogin();
}

function maybeShowLogin() {
  if (state.loginModalOpen || state.activeModal) return;
  const request = state.loginQueue.shift();
  if (!request) return;
  showLoginModal(request);
}

function showLoginModal(request) {
  if (!request) return;
  state.loginModalOpen = true;
  state.currentLoginId = request.requestId;
  state.loginQueue = state.loginQueue.filter((item) => item.requestId !== request.requestId);
  let resolved = false;
  const scopeLabels = state.ai.scopes || [];
  const scopeLabel = (id) => scopeLabels.find((item) => item.id === id)?.label || id;
  const scopeIcons = {
    read: 'file', write: 'edit', editor: 'code', run: 'play', terminal: 'terminal', mode: 'orbit', compilers: 'cpu', settings: 'settings', ui: 'panel',
  };
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="login-client">
      <div class="login-client-head">
        <div class="login-client-avatar">${icon('sparkles')}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(request.clientName)}</b>
          <small>${esc(request.remoteAddress || '127.0.0.1')} 路 ${relativeTime(request.createdAt)}鍙戣捣</small>
          <small style="color:var(--dim);word-break:break-all">鏉ユ簮锛?{esc(request.source || request.userAgent || request.origin || '鏈湴杩涚▼')}</small>
        </div>
        <span class="result-pill" style="background:rgba(251,191,36,.1);color:var(--warn)">寰呭鎵?/span>
      </div>
      ${request.clientId ? `<div class="login-scopes-label" style="margin-top:8px">clientId锛?span style="color:var(--text-soft);font-family:var(--mono)">${esc(request.clientId)}</span></div>` : ''}
      <div class="login-scopes">
        <div class="login-scopes-label">璇锋眰鐨勬潈闄?/div>
        <div class="scope-grid">
          ${(request.scopes || [])
            .map(
              (scope) => `<div class="scope-line">${icon(scopeIcons[scope] || 'check')}<span>${esc(scopeLabel(scope))}</span></div>`
            )
            .join('')}
        </div>
      </div>
    </div>
    <label class="check-row" ${request.clientId ? '' : 'title="瀹㈡埛绔湭鎻愪緵 clientId锛屾棤娉曡浣?'}><input type="checkbox" id="rememberClient" ${request.clientId ? '' : 'disabled'} /> 璁颁綇姝ゅ鎴风锛屼笅娆¤嚜鍔ㄦ壒鍑嗙浉鍚屾潈闄?{request.clientId ? '' : '锛堥渶瑕?clientId锛?}</label>
    <div class="login-warning" style="margin-top:12px">${icon('warning')}<div>鎵瑰噯鍚庯紝璇ュ鎴风浠呰兘鍦ㄤ笂鏂瑰垪鍑虹殑鏉冮檺鑼冨洿鍐呮搷浣滐細璇诲啓鏂囦欢銆佷慨鏀圭紪杈戝櫒銆佽繍琛屼唬鐮侊紝鎴栨墽琛岀粓绔懡浠ゃ€傝纭浣犱俊浠绘瀹㈡埛绔€?/div></div>
  `;
  const modal = showModal({
    title: 'AI 瀹㈡埛绔姹傛帴鍏?,
    subtitle: '璇锋槑纭€夋嫨鈥滃厑璁告帴鍏モ€濇垨鈥滄嫆缁濃€濄€傜偣鍑荤獥鍙ｅ閮ㄤ笉浼氬叧闂垨鎷掔粷姝よ姹傘€?,
    iconName: 'key',
    className: 'login-modal',
    content,
    dismissible: false,
    onClose: () => {
      state.loginModalOpen = false;
      state.currentLoginId = null;
      state.handledLogins.add(request.requestId);
      if (!resolved) {
        api.invoke('ai:respond', { requestId: request.requestId, approved: false, remember: false }).catch(() => {});
      }
      setTimeout(maybeShowLogin, 300);
    },
    buttons: [
      {
        label: '鎷掔粷',
        onClick: async () => {
          resolved = true;
          await api.invoke('ai:respond', { requestId: request.requestId, approved: false, remember: false }).catch(() => {});
          toast('宸叉嫆缁?AI 鐧诲綍璇锋眰', 'info');
          return true;
        },
      },
      {
        label: '鍏佽鎺ュ叆',
        class: 'primary',
        onClick: async () => {
          const remember = Boolean($('#rememberClient', content)?.checked);
          resolved = true;
          const result = await api.invoke('ai:respond', { requestId: request.requestId, approved: true, remember });
          if (!result?.ok) {
            resolved = false;
            toast(result?.message || '鎵瑰噯澶辫触', 'error');
            return false;
          }
          toast('宸叉壒鍑?AI 鎺ュ叆', 'success');
          state.ai = await api.invoke('ai:status');
          renderAI();
          updateAIChrome();
          openAIDrawer();
          return true;
        },
      },
    ],
  });
  if (!modal) {
    state.loginModalOpen = false;
    state.currentLoginId = null;
    state.handledLogins.add(request.requestId);
    maybeShowLogin();
  }
}

function handleAIAction(event) {
  const target = event.target.closest('[data-ai-action]');
  if (!target) return;
  const action = target.dataset.aiAction;
  if (action === 'copy-endpoint') copyText(state.ai.endpoint || '');
  else if (action === 'copy-code') {
    const code = $('.code-block pre', dom.aiPanel)?.textContent || '';
    copyText(code);
  } else if (action === 'tab') {
    state.aiSnippetTab = target.dataset.tab;
    renderAI();
  } else if (action === 'open-docs') {
    api.invoke('ai:openDocs').catch(() => {});
  } else if (action === 'refresh-audit') {
    refreshAudit();
  } else if (action === 'review') {
    const request = (state.ai.pending || []).find((item) => item.requestId === target.dataset.id);
    if (request) showLoginModal(request);
  } else if (action === 'revoke') {
    revokeSession(target.dataset.id);
  } else if (action === 'revoke-trusted') {
    revokeTrusted(target.dataset.id);
  }
}

async function revokeSession(id) {
  try {
    await api.invoke('ai:revoke', id);
    state.ai = await api.invoke('ai:status');
    renderAI();
    updateAIChrome();
    refreshAudit();
    toast('宸叉挙閿€璇?AI 浼氳瘽', 'success');
  } catch (error) {
    toast(error.message || '鎾ら攢澶辫触', 'error');
  }
}

async function revokeTrusted(id) {
  try {
    await api.invoke('ai:revokeTrusted', id);
    state.settings.trustedClients = (state.settings.trustedClients || []).filter((item) => item.id !== id);
    state.ai = await api.invoke('ai:status');
    renderAI();
    updateAIChrome();
    toast('宸茬Щ闄ゅ彈淇′换瀹㈡埛绔?, 'success');
  } catch (error) {
    toast(error.message || '鎿嶄綔澶辫触', 'error');
  }
}

/* 鈹€鈹€ 娆㈣繋椤?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function renderWelcome() {
  if (activeTab()) {
    dom.welcome.classList.add('hidden');
    return;
  }
  dom.welcome.classList.remove('hidden');
  const mode = state.mode;
  const compiler = state.selected?.cpp
    ? state.compilers.find((item) => item.id === state.selected.cpp.compilerId)
    : null;
  const standard = compiler?.standards?.find((item) => item.id === state.selected.cpp?.standard);
  const workspaceName = state.workspace?.name || '鏈墦寮€宸ヤ綔鍖?;
  const endpoint = state.ai?.endpoint || '127.0.0.1';
  dom.welcome.innerHTML = `
    <div class="welcome-inner">
      <div class="welcome-copy">
        <div class="welcome-eyebrow">ORBIT IDE 路 ${mode === 'oi' ? 'OI COMPETITION' : 'DEVELOPMENT'}</div>
        <h1>璁╂兂娉?br /><em>杩涘叆杞ㄩ亾</em></h1>
        <p class="welcome-lede">
          ${mode === 'oi'
            ? '涓撴敞绔炶禌鐨?C++ 宸ヤ綔鍙般€傜紪璇戝櫒鏍囧噯鑷姩鍖归厤锛屾牱渚嬩竴閿瘎娴嬶紝璁╀綘鍙叧蹇冪畻娉曟湰韬€?
            : '涓€涓畨闈欒€屽己澶х殑澶氳瑷€寮€鍙戠幆澧冦€侫I 鍙互閫氳繃鏈湴鎺ュ彛鎺ュ叆锛屽湪浣犵殑璁稿彲涓嬬洿鎺ュ弬涓庡垱浣溿€?}
        </p>
        <div class="welcome-actions">
          <button class="btn primary" data-welcome="new-file">${icon('plus')} 鏂板缓鏂囦欢</button>
          <button class="btn" data-welcome="open-folder">${icon('folder-open')} 鎵撳紑鏂囦欢澶?/button>
          <button class="btn ghost" data-welcome="switch-mode">${icon(mode === 'oi' ? 'code' : 'orbit')} 鍒囨崲鍒?{mode === 'oi' ? '寮€鍙? : 'OI'}妯″紡</button>
        </div>
        <div class="welcome-shortcuts">
          <div class="ws-key"><kbd>F5</kbd> 缂栬瘧骞惰繍琛?/div>
          <div class="ws-key"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>P</kbd> 鍛戒护闈㈡澘</div>
          <div class="ws-key"><kbd>Ctrl</kbd><kbd>P</kbd> 蹇€熸墦寮€</div>
          <div class="ws-key"><kbd>Ctrl</kbd><kbd>\`</kbd> 搴曢儴闈㈡澘</div>
          <div class="ws-key"><kbd>Ctrl</kbd><kbd>S</kbd> 淇濆瓨鏂囦欢</div>
          <div class="ws-key"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>B</kbd> 浠呯紪璇?/div>
        </div>
      </div>
      <div class="welcome-visual">
        <div class="visual-badge"><span class="dot"></span> ${mode === 'oi' ? 'OI 妯″紡宸插氨缁? : '寮€鍙戞ā寮忓凡灏辩华'}</div>
        <div class="orbit-graphic">
          <div class="orbit-ring"></div>
          <div class="orbit-ring r2"></div>
          <div class="orbit-ring r3"></div>
          <div class="orbit-core">${icon('orbit')}</div>
          <div class="orbit-node n1"></div>
          <div class="orbit-node n2"></div>
          <div class="orbit-node n3"></div>
        </div>
        <div class="graph-card g1">
          <div class="line"><b>${mode === 'oi' ? (compiler ? esc(compiler.name) : '绛夊緟缂栬瘧鍣?) : '澶氳瑷€宸ュ叿閾?}</b></div>
          <div class="line">${mode === 'oi' ? `${esc(standard?.label || '鑷姩鍖归厤')} 路 C++` : `${state.compilers.length} 涓彲鐢ㄥ伐鍏烽摼`}</div>
        </div>
        <div class="graph-card g2">
          <div class="line"><b>AI LINK</b> 路 鏈湴鎺ュ彛</div>
          <div class="line">${esc(endpoint.replace(/^https?:\/\//, ''))}</div>
        </div>
        <div class="welcome-side-label">${esc(workspaceName)} 路 ORBIT WORKSPACE</div>
      </div>
    </div>
  `;
  hydrateIcons(dom.welcome);
}

function bindWelcome() {
  dom.welcome.addEventListener('click', (event) => {
    const target = event.target.closest('[data-welcome]');
    if (!target) return;
    const action = target.dataset.welcome;
    if (action === 'new-file') promptNewFile();
    else if (action === 'open-folder') chooseWorkspace();
    else if (action === 'switch-mode') switchMode(state.mode === 'oi' ? 'dev' : 'oi');
  });
}

/* 鈹€鈹€ 鏂板缓 / 閲嶅懡鍚?/ 鍒犻櫎 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function promptNewFile(rootPath = '') {
  const languages = state.mode === 'oi' ? ['cpp', 'c'] : NEW_FILE_LANGS;
  let language = 'cpp';
  const dir = rootPath && rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
  const defaultPath = dir ? `${dir}/main.cpp` : 'main.cpp';
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="field">
      <label>鏂囦欢璺緞</label>
      <input type="text" id="newFilePath" value="${esc(defaultPath)}" spellcheck="false" />
      <div class="field-hint">鐩稿浜庡伐浣滃尯鏍圭洰褰曪紝渚嬪 <code>src/main.cpp</code></div>
    </div>
    <div class="field">
      <label>璇█</label>
      <select id="newFileLanguage">${languages
        .map((id) => `<option value="${id}" ${id === language ? 'selected' : ''}>${esc(languageMeta(id).label)}锛?{DEFAULT_EXT[id]}锛?/option>`)
        .join('')}</select>
      <div class="field-error" id="newFileError"></div>
    </div>
  `;
  const input = $('#newFilePath', content);
  const select = $('#newFileLanguage', content);
  const error = $('#newFileError', content);
  select.addEventListener('change', () => {
    language = select.value;
    const current = input.value;
    const currentExt = extname(current);
    const known = Object.values(DEFAULT_EXT);
    if (!currentExt || known.includes(currentExt)) {
      input.value = current.replace(/\.[^.\/]*$/, '') + DEFAULT_EXT[language];
    }
  });
  let submitting = false;
  const submit = async () => {
    if (submitting) return false;
    const raw = input.value.trim();
    if (!raw) {
      error.textContent = '璇疯緭鍏ユ枃浠惰矾寰?;
      return false;
    }
    let target = raw.replace(/\\/g, '/');
    if (!extname(target)) target += DEFAULT_EXT[language];
    submitting = true;
    try {
      const result = await api.invoke('file:create', {
        path: target,
        kind: 'file',
        content: newFileContentForLanguage(language, target),
      });
      await refreshTree();
      await refreshFiles();
      await openFile(result.path);
      toast(`宸插垱寤?${result.path}`, 'success');
      closeModal();
      return true;
    } catch (err) {
      error.textContent = err.message || '鍒涘缓澶辫触';
      submitting = false;
      return false;
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  showModal({
    title: '鏂板缓鏂囦欢',
    subtitle: state.mode === 'oi' ? 'OI 妯″紡浠呭厑璁稿垱寤?C/C++ 绯诲垪鏂囦欢銆? : '閫夋嫨璇█鍚庝細鑷姩琛ュ叏鎵╁睍鍚嶃€?,
    iconName: 'plus',
    content,
    dismissible: true,
    buttons: [
      { label: '鍙栨秷', onClick: () => true },
      { label: '鍒涘缓鏂囦欢', class: 'primary', onClick: submit },
    ],
  });
  setTimeout(() => {
    input.focus();
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  }, 40);
}

function newFileContentForLanguage(language, targetPath = '') {
  if (language === 'cpp') return cppTemplate();
  if (language === 'c') return '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n';
  if (language === 'python') return 'def solve() -> None:\n    pass\n\n\nif __name__ == "__main__":\n    solve()\n';
  if (language === 'javascript') return 'function solve() {\n  \n}\n\nsolve();\n';
  if (language === 'typescript') return 'function solve(): void {\n  \n}\n\nsolve();\n';
  if (language === 'java') {
    const raw = basename(targetPath).replace(/\.java$/i, '');
    const className = /^[A-Za-z_$][\w$]*$/.test(raw) ? raw : 'Main';
    return `public class ${className} {\n    public static void main(String[] args) {\n        \n    }\n}\n`;
  }
  if (language === 'go') return 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, Orbit")\n}\n';
  if (language === 'rust') return 'fn main() {\n    println!("Hello, Orbit");\n}\n';
  if (language === 'markdown') return '# 鏂版枃妗n\n鍦ㄨ繖閲屽紑濮嬩功鍐欍€俓n';
  if (language === 'html') return '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <title>Orbit</title>\n</head>\n<body>\n  \n</body>\n</html>\n';
  if (language === 'json') return '{\n  \n}\n';
  return '';
}

function promptNewFolder(rootPath = '') {
  const content = document.createElement('div');
  const base = rootPath ? `${rootPath.replace(/\/$/, '')}/` : '';
  content.innerHTML = `
    <div class="field">
      <label>鏂囦欢澶硅矾寰?/label>
      <input type="text" id="newFolderPath" value="${esc(base)}" spellcheck="false" placeholder="渚嬪 src/components" />
      <div class="field-hint">璺緞鐩稿浜庡伐浣滃尯鏍圭洰褰曪紝鍙垱寤哄绾х洰褰曘€?/div>
      <div class="field-error" id="newFolderError"></div>
    </div>
  `;
  const input = $('#newFolderPath', content);
  const error = $('#newFolderError', content);
  let submitting = false;
  const submit = async () => {
    if (submitting) return false;
    const target = input.value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!target) {
      error.textContent = '璇疯緭鍏ユ枃浠跺す璺緞';
      return false;
    }
    submitting = true;
    try {
      await api.invoke('file:mkdir', target);
      await refreshTree();
      toast(`宸插垱寤烘枃浠跺す ${target}`, 'success');
      closeModal();
      return true;
    } catch (err) {
      error.textContent = err.message || '鍒涘缓澶辫触';
      submitting = false;
      return false;
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  showModal({
    title: '鏂板缓鏂囦欢澶?,
    subtitle: '鏁寸悊浣犵殑椤圭洰缁撴瀯銆?,
    iconName: 'folder-plus',
    content,
    dismissible: true,
    buttons: [
      { label: '鍙栨秷', onClick: () => true },
      { label: '鍒涘缓鏂囦欢澶?, class: 'primary', onClick: submit },
    ],
  });
  setTimeout(() => input.focus(), 40);
}

function promptRename(filePath) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="field">
      <label>鏂拌矾寰?/label>
      <input type="text" id="renamePath" value="${esc(filePath)}" spellcheck="false" />
      <div class="field-error" id="renameError"></div>
    </div>
  `;
  const input = $('#renamePath', content);
  const error = $('#renameError', content);
  const submit = async () => {
    const target = input.value.trim().replace(/\\/g, '/');
    if (!target) {
      error.textContent = '璺緞涓嶈兘涓虹┖';
      return false;
    }
    const tab = findTab(filePath);
    if (tab?.dirty) {
      const ok = await saveTab(tab, { silent: true });
      if (!ok) return false;
    }
    try {
      await api.invoke('file:rename', { from: filePath, to: target });
      await refreshTree();
      await refreshFiles();
      toast(`宸查噸鍛藉悕涓?${target}`, 'success');
      closeModal();
      return true;
    } catch (err) {
      error.textContent = err.message || '閲嶅懡鍚嶅け璐?;
      return false;
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  showModal({
    title: '閲嶅懡鍚?,
    subtitle: '鏂囦欢鎴栨枃浠跺す浼氱珛鍗崇Щ鍔ㄥ埌鏂拌矾寰勩€?,
    iconName: 'edit',
    content,
    dismissible: true,
    buttons: [
      { label: '鍙栨秷', onClick: () => true },
      { label: '閲嶅懡鍚?, class: 'primary', onClick: submit },
    ],
  });
  setTimeout(() => {
    input.focus();
    input.setSelectionRange(0, input.value.lastIndexOf('.') > 0 ? input.value.lastIndexOf('.') : input.value.length);
  }, 40);
}

async function promptDelete(filePath, type = 'file') {
  const confirmed = await confirmDialog({
    title: `鍒犻櫎${type === 'dir' ? '鏂囦欢澶? : '鏂囦欢'}`,
    message: `纭畾瑕佸垹闄ゃ€?{filePath}銆嶅悧锛?{type === 'dir' ? '鍏朵腑鐨勬墍鏈夊唴瀹归兘浼氱Щ鍏ュ洖鏀剁珯銆? : '鏂囦欢浼氱Щ鍏ュ洖鏀剁珯銆?}`,
    confirmLabel: '鍒犻櫎',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.invoke('file:delete', filePath);
    await refreshTree();
    await refreshFiles();
    toast('宸插垹闄?, 'success');
  } catch (error) {
    toast(error.message || '鍒犻櫎澶辫触', 'error');
  }
}

/* 鈹€鈹€ 宸ヤ綔鍖哄垏鎹?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

async function chooseWorkspace() {
  if (state.tabs.some((tab) => tab.dirty)) {
    const confirmed = await confirmDialog({
      title: '鍒囨崲宸ヤ綔鍖?,
      message: '褰撳墠鏈夋湭淇濆瓨鐨勬枃浠躲€傚垏鎹㈠墠浼氬厛淇濆瓨杩欎簺鏂囦欢銆?,
      confirmLabel: '淇濆瓨骞剁户缁?,
    });
    if (!confirmed) return;
    const ok = await saveAll({ silent: true });
    if (!ok) return;
  }
  try {
    const payload = await api.invoke('workspace:choose');
    if (!payload) return;
    applyWorkspacePayload(payload);
    toast('宸ヤ綔鍖哄凡鍒囨崲', 'success');
    setTimeout(() => editorHost?.layout(), 100);
  } catch (error) {
    toast(error.message || '鎵撳紑鏂囦欢澶瑰け璐?, 'error');
  }
}

/* 鈹€鈹€ 璁剧疆 / 甯姪 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function showSettings() {
  const s = state.settings;
  const content = document.createElement('div');
  content.className = 'settings-grid';
  content.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">缂栬緫鍣?/div>
      <div class="setting-row">
        <div class="setting-label"><b>瀛椾綋澶у皬</b><span>浠ｇ爜缂栬緫鍣ㄧ殑瀛楀彿</span></div>
        <div class="setting-control"><input type="number" class="num-input" id="setFontSize" min="10" max="32" value="${s.fontSize}" /></div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>缂╄繘瀹藉害</b><span>Tab 瀵瑰簲鐨勭┖鏍兼暟</span></div>
        <div class="setting-control">
          <div class="seg-control" id="setTabSize">
            ${[2, 4, 8].map((n) => `<button data-value="${n}" class="${Number(s.tabSize) === n ? 'active' : ''}">${n}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>鑷姩鎹㈣</b><span>闀胯鍦ㄧ紪杈戝櫒瀹藉害澶勬姌琛?/span></div>
        <div class="setting-control">
          <div class="seg-control" id="setWordWrap">
            ${[['off', '鍏抽棴'], ['on', '寮€鍚?]].map(([v, label]) => `<button data-value="${v}" class="${s.wordWrap === v ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>缂╃暐鍥?/b><span>鍙充晶浠ｇ爜灏忓湴鍥?/span></div>
        <div class="setting-control"><button class="switch ${s.minimap ? 'on' : ''}" id="setMinimap" aria-label="鍒囨崲缂╃暐鍥?></button></div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>瀛椾綋杩炲瓧</b><span>鍚敤 Cascadia / JetBrains Mono 杩炲瓧</span></div>
        <div class="setting-control"><button class="switch ${s.fontLigatures ? 'on' : ''}" id="setLigatures" aria-label="鍒囨崲瀛椾綋杩炲瓧"></button></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">淇濆瓨涓庤繍琛?/div>
      <div class="setting-row">
        <div class="setting-label"><b>鑷姩淇濆瓨</b><span>鍋滄杈撳叆绾?0.9 绉掑悗鑷姩鍐欑洏</span></div>
        <div class="setting-control"><button class="switch ${s.autoSave ? 'on' : ''}" id="setAutoSave" aria-label="鍒囨崲鑷姩淇濆瓨"></button></div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>AI 鎺у埗鏈嶅姟</b><span>浠呯洃鍚湰鏈哄洖鐜湴鍧€</span></div>
        <div class="setting-control"><span class="muted" style="font-family:var(--mono);font-size:9.5px">${esc(state.ai.endpoint || '鏈惎鍔?)}</span></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">鍏充簬</div>
      <div class="setting-row">
        <div class="setting-label"><b>Orbit IDE ${esc(state.appVersion)}</b><span>${state.isDev ? '寮€鍙戞瀯寤? : '姝ｅ紡鏋勫缓'} 路 Electron ${esc(window.orbit.versions.electron)}</span></div>
        <div class="setting-control"><button class="mini-btn" id="openUserData">鎵撳紑鏁版嵁鐩綍</button></div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>缂栬瘧鍣ㄨ嚜鍔ㄥ尮閰?/b><span>${state.compilers.length} 涓伐鍏烽摼宸叉帰娴?/span></div>
        <div class="setting-control"><button class="mini-btn" id="rescanFromSettings">${icon('refresh')} 閲嶆柊鎵弿</button></div>
      </div>
    </div>
  `;
  showModal({
    title: '璁剧疆',
    subtitle: '璋冩暣缂栫爜浣撻獙涓庤繍琛岀幆澧冦€?,
    iconName: 'settings',
    className: 'wide',
    content,
    dismissible: true,
    buttons: [{ label: '瀹屾垚', class: 'primary', onClick: () => true }],
  });
  hydrateIcons(content);

  $('#setFontSize', content).addEventListener('change', (event) => patchSettings({ fontSize: Number(event.target.value) }));
  $('#setTabSize', content).addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    $$('#setTabSize button', content).forEach((item) => item.classList.toggle('active', item === button));
    patchSettings({ tabSize: Number(button.dataset.value) });
  });
  $('#setWordWrap', content).addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    $$('#setWordWrap button', content).forEach((item) => item.classList.toggle('active', item === button));
    patchSettings({ wordWrap: button.dataset.value });
  });
  const toggle = async (id, key) => {
    const current = Boolean(state.settings[key]);
    const next = !current;
    $(id, content).classList.toggle('on', next);
    await patchSettings({ [key]: next });
  };
  $('#setMinimap', content).addEventListener('click', () => toggle('#setMinimap', 'minimap'));
  $('#setLigatures', content).addEventListener('click', () => toggle('#setLigatures', 'fontLigatures'));
  $('#setAutoSave', content).addEventListener('click', () => toggle('#setAutoSave', 'autoSave'));
  $('#openUserData', content).addEventListener('click', () => api.invoke('app:openUserData').catch(() => {}));
  $('#rescanFromSettings', content).addEventListener('click', () => {
    closeModal();
    scanCompilers();
  });
}

function renderSettingsIfOpen() {
  if (!state.activeModal) return;
  // 璁剧疆椤瑰嵆鏃舵洿鏂帮紝涓嶉噸寤哄脊绐楋紝閬垮厤杈撳叆鐒︾偣涓㈠け銆?}

function showHelp() {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="shortcut-grid">
      ${[
        ['淇濆瓨', 'Ctrl+S'], ['鍏ㄩ儴淇濆瓨', 'Ctrl+Shift+S'], ['鏂板缓鏂囦欢', 'Ctrl+N'],
        ['鎵撳紑鏂囦欢澶?, 'Ctrl+O'], ['蹇€熸墦寮€', 'Ctrl+P'], ['鍛戒护闈㈡澘', 'Ctrl+Shift+P'],
        ['缂栬瘧', 'Ctrl+Shift+B'], ['杩愯', 'F5'], ['鍋滄杩愯', 'Shift+F5'],
        ['搴曢儴闈㈡澘', 'Ctrl+`'], ['鍏抽棴鏍囩', 'Ctrl+W'], ['鍒囨崲渚ц竟鏍?, 'Ctrl+B'],
      ]
        .map(([label, key]) => `<div class="shortcut-row"><span>${label}</span><kbd>${key}</kbd></div>`)
        .join('')}
    </div>
    <div class="modal-note">Orbit IDE 灏嗘湰鍦?AI 鎺у埗鎺ュ彛闄愬埗鍦?127.0.0.1锛屽苟瑕佹眰鍦?IDE 鍐呮壒鍑嗘瘡涓柊瀹㈡埛绔€侫PI 鏂囨。涓庢墍鏈夋搷浣滃垪琛ㄥ彲閫氳繃 AI 闈㈡澘鎵撳紑銆?/div>
    <div style="display:flex; gap:8px; margin-top:12px">
      <button class="btn" id="helpApiDocs">${icon('external')} 鎵撳紑 AI API 鏂囨。</button>
      <button class="btn ghost" id="helpSettings">${icon('settings')} 鎵撳紑璁剧疆</button>
    </div>
  `;
  showModal({
    title: '蹇嵎閿笌甯姪',
    subtitle: `Orbit IDE ${state.appVersion} 路 鍙屾ā寮?AI 鍘熺敓缂栬緫鍣╜,
    iconName: 'help',
    className: 'wide',
    content,
    dismissible: true,
    buttons: [{ label: '鐭ラ亾浜?, class: 'primary', onClick: () => true }],
  });
  hydrateIcons(content);
  $('#helpApiDocs', content).addEventListener('click', () => {
    closeModal();
    api.invoke('ai:openDocs').catch(() => {});
  });
  $('#helpSettings', content).addEventListener('click', () => {
    closeModal();
    showSettings();
  });
}

/* 鈹€鈹€ 寮圭獥 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function showModal({ title, subtitle, iconName = 'orbit', content, buttons = [], width = '', className = '', dismissible = true, onClose = null }) {
  closeModal({ silent: true });
  const root = dom.modalRoot;
  root.innerHTML = '';
  const modal = document.createElement('div');
  modal.className = `modal ${className} ${width === 'wide' ? 'wide' : ''}`.trim();
  const head = document.createElement('div');
  head.className = 'modal-head';
  head.innerHTML = `<div class="modal-icon">${icon(iconName)}</div><div class="modal-head-copy"><h3>${esc(title)}</h3>${subtitle ? `<p class="modal-sub">${esc(subtitle)}</p>` : ''}</div>`;
  if (dismissible) {
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = icon('close');
    closeButton.title = '鍏抽棴';
    closeButton.addEventListener('click', () => closeModal());
    head.append(closeButton);
  }
  modal.append(head);
  if (content) {
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (content instanceof Node) body.append(content);
    else body.innerHTML = content;
    modal.append(body);
  }
  const foot = document.createElement('div');
  foot.className = 'modal-foot';
  const close = (result) => {
    if (state.activeModal?.modal !== modal) return;
    const callback = state.activeModal.onClose;
    state.activeModal = null;
    root.classList.remove('open');
    root.innerHTML = '';
    callback?.(result);
  };
  for (const button of buttons) {
    const btn = document.createElement('button');
    btn.className = `btn ${button.class || ''}`.trim();
    btn.textContent = button.label;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const original = btn.textContent;
      btn.disabled = true;
      try {
        const outcome = button.onClick ? await button.onClick(close) : true;
        if (outcome !== false) close();
      } catch (error) {
        toast(error.message || '鎿嶄綔澶辫触', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    foot.append(btn);
  }
  modal.append(foot);
  root.append(modal);
  root.classList.add('open');
  state.activeModal = {
    modal,
    onClose,
    dismissible,
  };
  root.onclick = (event) => {
    if (event.target === root && dismissible) closeModal();
  };
  const firstButton = buttons.findIndex((button) => button.class === 'primary');
  setTimeout(() => {
    const focusTarget =
      $('input:not([type="checkbox"])', modal) ||
      $('textarea', modal) ||
      $('.modal-foot .btn.primary', modal) ||
      $('.modal-foot .btn', modal);
    focusTarget?.focus();
  }, 30);
  return { modal, close };
}

function closeModal(options = {}) {
  if (!state.activeModal) return;
  const { modal, onClose } = state.activeModal;
  state.activeModal = null;
  dom.modalRoot.classList.remove('open');
  dom.modalRoot.innerHTML = '';
  dom.modalRoot.onclick = null;
  if (!options.silent) onClose?.();
  setTimeout(maybeShowLogin, 260);
}

function confirmDialog({ title, message, confirmLabel = '纭畾', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    showModal({
      title,
      subtitle: message,
      iconName: danger ? 'warning' : 'info',
      dismissible: true,
      onClose: () => finish(false),
      body: `<div class="field-hint">姝ゆ搷浣滀細绔嬪嵆鐢熸晥銆?/div>`,
      buttons: [
        { label: '鍙栨秷', onClick: () => { finish(false); return true; } },
        { label: confirmLabel, class: danger ? 'danger' : 'primary', onClick: () => { finish(true); return true; } },
      ],
    });
  });
}

async function confirmCloseApp() {
  const dirty = state.tabs.filter((tab) => tab.dirty);
  if (!dirty.length) return true;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    showModal({
      title: '閫€鍑?Orbit IDE锛?,
      subtitle: `${dirty.length} 涓枃浠舵湁鏈繚瀛樼殑淇敼銆俙,
      iconName: 'warning',
      dismissible: true,
      onClose: () => finish(false),
      body: `<div class="field-hint">${dirty.map((tab) => esc(tab.name)).join('銆?)}</div>`,
      buttons: [
        { label: '鍙栨秷', onClick: () => { finish(false); return true; } },
        { label: '涓嶄繚瀛橀€€鍑?, onClick: () => { finish(true); return true; } },
        {
          label: '鍏ㄩ儴淇濆瓨骞堕€€鍑?,
          class: 'primary',
          onClick: async () => {
            const ok = await saveAll({ silent: true });
            finish(ok);
            return ok;
          },
        },
      ],
    });
  });
}

/* 鈹€鈹€ 鍛戒护闈㈡澘 / 蹇€熸墦寮€ 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function commandItems() {
  const tab = activeTab();
  const items = [
    { id: 'mode', label: state.mode === 'oi' ? '鍒囨崲鍒板紑鍙戞ā寮? : '鍒囨崲鍒?OI 妯″紡', detail: state.mode === 'oi' ? '澶氳瑷€' : 'C/C++', icon: 'orbit', shortcut: '', action: () => switchMode(state.mode === 'oi' ? 'dev' : 'oi') },
    { id: 'new-file', label: '鏂板缓鏂囦欢', icon: 'plus', shortcut: 'Ctrl+N', action: () => promptNewFile(tab ? dirname(tab.path) : '') },
    { id: 'new-folder', label: '鏂板缓鏂囦欢澶?, icon: 'folder-plus', action: () => promptNewFolder(tab ? dirname(tab.path) : '') },
    { id: 'open-folder', label: '鎵撳紑鏂囦欢澶光€?, icon: 'folder-open', shortcut: 'Ctrl+O', action: () => chooseWorkspace() },
    { id: 'save', label: '淇濆瓨鏂囦欢', icon: 'save', shortcut: 'Ctrl+S', action: () => saveActive() },
    { id: 'save-all', label: '鍏ㄩ儴淇濆瓨', icon: 'save', shortcut: 'Ctrl+Shift+S', action: () => saveAll() },
    { id: 'close-tab', label: '鍏抽棴褰撳墠鏍囩椤?, icon: 'close', shortcut: 'Ctrl+W', action: () => tab && closeTab(tab.path) },
    { id: 'build', label: '缂栬瘧褰撳墠鏂囦欢', icon: 'hammer', shortcut: 'Ctrl+Shift+B', action: () => buildActive() },
    { id: 'run', label: '杩愯褰撳墠鏂囦欢', icon: 'play', shortcut: 'F5', action: () => runActive() },
    { id: 'stop', label: '鍋滄杩愯', icon: 'stop', shortcut: 'Shift+F5', action: () => stopRun() },
    { id: 'tests', label: '鎵撳紑 OI 娴嬭瘯鐐?, icon: 'flask', action: () => { if (state.mode === 'dev') switchMode('oi'); else openPanel('tests'); } },
    { id: 'panel', label: '鍒囨崲搴曢儴闈㈡澘', icon: 'panel', shortcut: 'Ctrl+`', action: () => togglePanel() },
    { id: 'scan', label: '閲嶆柊鎵弿缂栬瘧鍣?, icon: 'refresh', action: () => { setActivity('compilers'); scanCompilers(); } },
    { id: 'add-compiler', label: '鎵嬪姩娣诲姞缂栬瘧鍣ㄢ€?, icon: 'plus', action: () => { setActivity('compilers'); browseCompiler(); } },
    { id: 'ai', label: '鎵撳紑 AI 鎺ュ叆闈㈡澘', icon: 'sparkles', action: () => openAIDrawer() },
    { id: 'settings', label: '鎵撳紑璁剧疆', icon: 'settings', action: () => showSettings() },
    { id: 'help', label: '蹇嵎閿笌甯姪', icon: 'help', action: () => showHelp() },
    { id: 'docs', label: '鏌ョ湅 AI API 鏂囨。', icon: 'external', action: () => api.invoke('ai:openDocs').catch(() => {}) },
    { id: 'format', label: '鏍煎紡鍖栧綋鍓嶆枃妗?, icon: 'wand', action: () => formatActive() },
    { id: 'copy-path', label: '澶嶅埗褰撳墠鏂囦欢璺緞', icon: 'copy', action: () => tab && copyText(tab.path) },
    { id: 'sidebar', label: '鍒囨崲渚ц竟鏍?, icon: 'panel', shortcut: 'Ctrl+B', action: () => toggleSidebar() },
  ];
  if (tab) {
    items.splice(7, 0, { id: 'reveal', label: '鍦ㄨ祫婧愮鐞嗗櫒涓樉绀哄綋鍓嶆枃浠?, icon: 'external', action: () => api.invoke('workspace:reveal', tab.path).catch(() => {}) });
  }
  return items;
}

function openCommandPalette() {
  openLauncher({
    placeholder: '杈撳叆鍛戒护鍚嶇О鈥?,
    hint: 'Ctrl+Shift+P',
    items: commandItems(),
    empty: '娌℃湁鍖归厤鐨勫懡浠?,
  });
}

async function openQuickOpen() {
  await refreshFiles();
  const items = state.files.map((file) => ({
    id: `file:${file.path}`,
    label: file.name,
    detail: file.path,
    icon: 'file',
    action: () => openFile(file.path),
  }));
  openLauncher({
    placeholder: '鎸夋枃浠跺悕鎼滅储鈥?,
    hint: 'Ctrl+P',
    items,
    empty: '娌℃湁鍖归厤鐨勬枃浠?,
  });
}

function openLauncher({ placeholder, hint, items, empty }) {
  closeLauncher();
  const overlay = document.createElement('div');
  overlay.className = 'command-overlay';
  overlay.innerHTML = `
    <div class="command-panel">
      <div class="command-input-row">
        ${icon('search')}
        <input id="commandInput" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off" />
        <span class="command-hint">${esc(hint)}</span>
      </div>
      <div class="command-list" id="commandList"></div>
    </div>
  `;
  document.body.append(overlay);
  const input = $('#commandInput', overlay);
  const list = $('#commandList', overlay);
  const launcher = { overlay, items, filtered: items, active: 0, input, list };
  state.launcher = launcher;
  const render = () => {
    const query = input.value.trim().toLowerCase();
    launcher.filtered = query
      ? items
          .map((item) => ({ item, score: fuzzyScore(query, `${item.label} ${item.detail || ''}`.toLowerCase()) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.item)
          .slice(0, 60)
      : items.slice(0, 60);
    if (launcher.active >= launcher.filtered.length) launcher.active = 0;
    list.innerHTML = '';
    if (!launcher.filtered.length) {
      list.innerHTML = `<div class="command-empty">${esc(empty)}</div>`;
      return;
    }
    launcher.filtered.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `command-item${index === launcher.active ? ' active' : ''}`;
      row.innerHTML = `${icon(item.icon || 'arrow-right')}<span class="command-label"></span>${item.detail ? '<span class="command-detail"></span>' : ''}${item.shortcut ? `<span class="command-hint">${esc(item.shortcut)}</span>` : ''}`;
      $('.command-label', row).textContent = item.label;
      if (item.detail) $('.command-detail', row).textContent = item.detail;
      row.addEventListener('mousemove', () => {
        launcher.active = index;
        $$('.command-item', list).forEach((node, i) => node.classList.toggle('active', i === index));
      });
      row.addEventListener('click', () => executeLauncherItem(item));
      list.append(row);
    });
  };
  input.addEventListener('input', render);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeLauncher();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      launcher.active = Math.min(launcher.filtered.length - 1, launcher.active + 1);
      render();
      $('.command-item.active', list)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      launcher.active = Math.max(0, launcher.active - 1);
      render();
      $('.command-item.active', list)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = launcher.filtered[launcher.active];
      if (item) executeLauncherItem(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeLauncher();
    }
  });
  render();
  setTimeout(() => input.focus(), 20);
}

function executeLauncherItem(item) {
  closeLauncher();
  setTimeout(() => {
    try {
      item.action?.();
    } catch (error) {
      toast(error.message || '鎵ц澶辫触', 'error');
    }
  }, 20);
}

function closeLauncher() {
  state.launcher?.overlay?.remove();
  state.launcher = null;
}

function fuzzyScore(query, text) {
  if (!query) return 1;
  if (text.includes(query)) return 1000 - text.indexOf(query);
  let score = 0;
  let index = 0;
  for (const char of query) {
    const found = text.indexOf(char, index);
    if (found === -1) return 0;
    score += found === index ? 3 : 1;
    index = found + 1;
  }
  return score;
}

async function formatActive() {
  if (!activeTab()) {
    toast('娌℃湁鎵撳紑鐨勬枃浠?, 'warning');
    return;
  }
  const result = await editorHost.format();
  if (result.formatted && result.changed) {
    toast('鏂囨。宸叉牸寮忓寲', 'success', 2000);
  } else if (result.formatted) {
    toast('鏂囨。宸茬粡鏄鑼冩牸寮?, 'info', 2000);
  } else {
    toast(`${languageMeta(activeTab().language).label} 鏆傛棤鍐呯疆鏍煎紡鍖栧櫒`, 'warning', 3000);
  }
}

/* 鈹€鈹€ 鍙抽敭鑿滃崟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function showContextMenu(x, y, items) {
  hideContextMenu();
  const menu = dom.contextMenu;
  menu.innerHTML = '';
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.append(sep);
      continue;
    }
    const button = document.createElement('button');
    button.className = `ctx-item${item.danger ? ' danger' : ''}`;
    button.innerHTML = `${icon(item.icon || 'arrow-right')}<span></span>${item.shortcut ? `<span class="ctx-shortcut">${esc(item.shortcut)}</span>` : ''}`;
    $('span', button).textContent = item.label;
    button.disabled = Boolean(item.disabled);
    if (item.disabled) button.style.opacity = '0.4';
    button.addEventListener('click', () => {
      hideContextMenu();
      item.action?.();
    });
    menu.append(button);
  }
  menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 10)}px`;
  menu.classList.add('open');
}

function hideContextMenu() {
  dom.contextMenu.classList.remove('open');
}

/* 鈹€鈹€ 娲诲姩鏍?/ 渚ц竟鏍?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function setActivity(view, options = {}) {
  state.activity = view;
  if (view === 'explorer' || view === 'compilers') {
    document.body.classList.remove('sidebar-collapsed');
    $$('.side-view').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  }
  updateActivity();
  if (!options.silent) {
    if (view === 'compilers') renderCompilers();
    if (view === 'explorer') renderTree();
  }
}

function updateActivity() {
  const aiOpen = document.body.classList.contains('ai-open');
  $$('.activity-btn', dom.activitybar).forEach((button) => {
    const isView = button.dataset.activity === state.activity;
    const isAi = button.dataset.activity === 'ai';
    button.classList.toggle('active', aiOpen ? isAi : isView && !button.dataset.activity.match(/ai|docs|settings/));
  });
}

function bindActivity() {
  dom.activitybar.addEventListener('click', (event) => {
    const button = event.target.closest('.activity-btn');
    if (!button) return;
    const activity = button.dataset.activity;
    if (activity === 'explorer' || activity === 'compilers') {
      if (state.activity === activity && !document.body.classList.contains('sidebar-collapsed') && !document.body.classList.contains('ai-open')) {
        document.body.classList.add('sidebar-collapsed');
        setTimeout(() => editorHost?.layout(), 260);
        updateActivity();
        return;
      }
      setActivity(activity);
      setTimeout(() => editorHost?.layout(), 260);
    } else if (activity === 'ai') {
      toggleAIDrawer();
    } else if (activity === 'settings') {
      showSettings();
    } else if (activity === 'docs') {
      showHelp();
    }
  });
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
  setTimeout(() => editorHost?.layout(), 260);
}

/* 鈹€鈹€ 缁戝畾 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function bindWindowControls() {
  dom.winMin.addEventListener('click', () => api.invoke('window:minimize'));
  dom.winMax.addEventListener('click', async () => {
    const maximized = await api.invoke('window:toggleMaximize');
    updateMaxIcon(maximized);
    setTimeout(() => editorHost?.layout(), 250);
  });
  dom.winClose.addEventListener('click', () => api.invoke('window:close'));
  dom.titlebar.addEventListener('dblclick', (event) => {
    if (event.target.closest('button, .mode-switch, .ai-pill, .brand')) return;
    api.invoke('window:toggleMaximize').then((maximized) => updateMaxIcon(maximized));
  });
}

function updateMaxIcon(maximized) {
  const button = dom.winMax;
  button.innerHTML = icon(maximized ? 'restore' : 'maximize');
  button.title = maximized ? '杩樺師' : '鏈€澶у寲';
}

function bindModeSwitch() {
  dom.modeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.mode-btn');
    if (!button) return;
    switchMode(button.dataset.mode);
  });
  dom.statusMode.addEventListener('click', () => {
    switchMode(state.mode === 'oi' ? 'dev' : 'oi');
  });
}

function bindTabsActions() {
  $('#btn-new-tab').addEventListener('click', () => promptNewFile(activeTab() ? dirname(activeTab().path) : ''));
  $('#btn-tab-more').addEventListener('click', (event) => {
    const tab = activeTab();
    const items = [
      { label: '鏂板缓鏂囦欢', icon: 'plus', action: () => promptNewFile() },
      { label: '鍏ㄩ儴淇濆瓨', icon: 'save', action: () => saveAll() },
      { label: '鍏ㄩ儴鍏抽棴', icon: 'close', action: () => closeAllTabs() },
    ];
    if (tab) {
      items.unshift({ label: '鍏抽棴褰撳墠鏍囩椤?, icon: 'close', action: () => closeTab(tab.path) });
      items.splice(2, 0, { label: '澶嶅埗褰撳墠鏂囦欢璺緞', icon: 'copy', action: () => copyText(tab.path) });
    }
    showContextMenu(event.clientX - 120, event.clientY + 10, items);
  });
}

function bindExplorer() {
  $('#btn-new-file').addEventListener('click', () => promptNewFile(activeTab() ? dirname(activeTab().path) : ''));
  $('#btn-new-folder').addEventListener('click', () => promptNewFolder(activeTab() ? dirname(activeTab().path) : ''));
  $('#btn-refresh-tree').addEventListener('click', async () => {
    await refreshTree();
    await refreshFiles();
    toast('鏂囦欢鏍戝凡鍒锋柊', 'success', 1600);
  });
  $('#btn-switch-workspace').addEventListener('click', () => chooseWorkspace());
  $('#btn-collapse-tree').addEventListener('click', () => {
    const collect = (nodes) => {
      for (const node of nodes || []) {
        if (node.type === 'dir') {
          state.collapsedDirs.add(node.path);
          collect(node.children);
        }
      }
    };
    collect(state.tree?.children);
    renderTree();
  });
  $('#btn-open-folder').addEventListener('click', () => chooseWorkspace());
  $('#btn-palette').addEventListener('click', () => openCommandPalette());
  $('#btn-format').addEventListener('click', () => formatActive());
  $('#btn-editor-save').addEventListener('click', () => saveActive());
}

function bindCompilerActions() {
  $('#btn-scan-compilers').addEventListener('click', () => scanCompilers());
  $('#btn-add-compiler').addEventListener('click', () => browseCompiler());
}

function bindPanel() {
  dom.panelTabs.forEach((tab) => {
    tab.addEventListener('click', () => openPanel(tab.dataset.panel));
  });
  $('#btn-close-panel').addEventListener('click', () => closePanel());
  dom.runBtn.addEventListener('click', () => runActive());
  dom.stopBtn.addEventListener('click', () => stopRun());
  $('#btn-stop').addEventListener('click', () => stopRun());
  $('#btn-clear-output').addEventListener('click', () => {
    resetOutput();
  });
  $('#btn-send-stdin').addEventListener('click', sendStdin);
  dom.stdinInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendStdin();
    }
  });
  dom.statusProblems.addEventListener('click', () => openPanel('problems'));
  dom.statusCompiler.addEventListener('click', () => {
    setActivity('compilers');
    setTimeout(() => editorHost?.layout(), 260);
  });
  dom.statusStandard.addEventListener('change', async () => {
    const compilerId = dom.statusStandard.dataset.compilerId;
    const standard = dom.statusStandard.value;
    if (!compilerId || !standard) return;
    try {
      state.selected = await api.invoke('compilers:standard', { compilerId, standard });
      renderStatus();
      renderCompilers();
      const std = state.compilers.find((item) => item.id === compilerId)?.standards?.find((item) => item.id === standard);
      toast(`C++ 鏍囧噯宸插垏鎹负 ${std?.label || standard}`, 'success', 1800);
    } catch (error) {
      toast(error.message || '鍒囨崲鏍囧噯澶辫触', 'error');
    }
  });
  dom.statusAI.addEventListener('click', () => openAIDrawer());
}

function bindEditorFloats() {
  // 娴姩鎸夐挳鍦?bindExplorer 涓粦瀹氾紝淇濇寔鍏ュ彛闆嗕腑銆?}

function bindTerminal() {
  dom.terminalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = dom.terminalInput.value;
      dom.terminalInput.value = '';
      if (command.trim()) executeTerminal(command);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!state.terminalHistory.length) return;
      state.terminalHistoryIndex = Math.max(0, state.terminalHistoryIndex - 1);
      dom.terminalInput.value = state.terminalHistory[state.terminalHistoryIndex] || '';
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.terminalHistoryIndex = Math.min(state.terminalHistory.length, state.terminalHistoryIndex + 1);
      dom.terminalInput.value = state.terminalHistory[state.terminalHistoryIndex] || '';
    }
  });
  dom.terminalPrompt.addEventListener('click', () => {
    dom.terminalInput.value = '';
  });
}

function bindTests() {
  $('#btn-add-case').addEventListener('click', addTestCase);
  $('#btn-run-tests').addEventListener('click', runTests);
  $('#btn-clear-tests').addEventListener('click', clearTestCases);
  dom.caseList.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('.cph-case');
    if (!card) return;
    event.preventDefault();
    const id = card.dataset.id;
    showContextMenu(event.clientX, event.clientY, [
      { label: '杩愯姝ゆ祴璇曠偣', icon: 'play', action: () => runSingleTest(id) },
      { label: '鍒犻櫎姝ゆ祴璇曠偣', icon: 'trash', danger: true, action: () => deleteTestCase(id) },
    ]);
  });
}

function bindAI() {
  dom.aiPill.addEventListener('click', () => openAIDrawer());
  $('#btn-close-ai').addEventListener('click', () => closeAIDrawer());
  dom.aiPanel.addEventListener('click', handleAIAction);
}

function bindEvents() {
  api.onRendererCall(handleRendererCall);
  api.on('ai:status', (info) => {
    state.ai = info;
    updateAIChrome();
    renderAI();
    renderStatus();
    for (const request of info.pending || []) enqueueLogin(request);
  });
  api.on('ai:login-request', (request) => {
    enqueueLogin(request);
    if (!document.body.classList.contains('ai-open')) {
      toast(`${request.clientName} 璇锋眰鎺ュ叆 Orbit IDE`, 'warning', 5000);
    }
    openAIDrawer();
  });
  api.on('ai:login-resolved', (payload) => {
    if (payload?.requestId) {
      state.handledLogins.add(payload.requestId);
      state.loginQueue = state.loginQueue.filter((item) => item.requestId !== payload.requestId);
      if (state.currentLoginId === payload.requestId) state.currentLoginId = null;
    }
    refreshAudit();
    api.invoke('ai:status').then((info) => {
      state.ai = info;
      updateAIChrome();
      renderAI();
    });
  });
  api.on('ai:activity', () => scheduleAuditRefresh());
  api.on('run:event', handleRunEvent);
  api.on('run:problems', (payload) => setProblems(payload.problems || []));
  api.on('tests:changed', (data) => {
    if (state.testRunning) return;
    if (document.activeElement?.closest?.('.cph-case-list textarea')) return;
    state.tests = data;
    renderTests();
  });
  api.on('tests:results', (result) => {
    applyTestResults(result);
    if (result.build?.success === false) openPanel('problems');
  });
  api.on('workspace:refresh', () => refreshTree());
  api.on('workspace:changed', (payload) => applyWorkspacePayload(payload));
  api.on('workspace:file-changed', async ({ path: changedPath }) => {
    const tab = findTab(changedPath);
    if (!tab || tab.dirty) return;
    try {
      const file = await api.invoke('file:read', changedPath);
      if (!tab.model) return;
      tab.model.setValue(file.content);
      tab.savedVersion = tab.model.getAlternativeVersionId();
      tab.dirty = false;
      renderTabs();
    } catch {
      // 鏂囦欢鍙兘宸茶鍒犻櫎銆?    }
  });
  api.on('workspace:renamed', ({ from, to }) => {
    const affected = state.tabs.filter((tab) => tab.path === from || tab.path.startsWith(`${from}/`));
    const wasFile = state.files.some((file) => file.path === from) || Boolean(extname(from));
    const activeAffected = affected.some((tab) => tab.path === state.activePath);
    Promise.resolve().then(async () => {
      for (const tab of affected) {
        await closeTab(tab.path, { force: true, activate: false, silent: true });
      }
      await refreshTree();
      await refreshFiles();
      if (wasFile && activeAffected && !findTab(to)) await openFile(to, { silent: true });
    });
  });
  api.on('workspace:removed', ({ path: removedPath }) => {
    const affected = state.tabs.filter((tab) => tab.path === removedPath || tab.path.startsWith(`${removedPath}/`));
    Promise.resolve().then(async () => {
      for (const tab of affected) await closeTab(tab.path, { force: true, silent: true });
      await refreshTree();
      await refreshFiles();
    });
  });
  api.on('mode:changed', async ({ mode, source }) => {
    const previous = state.mode;
    if (mode === previous) return;
    applyModeVisual(mode, { silent: true });
    await afterModeChanged(mode, source);
    renderTabs();
  });
  api.on('compilers:changed', (payload) => {
    if (payload.compilers) state.compilers = payload.compilers;
    if (payload.selected) state.selected = payload.selected;
    if (payload.state) state.compilerState = payload.state;
    renderCompilers();
    renderStatus();
    if (!activeTab()) renderWelcome();
  });
  api.on('settings:changed', (settings) => {
    state.settings = { ...state.settings, ...settings };
    applySettingsVisual();
    renderBreadcrumbs();
  });
  api.on('app:notify', (payload) => toast(payload.message, payload.type || 'info'));
  api.on('app:command', (command) => {
    if (command === 'run') runActive();
    else if (command === 'build') buildActive();
    else if (command === 'save') saveActive();
    else if (command === 'scan') scanCompilers();
  });
  api.on('window:state', ({ maximized }) => updateMaxIcon(maximized));

  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.context-menu')) hideContextMenu();
    if (state.launcher && !event.target.closest('.command-overlay')) closeLauncher();
  });
  window.addEventListener('blur', () => hideContextMenu());
  window.addEventListener('resize', () => {
    editorHost?.layout();
    hideContextMenu();
  });
  window.addEventListener('online', () => {});
}

/* 鈹€鈹€ 娓叉煋杩涚▼妗ワ紙渚涗富杩涚▼ / AI 璋冪敤锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

async function handleRendererCall(action, payload) {
  switch (action) {
    case 'editor.get':
      return editorState();
    case 'editor.open': {
      const tab = await openFile(payload.path, { line: payload.line, column: payload.column });
      return editorState(tab);
    }
    case 'editor.setContent': {
      if (!editorHost?.editor.getModel()) throw new Error('娌℃湁娲诲姩缂栬緫鍣?);
      editorHost.setContent(payload.content);
      scheduleEditorState();
      const tab = activeTab();
      if (tab) {
        tab.dirty = tab.model.getAlternativeVersionId() !== tab.savedVersion;
        renderTabs();
      }
      return editorState();
    }
    case 'editor.insert': {
      if (!editorHost?.editor.getModel()) throw new Error('娌℃湁娲诲姩缂栬緫鍣?);
      editorHost.insert(payload.text, payload.position);
      return editorState();
    }
    case 'editor.replace': {
      if (!editorHost?.editor.getModel()) throw new Error('娌℃湁娲诲姩缂栬緫鍣?);
      editorHost.replace(payload.range, payload.text);
      return editorState();
    }
    case 'editor.select': {
      if (!editorHost?.editor.getModel()) throw new Error('娌℃湁娲诲姩缂栬緫鍣?);
      editorHost.select(payload.startLine, payload.startColumn, payload.endLine, payload.endColumn);
      return editorState();
    }
    case 'editor.save': {
      const tab = activeTab();
      if (!tab) return { saved: false, ...editorState() };
      const saved = await saveTab(tab, { silent: true });
      return { saved, ...editorState() };
    }
    case 'editor.format': {
      if (!editorHost?.editor.getModel()) return { formatted: false };
      return editorHost.format();
    }
    case 'editor.isDirty': {
      const tab = findTab(String(payload.path || '').replace(/\\/g, '/'));
      return { dirty: Boolean(tab?.dirty) };
    }
    case 'editor.syncFile': {
      const target = String(payload.path || '').replace(/\\/g, '/');
      const tab = findTab(target);
      if (!tab) return { synced: false, reason: 'not-open' };
      if (tab.dirty) return { synced: false, reason: 'dirty' };
      const file = await api.invoke('file:read', target);
      tab.model.setValue(file.content);
      tab.savedVersion = tab.model.getAlternativeVersionId();
      tab.dirty = false;
      renderTabs();
      return { synced: true };
    }
    case 'mode.apply': {
      if (payload.mode !== 'oi') return { closedTabs: [] };
      const nonCpp = state.tabs.filter((tab) => tab.language !== 'cpp' && tab.language !== 'c');
      if (nonCpp.length && payload.source === 'user') {
        const confirmed = await confirmDialog({
          title: '鍒囨崲鍒?OI 妯″紡',
          message: `OI 妯″紡浠呮敮鎸?C/C++銆傚皢淇濆瓨骞跺叧闂?${nonCpp.length} 涓潪 C/C++ 鏍囩椤点€俙,
          confirmLabel: '缁х画鍒囨崲',
        });
        if (!confirmed) return { cancelled: true, closedTabs: [] };
      }
      const saved = await saveAll({ silent: true });
      if (!saved) throw new Error('淇濆瓨鏂囦欢澶辫触锛屽凡鍙栨秷妯″紡鍒囨崲');
      const closed = [];
      for (const tab of nonCpp) {
        await closeTab(tab.path, { force: true, silent: true, activate: false });
        closed.push(tab.path);
      }
      renderTabs();
      if (!state.tabs.length) {
        state.activePath = null;
        editorHost.editor.setModel(null);
        renderBreadcrumbs();
        renderWelcome();
      }
      return { closedTabs: closed };
    }
    case 'app.confirmClose':
      return confirmCloseApp();
    case 'ui.notify':
      toast(payload.message, payload.type || 'info');
      return { ok: true };
    case 'ui.openPanel': {
      const panel = payload.panel;
      if (panel === 'explorer') setActivity('explorer');
      else if (panel === 'compilers') setActivity('compilers');
      else if (panel === 'ai') openAIDrawer();
      else if (panel === 'settings') showSettings();
      else if (panel === 'terminal') openPanel('terminal');
      else if (panel === 'problems') openPanel('problems');
      else if (panel === 'tests') openPanel('tests');
      return { ok: true };
    }
    default:
      throw new Error(`鏈煡鐨勭晫闈㈡搷浣滐細${action}`);
  }
}

function editorState(tabOverride = null) {
  if (!editorHost) return null;
  const tab = tabOverride || activeTab();
  const current = editorHost.getState();
  const position = editorHost.getPosition();
  const selection = editorHost.getSelection();
  return {
    path: tab?.path || (current.path ? current.path : null),
    name: tab?.name || null,
    language: tab?.language || current.language || null,
    languageLabel: languageMeta(tab?.language || current.language).label,
    content: current.content,
    dirty: Boolean(tab?.dirty),
    line: position.lineNumber,
    column: position.column,
    selection: selection
      ? {
          startLine: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLine: selection.endLineNumber,
          endColumn: selection.endColumn,
        }
      : null,
    mode: state.mode,
  };
}

function scheduleEditorState() {
  clearTimeout(state.editorPushTimer);
  state.editorPushTimer = setTimeout(() => {
    const payload = editorState();
    if (payload) api.invoke('editor:pushState', payload).catch(() => {});
    if (activeTab()) api.invoke('editor:pushProblems', state.problems).catch(() => {});
  }, 150);
}

/* 鈹€鈹€ 閿洏 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function bindKeyboard() {
  window.addEventListener(
    'keydown',
    (event) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') {
        if (state.launcher) {
          closeLauncher();
          event.preventDefault();
          return;
        }
        if (dom.contextMenu.classList.contains('open')) {
          hideContextMenu();
          return;
        }
        if (state.activeModal) {
          if (state.activeModal.dismissible) closeModal();
          event.preventDefault();
          return;
        }
        return;
      }
      if (state.launcher) return;
      if (state.activeModal) return;
      if (ctrl && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 's') {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) saveAll();
          else saveActive();
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          promptNewFile(activeTab() ? dirname(activeTab().path) : '');
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          chooseWorkspace();
          return;
        }
        if (key === 'p') {
          event.preventDefault();
          if (event.shiftKey) openCommandPalette();
          else openQuickOpen();
          return;
        }
        if (key === 'w') {
          event.preventDefault();
          if (activeTab()) closeTab(activeTab().path);
          return;
        }
        if (key === '`') {
          event.preventDefault();
          togglePanel();
          return;
        }
        if (key === 'b' && !event.shiftKey) {
          event.preventDefault();
          toggleSidebar();
          return;
        }
        if (key === 'b' && event.shiftKey) {
          event.preventDefault();
          buildActive();
          return;
        }
        if (key === 'tab') {
          event.preventDefault();
          cycleTab(event.shiftKey ? -1 : 1);
          return;
        }
      }
      if (event.key === 'F5') {
        event.preventDefault();
        if (event.shiftKey) stopRun();
        else runActive();
      }
    },
    true
  );
}

function cycleTab(direction) {
  if (state.tabs.length < 2) return;
  const index = state.tabs.findIndex((tab) => tab.path === state.activePath);
  const next = (index + direction + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[next]);
}

/* 鈹€鈹€ 灏哄鎷栨嫿 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

function bindResizers() {
  const sidebar = dom.sidebar;
  let sidebarDragging = false;
  dom.sidebarResizer.addEventListener('pointerdown', (event) => {
    sidebarDragging = true;
    document.body.style.cursor = 'col-resize';
    dom.sidebarResizer.setPointerCapture(event.pointerId);
  });
  dom.sidebarResizer.addEventListener('pointermove', (event) => {
    if (!sidebarDragging) return;
    const width = Math.max(200, Math.min(420, event.clientX - 48));
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    editorHost?.layout();
  });
  dom.sidebarResizer.addEventListener('pointerup', () => {
    sidebarDragging = false;
    document.body.style.cursor = '';
  });

  let resizing = false;
  dom.panelResizer.addEventListener('pointerdown', (event) => {
    resizing = true;
    document.body.style.cursor = 'row-resize';
    dom.panelResizer.setPointerCapture(event.pointerId);
  });
  dom.panelResizer.addEventListener('pointermove', (event) => {
    if (!resizing) return;
    const height = Math.max(150, Math.min(window.innerHeight * 0.65, window.innerHeight - event.clientY - 26));
    document.documentElement.style.setProperty('--panel-height', `${height}px`);
    state.settings.oiPanelHeight = Math.round(height);
    editorHost?.layout();
  });
  dom.panelResizer.addEventListener('pointerup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    patchSettings({ oiPanelHeight: state.settings.oiPanelHeight });
  });
}

/* 鈹€鈹€ 鍚姩鍏ュ彛 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SERVER_SPECS = {
  cpp: { commands: ['clangd'], args: ['--background-index'] },
  c: { commands: ['clangd'], args: ['--background-index'] },
  python: { commands: ['pyright-langserver', 'pylsp'], args: ['--stdio'] },
  go: { commands: ['gopls'], args: [] },
  rust: { commands: ['rust-analyzer'], args: [] },
  yaml: { commands: ['yaml-language-server'], args: ['--stdio'] },
  shell: { commands: ['bash-language-server'], args: ['start'] },
  java: { commands: ['jdtls'], args: [] },
};

const MONACO_KIND_OFFSET = 1;

function findExecutable(name) {
  if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  dirs.unshift('D:\\.tools', 'D:\\.tools\\bin', 'D:\\mingw64\\bin');
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name.endsWith(ext) ? name : `${name}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  if (process.platform === 'win32') {
    const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) {
      const first = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    }
  }
  return null;
}

function toMonacoRange(range) {
  if (!range) return undefined;
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function toMonacoDocumentation(documentation) {
  if (!documentation) return undefined;
  if (typeof documentation === 'string') return documentation;
  return documentation.value || undefined;
}

function toMonacoCompletion(item, defaultRange) {
  const label = typeof item.label === 'string' ? item.label : item.label?.label || '';
  const textEdit = item.textEdit;
  const editRange = textEdit?.range || textEdit?.replace || item.range;
  const insertText = textEdit?.newText || item.insertText || label;
  const command = item.command
    ? { id: item.command.command, title: item.command.title, arguments: item.command.arguments || [] }
    : undefined;
  return {
    label,
    kind: Math.max(0, Math.min(24, (Number(item.kind) || 1) - MONACO_KIND_OFFSET)),
    detail: item.detail || item.label?.detail || undefined,
    documentation: toMonacoDocumentation(item.documentation),
    insertText,
    insertTextRules: item.insertTextFormat === 2 ? 4 : undefined,
    range: toMonacoRange(editRange) || defaultRange,
    filterText: item.filterText,
    sortText: item.sortText || label,
    preselect: Boolean(item.preselect),
    commitCharacters: item.commitCharacters,
    additionalTextEdits: (item.additionalTextEdits || []).map((edit) => ({
      range: toMonacoRange(edit.range),
      text: edit.newText,
    })),
    command,
    data: item.data,
  };
}

class LspClient {
  constructor(language, command, args, root, env) {
    this.language = language;
    this.command = command;
    this.args = args;
    this.root = root;
    this.env = env || process.env;
    this.proc = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.documents = new Map();
    this.ready = null;
    this.stderr = '';
  }

  async start() {
    if (this.ready) return this.ready;
    this.ready = this._start().catch((error) => {
      this.ready = null;
      this.stop();
      throw error;
    });
    return this.ready;
  }

  async _start() {
    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(this.command);
    const command = useShell ? `"${this.command}"` : this.command;
    this.proc = spawn(command, this.args, {
      cwd: this.root,
      env: { ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: useShell,
    });
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4000);
    });
    this.proc.on('error', (error) => this._failAll(error));
    this.proc.on('exit', (code) => {
      this._failAll(new Error(`LSP ${this.language} exited (${code})`));
      this.proc = null;
      this.ready = null;
    });
    this.proc.stdin.on('error', () => {});

    const rootUri = pathToFileURL(this.root).href;
    const init = await this.request(
      'initialize',
      {
        processId: process.pid,
        clientInfo: { name: 'Orbit IDE', version: '1.0.0' },
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: path.basename(this.root) }],
        capabilities: {
          workspace: { workspaceFolders: true, configuration: true },
          textDocument: {
            synchronization: { dynamicRegistration: false, didSave: false },
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
              },
              contextSupport: true,
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
          },
        },
      },
      20000
    );
    this.capabilities = init?.capabilities || {};
    this.notify('initialized', {});
    return this;
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      this._onMessage(message);
    }
  }

  _onMessage(message) {
    if (Object.prototype.hasOwnProperty.call(message, 'id')) {
      if (message.method) {
        this._respond(message.id, null);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || 'LSP error'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'workspace/configuration') {
      this._respond(message.id, (message.params?.items || []).map(() => null));
    } else if (message.method === 'client/registerCapability' || message.method === 'window/workDoneProgress/create') {
      this._respond(message.id, null);
    }
  }

  _respond(id, result) {
    if (id === undefined) return;
    this._write({ jsonrpc: '2.0', id, result });
  }

  _write(message) {
    if (!this.proc?.stdin?.writable) return;
    const body = JSON.stringify(message);
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  request(method, params, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP ${method} timeout`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this._write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params, id) {
    this._write({ jsonrpc: '2.0', method, params });
  }

  _failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async openDocument(filePath, languageId, content, version) {
    await this.start();
    const uri = pathToFileURL(filePath).href;
    const old = this.documents.get(uri);
    if (!old) {
      this.documents.set(uri, { version, content, languageId });
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version, text: content },
      });
      return uri;
    }
    if (old.content !== content) {
      old.content = content;
      old.version = version;
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
    }
    return uri;
  }

  async completion(filePath, languageId, content, version, line, column, context) {
    const uri = await this.openDocument(filePath, languageId, content, version);
    const triggerKind = context.triggerCharacter ? 2 : context.triggerKind === 2 ? 3 : 1;
    const result = await this.request('textDocument/completion', {
      textDocument: { uri },
      position: { line: Math.max(0, line - 1), character: Math.max(0, column - 1) },
      context: {
        triggerKind,
        ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {}),
      },
    });
    const items = Array.isArray(result) ? result : result?.items || [];
    const defaultRange = {
      startLineNumber: line,
      startColumn: context.wordStart || column,
      endLineNumber: line,
      endColumn: context.wordEnd || column,
    };
    return {
      items: items.map((item) => toMonacoCompletion(item, defaultRange)),
      isIncomplete: Boolean(result?.isIncomplete),
    };
  }

  stop() {
    try {
      this.proc?.stdin?.end();
      this.proc?.kill();
    } catch {
      // 忽略。
    }
    this.proc = null;
    this.ready = null;
    this.documents.clear();
    this._failAll(new Error('LSP stopped'));
  }
}

class LspManager {
  constructor(options = {}) {
    this.getRoot = options.getRoot || (() => null);
    this.installer = options.installer || null;
    this.servers = new Map();
    this.commandCache = new Map();
    this.statusCache = null;
    this.statusAt = 0;
  }

  commandFor(language) {
    if (this.commandCache.has(language)) return this.commandCache.get(language);
    const installed = this.installer?.getCommand(language);
    if (installed) {
      this.commandCache.set(language, {
        command: installed.command,
        args: installed.args,
        env: installed.env,
        source: installed.source,
      });
      return this.commandCache.get(language);
    }
    const spec = SERVER_SPECS[language];
    if (!spec) {
      this.commandCache.set(language, null);
      return null;
    }
    let found = null;
    for (const name of spec.commands) {
      const command = findExecutable(name);
      if (command) {
        found = { command, args: spec.args };
        break;
      }
    }
    this.commandCache.set(language, found);
    return found;
  }

  status() {
    const now = Date.now();
    if (this.statusCache && now - this.statusAt < 15000) return this.statusCache;
    const available = {};
    for (const language of Object.keys(SERVER_SPECS)) {
      const found = this.commandFor(language);
      if (found) available[language] = found.command;
    }
    this.statusCache = { available, root: this.getRoot() };
    this.statusAt = now;
    return this.statusCache;
  }

  async getServer(language) {
    const root = this.getRoot();
    if (!root) throw new Error('没有打开工作区');
    const found = this.commandFor(language);
    if (!found) throw new Error(`未找到 ${language} 语言服务器`);
    const key = `${language}:${root}`;
    let server = this.servers.get(key);
    if (!server) {
      server = new LspClient(language, found.command, found.args, root, found.env);
      this.servers.set(key, server);
    }
    await server.start();
    return server;
  }

  async completion(payload) {
    const language = payload?.language;
    const root = this.getRoot();
    if (!root || !language || !this.commandFor(language)) {
      return { items: [], isIncomplete: false };
    }
    const filePath = path.resolve(root, String(payload.path || '').replace(/^[/\\]+/, ''));
    const server = await this.getServer(language);
    return server.completion(
      filePath,
      language,
      String(payload.content || ''),
      Number(payload.version) || 1,
      Number(payload.line) || 1,
      Number(payload.column) || 1,
      {
        triggerKind: payload.triggerKind,
        triggerCharacter: payload.triggerCharacter,
        wordStart: payload.wordStart,
        wordEnd: payload.wordEnd,
      }
    );
  }

  stopAll() {
    for (const server of this.servers.values()) server.stop();
    this.servers.clear();
    this.statusCache = null;
  }

  invalidate() {
    this.statusCache = null;
    this.commandCache.clear();
  }
}

module.exports = { LspManager, LspClient, SERVER_SPECS, findExecutable };

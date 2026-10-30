'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { languageForPath } = require('./languages.cjs');

const APP_NAME = 'Orbit IDE';
const API_VERSION = '1.0';

const ALL_SCOPES = ['read', 'write', 'editor', 'run', 'terminal', 'mode', 'compilers', 'settings', 'ui'];

const SCOPE_LABELS = {
  read: '读取工作区与状态',
  write: '创建、修改与删除文件',
  editor: '控制编辑器内容与光标',
  run: '编译并运行代码',
  terminal: '执行终端命令',
  mode: '切换 OI / 开发模式',
  compilers: '扫描与选择编译器',
  settings: '修改 IDE 设置',
  ui: '控制 IDE 界面与通知',
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new ApiError(413, 'BODY_TOO_LARGE', '请求体超过 8 MB 限制'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function randomToken() {
  return `orb_${crypto.randomBytes(32).toString('base64url')}`;
}

function normalizeScopes(input) {
  if (!Array.isArray(input) || !input.length) return [...ALL_SCOPES];
  const scopes = [...new Set(input.filter((item) => ALL_SCOPES.includes(item)))];
  return scopes.length ? scopes : [...ALL_SCOPES];
}

function withinScopes(available, required) {
  return required.every((scope) => available.includes(scope));
}

function makeChangeActivity(kind, filePath, before, after, extra = {}) {
  const oldText = String(before ?? '');
  const newText = String(after ?? '');
  if (oldText === newText) return { kind, path: filePath, changed: false, ...extra };
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const removed = oldLines.slice(start, oldEnd);
  const added = newLines.slice(start, newEnd);
  const cap = 200;
  return {
    kind,
    path: filePath,
    changed: true,
    startLine: start + 1,
    removed: removed.slice(0, cap),
    added: added.slice(0, cap),
    removedTotal: removed.length,
    addedTotal: added.length,
    truncated: removed.length > cap || added.length > cap,
    ...extra,
  };
}

class AIServer {
  constructor({ settings, workspace, tests, compilers, runner, bridge, appVersion, onModeChange, onSettingsChange, onCompilersChanged }) {
    this.settings = settings;
    this.workspace = workspace;
    this.tests = tests;
    this.compilers = compilers;
    this.runner = runner;
    this.bridge = bridge;
    this.appVersion = appVersion;
    this.onModeChange = onModeChange || (() => {});
    this.onSettingsChange = onSettingsChange || (() => {});
    this.onCompilersChanged = onCompilersChanged || (() => {});
    this.server = null;
    this.port = null;
    this.status = 'stopped';
    this.error = null;
    this.pending = new Map();
    this.sessions = new Map();
    this.audit = [];
    this.startedAt = null;
    this.operations = this.buildOperations();
    this.cleanupTimer = null;
  }

  async start() {
    if (this.server) return this.info();
    this.status = 'starting';
    const preferred = Number(this.settings.get('aiPort', 37821)) || 37821;
    let lastError = null;
    for (let offset = 0; offset < 10; offset += 1) {
      const port = preferred + offset;
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch((error) => {
          console.error('[ai] 未处理错误', error);
          if (!res.headersSent) {
            json(res, 500, { error: { code: 'INTERNAL', message: '内部错误' } });
          } else res.end();
        });
      });
      server.keepAliveTimeout = 5000;
      server.on('clientError', (error, socket) => {
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      });
      const ok = await new Promise((resolve) => {
        const onError = (error) => {
          server.off('listening', onListening);
          lastError = error;
          resolve(false);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(true);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      if (ok) {
        this.server = server;
        this.port = port;
        this.status = 'running';
        this.startedAt = Date.now();
        this.cleanupTimer = setInterval(() => this.cleanup(), 15_000);
        this.cleanupTimer.unref?.();
        this.emitStatus();
        return this.info();
      }
      server.close?.();
    }
    this.status = 'error';
    this.error = lastError ? lastError.message : '无法监听本地端口';
    this.emitStatus();
    return this.info();
  }

  async stop() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
    this.status = 'stopped';
    this.port = null;
    this.emitStatus();
  }

  emitStatus() {
    this.bridge.broadcast('ai:status', this.info());
  }

  info() {
    return {
      running: this.status === 'running',
      status: this.status,
      error: this.error,
      host: '127.0.0.1',
      port: this.port,
      endpoint: this.port ? `http://127.0.0.1:${this.port}` : null,
      apiVersion: API_VERSION,
      appVersion: this.appVersion,
      startedAt: this.startedAt,
      sessions: this.publicSessions(),
      pending: [...this.pending.values()].filter((item) => item.status === 'pending').map((item) => this.publicRequest(item)),
      trusted: this.settings.get('trustedClients', []).map(({ id, clientName, clientId, scopes, approvedAt }) => ({
        id,
        clientName,
        clientId,
        scopes,
        approvedAt,
      })),
      scopes: ALL_SCOPES.map((id) => ({ id, label: SCOPE_LABELS[id] })),
    };
  }

  publicSessions() {
    return [...this.sessions.values()]
      .filter((item) => item.expiresAt > Date.now())
      .map((item) => ({
        id: item.id,
        clientName: item.clientName,
        scopes: item.scopes,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        remoteAddress: item.remoteAddress,
      }));
  }

  publicRequest(item) {
    return {
      requestId: item.requestId,
      clientName: item.clientName,
      clientId: item.clientId,
      scopes: item.scopes,
      remoteAddress: item.remoteAddress,
      source: item.clientInfo || item.origin || item.userAgent || '本地进程',
      userAgent: item.userAgent || '',
      origin: item.origin || '',
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      status: item.status,
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [id, item] of this.pending) {
      if (item.status === 'pending' && item.expiresAt < now) {
        item.status = 'expired';
        this.pending.delete(id);
        this.bridge.broadcast('ai:login-resolved', { requestId: id, status: 'expired' });
      }
    }
    for (const [token, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(token);
        this.emitStatus();
      }
    }
  }

  createSession(request, remoteAddress) {
    const now = Date.now();
    const sameClient = [...this.sessions.values()].find((item) => {
      if (item.expiresAt <= now) return false;
      if (request.clientId && item.clientId) {
        return item.clientId === request.clientId && item.clientName === request.clientName;
      }
      return !request.clientId && !item.clientId && item.clientName === request.clientName && item.remoteAddress === remoteAddress;
    });
    // 同一客户端重复登录时复用现有会话，避免一个 AI 客户端显示成多个“在线”。
    if (sameClient) {
      sameClient.scopes = request.scopes;
      sameClient.expiresAt = now + 24 * 60 * 60 * 1000;
      this.emitStatus();
      return sameClient;
    }
    const token = randomToken();
    const session = {
      id: crypto.randomUUID(),
      token,
      clientName: request.clientName,
      clientId: request.clientId,
      scopes: request.scopes,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      remoteAddress,
    };
    this.sessions.set(token, session);
    this.emitStatus();
    return session;
  }

  respond(requestId, approved, { remember = false } = {}) {
    const request = this.pending.get(requestId);
    if (!request) return { ok: false, message: '登录请求不存在或已过期' };
    if (request.status !== 'pending') return { ok: false, message: '登录请求已处理' };
    request.status = approved ? 'approved' : 'denied';
    request.resolvedAt = Date.now();
    if (approved) {
      request.session = this.createSession(request, request.remoteAddress);
      request.token = request.session.token;
      if (remember && request.clientId) {
        const trusted = this.settings.get('trustedClients', []).filter(
          (item) => !(item.clientId && item.clientId === request.clientId && item.clientName === request.clientName)
        );
        trusted.unshift({
          id: crypto.randomUUID(),
          clientName: request.clientName,
          clientId: request.clientId || '',
          scopes: request.scopes,
          approvedAt: Date.now(),
        });
        this.settings.set('trustedClients', trusted.slice(0, 50));
      }
    }
    this.audit.push({
      at: Date.now(),
      kind: 'login',
      clientName: request.clientName,
      status: approved ? 'approved' : 'denied',
      summary: approved ? 'AI 登录已批准' : 'AI 登录被拒绝',
    });
    this.audit = this.audit.slice(-250);
    this.bridge.broadcast('ai:login-resolved', {
      requestId,
      status: approved ? 'approved' : 'denied',
    });
    this.bridge.broadcast('ai:activity', {
      type: 'login',
      approved,
      clientName: request.clientName,
      at: Date.now(),
    });
    this.emitStatus();
    setTimeout(() => this.pending.delete(requestId), 5 * 60 * 1000).unref?.();
    return { ok: true };
  }

  revoke(sessionId) {
    for (const [token, session] of this.sessions) {
      if (session.id === sessionId) {
        this.sessions.delete(token);
        this.audit.push({ at: Date.now(), kind: 'revoke', clientName: session.clientName, status: 'revoked', summary: '已撤销 AI 访问令牌' });
        this.emitStatus();
        return true;
      }
    }
    return false;
  }

  revokeTrusted(clientId) {
    const list = this.settings.get('trustedClients', []).filter((item) => item.id !== clientId);
    this.settings.set('trustedClients', list);
    this.emitStatus();
    return true;
  }

  async handle(req, res) {
    const started = Date.now();
    const origin = req.headers.origin;
    if (origin && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${this.port || 37821}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/health') {
      json(res, 200, {
        ok: true,
        app: APP_NAME,
        status: this.status,
        time: new Date().toISOString(),
      });
      return;
    }
    if (pathname === '/' || pathname === '/v1' || pathname === '/v1/info') {
      json(res, 200, {
        name: APP_NAME,
        apiVersion: API_VERSION,
        appVersion: this.appVersion,
        endpoint: this.info().endpoint,
        authentication: {
          type: 'bearer',
          login: 'POST /v1/login',
          note: '登录请求会显示在 IDE 内，由用户批准后发放 24 小时访问令牌。',
        },
        docs: '/v1/docs',
        openapi: '/openapi.json',
        operations: Object.keys(this.operations),
      });
      return;
    }
    if (pathname === '/openapi.json') {
      text(res, 200, JSON.stringify(this.openapi(), null, 2), 'application/json; charset=utf-8');
      return;
    }
    if (pathname === '/v1/docs') {
      text(res, 200, this.docsMarkdown(), 'text/markdown; charset=utf-8');
      return;
    }
    if (pathname === '/v1/login' && req.method === 'POST') {
      try {
        await this.handleLogin(req, res);
      } catch (error) {
        if (!res.headersSent) {
          const status = error instanceof ApiError ? error.status : 500;
          json(res, status, {
            error: {
              code: error.code || 'LOGIN_ERROR',
              message: error.message || '登录请求处理失败',
            },
          });
        }
      }
      return;
    }
    if (pathname.startsWith('/v1/login/') && req.method === 'GET') {
      const id = pathname.slice('/v1/login/'.length);
      this.handleLoginStatus(res, id);
      return;
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const session = token ? this.sessions.get(token) : null;
    if (!session || session.expiresAt < Date.now()) {
      if (session) this.sessions.delete(token);
      json(res, 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: '需要有效的 AI 访问令牌。请先调用 POST /v1/login，并在 IDE 中批准。',
        },
      });
      return;
    }

    const remote = req.socket.remoteAddress;
    try {
      const requiredScope = this.requiredScope(req.method, pathname);
      if (requiredScope) this.requireScope(session, requiredScope);
      const result = await this.route(req, url, pathname, session);
      this.record({
        session,
        method: req.method,
        path: pathname,
        status: 200,
        durationMs: Date.now() - started,
        summary: result?.summary || '',
        activity: result?.activity || null,
      });
      json(res, 200, result);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      this.record({
        session,
        method: req.method,
        path: pathname,
        status,
        durationMs: Date.now() - started,
        summary: error.message,
        activity: null,
      });
      if (!res.headersSent) {
        json(res, status, {
          error: {
            code: error.code || 'INTERNAL',
            message: error.message || '内部错误',
          },
        });
      }
    }
  }

  record({ session, method, path, status, durationMs, summary, activity = null }) {
    this.audit.push({
      at: Date.now(),
      kind: 'api',
      clientName: session.clientName,
      sessionId: session.id,
      method,
      path,
      status,
      durationMs,
      summary,
    });
    this.audit = this.audit.slice(-250);
    this.bridge.broadcast('ai:activity', {
      type: 'api',
      method,
      path,
      status,
      durationMs,
      summary,
      activity,
      clientName: session.clientName,
      at: Date.now(),
    });
  }

  async handleLogin(req, res) {
    const body = await readBody(req, 64 * 1024);
    const clientName = String(body.clientName || '').trim().slice(0, 80);
    if (!clientName) throw new ApiError(400, 'MISSING_CLIENT_NAME', 'clientName 不能为空');
    const clientId = String(body.clientId || '').trim().slice(0, 200);
    const scopes = normalizeScopes(body.scopes);
    const remoteAddress = req.socket.remoteAddress;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const origin = String(req.headers.origin || '').slice(0, 300);
    const clientInfo = String(req.headers['x-orbit-client'] || body.clientInfo || '').slice(0, 160);
    const trusted = this.settings.get('trustedClients', []).find(
      (item) => clientId && item.clientId === clientId && item.clientName === clientName && withinScopes(item.scopes, scopes)
    );
    if (trusted) {
      const request = {
        requestId: crypto.randomUUID(),
        clientName,
        clientId: clientId || trusted.clientId,
        scopes,
        remoteAddress,
        userAgent,
        origin,
        clientInfo,
        createdAt: Date.now(),
        expiresAt: Date.now() + 120_000,
        status: 'approved',
        trusted: true,
      };
      request.session = this.createSession(request, remoteAddress);
      this.pending.set(request.requestId, request);
      this.audit.push({ at: Date.now(), kind: 'login', clientName, status: 'auto-approved', summary: '受信任客户端自动登录' });
      this.bridge.broadcast('ai:activity', { type: 'login', approved: true, clientName, trusted: true, at: Date.now() });
      json(res, 200, {
        requestId: request.requestId,
        status: 'approved',
        token: request.session.token,
        scopes,
        expiresAt: request.session.expiresAt,
        trusted: true,
      });
      return;
    }
    const existing = [...this.pending.values()].find(
      (item) => item.status === 'pending' && item.clientName === clientName && item.clientId === clientId
    );
    if (existing) {
      json(res, 202, {
        requestId: existing.requestId,
        status: 'pending',
        poll: `/v1/login/${existing.requestId}`,
        expiresInMs: Math.max(0, existing.expiresAt - Date.now()),
      });
      return;
    }
    if ([...this.pending.values()].filter((item) => item.status === 'pending').length >= 10) {
      throw new ApiError(429, 'TOO_MANY_LOGIN_REQUESTS', '当前待审批的登录请求过多，请稍后再试');
    }
    const request = {
      requestId: crypto.randomUUID(),
      clientName,
      clientId,
      scopes,
      remoteAddress,
      userAgent,
      origin,
      clientInfo,
      createdAt: Date.now(),
      expiresAt: Date.now() + 120_000,
      status: 'pending',
    };
    this.pending.set(request.requestId, request);
    this.audit.push({ at: Date.now(), kind: 'login', clientName, status: 'pending', summary: 'AI 请求登录，等待用户批准' });
    this.bridge.broadcast('ai:login-request', this.publicRequest(request));
    this.emitStatus();
    this.bridge.focusWindow?.();
    json(res, 202, {
      requestId: request.requestId,
      status: 'pending',
      poll: `/v1/login/${request.requestId}`,
      expiresInMs: 120_000,
      message: '登录请求已发送到 Orbit IDE，请在 IDE 中批准。',
    });
  }

  handleLoginStatus(res, requestId) {
    const request = this.pending.get(requestId);
    if (!request) {
      json(res, 404, { error: { code: 'LOGIN_NOT_FOUND', message: '登录请求不存在或已过期' } });
      return;
    }
    const base = {
      requestId,
      status: request.status,
      clientName: request.clientName,
      scopes: request.scopes,
    };
    if (request.status === 'approved' && request.token) {
      base.token = request.token;
      base.tokenType = 'Bearer';
      base.expiresAt = request.session.expiresAt;
      request.token = null;
      this.pending.delete(requestId);
    } else if (request.status === 'approved') {
      base.message = '令牌已发放，请勿重复获取。';
    } else if (request.status === 'denied') {
      base.message = '用户拒绝了本次登录请求。';
    }
    json(res, 200, base);
  }

  async route(req, url, pathname, session) {
    const method = req.method;
    const body =
      method === 'POST' || method === 'PUT' || method === 'PATCH' ? await readBody(req) : {};
    const segments = pathname.split('/').filter(Boolean);

    if (pathname === '/v1/state' && method === 'GET') return this.opState(session, {});
    if (pathname === '/v1/tree' && method === 'GET') return this.opTree(session, { path: url.searchParams.get('path') || '' });
    if (pathname === '/v1/files' && method === 'GET') return this.opFiles(session, {});
    if (pathname === '/v1/file' && method === 'GET') return this.opFileRead(session, { path: url.searchParams.get('path') });
    if (pathname === '/v1/file' && method === 'PUT') return this.opFileWrite(session, { path: body.path, content: body.content });
    if (pathname === '/v1/file' && method === 'DELETE') return this.opFileDelete(session, { path: url.searchParams.get('path') || body.path });
    if (pathname === '/v1/file/create' && method === 'POST') return this.opFileCreate(session, body);
    if (pathname === '/v1/files' && method === 'POST') return this.opFileCreate(session, body);
    if (pathname === '/v1/folders' && method === 'POST') return this.opFolderCreate(session, body);
    if (pathname === '/v1/rename' && method === 'POST') return this.opRename(session, body);
    if (pathname === '/v1/editor' && method === 'GET') return this.opEditorGet(session, {});
    if (pathname === '/v1/editor/open' && method === 'POST') return this.opEditorOpen(session, body);
    if (pathname === '/v1/editor/content' && method === 'POST') return this.opEditorContent(session, body);
    if (pathname === '/v1/editor/insert' && method === 'POST') return this.opEditorInsert(session, body);
    if (pathname === '/v1/editor/replace' && method === 'POST') return this.opEditorReplace(session, body);
    if (pathname === '/v1/editor/selection' && method === 'POST') return this.opEditorSelect(session, body);
    if (pathname === '/v1/editor/save' && method === 'POST') return this.opEditorSave(session, body);
    if (pathname === '/v1/editor/format' && method === 'POST') return this.opEditorFormat(session, body);
    if (pathname === '/v1/problems' && method === 'GET') return this.opProblems(session, {});
    if (pathname === '/v1/build' && method === 'POST') return this.opBuild(session, body);
    if (pathname === '/v1/run' && method === 'POST') return this.opRun(session, body);
    if (pathname === '/v1/terminal' && method === 'POST') return this.opTerminal(session, body);
    if (pathname === '/v1/tests' && method === 'GET') return this.opTestsGet(session, {});
    if (pathname === '/v1/tests' && method === 'PUT') return this.opTestsSet(session, body);
    if (pathname === '/v1/tests/run' && method === 'POST') return this.opTestsRun(session, body);
    if (pathname === '/v1/mode' && method === 'GET') return this.opModeGet(session, {});
    if (pathname === '/v1/mode' && method === 'POST') return this.opModeSet(session, body);
    if (pathname === '/v1/compilers' && method === 'GET') return this.opCompilersList(session, {});
    if (pathname === '/v1/compilers/scan' && method === 'POST') return this.opCompilersScan(session, body);
    if (pathname === '/v1/compilers/select' && method === 'POST') return this.opCompilersSelect(session, body);
    if (pathname === '/v1/compilers/standard' && method === 'POST') return this.opCompilersStandard(session, body);
    if (pathname === '/v1/compilers/add' && method === 'POST') return this.opCompilersAdd(session, body);
    if (pathname === '/v1/settings' && method === 'GET') return this.opSettingsGet(session, {});
    if (pathname === '/v1/settings' && method === 'PATCH') return this.opSettingsPatch(session, body);
    if (pathname === '/v1/audit' && method === 'GET') return this.opAudit(session, {});
    if (pathname === '/v1/clients' && method === 'GET') return this.opClientsGet(session, {});
    if (pathname === '/v1/ui/notify' && method === 'POST') return this.opNotify(session, body);
    if (pathname === '/v1/ui/open-panel' && method === 'POST') return this.opOpenPanel(session, body);
    if (pathname === '/v1/operations' && method === 'GET') return this.opOperations(session, {});
    if (pathname === '/v1/execute' && method === 'POST') {
      const op = this.operations[body.op];
      if (!op) throw new ApiError(404, 'UNKNOWN_OPERATION', `未知操作：${body.op}`);
      this.requireScope(session, op.scope);
      const result = await op.handler(session, body.args || {});
      return { ...result, summary: result.summary || `${body.op} 已完成` };
    }
    if (segments[0] === 'v1' && segments[1] === 'editor') throw new ApiError(404, 'NOT_FOUND', '未知的编辑器接口');
    throw new ApiError(404, 'NOT_FOUND', `未知接口：${method} ${pathname}`);
  }

  requireScope(session, scope) {
    if (!withinScopes(session.scopes, [scope])) {
      throw new ApiError(403, 'FORBIDDEN_SCOPE', `当前 AI 会话缺少「${scope}」权限`);
    }
  }

  requiredScope(method, pathname) {
    if (pathname === '/v1/editor') return 'read';
    if (pathname.startsWith('/v1/editor/')) return 'editor';
    if (pathname === '/v1/file') return method === 'GET' ? 'read' : 'write';
    if (pathname === '/v1/file/create') return 'write';
    if (pathname === '/v1/files') return method === 'GET' ? 'read' : 'write';
    if (pathname === '/v1/folders' || pathname === '/v1/rename') return 'write';
    if (pathname === '/v1/terminal') return 'terminal';
    if (pathname === '/v1/tests') return method === 'GET' ? 'read' : 'write';
    if (pathname === '/v1/tests/run') return 'run';
    if (pathname === '/v1/build' || pathname === '/v1/run') return 'run';
    if (pathname === '/v1/mode') return method === 'GET' ? 'read' : 'mode';
    if (pathname === '/v1/compilers') return 'read';
    if (pathname.startsWith('/v1/compilers/')) return 'compilers';
    if (pathname === '/v1/settings') return method === 'GET' ? 'read' : 'settings';
    if (pathname === '/v1/ui/notify' || pathname === '/v1/ui/open-panel') return 'ui';
    if (
      pathname === '/v1/state' ||
      pathname === '/v1/tree' ||
      pathname === '/v1/problems' ||
      pathname === '/v1/audit' ||
      pathname === '/v1/clients' ||
      pathname === '/v1/operations'
    ) {
      return 'read';
    }
    return null;
  }

  requireWorkspace() {
    if (!this.workspace.isOpen) throw new ApiError(409, 'NO_WORKSPACE', 'IDE 尚未打开工作区');
  }

  serializeSettings() {
    const data = this.settings.all();
    return {
      mode: data.mode,
      fontSize: data.fontSize,
      tabSize: data.tabSize,
      wordWrap: data.wordWrap,
      minimap: data.minimap,
      autoSave: data.autoSave,
      fontLigatures: data.fontLigatures,
      autoComplete: data.autoComplete,
      o2Optimization: data.o2Optimization,
      aiActivityEnabled: data.aiActivityEnabled,
      aiActivityAutoOpen: data.aiActivityAutoOpen,
      aiAutoSwitch: data.aiAutoSwitch,
      aiDiffFlash: data.aiDiffFlash,
      aiDiffFlashDuration: data.aiDiffFlashDuration,
      aiPort: data.aiPort,
      oiPanelHeight: data.oiPanelHeight,
      recentWorkspaces: data.recentWorkspaces,
    };
  }

  buildOperations() {
    return {
      'ide.state': { scope: 'read', handler: (s, a) => this.opState(s, a) },
      'workspace.tree': { scope: 'read', handler: (s, a) => this.opTree(s, a) },
      'workspace.files': { scope: 'read', handler: (s, a) => this.opFiles(s, a) },
      'file.read': { scope: 'read', handler: (s, a) => this.opFileRead(s, a) },
      'file.write': { scope: 'write', handler: (s, a) => this.opFileWrite(s, a) },
      'file.create': { scope: 'write', handler: (s, a) => this.opFileCreate(s, a) },
      createFile: { scope: 'write', handler: (s, a) => this.opFileCreate(s, a) },
      'folder.create': { scope: 'write', handler: (s, a) => this.opFolderCreate(s, a) },
      'file.rename': { scope: 'write', handler: (s, a) => this.opRename(s, a) },
      'file.delete': { scope: 'write', handler: (s, a) => this.opFileDelete(s, a) },
      'editor.get': { scope: 'read', handler: (s, a) => this.opEditorGet(s, a) },
      'editor.open': { scope: 'editor', handler: (s, a) => this.opEditorOpen(s, a) },
      'editor.setContent': { scope: 'editor', handler: (s, a) => this.opEditorContent(s, a) },
      'editor.insert': { scope: 'editor', handler: (s, a) => this.opEditorInsert(s, a) },
      'editor.replace': { scope: 'editor', handler: (s, a) => this.opEditorReplace(s, a) },
      'editor.select': { scope: 'editor', handler: (s, a) => this.opEditorSelect(s, a) },
      'editor.save': { scope: 'editor', handler: (s, a) => this.opEditorSave(s, a) },
      'editor.format': { scope: 'editor', handler: (s, a) => this.opEditorFormat(s, a) },
      'problems.get': { scope: 'read', handler: (s, a) => this.opProblems(s, a) },
      'project.build': { scope: 'run', handler: (s, a) => this.opBuild(s, a) },
      'project.run': { scope: 'run', handler: (s, a) => this.opRun(s, a) },
      'tests.get': { scope: 'read', handler: (s, a) => this.opTestsGet(s, a) },
      'tests.set': { scope: 'write', handler: (s, a) => this.opTestsSet(s, a) },
      'tests.run': { scope: 'run', handler: (s, a) => this.opTestsRun(s, a) },
      'terminal.exec': { scope: 'terminal', handler: (s, a) => this.opTerminal(s, a) },
      'mode.get': { scope: 'read', handler: (s, a) => this.opModeGet(s, a) },
      'mode.set': { scope: 'mode', handler: (s, a) => this.opModeSet(s, a) },
      'compilers.list': { scope: 'read', handler: (s, a) => this.opCompilersList(s, a) },
      'compilers.scan': { scope: 'compilers', handler: (s, a) => this.opCompilersScan(s, a) },
      'compilers.select': { scope: 'compilers', handler: (s, a) => this.opCompilersSelect(s, a) },
      'compilers.standard': { scope: 'compilers', handler: (s, a) => this.opCompilersStandard(s, a) },
      'compilers.add': { scope: 'compilers', handler: (s, a) => this.opCompilersAdd(s, a) },
      'settings.get': { scope: 'read', handler: (s, a) => this.opSettingsGet(s, a) },
      'settings.patch': { scope: 'settings', handler: (s, a) => this.opSettingsPatch(s, a) },
      'audit.list': { scope: 'read', handler: (s, a) => this.opAudit(s, a) },
      'clients.list': { scope: 'read', handler: (s, a) => this.opClientsGet(s, a) },
      'ui.notify': { scope: 'ui', handler: (s, a) => this.opNotify(s, a) },
      'ui.openPanel': { scope: 'ui', handler: (s, a) => this.opOpenPanel(s, a) },
      'api.operations': { scope: 'read', handler: (s, a) => this.opOperations(s, a) },
    };
  }

  async opState(session, args) {
    const editor = await this.bridge.call('editor.get', {});
    const resolvedCpp = this.compilers.resolve('cpp');
    return {
      app: APP_NAME,
      version: this.appVersion,
      mode: this.settings.get('mode'),
      workspace: this.workspace.isOpen
        ? { name: path.basename(this.workspace.root), path: this.workspace.root }
        : null,
      editor,
      compiler: resolvedCpp.compiler
        ? {
            id: resolvedCpp.compiler.id,
            name: resolvedCpp.compiler.name,
            standard: resolvedCpp.standard?.id || null,
          }
        : null,
      session: {
        clientName: session.clientName,
        scopes: session.scopes,
        expiresAt: session.expiresAt,
      },
      summary: '已返回 IDE 状态',
    };
  }

  async opTree(session, args) {
    this.requireScope(session, 'read');
    this.requireWorkspace();
    const tree = await this.workspace.tree();
    if (args.path) {
      const target = this.workspace.resolve(args.path);
      const findNode = (node) => {
        if (node.path === args.path && node.type === 'dir') return node;
        for (const child of node.children || []) {
          const hit = findNode(child);
          if (hit) return hit;
        }
        return null;
      };
      const node = findNode(tree);
      return { tree: node || null, summary: `已读取目录 ${args.path}` };
    }
    return { tree, summary: '已读取工作区文件树' };
  }

  async opFiles(session, args) {
    this.requireWorkspace();
    const files = await this.workspace.flatFiles();
    return { files, count: files.length, summary: `已列出 ${files.length} 个文件` };
  }

  async opFileRead(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    const file = await this.workspace.read(args.path);
    return { file, summary: `已读取 ${file.path}` };
  }

  async opFileWrite(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    if (typeof args.content !== 'string') throw new ApiError(400, 'MISSING_CONTENT', 'content 必须是字符串');
    await this.assertBufferClean(args.path);
    let before = '';
    try {
      before = (await this.workspace.read(args.path)).content;
    } catch {
      before = '';
    }
    const result = await this.workspace.write(args.path, args.content);
    this.bridge.broadcast('workspace:file-changed', { path: result.path, source: 'ai' });
    this.bridge.broadcast('workspace:refresh', {});
    await this.bridge.call('editor.syncFile', { path: result.path }).catch(() => {});
    return {
      file: result,
      summary: `已写入 ${result.path}（${result.size} 字节）`,
      activity: makeChangeActivity('file-write', result.path, before, args.content),
    };
  }

  async opFileCreate(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    const kind = args.kind === 'dir' || args.kind === 'folder' ? 'dir' : 'file';
    const result = await this.workspace.create(args.path, kind, args.content ?? '');
    this.bridge.broadcast('workspace:refresh', {});
    if (result.type === 'file' && args.open !== false) {
      await this.bridge.call('editor.open', { path: result.path }).catch(() => {});
    }
    return {
      ...result,
      summary: `已创建 ${result.type === 'dir' ? '文件夹' : '文件'} ${result.path}`,
      activity: result.type === 'file'
        ? makeChangeActivity('file-create', result.path, '', args.content ?? '')
        : { kind: 'folder-create', path: result.path, changed: false },
    };
  }

  async opFolderCreate(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    const result = await this.workspace.mkdir(args.path);
    this.bridge.broadcast('workspace:refresh', {});
    return { ...result, summary: `已创建文件夹 ${result.path}` };
  }

  async opRename(session, args) {
    this.requireWorkspace();
    if (!args.from || !args.to) throw new ApiError(400, 'MISSING_PATH', '需要 from 与 to 参数');
    await this.assertBufferClean(args.from);
    const result = await this.workspace.rename(args.from, args.to);
    this.bridge.broadcast('workspace:renamed', result);
    this.bridge.broadcast('workspace:refresh', {});
    return { ...result, summary: `已重命名 ${result.from} → ${result.to}` };
  }

  async opFileDelete(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    await this.assertBufferClean(args.path);
    const result = await this.workspace.remove(args.path);
    this.bridge.broadcast('workspace:removed', result);
    this.bridge.broadcast('workspace:refresh', {});
    return { ...result, summary: `已删除 ${result.path}` };
  }

  async opEditorGet(session, args) {
    return { editor: await this.bridge.call('editor.get', {}), summary: '已读取编辑器状态' };
  }

  async opEditorOpen(session, args) {
    this.requireWorkspace();
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    const target = this.workspace.resolve(args.path, { allowMissing: false });
    this.workspace.assertOiPolicy(target);
    const editor = await this.bridge.call('editor.open', {
      path: this.workspace.relative(target),
      line: args.line,
      column: args.column,
    });
    return { editor, summary: `已打开 ${args.path}` };
  }

  async opEditorContent(session, args) {
    if (typeof args.content !== 'string') throw new ApiError(400, 'MISSING_CONTENT', 'content 必须是字符串');
    const before = await this.bridge.call('editor.get', {}).catch(() => null);
    const editor = await this.bridge.call('editor.setContent', { content: args.content });
    return {
      editor,
      summary: '已替换编辑器内容',
      activity: makeChangeActivity('editor-content', editor?.path || before?.path || '', before?.content || '', args.content),
    };
  }

  async opEditorInsert(session, args) {
    if (typeof args.text !== 'string') throw new ApiError(400, 'MISSING_TEXT', 'text 必须是字符串');
    const before = await this.bridge.call('editor.get', {}).catch(() => null);
    const editor = await this.bridge.call('editor.insert', { text: args.text, position: args.position });
    return {
      editor,
      summary: '已插入文本',
      activity: makeChangeActivity('editor-insert', editor?.path || before?.path || '', before?.content || '', editor?.content || ''),
    };
  }

  async opEditorReplace(session, args) {
    if (typeof args.text !== 'string') throw new ApiError(400, 'MISSING_TEXT', 'text 必须是字符串');
    if (!args.range || typeof args.range !== 'object') throw new ApiError(400, 'MISSING_RANGE', '需要 range 参数');
    const before = await this.bridge.call('editor.get', {}).catch(() => null);
    const editor = await this.bridge.call('editor.replace', { text: args.text, range: args.range });
    return {
      editor,
      summary: '已替换文本范围',
      activity: makeChangeActivity('editor-replace', editor?.path || before?.path || '', before?.content || '', editor?.content || ''),
    };
  }

  async opEditorSelect(session, args) {
    const editor = await this.bridge.call('editor.select', {
      startLine: args.startLine,
      startColumn: args.startColumn,
      endLine: args.endLine,
      endColumn: args.endColumn,
    });
    return { editor, summary: '已设置选区' };
  }

  async opEditorSave(session, args) {
    const editor = await this.bridge.call('editor.save', {});
    return { editor, summary: editor?.saved ? '已保存' : '没有需要保存的修改' };
  }

  async opEditorFormat(session, args) {
    const before = await this.bridge.call('editor.get', {});
    const result = await this.bridge.call('editor.format', {});
    return {
      formatted: Boolean(result?.formatted),
      language: result?.language || before?.language,
      message: result?.formatted ? '已格式化文档' : '当前文档没有可用的格式化器',
      summary: result?.formatted ? '已格式化文档' : '格式化器不可用',
    };
  }

  async opProblems(session, args) {
    return {
      problems: this.runner.lastProblems,
      count: this.runner.lastProblems.length,
      summary: `当前有 ${this.runner.lastProblems.length} 条问题`,
    };
  }

  async opBuild(session, args) {
    this.requireWorkspace();
    if (!args.path && !this.workspace.isOpen) throw new ApiError(400, 'MISSING_PATH', '缺少 path 参数');
    const target = await this.activeOrArgPath(args.path);
    const build = await this.runner.build(target, {
      compilerId: args.compilerId,
      standard: args.standard,
    });
    this.emitCompilerEvents(this.runner.lastProblems);
    return {
      success: build.success,
      build: this.publicBuild(build),
      summary: build.success ? `编译成功，用时 ${build.durationMs} ms` : '编译失败',
    };
  }

  async opRun(session, args) {
    this.requireWorkspace();
    const target = await this.activeOrArgPath(args.path);
    const result = await this.runner.run(target, {
      compilerId: args.compilerId,
      stdin: args.stdin ?? '',
      timeoutMs: args.timeoutMs,
      standard: args.standard,
    });
    this.emitCompilerEvents(result.build?.diagnostics || []);
    return {
      success: Boolean(result.run?.ok),
      build: this.publicBuild(result.build),
      run: result.run
        ? {
            stdout: result.run.stdout,
            stderr: result.run.stderr,
            output: result.run.output,
            exitCode: result.run.exitCode,
            timedOut: result.run.timedOut,
            durationMs: result.run.durationMs,
          }
        : null,
      summary: result.run?.ok ? `运行完成，用时 ${result.run.durationMs} ms` : '运行失败',
    };
  }

  async opTerminal(session, args) {
    if (!args.command) throw new ApiError(400, 'MISSING_COMMAND', '缺少 command 参数');
    const result = await this.runner.exec(args.command, {
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
    });
    return { ...result, summary: `命令退出码 ${result.exitCode}` };
  }

  async opTestsGet(session, args) {
    this.requireWorkspace();
    const data = await this.tests.read();
    return { tests: data, summary: `共 ${data.cases.length} 个测试点` };
  }

  async opTestsSet(session, args) {
    this.requireWorkspace();
    if (!Array.isArray(args.cases)) throw new ApiError(400, 'MISSING_CASES', 'cases 必须是数组');
    if (args.cases.length > 200) throw new ApiError(400, 'TOO_MANY_CASES', '测试点最多 200 个');
    const data = await this.tests.write({ cases: args.cases });
    this.bridge.broadcast('tests:changed', data);
    return { tests: data, summary: `已保存 ${data.cases.length} 个测试点` };
  }

  async opTestsRun(session, args) {
    this.requireWorkspace();
    const target = await this.activeOrArgPath(args.path);
    const language = languageForPath(target);
    if (this.settings.get('mode') === 'oi' && language.id !== 'cpp' && language.id !== 'c') {
      throw new ApiError(409, 'MODE_RESTRICTED', 'OI 模式下仅可评测 C/C++ 代码');
    }
    const data = await this.tests.read();
    const cases = Array.isArray(args.cases) ? args.cases : data.cases;
    const result = await this.runner.runTests(target, {
      cases,
      testStore: this.tests,
      timeoutMs: args.timeoutMs,
      compilerId: args.compilerId,
    });
    if (result.build?.diagnostics) {
      this.bridge.broadcast('run:problems', { problems: result.build.diagnostics });
    }
    this.bridge.broadcast('tests:results', result);
    return {
      allPassed: result.allPassed,
      passed: result.passed,
      total: result.total,
      compileSuccess: result.build?.success ?? false,
      buildOutput: result.build?.output || '',
      diagnostics: result.build?.diagnostics || [],
      results: result.results,
      summary: `测试完成：通过 ${result.passed}/${result.total}`,
    };
  }

  async opModeGet(session, args) {
    return {
      mode: this.settings.get('mode'),
      oiLanguages: ['cpp', 'c'],
      description: this.settings.get('mode') === 'oi' ? 'OI 竞赛模式，仅支持 C/C++' : '开发模式，支持多语言',
      summary: '已返回当前模式',
    };
  }

  async opModeSet(session, args) {
    if (args.mode !== 'oi' && args.mode !== 'dev') throw new ApiError(400, 'BAD_MODE', 'mode 必须是 oi 或 dev');
    const result = await this.onModeChange(args.mode, { source: 'ai' });
    return {
      mode: args.mode,
      closedTabs: result?.closedTabs || [],
      summary: args.mode === 'oi' ? '已切换到 OI 模式' : '已切换到开发模式',
    };
  }

  async opCompilersList(session, args) {
    const selected = {};
    for (const language of ['cpp', 'c', 'python', 'javascript', 'java', 'go', 'rust']) {
      const resolved = this.compilers.resolve(language);
      selected[language] = resolved.compiler
        ? { compilerId: resolved.compiler.id, standard: resolved.standard?.id || null }
        : null;
    }
    return {
      compilers: this.compilers.list(),
      selected,
      scanning: this.compilers.scanningState,
      summary: `已检测到 ${this.compilers.list().length} 个工具链`,
    };
  }

  async opCompilersScan(session, args) {
    const compilers = await this.compilers.scan({ force: Boolean(args.force) });
    this.onCompilersChanged();
    return { compilers, count: compilers.length, summary: `扫描完成，共 ${compilers.length} 个工具链` };
  }

  async opCompilersSelect(session, args) {
    if (!args.language || !args.compilerId) throw new ApiError(400, 'MISSING_ARGS', '需要 language 与 compilerId');
    const resolved = this.compilers.select(args.language, args.compilerId);
    this.onCompilersChanged();
    return {
      language: args.language,
      compiler: resolved.compiler,
      standard: resolved.standard,
      summary: `已为 ${args.language} 选择 ${resolved.compiler?.name}`,
    };
  }

  async opCompilersStandard(session, args) {
    if (!args.compilerId || !args.standard) throw new ApiError(400, 'MISSING_ARGS', '需要 compilerId 与 standard');
    this.compilers.selectStandard(args.compilerId, args.standard);
    this.onCompilersChanged();
    return { compilerId: args.compilerId, standard: args.standard, summary: `已切换编译标准为 ${args.standard}` };
  }

  async opCompilersAdd(session, args) {
    if (!args.path) throw new ApiError(400, 'MISSING_PATH', '缺少可执行文件路径');
    const compiler = await this.compilers.addCustom(args.path);
    this.onCompilersChanged();
    return { compiler, summary: `已添加 ${compiler.name}` };
  }

  async opSettingsGet(session, args) {
    return { settings: this.serializeSettings(), summary: '已返回设置' };
  }

  async opSettingsPatch(session, args) {
    const allowed = ['fontSize', 'tabSize', 'wordWrap', 'minimap', 'autoSave', 'fontLigatures', 'autoComplete', 'o2Optimization', 'aiActivityEnabled', 'aiActivityAutoOpen', 'aiAutoSwitch', 'aiDiffFlash', 'aiDiffFlashDuration', 'oiPanelHeight'];
    const patch = {};
    for (const [key, value] of Object.entries(args.settings || args)) {
      if (!allowed.includes(key)) continue;
      patch[key] = value;
    }
    if ('fontSize' in patch) patch.fontSize = Math.max(10, Math.min(32, Number(patch.fontSize) || 14));
    if ('tabSize' in patch) patch.tabSize = Math.max(1, Math.min(8, Number(patch.tabSize) || 4));
    if ('wordWrap' in patch) patch.wordWrap = ['on', 'off', 'bounded'].includes(patch.wordWrap) ? patch.wordWrap : 'off';
    if ('minimap' in patch) patch.minimap = Boolean(patch.minimap);
    if ('autoSave' in patch) patch.autoSave = Boolean(patch.autoSave);
    if ('fontLigatures' in patch) patch.fontLigatures = Boolean(patch.fontLigatures);
    if ('autoComplete' in patch) patch.autoComplete = Boolean(patch.autoComplete);
    if ('o2Optimization' in patch) patch.o2Optimization = Boolean(patch.o2Optimization);
    if ('aiActivityEnabled' in patch) patch.aiActivityEnabled = Boolean(patch.aiActivityEnabled);
    if ('aiActivityAutoOpen' in patch) patch.aiActivityAutoOpen = Boolean(patch.aiActivityAutoOpen);
    if ('aiAutoSwitch' in patch) patch.aiAutoSwitch = Boolean(patch.aiAutoSwitch);
    if ('aiDiffFlash' in patch) patch.aiDiffFlash = Boolean(patch.aiDiffFlash);
    if ('aiDiffFlashDuration' in patch) patch.aiDiffFlashDuration = Math.max(300, Math.min(3000, Number(patch.aiDiffFlashDuration) || 900));
    if ('oiPanelHeight' in patch) patch.oiPanelHeight = Math.max(140, Math.min(600, Number(patch.oiPanelHeight) || 260));
    this.settings.patch(patch);
    this.onSettingsChange(patch);
    this.bridge.broadcast('settings:changed', this.serializeSettings());
    return { settings: this.serializeSettings(), summary: '设置已更新' };
  }

  async opAudit(session, args) {
    return {
      audit: this.audit.slice(-100).reverse(),
      sessions: this.publicSessions(),
      trusted: this.settings.get('trustedClients', []).map(({ id, clientName, clientId, scopes, approvedAt }) => ({
        id,
        clientName,
        clientId,
        scopes,
        approvedAt,
      })),
      summary: '已返回近期 AI 活动',
    };
  }

  async opClientsGet(session, args) {
    return {
      sessions: this.publicSessions(),
      trusted: this.settings.get('trustedClients', []),
      summary: `当前有 ${this.publicSessions().length} 个在线 AI 客户端`,
    };
  }

  async opNotify(session, args) {
    const message = String(args.message || '').slice(0, 500);
    if (!message) throw new ApiError(400, 'MISSING_MESSAGE', '缺少 message');
    await this.bridge.call('ui.notify', { message, type: args.type || 'info' }).catch(() => {});
    return { delivered: true, summary: '通知已发送到 IDE' };
  }

  async opOpenPanel(session, args) {
    const panel = ['explorer', 'compilers', 'ai', 'terminal', 'problems', 'tests', 'settings'].includes(args.panel)
      ? args.panel
      : 'explorer';
    await this.bridge.call('ui.openPanel', { panel }).catch(() => {});
    return { panel, summary: `已打开 ${panel} 面板` };
  }

  async opOperations(session, args) {
    const operations = Object.entries(this.operations).map(([name, item]) => ({
      name,
      scope: item.scope,
      description: OPERATION_DESCRIPTIONS[name] || '',
    }));
    return {
      operations,
      scopes: ALL_SCOPES.map((id) => ({ id, label: SCOPE_LABELS[id] })),
      summary: `共 ${operations.length} 个操作`,
    };
  }

  async activeOrArgPath(inputPath) {
    if (inputPath) {
      this.workspace.resolve(inputPath, { allowMissing: false });
      return inputPath;
    }
    const state = await this.bridge.call('editor.get', {});
    if (!state?.path) throw new ApiError(409, 'NO_ACTIVE_FILE', '没有活动文件，请传入 path');
    return state.path;
  }

  async assertBufferClean(inputPath) {
    try {
      const result = await this.bridge.call('editor.isDirty', { path: String(inputPath).replace(/\\/g, '/') });
      if (result?.dirty) {
        throw new ApiError(409, 'DIRTY_BUFFER', '该文件在编辑器中还有未保存的修改，请先保存或让用户处理');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // 界面不可用时跳过检查。
    }
  }

  emitCompilerEvents(problems) {
    this.bridge.broadcast('run:problems', { problems: problems || [] });
  }

  publicBuild(build) {
    if (!build) return null;
    return {
      success: build.success,
      language: build.language,
      compiler: build.compiler,
      standard: build.standard,
      output: build.output,
      diagnostics: build.diagnostics,
      durationMs: build.durationMs,
      executable: build.executable ? path.basename(build.executable) : null,
      commandLine: build.commandLine,
      autoFallback: build.autoFallback || null,
    };
  }

  docsMarkdown() {
    const lines = [];
    lines.push('# Orbit IDE · AI Control API');
    lines.push('');
    lines.push(`Base URL: \`${this.info().endpoint || 'http://127.0.0.1:37821'}\``);
    lines.push('');
    lines.push('## 登录流程');
    lines.push('');
    lines.push('1. `POST /v1/login`，请求体：`{ "clientName": "My Agent", "scopes": ["read","write","editor","run"] }`。');
    lines.push('2. IDE 内会弹出审批窗口，用户点击「允许」。');
    lines.push('3. 轮询响应中的 `poll` 地址，拿到 `token`。');
    lines.push('4. 后续请求携带 `Authorization: Bearer <token>`。Token 有效期 24 小时。');
    lines.push('');
    lines.push('所有操作也可以通过 `POST /v1/execute` 统一调用：`{ "op": "file.write", "args": { ... } }`。');
    lines.push('');
    for (const [name, item] of Object.entries(this.operations)) {
      lines.push(`## ${name}`);
      lines.push('');
      lines.push(`权限：\`${item.scope}\``);
      lines.push('');
      lines.push(OPERATION_DESCRIPTIONS[name] || '');
      lines.push('');
    }
    lines.push('## 安全说明');
    lines.push('');
    lines.push('- 服务只监听 `127.0.0.1`，不会暴露到局域网。');
    lines.push('- 每次新客户端登录都需要用户在 IDE 内批准；可勾选「记住」以允许该客户端后续自动连接。');
    lines.push('- 可在 IDE 的 AI 面板中随时撤销在线令牌或受信任客户端。');
    lines.push('- OI 模式会在服务端强制限制非 C/C++ 文件的写入与运行。');
    lines.push('');
    return lines.join('\n');
  }

  openapi() {
    const secured = [{ bearerAuth: [] }];
    const paths = {
      '/health': { get: { summary: '存活检查', security: [] } },
      '/v1/info': { get: { summary: '服务信息与操作列表', security: [] } },
      '/v1/login': {
        post: {
          summary: '申请 AI 登录，等待 IDE 内审批',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['clientName'],
                  properties: {
                    clientName: { type: 'string' },
                    clientId: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/login/{requestId}': {
        get: {
          summary: '轮询登录审批结果',
          security: [],
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
        },
      },
      '/v1/state': { get: { summary: 'IDE 状态', security: secured } },
      '/v1/tree': { get: { summary: '文件树', security: secured } },
      '/v1/files': {
        get: { summary: '文件平铺列表', security: secured },
        post: { summary: '创建文件', security: secured },
      },
      '/v1/file/create': { post: { summary: '创建文件（专用接口）', security: secured } },
      '/v1/file': {
        get: { summary: '读取文件', security: secured },
        put: { summary: '写入文件', security: secured },
        delete: { summary: '删除文件', security: secured },
      },
      '/v1/folders': { post: { summary: '创建文件夹', security: secured } },
      '/v1/rename': { post: { summary: '重命名/移动', security: secured } },
      '/v1/editor': { get: { summary: '编辑器状态', security: secured } },
      '/v1/editor/open': { post: { summary: '打开文件', security: secured } },
      '/v1/editor/content': { post: { summary: '替换全文', security: secured } },
      '/v1/editor/insert': { post: { summary: '插入文本', security: secured } },
      '/v1/editor/replace': { post: { summary: '替换范围', security: secured } },
      '/v1/editor/selection': { post: { summary: '设置选区', security: secured } },
      '/v1/editor/save': { post: { summary: '保存当前文件', security: secured } },
      '/v1/editor/format': { post: { summary: '格式化当前文档', security: secured } },
      '/v1/problems': { get: { summary: '编译诊断', security: secured } },
      '/v1/build': { post: { summary: '编译', security: secured } },
      '/v1/run': { post: { summary: '编译并运行', security: secured } },
      '/v1/terminal': { post: { summary: '执行终端命令', security: secured } },
      '/v1/tests': {
        get: { summary: '读取测试点', security: secured },
        put: { summary: '保存测试点', security: secured },
      },
      '/v1/tests/run': { post: { summary: '批量评测', security: secured } },
      '/v1/mode': {
        get: { summary: '读取模式', security: secured },
        post: { summary: '切换模式', security: secured },
      },
      '/v1/compilers': { get: { summary: '编译器列表', security: secured } },
      '/v1/compilers/scan': { post: { summary: '重新扫描编译器', security: secured } },
      '/v1/compilers/select': { post: { summary: '选择编译器', security: secured } },
      '/v1/compilers/standard': { post: { summary: '选择 C/C++ 标准', security: secured } },
      '/v1/compilers/add': { post: { summary: '手动添加编译器', security: secured } },
      '/v1/settings': {
        get: { summary: '读取设置', security: secured },
        patch: { summary: '修改设置', security: secured },
      },
      '/v1/audit': { get: { summary: 'AI 审计日志', security: secured } },
      '/v1/clients': { get: { summary: '在线会话与信任列表', security: secured } },
      '/v1/ui/notify': { post: { summary: '发送 IDE 通知', security: secured } },
      '/v1/ui/open-panel': { post: { summary: '打开 IDE 面板', security: secured } },
      '/v1/operations': { get: { summary: '全部操作与 scope', security: secured } },
      '/v1/execute': {
        post: {
          summary: '统一操作入口',
          security: secured,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['op'],
                  properties: {
                    op: { type: 'string' },
                    args: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/docs': { get: { summary: 'Markdown 文档', security: [] } },
    };
    return {
      openapi: '3.1.0',
      info: {
        title: 'Orbit IDE AI Control API',
        version: API_VERSION,
        description: '本地 AI 控制接口。除公开端点外，需要先通过 /v1/login 获取 Bearer Token。',
      },
      servers: [{ url: this.info().endpoint || 'http://127.0.0.1:37821' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: secured,
      paths,
      'x-orbit-operations': Object.entries(this.operations).map(([name, item]) => ({
        name,
        scope: item.scope,
        description: OPERATION_DESCRIPTIONS[name] || '',
      })),
    };
  }
}

const OPERATION_DESCRIPTIONS = {
  'ide.state': '读取当前模式、工作区、活动文件、所选编译器与会话权限。',
  'workspace.tree': '读取工作区文件树，可传 `path` 只返回某个目录。',
  'workspace.files': '平铺列出工作区所有文件，适合快速打开。',
  'file.read': '读取文本文件内容。参数：`path`。',
  'file.write': '覆盖写入文件（必要时创建父目录）。参数：`path`, `content`。',
  'file.create': '创建文件或文件夹。参数：`path`, `kind`（"file"/"dir"）, `content`, `open`。',
  createFile: '创建文件（file.create 的别名）。参数：`path`, `content`, `open`。',
  'folder.create': '创建文件夹。参数：`path`。',
  'file.rename': '重命名或移动。参数：`from`, `to`。',
  'file.delete': '删除文件/文件夹（优先放入回收站）。参数：`path`。',
  'editor.get': '读取当前活动文件、内容、光标、选区与未保存状态。',
  'editor.open': '在编辑器中打开文件。参数：`path`, 可选 `line`, `column`。',
  'editor.setContent': '替换活动编辑器全文。参数：`content`。',
  'editor.insert': '在光标处插入文本，可通过 `position` 指定 `{line,column}`。参数：`text`。',
  'editor.replace': '替换指定文本范围。参数：`range`（startLine/startColumn/endLine/endColumn），`text`。',
  'editor.select': '设置选区。参数：`startLine`, `startColumn`, `endLine`, `endColumn`。',
  'editor.save': '保存当前文件。无参数。',
  'editor.format': '调用编辑器格式化器格式化当前文档。无参数。',
  'problems.get': '读取最近一次编译产生的诊断信息。',
  'project.build': '编译指定文件或当前文件。参数：`path`, 可选 `compilerId`, `standard`。',
  'project.run': '编译并运行。参数：`path`, `stdin`, `timeoutMs`, 可选 `compilerId`。',
  'tests.get': '读取 OI 测试点。',
  'tests.set': '覆盖保存 OI 测试点。参数：`cases` 数组，每项包含 `name`, `input`, `expected`, `enabled`。',
  'tests.run': '编译并批量运行测试点，返回逐点结果。参数：`cases`（可选）, `timeoutMs`, `path`。',
  'terminal.exec': '在单次 PowerShell 中执行命令。参数：`command`, 可选 `cwd`, `timeoutMs`。需要 terminal 权限。',
  'mode.get': '读取当前模式（oi/dev）。',
  'mode.set': '切换模式。参数：`mode`（"oi" 或 "dev"）。切到 OI 时会关闭不兼容的标签页。',
  'compilers.list': '列出扫描到的编译器、解释器及其支持的 C/C++ 标准，以及当前选择。',
  'compilers.scan': '重新扫描系统编译器。参数：可选 `force`（重新探测标准）。',
  'compilers.select': '为语言选择工具链。参数：`language`, `compilerId`。',
  'compilers.standard': '选择 C/C++ 标准。参数：`compilerId`, `standard`。',
  'compilers.add': '手动添加编译器可执行文件。参数：`path`。',
  'settings.get': '读取 IDE 设置。',
  'settings.patch': '修改设置。支持 `fontSize`, `tabSize`, `wordWrap`, `minimap`, `autoSave`, `fontLigatures`, `oiPanelHeight`。',
  'audit.list': '读取近期 AI 操作审计、在线会话与受信任客户端。',
  'clients.list': '列出在线 AI 会话与受信任客户端。',
  'ui.notify': '在 IDE 中弹出通知。参数：`message`, `type`（info/success/warning/error）。',
  'ui.openPanel': '打开界面面板。参数：`panel`（explorer/compilers/ai/terminal/problems/tests/settings）。',
  'api.operations': '列出所有可用操作与权限。',
};

module.exports = { AIServer, ALL_SCOPES, SCOPE_LABELS };

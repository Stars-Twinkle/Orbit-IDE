'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { shell } = require('electron');
const { languageForPath, isOiAllowed } = require('./languages.cjs');

const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.orbit',
  'node_modules',
  'dist',
  'release',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
]);

const MAX_FILE_BYTES = 8 * 1024 * 1024;

class WorkspaceError extends Error {
  constructor(message, code = 'WORKSPACE_ERROR') {
    super(message);
    this.code = code;
  }
}

class WorkspaceService {
  constructor(settings) {
    this.settings = settings;
    this.root = null;
  }

  async open(rootPath) {
    if (!rootPath) throw new WorkspaceError('缺少文件夹路径', 'BAD_PATH');
    const resolved = path.resolve(rootPath);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) throw new WorkspaceError('文件夹不存在', 'NOT_FOUND');
    this.root = resolved;
    this.settings.patch({
      workspace: resolved,
      recentWorkspaces: [
        resolved,
        ...(this.settings.get('recentWorkspaces', []) || []).filter(
          (item) => item.toLowerCase() !== resolved.toLowerCase()
        ),
      ].slice(0, 8),
    });
    return { root: this.root, name: path.basename(this.root) };
  }

  close() {
    this.root = null;
    this.settings.set('workspace', null);
  }

  get isOpen() {
    return Boolean(this.root);
  }

  relative(target) {
    if (!this.root) return target;
    return path.relative(this.root, target).split(path.sep).join('/');
  }

  resolve(inputPath, { allowMissing = true } = {}) {
    if (!this.root) throw new WorkspaceError('尚未打开文件夹', 'NO_WORKSPACE');
    if (typeof inputPath !== 'string' || !inputPath.trim()) {
      throw new WorkspaceError('路径不能为空', 'BAD_PATH');
    }
    if (inputPath.includes('\0')) throw new WorkspaceError('非法路径', 'BAD_PATH');
    const target = path.resolve(this.root, inputPath);
    const rootLower = this.root.toLowerCase().replace(/[\\/]+$/, '');
    const targetLower = target.toLowerCase();
    if (targetLower !== rootLower && !targetLower.startsWith(rootLower + path.sep)) {
      throw new WorkspaceError('路径必须位于当前工作区内', 'OUTSIDE_WORKSPACE');
    }
    if (!allowMissing && !fs.existsSync(target)) {
      throw new WorkspaceError('文件不存在', 'NOT_FOUND');
    }
    return target;
  }

  assertOiPolicy(target) {
    if (this.settings.get('mode') === 'oi' && !isOiAllowed(target)) {
      throw new WorkspaceError('OI 模式仅支持 C/C++ 系列文件', 'MODE_RESTRICTED');
    }
  }

  async tree() {
    if (!this.root) return null;
    let count = 0;
    const walk = async (dir, depth) => {
      if (depth > 9 || count > 4000) return [];
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
      });
      const nodes = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        count += 1;
        if (entry.isDirectory()) {
          nodes.push({
            type: 'dir',
            name: entry.name,
            path: this.relative(full),
            children: await walk(full, depth + 1),
          });
        } else if (entry.isFile()) {
          let stat = null;
          try {
            stat = await fsp.stat(full);
          } catch {
            continue;
          }
          const lang = languageForPath(full);
          nodes.push({
            type: 'file',
            name: entry.name,
            path: this.relative(full),
            size: stat.size,
            mtime: stat.mtimeMs,
            language: lang.id,
            languageLabel: lang.label,
            color: lang.color,
            locked: this.settings.get('mode') === 'oi' && !isOiAllowed(full),
          });
        }
      }
      return nodes;
    };
    return {
      name: path.basename(this.root),
      path: this.root,
      children: await walk(this.root, 0),
    };
  }

  async flatFiles() {
    if (!this.root) return [];
    const results = [];
    const walk = async (dir, depth) => {
      if (depth > 8 || results.length > 5000) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile()) {
          results.push({
            path: this.relative(full),
            name: entry.name,
            language: languageForPath(full).id,
          });
        }
      }
    };
    await walk(this.root, 0);
    return results;
  }

  async read(inputPath) {
    const target = this.resolve(inputPath, { allowMissing: false });
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new WorkspaceError('目标不是文件', 'NOT_FILE');
    if (stat.size > MAX_FILE_BYTES) throw new WorkspaceError('文件过大（超过 8 MB）', 'TOO_LARGE');
    const buffer = await fsp.readFile(target);
    if (buffer.includes(0)) throw new WorkspaceError('无法编辑二进制文件', 'BINARY_FILE');
    const lang = languageForPath(target);
    return {
      path: this.relative(target),
      name: path.basename(target),
      content: buffer.toString('utf8'),
      language: lang.id,
      languageLabel: lang.label,
      size: stat.size,
      mtime: stat.mtimeMs,
      locked: this.settings.get('mode') === 'oi' && !isOiAllowed(target),
    };
  }

  async write(inputPath, content, { create = false } = {}) {
    const target = this.resolve(inputPath);
    this.assertOiPolicy(target);
    const exists = fs.existsSync(target);
    if (!exists && !create) throw new WorkspaceError('文件不存在，可通过创建接口新建', 'NOT_FOUND');
    if (exists) {
      const stat = await fsp.stat(target);
      if (!stat.isFile()) throw new WorkspaceError('目标不是文件', 'NOT_FILE');
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, String(content ?? ''), 'utf8');
    const stat = await fsp.stat(target);
    return {
      path: this.relative(target),
      size: stat.size,
      mtime: stat.mtimeMs,
      created: !exists,
    };
  }

  async create(inputPath, kind = 'file', content = '') {
    const target = this.resolve(inputPath);
    const isDir = kind === 'dir' || kind === 'folder';
    if (!isDir) this.assertOiPolicy(target);
    if (fs.existsSync(target)) throw new WorkspaceError('同名文件或文件夹已存在', 'ALREADY_EXISTS');
    if (isDir) {
      await fsp.mkdir(target, { recursive: true });
      return { path: this.relative(target), type: 'dir' };
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, String(content ?? ''), 'utf8');
    return {
      path: this.relative(target),
      type: 'file',
      language: languageForPath(target).id,
    };
  }

  async mkdir(inputPath) {
    const target = this.resolve(inputPath);
    await fsp.mkdir(target, { recursive: true });
    return { path: this.relative(target), type: 'dir' };
  }

  async rename(from, to) {
    const source = this.resolve(from, { allowMissing: false });
    const target = this.resolve(to);
    const sourceStat = await fsp.stat(source);
    if (sourceStat.isFile()) {
      this.assertOiPolicy(source);
      this.assertOiPolicy(target);
    }
    if (fs.existsSync(target)) throw new WorkspaceError('目标路径已存在', 'ALREADY_EXISTS');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(source, target);
    return { from: this.relative(source), to: this.relative(target) };
  }

  async remove(inputPath) {
    const target = this.resolve(inputPath, { allowMissing: false });
    if (target === this.root) throw new WorkspaceError('不能删除工作区根目录', 'FORBIDDEN');
    const stat = await fsp.stat(target);
    if (stat.isFile()) this.assertOiPolicy(target);
    try {
      await shell.trashItem(target);
    } catch {
      if (stat.isDirectory()) await fsp.rm(target, { recursive: true, force: true });
      else await fsp.unlink(target);
    }
    return { path: this.relative(target), type: stat.isDirectory() ? 'dir' : 'file' };
  }

  async exists(inputPath) {
    try {
      return fs.existsSync(this.resolve(inputPath));
    } catch {
      return false;
    }
  }
}

class TestStore {
  constructor(workspace) {
    this.workspace = workspace;
    this.fileName = '.orbit/tests.json';
  }

  async read() {
    if (!this.workspace.isOpen) return { version: 1, cases: [] };
    const target = this.workspace.resolve(this.fileName);
    try {
      const raw = await fsp.readFile(target, 'utf8');
      const data = JSON.parse(raw);
      return {
        version: 1,
        cases: Array.isArray(data.cases)
          ? data.cases.map((item, index) => ({
              id: String(item.id || `case-${index + 1}`),
              name: String(item.name || `测试点 ${index + 1}`),
              input: String(item.input ?? ''),
              expected: String(item.expected ?? ''),
              enabled: item.enabled !== false,
            }))
          : [],
      };
    } catch {
      return { version: 1, cases: [] };
    }
  }

  async write(data) {
    if (!this.workspace.isOpen) throw new WorkspaceError('尚未打开文件夹', 'NO_WORKSPACE');
    const target = this.workspace.resolve(this.fileName);
    const payload = {
      version: 1,
      cases: (Array.isArray(data?.cases) ? data.cases : []).map((item, index) => ({
        id: String(item.id || `case-${Date.now()}-${index}`),
        name: String(item.name || `测试点 ${index + 1}`),
        input: String(item.input ?? ''),
        expected: String(item.expected ?? ''),
        enabled: item.enabled !== false,
      })),
    };
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }
}

module.exports = { WorkspaceService, WorkspaceError, TestStore };

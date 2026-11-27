'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const SERVERS = {
  clangd: {
    label: 'C/C++ 语言服务',
    detail: 'clangd · 代码补全、跳转、诊断',
    version: '23.1.0',
    languages: ['cpp', 'c'],
    url: 'https://github.com/clangd/clangd/releases/download/23.1.0/clangd-windows-23.1.0.zip',
    archive: 'zip',
    executable: 'clangd.exe',
    runtime: 'binary',
  },
  'rust-analyzer': {
    label: 'Rust 语言服务',
    detail: 'rust-analyzer · 语义补全与诊断',
    version: '2026-11-23',
    languages: ['rust'],
    url: 'https://github.com/rust-lang/rust-analyzer/releases/download/2026-11-23/rust-analyzer-x86_64-pc-windows-msvc.zip',
    archive: 'zip',
    executable: 'rust-analyzer.exe',
    runtime: 'binary',
  },
  pyright: {
    label: 'Python 语言服务',
    detail: 'Pyright · 类型检查与补全',
    version: '1.1.414',
    languages: ['python'],
    url: 'https://registry.npmjs.org/pyright/-/pyright-1.1.414.tgz',
    archive: 'tgz',
    executable: 'pyright-langserver.js',
    runtime: 'node',
    args: ['--stdio'],
  },
  yaml: {
    label: 'YAML 语言服务',
    detail: 'yaml-language-server · schema 补全',
    version: 'latest',
    languages: ['yaml'],
    url: 'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/redhat/vsextensions/vscode-yaml/latest/vspackage',
    archive: 'zip',
    executable: 'languageserver.js',
    runtime: 'node',
    args: ['--stdio'],
    strip: 'extension',
  },
  bash: {
    label: 'Shell 语言服务',
    detail: 'bash-language-server · Shell 补全',
    version: 'latest',
    languages: ['shell'],
    url: 'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/mads-hartmann/vsextensions/bash-ide-vscode/latest/vspackage',
    archive: 'zip',
    executable: 'bash-language-server/out/cli.js',
    runtime: 'node',
    args: ['start'],
    strip: 'extension',
  },
  gopls: {
    label: 'Go 语言服务',
    detail: 'gopls v0.24.0 · 语义补全与诊断',
    version: 'v0.24.0',
    languages: ['go'],
    url: 'https://raw.githubusercontent.com/Stars-Twinkle/Orbit-IDE/main/vendor/lsp/gopls.zip',
    archive: 'zip',
    executable: 'gopls.exe',
    runtime: 'binary',
  },
};

class LspInstaller {
  constructor(userData) {
    this.root = path.join(userData, 'language-servers');
  }

  serverDir(id) {
    return path.join(this.root, id);
  }

  manifestPath(id) {
    return path.join(this.serverDir(id), 'install.json');
  }

  readManifest(id) {
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath(id), 'utf8'));
    } catch {
      return null;
    }
  }

  async status() {
    const servers = {};
    for (const [id, spec] of Object.entries(SERVERS)) {
      const manifest = this.readManifest(id);
      const installed = Boolean(manifest?.executable && fs.existsSync(manifest.executable));
      servers[id] = {
        id,
        label: spec.label,
        detail: spec.detail,
        version: spec.version,
        manual: Boolean(spec.manual),
        docs: spec.docs || null,
        installed,
        executable: installed ? manifest.executable : null,
        runtime: manifest?.runtime || spec.runtime,
      };
    }
    return { servers };
  }

  findFile(root, matcher) {
    const queue = [root];
    while (queue.length) {
      const dir = queue.shift();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) queue.push(full);
        else if (matcher(full, entry.name)) return full;
      }
    }
    return null;
  }

  async extract(archive, target, kind) {
    await fsp.mkdir(target, { recursive: true });
    const args = kind === 'tgz' ? ['-xzf', archive, '-C', target] : ['-xf', archive, '-C', target];
    await execFileAsync('tar.exe', args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  }

  async downloadToFile(spec, archive, onProgress) {
    const urls = [spec.url];
    if (/^https:\/\/(github\.com|raw\.githubusercontent\.com)\//i.test(spec.url)) {
      urls.push(`https://ghfast.top/${spec.url}`);
    }
    let lastError = null;
    for (const url of urls) {
      await fsp.rm(archive, { force: true });
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok || !response.body) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const total = Number(response.headers.get('content-length')) || 0;
        const handle = await fsp.open(archive, 'w');
        const reader = response.body.getReader();
        const startedAt = Date.now();
        let received = 0;
        let lastEmit = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            await handle.write(value);
            received += value.byteLength;
            const now = Date.now();
            if (now - lastEmit > 180) {
              lastEmit = now;
              const elapsed = Math.max(0.2, (now - startedAt) / 1000);
              const speed = received / elapsed;
              const percent = total ? Math.min(99, Math.round((received / total) * 100)) : null;
              const eta = total && speed > 0 ? Math.max(0, Math.ceil((total - received) / speed)) : null;
              onProgress?.({
                id: spec.id || null,
                phase: 'download',
                received,
                total,
                percent,
                bytesPerSecond: Math.round(speed),
                etaSeconds: eta,
              });
            }
          }
        } finally {
          await handle.close();
          reader.releaseLock?.();
        }
        onProgress?.({ phase: 'extract', received, total, percent: total ? 100 : null, bytesPerSecond: 0, etaSeconds: 0 });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`下载失败：${lastError?.message || '网络错误'}`);
  }

  async install(id, onProgress) {
    const spec = SERVERS[id];
    if (!spec) throw new Error('未知语言服务');
    if (spec.manual) throw new Error(spec.detail);

    const dir = this.serverDir(id);
    const tmp = path.join(this.root, '.downloads', `${id}-${Date.now()}`);
    await fsp.mkdir(tmp, { recursive: true });
    const archive = path.join(tmp, `payload.${spec.archive === 'tgz' ? 'tgz' : 'zip'}`);
    spec.id = id;

    onProgress?.({ phase: 'download', received: 0, total: 0, percent: 0, bytesPerSecond: 0, etaSeconds: null });
    await this.downloadToFile(spec, archive, onProgress);
    onProgress?.({ phase: 'extract', received: 0, total: 0, percent: 100, bytesPerSecond: 0, etaSeconds: 0 });

    const extractDir = path.join(tmp, 'unpacked');
    await this.extract(archive, extractDir, spec.archive);
    const executable = this.findFile(extractDir, (full, name) => {
      if (spec.executable.includes('/')) return full.replace(/\\/g, '/').endsWith(spec.executable);
      return name === spec.executable;
    });
    if (!executable) throw new Error(`安装包中未找到 ${spec.executable}`);

    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });
    const payload = path.join(dir, 'payload');
    const sourceRoot = spec.strip ? path.join(extractDir, spec.strip) : extractDir;
    await fsp.cp(sourceRoot, payload, { recursive: true });
    if (id === 'yaml') {
      const l10n = path.join(sourceRoot, 'dist', 'l10n');
      if (fs.existsSync(l10n)) await fsp.cp(l10n, path.join(dir, 'l10n'), { recursive: true });
    }
    const relative = path.relative(sourceRoot, executable);
    const installedExecutable = path.join(payload, relative);
    const manifest = {
      id,
      version: spec.version,
      runtime: spec.runtime,
      executable: installedExecutable,
      args: spec.args || [],
      installedAt: Date.now(),
    };
    await fsp.writeFile(this.manifestPath(id), JSON.stringify(manifest, null, 2), 'utf8');
    await fsp.rm(tmp, { recursive: true, force: true });
    onProgress?.({ phase: 'done', received: 0, total: 0, percent: 100, bytesPerSecond: 0, etaSeconds: 0 });
    return manifest;
  }

  async uninstall(id) {
    await fsp.rm(this.serverDir(id), { recursive: true, force: true });
    return { id, installed: false };
  }

  getCommand(language) {
    for (const [id, spec] of Object.entries(SERVERS)) {
      if (!spec.languages?.includes(language)) continue;
      const manifest = this.readManifest(id);
      if (!manifest?.executable || !fs.existsSync(manifest.executable)) continue;
      if (manifest.runtime === 'node') {
        return {
          command: process.execPath,
          args: [manifest.executable, ...(manifest.args || [])],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          source: `installed:${id}`,
        };
      }
      return {
        command: manifest.executable,
        args: manifest.args || [],
        env: { ...process.env },
        source: `installed:${id}`,
      };
    }
    return null;
  }
}

module.exports = { LspInstaller, SERVERS };

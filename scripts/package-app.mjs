import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rcedit } from 'rcedit';

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const RELEASE_ROOT = path.join(ROOT, 'release');
const OUT_DIR = path.join(RELEASE_ROOT, 'OrbitIDE-1.0.0-win-x64');
const APP_DIR = path.join(OUT_DIR, 'resources', 'app');
const LAUNCHER_NAME = 'OrbitIDE.exe';
const RUNTIME_NAME = 'OrbitRuntime.exe';

async function copyDir(from, to) {
  await fsp.cp(from, to, { recursive: true, force: true });
}

async function main() {
  if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
    throw new Error('未找到 Electron 运行时，请先执行 npm install');
  }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('未找到 dist，请先执行 npm run build:web');
  }

  await fsp.rm(OUT_DIR, { recursive: true, force: true });
  await fsp.mkdir(OUT_DIR, { recursive: true });
  console.log('[package] 复制 Electron 运行时…');
  await copyDir(ELECTRON_DIST, OUT_DIR);
  await fsp.rm(path.join(OUT_DIR, 'resources', 'app'), { recursive: true, force: true });
  await fsp.rm(path.join(OUT_DIR, 'resources', 'default_app.asar'), { force: true });
  await fsp.rm(path.join(OUT_DIR, 'ver.txt'), { force: true });

  console.log('[package] 写入应用文件…');
  await fsp.mkdir(APP_DIR, { recursive: true });
  await copyDir(path.join(ROOT, 'src', 'main'), path.join(APP_DIR, 'src', 'main'));
  await copyDir(path.join(ROOT, 'src', 'preload'), path.join(APP_DIR, 'src', 'preload'));
  await copyDir(path.join(ROOT, 'dist'), path.join(APP_DIR, 'dist'));
  await copyDir(path.join(ROOT, 'docs'), path.join(APP_DIR, 'docs'));
  await fsp.copyFile(path.join(ROOT, 'README.md'), path.join(APP_DIR, 'README.md'));
  await fsp.copyFile(path.join(ROOT, 'AI-CONNECT.md'), path.join(APP_DIR, 'AI-CONNECT.md'));
  await fsp.copyFile(path.join(ROOT, 'AI-CONNECT.md'), path.join(OUT_DIR, 'AI-CONNECT.md'));
  await fsp.mkdir(path.join(APP_DIR, 'build'), { recursive: true });
  await fsp.copyFile(path.join(ROOT, 'build', 'icon.png'), path.join(APP_DIR, 'build', 'icon.png'));

  const appPackage = {
    name: 'orbit-ide',
    productName: 'Orbit IDE',
    version: '1.0.0',
    description: 'Orbit IDE — 双模式 AI 原生集成开发环境',
    main: 'src/main/main.cjs',
    author: 'Orbit Labs',
    license: 'MIT',
    private: true,
  };
  await fsp.writeFile(path.join(APP_DIR, 'package.json'), JSON.stringify(appPackage, null, 2), 'utf8');

  const runtimePath = path.join(OUT_DIR, RUNTIME_NAME);
  await fsp.rename(path.join(OUT_DIR, 'electron.exe'), runtimePath);

  console.log('[package] 写入图标与版本信息…');
  await rcedit(runtimePath, {
    icon: path.join(ROOT, 'build', 'icon.ico'),
    'file-version': '1.0.0.0',
    'product-version': '1.0.0',
    'version-string': {
      ProductName: 'Orbit IDE Runtime',
      FileDescription: 'Orbit IDE 运行时',
      CompanyName: 'Orbit Labs',
      LegalCopyright: 'Copyright © 2026 Orbit Labs',
      OriginalFilename: RUNTIME_NAME,
    },
    'requested-execution-level': 'asInvoker',
  });

  console.log('[package] 编译原生启动器…');
  const launcherPath = path.join(OUT_DIR, LAUNCHER_NAME);
  const resourceObject = path.join(OUT_DIR, 'launcher-res.o');
  execFileSync(
    'windres',
    ['-i', path.join(ROOT, 'scripts', 'launcher.rc'), '-o', resourceObject, '--include-dir', ROOT],
    { stdio: 'inherit', cwd: ROOT }
  );
  execFileSync(
    'g++',
    [
      '-municode',
      '-mwindows',
      '-static',
      '-static-libgcc',
      '-static-libstdc++',
      '-O2',
      path.join(ROOT, 'scripts', 'launcher.cpp'),
      resourceObject,
      '-o',
      launcherPath,
      '-luser32',
    ],
    { stdio: 'inherit' }
  );
  await fsp.rm(resourceObject, { force: true });

  const readme = `Orbit IDE 1.0.0
================

启动：双击“Orbit IDE.exe”
开发启动：项目根目录运行 start-dev.bat

说明：
- 首次启动会在“文档/OrbitIDE/Playground”创建一个示例工作区。
- OI 模式仅支持 C/C++，开发模式支持 C/C++、Python、JavaScript、TypeScript、Java、Go、Rust 等。
- 编译器会自动扫描；可在左侧“编译器”面板查看每个编译器实际支持的全部 C/C++ 标准。
- AI 接入：打开右上角“AI 接入”，把本地地址和登录示例交给 AI 客户端，在 IDE 内批准后即可操作。
- 配置保存在 %APPDATA%\\Orbit IDE\\settings.json。

快捷键：
  Ctrl+S            保存
  F5                编译并运行
  Ctrl+Shift+B      仅编译
  Ctrl+Shift+P      命令面板
  Ctrl+P            快速打开
  Ctrl+\`            底部面板
  Ctrl+W            关闭标签
`;
  await fsp.writeFile(path.join(OUT_DIR, '使用说明.txt'), `\uFEFF${readme}`, 'utf8');
  await fsp.writeFile(
    path.join(OUT_DIR, '启动 Orbit IDE.bat'),
    '@echo off\r\nchcp 65001 >nul\r\nset ELECTRON_RUN_AS_NODE=\r\ncd /d "%~dp0"\r\nstart "" "Orbit IDE.exe"\r\n',
    'utf8'
  );
  const shortcut = `@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desktop 'Orbit IDE.lnk')); $s.TargetPath = (Join-Path '%~dp0' 'Orbit IDE.exe'); $s.WorkingDirectory = '%~dp0'; $s.IconLocation = (Join-Path '%~dp0' 'Orbit IDE.exe') + ',0'; $s.Description = 'Orbit IDE'; $s.Save()"
echo 已创建桌面快捷方式。
pause
`;
  await fsp.writeFile(path.join(OUT_DIR, '创建桌面快捷方式.bat'), shortcut.replace(/\n/g, '\r\n'), 'utf8');

  const stats = await fsp.stat(launcherPath);
  console.log(`[package] 完成：${OUT_DIR}`);
  console.log(`[package] 启动程序：${LAUNCHER_NAME} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`[package] 运行时：${RUNTIME_NAME}`);
}

main().catch((error) => {
  console.error('[package] 失败:', error);
  process.exit(1);
});

import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.ORBIT_CAPTURE_URL || 'http://127.0.0.1:5280/?mock=1';
const PORT = 9345;
const ROOT = path.resolve(import.meta.dirname, '..');
const userData = path.join(os.tmpdir(), `orbit-ui-test-${Date.now()}`);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
  '--no-first-run', '--no-default-browser-check', URL,
], { stdio: 'ignore', windowsHide: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 60; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    if (page) break;
  } catch {}
  await sleep(300);
}
if (!page) throw new Error('Chrome 页面未启动');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
});
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await fsp.writeFile(path.join(ROOT, name), Buffer.from(result.data, 'base64'));
}

async function key(type, keyValue, code, vk, modifiers = 0, text) {
  await send('Input.dispatchKeyEvent', {
    type,
    key: keyValue,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers,
    ...(text ? { text, unmodifiedText: text } : {}),
  });
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 50; i += 1) {
    const ready = await evaluate("Boolean(document.querySelector('#boot')?.classList.contains('hidden') && document.querySelector('.tab'))").catch(() => false);
    if (ready) break;
    await sleep(400);
  }
  await sleep(700);

  // 聚焦编辑器并移动到文件末尾，输入 vec 触发补全。
  await evaluate("document.querySelector('.monaco-editor textarea.inputarea')?.focus()");
  await key('rawKeyDown', 'End', 'End', 35, 2);
  await key('keyUp', 'End', 'End', 35, 2);
  await sleep(150);
  await key('rawKeyDown', 'Enter', 'Enter', 13, 0, '\r');
  await key('keyUp', 'Enter', 'Enter', 13, 0);
  for (const char of 'vec') {
    await key('char', char, `Key${char.toUpperCase()}`, char.toUpperCase().charCodeAt(0), 0, char);
  }
  await sleep(1000);
  const suggest = await evaluate(`(() => {
    const widget = document.querySelector('.suggest-widget');
    const rows = [...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0, 8).map((node) => node.innerText.trim());
    return { visible: Boolean(widget && widget.className.includes('visible')), rows };
  })()`);
  console.log('autocomplete:', JSON.stringify(suggest));
  await screenshot('ui-autocomplete.png');
  if (!suggest.visible || !suggest.rows.length) throw new Error('C++ 自动补全未出现');

  // OI 模式应阻止打开 Python 文件。
  await evaluate("document.querySelector('.tree-row[data-path=\"examples/hello.py\"]')?.click()");
  await sleep(900);
  const oiBlocked = await evaluate(`({
    tabs: document.querySelectorAll('.tab').length,
    names: [...document.querySelectorAll('.tab-name')].map((n) => n.textContent),
    toast: document.querySelector('.toast')?.innerText || ''
  })`);
  console.log('OI restriction:', JSON.stringify(oiBlocked));
  await screenshot('ui-oi-locked.png');
  if (oiBlocked.names.includes('hello.py')) throw new Error('OI 模式错误地打开了 Python 文件');

  // 开发模式允许打开 Python 文件。
  await evaluate("document.querySelector('.mode-btn[data-mode=\"dev\"]')?.click()");
  await sleep(1800);
  await evaluate("document.querySelector('.tree-row[data-path=\"examples/hello.py\"]')?.click()");
  await sleep(1000);
  const devOpened = await evaluate(`({
    tabs: [...document.querySelectorAll('.tab-name')].map((n) => n.textContent),
    active: document.querySelector('.tab.active .tab-name')?.textContent,
    language: document.querySelector('#statusLang')?.textContent
  })`);
  console.log('Dev open:', JSON.stringify(devOpened));
  await screenshot('ui-dev-python.png');
  if (!devOpened.tabs.includes('hello.py')) throw new Error('开发模式未能打开 Python 文件');

  // 验证 AI 通过主进程桥操作编辑器。
  const bridgeResult = await evaluate(`(async () => {
    const before = await window.__rendererHandler('editor.get', {});
    const inserted = await window.__rendererHandler('editor.insert', {
      text: '# AI edited\\n',
      position: { line: 1, column: 1 }
    });
    const saved = await window.__rendererHandler('editor.save', {});
    const modeApply = await window.__rendererHandler('mode.apply', { mode: 'oi', source: 'ai' });
    return {
      beforePath: before?.path,
      insertedDirty: inserted?.dirty,
      savedDirty: saved?.dirty,
      content: saved?.content,
      closedTabs: modeApply?.closedTabs,
      remainingTabs: [...document.querySelectorAll('.tab-name')].map((n) => n.textContent)
    };
  })()`);
  console.log('Editor bridge:', JSON.stringify({ ...bridgeResult, content: bridgeResult.content?.slice(0, 40) }));
  if (bridgeResult.beforePath !== 'examples/hello.py') throw new Error('editor.get 路径不正确');
  if (!bridgeResult.insertedDirty) throw new Error('editor.insert 未标记 dirty');
  if (!bridgeResult.content?.startsWith('# AI edited')) throw new Error('editor 桥写入内容失败');
  if (!bridgeResult.closedTabs?.includes('examples/hello.py')) throw new Error('AI 切换 OI 模式未关闭非 C++ 标签');

  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) throw new Error('页面存在运行时异常');
  console.log('PASS');
} finally {
  try { await send('Browser.close'); } catch {}
  ws.close();
  chrome.kill();
  await sleep(500);
  await fsp.rm(userData, { recursive: true, force: true }).catch(() => {});
}

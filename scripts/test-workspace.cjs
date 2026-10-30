'use strict';

const Module = require('node:module');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') {
    return {
      shell: {
        async trashItem(target) {
          await fsp.rm(target, { recursive: true, force: true });
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { WorkspaceService } = require('../src/main/workspace.cjs');

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'orbit-ws-test-'));
  const data = { mode: 'oi', workspace: root, recentWorkspaces: [] };
  const settings = {
    data,
    get(key, fallback) { return this.data[key] === undefined ? fallback : this.data[key]; },
    set(key, value) { this.data[key] = value; },
    patch(patch) { Object.assign(this.data, patch); },
    save() {},
  };
  const workspace = new WorkspaceService(settings);
  await workspace.open(root);
  await workspace.create('src', 'dir');
  console.log('mkdir in OI:', fs.existsSync(path.join(root, 'src')));
  await workspace.create('src/main.cpp', 'file', 'int main(){}\n');
  console.log('cpp create:', fs.existsSync(path.join(root, 'src', 'main.cpp')));

  let blocked = false;
  try {
    await workspace.create('evil.py', 'file', 'print(1)');
  } catch (error) {
    blocked = error.code === 'MODE_RESTRICTED';
  }
  console.log('python blocked in OI:', blocked);
  if (!blocked) throw new Error('OI 模式未阻止 Python 文件');

  let traversal = false;
  try {
    await workspace.read('../../outside.txt');
  } catch (error) {
    traversal = ['OUTSIDE_WORKSPACE', 'NOT_FOUND'].includes(error.code);
  }
  console.log('path traversal blocked:', traversal);
  if (!traversal) throw new Error('路径穿越未被阻止');

  await workspace.rename('src', 'source');
  console.log('rename folder:', fs.existsSync(path.join(root, 'source')));
  await workspace.remove('source');
  console.log('remove folder:', !fs.existsSync(path.join(root, 'source')));

  data.mode = 'dev';
  await workspace.create('main.py', 'file', 'print(1)\n');
  console.log('python allowed in dev:', fs.existsSync(path.join(root, 'main.py')));
  await fsp.rm(root, { recursive: true, force: true });
  console.log('PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

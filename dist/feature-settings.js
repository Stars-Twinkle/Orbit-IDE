// 功能设置树：集中管理 AI 可视化、补全与工具链选项。
(function () {
  let api = window.orbit;
  let settings = {};
  let current = 'aiActivityEnabled';
  let built = false;

  const items = [
    { group: 'AI 可视化', key: 'aiActivityEnabled', type: 'bool', title: 'AI 操作面板', desc: '在窗口右下角显示 AI 操作流与代码 diff。' },
    { key: 'aiActivityAutoOpen', type: 'bool', title: '自动展开操作面板', desc: 'AI 第一次操作时自动展开右下角操作面板。' },
    { key: 'aiAutoSwitch', type: 'bool', title: '自动切换文件', desc: 'AI 修改文件后自动切换到对应标签页。' },
    { key: 'aiDiffFlash', type: 'bool', title: '编辑器内 diff 闪烁', desc: '在代码行上闪烁新增绿、删除红、替换白。' },
    { key: 'aiDiffFlashDuration', type: 'number', title: '闪烁时长', desc: '单次高亮淡出时长，300–3000 ms。', min: 300, max: 3000, step: 100, suffix: 'ms' },
    { group: '编辑器', key: 'autoComplete', type: 'bool', title: '自动补全', desc: '输入时自动弹出关键字、变量和头文件候选。' },
    { group: '工具链', key: 'o2Optimization', type: 'bool', title: 'O2 优化', desc: '编译时添加 -O2（MSVC 使用 /O2）。' },
    { key: 'compilerScanDirs', type: 'dirs', title: '额外扫描目录', desc: '除 PATH 和常见位置外，递归查找这些目录中的编译器。' },
  ];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enabled = (key) => settings[key] !== false;
  const stateText = (item) => {
    if (item.type === 'bool') return enabled(item.key) ? '开' : '关';
    if (item.type === 'number') return `${Number(settings[item.key]) || 900}ms`;
    return `${(settings.compilerScanDirs || []).length} 个`;
  };

  function open() {
    document.querySelector('#fsOverlay')?.classList.add('open');
    renderTree();
    renderContent();
  }
  function close() {
    document.querySelector('#fsOverlay')?.classList.remove('open');
  }

  function renderTree() {
    const tree = document.querySelector('#fsTree');
    if (!tree) return;
    let lastGroup = '';
    tree.innerHTML = items
      .map((item) => {
        let group = '';
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          group = `<div class="fs-group">${esc(item.group)}</div>`;
        }
        return `${group}<button class="fs-item${item.key === current ? ' active' : ''}" data-fs-key="${item.key}">
          <span>${esc(item.title)}</span><span class="fs-state">${esc(stateText(item))}</span>
        </button>`;
      })
      .join('');
    for (const button of tree.querySelectorAll('[data-fs-key]')) {
      button.addEventListener('click', () => {
        current = button.dataset.fsKey;
        renderTree();
        renderContent();
      });
    }
  }

  function currentItem() {
    return items.find((item) => item.key === current) || items[0];
  }

  function renderContent() {
    const content = document.querySelector('#fsContent');
    if (!content) return;
    const item = currentItem();
    let control = '';
    if (item.type === 'bool') {
      control = `<div class="fs-control">
        <div class="fs-control-label"><b>${esc(item.title)}</b><span>${esc(item.desc)}</span></div>
        <button class="fs-switch${enabled(item.key) ? ' on' : ''}" data-fs-toggle="${item.key}" aria-label="${esc(item.title)}"></button>
      </div>`;
    } else if (item.type === 'number') {
      control = `<div class="fs-control">
        <div class="fs-control-label"><b>${esc(item.title)}</b><span>${esc(item.desc)}</span></div>
        <input class="fs-number" type="number" id="fsNumber" min="${item.min}" max="${item.max}" step="${item.step}" value="${Number(settings[item.key]) || 900}" /> <span class="fs-state">${esc(item.suffix)}</span>
      </div>`;
    } else {
      const dirs = settings.compilerScanDirs || [];
      control = `<div class="fs-control">
        <div class="fs-control-label"><b>${esc(item.title)}</b><span>${esc(item.desc)}</span></div>
        <button class="fs-btn" id="fsChooseDirs">选择目录</button>
      </div>
      <div class="fs-dir-list">${dirs.length ? dirs.map((dir) => `<div class="fs-dir">${esc(dir)}</div>`).join('') : '<div class="fs-dir-empty">还没有额外扫描目录</div>'}</div>`;
    }
    content.innerHTML = `<h2>${esc(item.title)}</h2><p class="fs-desc">${esc(item.desc)}</p>${control}`;

    const toggle = content.querySelector('[data-fs-toggle]');
    toggle?.addEventListener('click', () => {
      const key = toggle.dataset.fsToggle;
      patch(key, !enabled(key));
    });
    const number = content.querySelector('#fsNumber');
    number?.addEventListener('change', () => {
      patch(item.key, Math.max(item.min, Math.min(item.max, Number(number.value) || 900)));
    });
    content.querySelector('#fsChooseDirs')?.addEventListener('click', chooseDirs);
  }

  async function patch(key, value) {
    try {
      const next = await api.invoke('settings:patch', { [key]: value });
      settings = { ...settings, ...(next || {}) };
      renderTree();
      renderContent();
    } catch (error) {
      console.warn('保存功能设置失败', error);
    }
  }

  async function chooseDirs() {
    try {
      const dirs = await api.invoke('compilers:chooseScanDirs');
      if (Array.isArray(dirs)) {
        settings.compilerScanDirs = dirs;
        await api.invoke('compilers:scan', { force: false }).catch(() => {});
        renderTree();
        renderContent();
      }
    } catch (error) {
      console.warn('选择扫描目录失败', error);
    }
  }

  function build() {
    if (built || !document.querySelector('.titlebar-right')) return;
    built = true;
    const right = document.querySelector('.titlebar-right');
    const button = document.createElement('button');
    button.id = 'featureSettingsToggle';
    button.className = 'feature-settings-btn';
    button.title = '功能设置';
    button.innerHTML = '&#9881;';
    button.addEventListener('click', () => {
      if (document.querySelector('#fsOverlay')?.classList.contains('open')) close();
      else open();
    });
    right.insertBefore(button, right.firstChild);

    const overlay = document.createElement('div');
    overlay.id = 'fsOverlay';
    overlay.className = 'fs-overlay';
    overlay.innerHTML = `<div class="fs-modal">
      <div class="fs-head">
        <span class="fs-head-icon">&#9881;</span>
        <b>功能设置</b>
        <small>AI 可视化 / 编辑器 / 工具链</small>
        <button class="fs-close" id="fsClose" title="关闭">×</button>
      </div>
      <div class="fs-body">
        <aside class="fs-tree" id="fsTree"></aside>
        <section class="fs-content" id="fsContent"></section>
      </div>
      <div class="fs-foot"><button id="fsDone">完成</button></div>
    </div>`;
    document.body.append(overlay);
    overlay.querySelector('#fsClose').addEventListener('click', close);
    overlay.querySelector('#fsDone').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    renderTree();
    renderContent();
  }

  async function loadSettings() {
    try {
      settings = (await api.invoke('settings:get')) || {};
    } catch {
      settings = {};
    }
    if (built) {
      renderTree();
      renderContent();
    }
  }

  const timer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    build();
    loadSettings();
    api.on('settings:changed', (next) => {
      settings = { ...settings, ...(next || {}) };
      if (built) {
        renderTree();
        renderContent();
      }
    });
    clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 20000);

  window.__orbitFeatureSettings = { open, close };
})();

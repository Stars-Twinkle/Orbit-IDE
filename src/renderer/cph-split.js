// CPH-NG 风格测试工作区。独立于旧版手风琴面板，直接通过 preload API 操作测试点。
(function () {
  let api = window.orbit;

  const state = {
    cases: [],
    selectedId: null,
    results: new Map(),
    running: false,
    saveTimer: 0,
    ready: false,
    timeoutMs: 5000,
  };

  try {
    const savedTimeout = Number(localStorage.getItem('orbit.testTimeoutMs'));
    if (Number.isFinite(savedTimeout) && savedTimeout >= 100) {
      state.timeoutMs = Math.min(60000, Math.max(100, Math.round(savedTimeout)));
    }
  } catch {
    // localStorage 不可用时使用默认值。
  }

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function verdict(result) {
    if (!result) return { cls: '', label: '' };
    return {
      passed: { cls: 'ac', label: 'AC' },
      'wrong-answer': { cls: 'wa', label: 'WA' },
      timeout: { cls: 'tle', label: 'TLE' },
      'runtime-error': { cls: 're', label: 'RE' },
      'no-expected': { cls: 'ok', label: 'OK' },
      running: { cls: '', label: 'RUN' },
    }[result.status] || { cls: '', label: String(result.status || '').toUpperCase() };
  }

  function selectedCase() {
    return state.cases.find((item) => item.id === state.selectedId) || null;
  }

  function root() {
    return document.querySelector('#cphSplit');
  }

  function setSaveState(text) {
    const node = document.querySelector('#cphSaveState');
    if (node) node.textContent = text;
  }

  function renderList() {
    const list = document.querySelector('#cphList');
    if (!list) return;
    const count = document.querySelector('#cphCount');
    if (count) count.textContent = `${state.cases.length} tests`;
    list.innerHTML = '';

    if (!state.cases.length) {
      const empty = document.createElement('div');
      empty.className = 'cph-empty-list';
      empty.innerHTML = '<b>还没有测试点</b>点击下方按钮添加';
      list.append(empty);
      return;
    }

    state.cases.forEach((item, index) => {
      const result = state.results.get(item.id);
      const status = verdict(result);
      const row = document.createElement('div');
      row.className = `cph-case-row${status.cls ? ` ${status.cls}` : ''}${item.id === state.selectedId ? ' selected' : ''}`;
      row.dataset.id = item.id;
      row.innerHTML = `
        <span class="cph-row-idx">#${index + 1}</span>
        ${status.label ? `<span class="cph-chip">${status.label}</span>` : ''}
        <span class="cph-row-name">${esc(item.name)}</span>
        <span class="cph-row-time" title="运行时间">${result && Number.isFinite(result.timeMs) ? `${Math.round(result.timeMs)} ms` : '—'}</span>
        <span class="cph-row-actions">
          <button class="cph-mini run" title="运行此测试点" ${state.running ? 'disabled' : ''}>&#9654;</button>
          <button class="cph-mini del" title="删除此测试点">&times;</button>
        </span>
      `;
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        selectCase(item.id);
      });
      row.querySelector('.run').addEventListener('click', (event) => {
        event.stopPropagation();
        runCases([item]);
      });
      row.querySelector('.del').addEventListener('click', (event) => {
        event.stopPropagation();
        deleteCase(item.id);
      });
      list.append(row);
    });
  }

  function renderDetail() {
    const item = selectedCase();
    const input = document.querySelector('#cphInput');
    const answer = document.querySelector('#cphAnswer');
    const stdout = document.querySelector('#cphStdout');
    const stderr = document.querySelector('#cphStderr');
    const chip = document.querySelector('#cphVerdict');
    const time = document.querySelector('#cphTime');
    if (!input || !answer || !stdout || !stderr) return;

    if (!item) {
      input.value = '';
      answer.value = '';
      input.disabled = true;
      answer.disabled = true;
      stdout.textContent = '';
      stderr.textContent = '';
      if (chip) {
        chip.className = 'cph-verdict';
        chip.textContent = '';
      }
      if (time) time.textContent = '';
      return;
    }

    input.disabled = false;
    answer.disabled = false;
    input.value = item.input || '';
    answer.value = item.expected || '';

    const result = state.results.get(item.id);
    const status = verdict(result);
    if (chip) {
      chip.className = `cph-verdict${status.cls ? ` ${status.cls}` : ''}`;
      chip.textContent = status.label;
      chip.title = status.label || '';
    }
    stdout.className = `cph-stdout${result ? (result.status === 'passed' || result.status === 'no-expected' ? ' pass' : ' fail') : ''}`;
    stdout.textContent = result ? (result.actual || result.stdout || '(空)') : '';
    stderr.textContent = result ? (result.stderr || (result.timedOut ? '运行超时' : '')) : '';
    stdout.placeholder = '尚未运行 · 点击 Run All 或单点运行';
    if (time) {
      time.textContent = result && Number.isFinite(result.timeMs) ? `${Math.round(result.timeMs)} ms` : '';
      time.title = result ? '运行时间' : '';
    }
  }

  function selectCase(id) {
    state.selectedId = id;
    renderList();
    renderDetail();
    document.querySelector('#cphInput')?.focus();
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    setSaveState('保存中…');
    state.saveTimer = setTimeout(async () => {
      try {
        await api.invoke('tests:write', { cases: state.cases });
        setSaveState('已保存');
      } catch (error) {
        setSaveState('保存失败');
        console.warn('保存测试点失败', error);
      }
    }, 400);
  }

  function bindInputs() {
    const input = document.querySelector('#cphInput');
    const answer = document.querySelector('#cphAnswer');
    const update = (field) => {
      const item = selectedCase();
      if (!item) return;
      item[field] = field === 'input' ? input.value : answer.value;
      state.results.delete(item.id);
      renderList();
      scheduleSave();
    };
    input.addEventListener('input', () => update('input'));
    answer.addEventListener('input', () => update('expected'));
    for (const el of [input, answer]) {
      el.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          runCases(state.cases);
        }
      });
    }
  }

  async function loadTests() {
    try {
      const data = await api.invoke('tests:read');
      state.cases = Array.isArray(data?.cases) ? data.cases : [];
      if (!state.cases.some((item) => item.id === state.selectedId)) {
        state.selectedId = state.cases[0]?.id || null;
      }
      renderList();
      renderDetail();
      state.ready = true;
    } catch (error) {
      console.warn('读取测试点失败', error);
    }
  }

  async function addCase() {
    const item = {
      id: `case-${Date.now().toString(36)}`,
      name: `测试点 ${state.cases.length + 1}`,
      input: '',
      expected: '',
      enabled: true,
    };
    state.cases.push(item);
    state.selectedId = item.id;
    renderList();
    renderDetail();
    scheduleSave();
    document.querySelector('#cphInput')?.focus();
  }

  async function deleteCase(id) {
    const item = state.cases.find((entry) => entry.id === id);
    if (!item) return;
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    state.cases = state.cases.filter((entry) => entry.id !== id);
    state.results.delete(id);
    if (state.selectedId === id) state.selectedId = state.cases[0]?.id || null;
    renderList();
    renderDetail();
    scheduleSave();
  }

  async function clearCases() {
    if (!state.cases.length) return;
    if (!window.confirm(`确定删除全部 ${state.cases.length} 个测试点吗？`)) return;
    state.cases = [];
    state.results.clear();
    state.selectedId = null;
    renderList();
    renderDetail();
    scheduleSave();
  }

  async function runCases(cases) {
    if (state.running) return;
    const list = (cases || []).filter((item) => item.enabled !== false);
    if (!list.length) {
      const stdout = document.querySelector('#cphStdout');
      if (stdout) stdout.textContent = '请先添加至少一个测试点。';
      return;
    }

    state.running = true;
    const runAll = document.querySelector('#cphRunAll');
    if (runAll) {
      runAll.disabled = true;
      runAll.textContent = 'Running…';
    }
    renderList();
    const stdout = document.querySelector('#cphStdout');
    if (stdout) {
      stdout.className = 'cph-stdout';
      stdout.textContent = '编译并运行中…';
    }

    try {
      // 先触发主界面的保存按钮，确保评测的是磁盘上的最新代码。
      document.querySelector('#btn-editor-save')?.click();
      await sleep(260);
      const result = await api.invoke('tests:run', { cases: list, timeoutMs: state.timeoutMs });
      if (result?.build?.success === false) {
        if (stdout) {
          stdout.textContent = '编译失败，请查看“问题”面板。';
          stdout.className = 'cph-stdout fail';
        }
      }
      if (Array.isArray(result?.results)) {
        for (const item of result.results) state.results.set(item.id, item);
      }
      renderList();
      renderDetail();
      if (result?.results?.length && !document.querySelector('#cphStderr')?.textContent) {
        const stderr = document.querySelector('#cphStderr');
        if (stderr && result.results.some((item) => item.stderr)) {
          stderr.textContent = result.results.map((item) => item.stderr).filter(Boolean).join('\n');
        }
      }
    } catch (error) {
      if (stdout) {
        stdout.textContent = error?.message || '评测失败';
        stdout.className = 'cph-stdout fail';
      }
    } finally {
      state.running = false;
      if (runAll) {
        runAll.disabled = false;
        runAll.textContent = 'Run All';
      }
      renderList();
    }
  }

  function buildDom(panel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cph-split';
    wrapper.id = 'cphSplit';
    wrapper.innerHTML = `
      <section class="cph-pane cph-list-pane">
        <div class="cph-pane-head">
          <div>
            <span class="cph-pane-title">TEST CASES</span>
            <span class="cph-pane-sub" id="cphCount">0 tests</span>
          </div>
          <div class="cph-head-actions">
            <button class="cph-btn" id="cphClear">清空</button>
            <button class="cph-btn primary" id="cphRunAll">Run All</button>
          </div>
        </div>
        <div class="cph-case-list" id="cphList"></div>
        <div class="cph-list-foot">
          <div class="cph-timeout-row">
            <span>测试超时</span>
            <input id="cphTimeout" type="number" min="100" max="60000" step="500" value="5000" title="单个测试点超时时间（毫秒）" />
            <span>ms</span>
          </div>
          <button class="cph-add" id="cphAdd">＋ 添加测试点</button>
        </div>
      </section>

      <section class="cph-pane cph-detail-pane">
        <div class="cph-pane-head">
          <span class="cph-pane-title">输入</span>
          <span class="cph-pane-sub">stdin</span>
          <span class="cph-pane-sub" id="cphSaveState"></span>
        </div>
        <div class="cph-editor-wrap">
          <textarea id="cphInput" class="cph-fill-textarea" spellcheck="false" placeholder="程序的标准输入"></textarea>
        </div>
      </section>

      <section class="cph-pane cph-side">
        <div class="cph-output-pane">
          <div class="cph-out-head">
            <span class="cph-out-label">答案输出<small>answer</small></span>
          </div>
          <textarea id="cphAnswer" class="cph-fill-textarea" spellcheck="false" placeholder="留空则只检查程序是否正常运行"></textarea>
        </div>
        <div class="cph-output-pane">
          <div class="cph-out-head">
            <span class="cph-out-label">程序输出<small>stdout</small></span>
            <span class="cph-verdict" id="cphVerdict"></span>
            <span class="cph-time" id="cphTime"></span>
          </div>
          <pre class="cph-stdout" id="cphStdout"></pre>
          <pre class="cph-stderr" id="cphStderr"></pre>
        </div>
      </section>
    `;
    panel.append(wrapper);

    wrapper.querySelector('#cphAdd').addEventListener('click', addCase);
    wrapper.querySelector('#cphClear').addEventListener('click', clearCases);
    wrapper.querySelector('#cphRunAll').addEventListener('click', () => runCases(state.cases));
    bindTimeout();
    bindInputs();
  }

  function bindTimeout() {
    const input = document.querySelector('#cphTimeout');
    if (!input) return;
    input.value = String(state.timeoutMs);
    const apply = () => {
      const value = Math.min(60000, Math.max(100, Math.round(Number(input.value) || 5000)));
      state.timeoutMs = value;
      input.value = String(value);
      try {
        localStorage.setItem('orbit.testTimeoutMs', String(value));
      } catch {
        // 忽略持久化失败。
      }
    };
    input.addEventListener('change', apply);
    input.addEventListener('blur', apply);
  }

  function mount() {
    const panel = document.querySelector('[data-panel-view="tests"]');
    if (!panel || panel.querySelector('#cphSplit')) return false;
    buildDom(panel);
    loadTests();
    return true;
  }

  // 主界面可能在启动后异步渲染面板，轮询到 preload API 与面板都出现再挂载。
  const timer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    if (mount()) clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 20000);

  const bindApi = () => {
    if (!api?.on) return;
    api.on('tests:changed', (data) => {
      if (document.activeElement?.closest?.('#cphSplit')) return;
      state.cases = Array.isArray(data?.cases) ? data.cases : [];
      if (!state.cases.some((item) => item.id === state.selectedId)) {
        state.selectedId = state.cases[0]?.id || null;
      }
      renderList();
      renderDetail();
    });
  };
  const apiTimer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    bindApi();
    clearInterval(apiTimer);
  }, 200);
  setTimeout(() => clearInterval(apiTimer), 20000);
})();

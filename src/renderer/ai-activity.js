// AI 操作可视化：在窗口内实时显示 AI 做了什么、改了哪个文件哪几行。
(function () {
  let api = window.orbit;
  const state = {
    items: [],
    open: false,
    unread: 0,
    autoOpened: false,
    bound: false,
  };

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));

  function timeText(ts) {
    const date = new Date(ts || Date.now());
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }

  function operationLabel(event) {
    const activity = event.activity || {};
    const kind = activity.kind || '';
    if (kind === 'file-write') return '修改文件';
    if (kind === 'file-create') return '创建文件';
    if (kind === 'folder-create') return '创建目录';
    if (kind === 'editor-content') return '重写编辑器';
    if (kind === 'editor-insert') return '插入代码';
    if (kind === 'editor-replace') return '替换代码';
    const path = event.path || '';
    const method = String(event.method || '').toUpperCase();
    if (path === '/v1/file' && method === 'PUT') return '修改文件';
    if (path === '/v1/file/create') return '创建文件';
    if (path === '/v1/file' && method === 'DELETE') return '删除文件';
    if (path === '/v1/folders') return '创建目录';
    if (path === '/v1/rename') return '重命名';
    if (path === '/v1/editor' && method === 'POST') return '编辑代码';
    if (path.startsWith('/v1/editor')) return '编辑器操作';
    if (path === '/v1/build') return '编译';
    if (path === '/v1/run') return '运行';
    if (path === '/v1/tests/run') return '运行测试点';
    if (path === '/v1/terminal') return '终端命令';
    if (path === '/v1/mode') return '切换模式';
    if (path === '/v1/compilers' || path.startsWith('/v1/compilers/')) return '编译器操作';
    if (path === '/v1/settings') return '修改设置';
    if (path.startsWith('/v1/ui')) return '界面操作';
    if (path === '/v1/login') return '登录审批';
    return method === 'GET' ? '读取状态' : 'AI 操作';
  }

  function cardClass(event) {
    if (event.type === 'login') return 'auth';
    if (event.status && event.status >= 400) return 'err';
    const kind = event.activity?.kind || '';
    if (kind.startsWith('file-') || kind.startsWith('editor-')) return 'edit';
    if (event.path === '/v1/run' || event.path === '/v1/build' || event.path === '/v1/tests/run') return 'run';
    return 'ok';
  }

  function shorten(value, max = 120) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function makeItem(event) {
    const activity = event.activity || null;
    const isLogin = event.type === 'login';
    const pendingLogin = isLogin && event.approved === undefined;
    const title = isLogin
      ? `${event.clientName || 'AI 客户端'}${pendingLogin ? ' 请求接入' : event.approved ? ' 已接入' : ' 被拒绝'}`
      : operationLabel(event);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: event.at || Date.now(),
      title,
      kind: isLogin ? 'AUTH' : (activity?.kind ? activity.kind.toUpperCase() : 'API'),
      summary: isLogin
        ? (pendingLogin ? 'AI 正在请求登录，等待你在 IDE 中审批' : event.approved ? 'AI 客户端获得访问令牌' : 'AI 登录请求被拒绝')
        : (event.summary || `${event.method || 'GET'} ${event.path || ''}`),
      path: activity?.path || '',
      changed: Boolean(activity?.changed),
      removed: activity?.removed || [],
      added: activity?.added || [],
      startLine: activity?.startLine || 1,
      removedTotal: activity?.removedTotal ?? (activity?.removed || []).length,
      addedTotal: activity?.addedTotal ?? (activity?.added || []).length,
      truncated: Boolean(activity?.truncated),
      status: isLogin ? (pendingLogin ? 202 : event.approved ? 200 : 403) : event.status,
      durationMs: event.durationMs,
      className: cardClass(event),
      expanded: false,
    };
  }

  function diffLines(item) {
    const lines = [];
    for (let index = 0; index < item.removed.length; index += 1) {
      lines.push({ type: 'del', line: item.startLine + index, text: item.removed[index] });
    }
    for (let index = 0; index < item.added.length; index += 1) {
      lines.push({ type: 'add', line: item.startLine + index, text: item.added[index] });
    }
    return lines;
  }

  function render() {
    const list = document.querySelector('#aiActList');
    const count = document.querySelector('#aiActCount');
    const badge = document.querySelector('#aiActBadge');
    if (!list) return;

    if (count) count.textContent = `${state.items.length} 条`;
    if (badge) {
      badge.textContent = String(state.unread);
      badge.classList.toggle('show', state.unread > 0);
    }

    if (!state.items.length) {
      list.innerHTML = `<div class="ai-act-empty"><b>等待 AI 操作</b>AI 通过接口改动代码或运行时，这里会实时显示操作、文件和 diff。</div>`;
      return;
    }

    list.innerHTML = state.items
      .map((item) => {
        const lines = diffLines(item);
        const limit = item.expanded ? lines.length : Math.min(8, lines.length);
        const shown = lines.slice(0, limit);
        const hasMore = lines.length > limit;
        const diff = lines.length
          ? `<div class="ai-act-diff">${shown
              .map((line) => `<div class="ai-act-line ${line.type}"><span class="no">${line.type === 'add' ? '+' : '-'}${line.line}</span><span>${esc(line.text) || ' '}</span></div>`)
              .join('')}${hasMore ? `<button class="ai-act-more" data-expand="${item.id}">展开剩余 ${lines.length - limit} 行</button>` : ''}${item.expanded && lines.length > 8 ? `<button class="ai-act-more" data-collapse="${item.id}">收起 diff</button>` : ''}</div>`
          : '';
        const meta = item.changed
          ? `<div class="ai-act-meta"><span class="add">+${item.addedTotal}</span><span class="del">-${item.removedTotal}</span>${item.truncated ? '<span>已截断</span>' : ''}</div>`
          : '';
        return `<article class="ai-act-card ${esc(item.className)}">
          <div class="ai-act-card-head">
            <span class="ai-act-kind">${esc(item.kind)}</span>
            <span class="ai-act-title">${esc(item.title)}</span>
            <span class="ai-act-status ${item.status >= 400 ? 'err' : 'ok'}">${item.status >= 400 ? 'ERR' : 'OK'}</span>
            <span class="ai-act-time">${timeText(item.at)}</span>
          </div>
          <div class="ai-act-body">
            <div class="ai-act-summary">${esc(shorten(item.summary, 240))}</div>
            ${item.path ? `<span class="ai-act-path" title="${esc(item.path)}">${esc(item.path)}</span>` : ''}
            ${diff}
            ${meta}
          </div>
        </article>`;
      })
      .join('');

    for (const button of list.querySelectorAll('[data-expand]')) {
      button.addEventListener('click', () => {
        const item = state.items.find((entry) => entry.id === button.dataset.expand);
        if (item) {
          item.expanded = true;
          render();
        }
      });
    }
    for (const button of list.querySelectorAll('[data-collapse]')) {
      button.addEventListener('click', () => {
        const item = state.items.find((entry) => entry.id === button.dataset.collapse);
        if (item) {
          item.expanded = false;
          render();
        }
      });
    }
  }

  function setOpen(open) {
    state.open = open;
    document.querySelector('#aiActivityPanel')?.classList.toggle('open', open);
    document.querySelector('#aiActivityToggle')?.classList.toggle('open', open);
    if (open) {
      state.unread = 0;
      render();
    }
  }

  function add(event) {
    state.items.unshift(makeItem(event));
    state.items = state.items.slice(0, 120);
    const toggle = document.querySelector('#aiActivityToggle');
    toggle?.classList.add('live');
    state.unread += 1;
    render();
    if (!state.autoOpened) {
      state.autoOpened = true;
      setOpen(true);
    }
  }

  function build() {
    if (document.querySelector('#aiActivityPanel')) return true;
    const right = document.querySelector('.titlebar-right');
    const aiPill = document.querySelector('#aiPill');
    if (!right) return false;

    const button = document.createElement('button');
    button.id = 'aiActivityToggle';
    button.className = 'ai-act-toggle';
    button.title = 'AI 操作可视化';
    button.innerHTML = '<span class="ai-act-pulse"></span><span class="ai-act-toggle-label">AI 操作</span><span class="ai-act-badge" id="aiActBadge">0</span>';
    button.addEventListener('click', () => setOpen(!state.open));
    right.insertBefore(button, aiPill || right.firstChild);

    const panel = document.createElement('section');
    panel.id = 'aiActivityPanel';
    panel.className = 'ai-activity-panel';
    panel.innerHTML = `
      <div class="ai-act-head">
        <b>AI ACTIVITY</b>
        <small id="aiActCount">0 条</small>
        <button class="ai-act-head-btn" id="aiActClear" title="清空">×</button>
        <button class="ai-act-head-btn" id="aiActClose" title="收起">−</button>
      </div>
      <div class="ai-act-list" id="aiActList"></div>
    `;
    document.body.append(panel);
    panel.querySelector('#aiActClose').addEventListener('click', () => setOpen(false));
    panel.querySelector('#aiActClear').addEventListener('click', () => {
      state.items = [];
      state.unread = 0;
      render();
    });
    render();
    return true;
  }

  function bind() {
    if (!api || state.bound) return;
    if (!document.querySelector('#aiActivityPanel') && !build()) return;
    state.bound = true;
    api.on('ai:activity', add);
    api.on('ai:login-request', (request) => {
      add({
        type: 'login',
        approved: false,
        clientName: request?.clientName,
        at: Date.now(),
        summary: 'AI 正在请求登录，等待你在 IDE 中审批',
      });
    });
  }

  const timer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    if (build()) {
      bind();
      clearInterval(timer);
    }
  }, 250);
  setTimeout(() => clearInterval(timer), 20000);

  window.__orbitActivityDemo = (event) => add(event || {
    type: 'api',
    method: 'PUT',
    path: '/v1/file',
    status: 200,
    durationMs: 42,
    summary: '已写入 main.cpp（120 字节）',
    at: Date.now(),
    activity: {
      kind: 'file-write',
      path: 'main.cpp',
      changed: true,
      startLine: 6,
      removed: ['int main() {'],
      added: ['int main() {', '    // AI 修改', '    return 0;'],
      removedTotal: 1,
      addedTotal: 3,
    },
  });
})();

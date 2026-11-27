// 设置中的语言服务可选下载项。
(function () {
  const IDS = ['clangd', 'pyright', 'rust-analyzer', 'gopls', 'yaml', 'bash'];
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
  }

  function formatEta(seconds) {
    if (seconds === null || seconds === undefined) return '';
    if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${Math.ceil(seconds % 60)} 秒`;
  }

  function progressText(progress) {
    if (!progress) return '';
    if (progress.phase === 'extract') return '下载完成，正在解压…';
    if (progress.phase === 'done') return '安装完成';
    if (progress.phase !== 'download') return '';
    const speed = progress.bytesPerSecond ? `${formatBytes(progress.bytesPerSecond)}/s` : '';
    const eta = formatEta(progress.etaSeconds);
    if (progress.percent !== null && progress.percent !== undefined && progress.total) {
      return `${progress.percent}% · ${formatBytes(progress.received)} / ${formatBytes(progress.total)}${speed ? ` · ${speed}` : ''}${eta ? ` · 剩余 ${eta}` : ''}`;
    }
    return `${formatBytes(progress.received)}${speed ? ` · ${speed}` : ''}`;
  }

  if (window.orbit?.on) {
    window.orbit.on('lsp:download-progress', (progress) => {
      if (!IDS.includes(progress?.id)) return;
      setState(progress.id, progressText(progress));
    });
  }

  let loading = false;

  function el(id) {
    return document.getElementById(id);
  }

  function setState(id, text) {
    const node = el(`lsp-state-${id}`);
    if (node) node.textContent = text;
  }

  function setAction(id, label, disabled = false) {
    const node = el(`lsp-action-${id}`);
    if (!node) return;
    node.textContent = label;
    node.disabled = disabled;
  }

  async function loadStatus() {
    if (loading) return;
    loading = true;
    try {
      const status = await window.orbit.invoke('lsp:status');
      const servers = status?.downloads?.servers || {};
      for (const id of IDS) {
        const info = servers[id];
        if (!info) {
          setState(id, '不可用');
          setAction(id, '不可用', true);
          continue;
        }
        if (info.installed) {
          setState(id, `已安装${info.version ? ` · ${info.version}` : ''}`);
          setAction(id, '卸载');
        } else if (info.manual) {
          setState(id, '需 Go 工具链');
          setAction(id, '文档');
        } else {
          setState(id, '未安装');
          setAction(id, '下载');
        }
      }
    } catch (error) {
      for (const id of IDS) setState(id, `检查失败：${error.message || error}`);
    } finally {
      loading = false;
    }
  }

  function bind(section) {
    if (section.dataset.lspBound === '1') return;
    section.dataset.lspBound = '1';
    for (const id of IDS) {
      const button = el(`lsp-action-${id}`);
      if (!button) continue;
      button.addEventListener('click', async () => {
        const info = (await window.orbit.invoke('lsp:status').catch(() => null))?.downloads?.servers?.[id];
        if (info?.manual) {
          if (info.docs) await window.orbit.invoke('app:openExternal', info.docs);
          return;
        }
        if (info?.installed) {
          setAction(id, '卸载中…', true);
          try {
            await window.orbit.invoke('lsp:uninstall', id);
          } catch (error) {
            setState(id, `卸载失败：${error.message || error}`);
          }
          await loadStatus();
          return;
        }
        setAction(id, '下载中…', true);
        setState(id, '正在下载，请稍候…');
        try {
          await window.orbit.invoke('lsp:install', id);
          await loadStatus();
        } catch (error) {
          setState(id, `下载失败：${error.message || error}`);
          setAction(id, '重试');
        }
      });
    }
    loadStatus();
  }

  function findSection() {
    const section = document.getElementById('lspSettingsSection');
    if (!section) return false;
    bind(section);
    return true;
  }

  const timer = setInterval(() => {
    if (findSection()) clearInterval(timer);
  }, 300);
  setTimeout(() => clearInterval(timer), 20000);
})();

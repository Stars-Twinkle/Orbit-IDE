// 浅色/深色/跟随系统主题。
(function () {
  let api = window.orbit;
  let setting = 'dark';
  let media = null;

  function resolvedTheme() {
    if (setting === 'system') return media?.matches ? 'dark' : 'light';
    return setting === 'light' ? 'light' : 'dark';
  }

  function applyMonaco(theme) {
    const editorApi = window.__orbitEditorApi || window.__orbitMonaco;
    if (!editorApi?.defineTheme || !editorApi?.setTheme) return;
    if (!editorApi.__orbitLightDefined) {
      editorApi.defineTheme('orbit-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '7a889c', fontStyle: 'italic' },
          { token: 'keyword', foreground: '7c3aed' },
          { token: 'string', foreground: '047857' },
          { token: 'number', foreground: 'b45309' },
          { token: 'type', foreground: '0369a1' },
          { token: 'function', foreground: '1d4ed8' },
          { token: 'variable', foreground: '0f172a' },
          { token: 'operator', foreground: '475569' },
        ],
        colors: {
          'editor.background': '#fbfdff',
          'editor.foreground': '#1f2937',
          'editorLineNumber.foreground': '#a3aec0',
          'editorLineNumber.activeForeground': '#475569',
          'editor.lineHighlightBackground': '#eef4fb',
          'editor.selectionBackground': '#cfe0ff',
          'editor.inactiveSelectionBackground': '#e2ebf8',
          'editorCursor.foreground': '#2563eb',
          'editorIndentGuide.background1': '#e3e9f1',
          'editorIndentGuide.activeBackground1': '#c7d3e3',
          'editorWidget.background': '#ffffff',
          'editorWidget.border': '#d8e0eb',
          'editorSuggestWidget.background': '#ffffff',
          'editorSuggestWidget.border': '#d8e0eb',
          'editorSuggestWidget.selectedBackground': '#e8f1ff',
          'editorHoverWidget.background': '#ffffff',
          'editorHoverWidget.border': '#d8e0eb',
          'editorGutter.background': '#fbfdff',
          'minimap.background': '#f3f7fc',
          'scrollbarSlider.background': '#94a3b84d',
          'scrollbarSlider.hoverBackground': '#64748b66',
          'scrollbarSlider.activeBackground': '#47556980',
        },
      });
      editorApi.__orbitLightDefined = true;
    }
    editorApi.setTheme(theme === 'light' ? 'orbit-light' : 'orbit-dark');
  }

  function apply() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('orbit.theme', setting);
    } catch {
      // 忽略。
    }
    applyMonaco(theme);
  }

  function setSetting(next) {
    if (next === 'light' || next === 'dark' || next === 'system') setting = next;
    apply();
  }

  function boot() {
    try {
      const cached = localStorage.getItem('orbit.theme');
      if (cached) setting = cached;
    } catch {
      // 默认深色。
    }
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', () => {
      if (setting === 'system') apply();
    });
    apply();
  }

  boot();

  const timer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    clearInterval(timer);
    api.invoke('settings:get')
      .then((settings) => {
        if (settings?.theme) setSetting(settings.theme);
      })
      .catch(() => {});
    api.on('settings:changed', (settings) => {
      if (settings?.theme) setSetting(settings.theme);
    });
    api.on('mode:changed', () => setTimeout(apply, 80));
  }, 250);
  setTimeout(() => clearInterval(timer), 20000);
})();

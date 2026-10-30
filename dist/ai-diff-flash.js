// 在 Monaco 编辑器内直接高亮 AI 修改：新增绿、删除红、替换白。
(function () {
  let api = window.orbit;
  let editorApi = window.__orbitEditorApi || window.__orbitMonaco;
  let bound = false;

  const norm = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();

  function findModel(filePath) {
    if (!editorApi || !filePath) return null;
    const needle = norm(filePath);
    for (const model of editorApi.getModels()) {
      let uriPath = model.uri?.path || '';
      try {
        uriPath = decodeURIComponent(uriPath);
      } catch {
        // uri 已经是解码后的形式。
      }
      const candidate = norm(uriPath);
      if (candidate === needle || candidate.endsWith(`/${needle}`)) return model;
    }
    return null;
  }

  function flash(activity) {
    if (!editorApi || !activity || activity.changed === false || !activity.path) return false;
    const model = findModel(activity.path);
    if (!model) return false;

    const total = model.getLineCount();
    const start = Math.max(1, Math.min(total, Number(activity.startLine) || 1));
    const removedCount = Number(activity.removedTotal) || 0;
    const addedCount = Number(activity.addedTotal) || 0;
    if (!removedCount && !addedCount) return false;

    const decorations = [];
    const addEnd = Math.min(total, start + Math.max(0, addedCount) - 1);
    const replaced = removedCount > 0 && addedCount > 0;
    const lineClass = replaced ? 'ai-diff-replace' : 'ai-diff-add';

    if (addedCount > 0) {
      for (let line = start; line <= addEnd; line += 1) {
        decorations.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: {
            isWholeLine: true,
            className: lineClass,
            zIndex: 20,
          },
        });
      }
    }

    if (removedCount > 0) {
      const line = Math.max(1, Math.min(total, start));
      const note = replaced
        ? `  ${removedCount} 行被替换为 ${addedCount} 行`
        : `  −${removedCount} 行已删除`;
      const noteOptions = {
        isWholeLine: true,
        className: replaced ? 'ai-diff-replace' : 'ai-diff-del',
        after: {
          content: note,
          inlineClassName: 'ai-diff-del-note',
        },
        zIndex: 21,
      };
      decorations.push({ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: noteOptions });
    }

    if (addedCount > 0 && removedCount === 0 && activity.addedTotal <= 20) {
      const line = start;
      decorations.push({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: {
          isWholeLine: true,
          after: {
            content: `  +${addedCount} 行`,
            inlineClassName: 'ai-diff-add-note',
          },
        },
      });
    }

    const ids = model.deltaDecorations([], decorations);
    setTimeout(() => {
      try {
        model.deltaDecorations(ids, []);
      } catch {
        // 文件已关闭或模型已销毁。
      }
    }, 2100);
    return true;
  }

  async function handle(event) {
    if (event?.type !== 'api') return;
    const activity = event.activity;
    if (!activity?.changed || !activity.path) return;
    // AI 改完文件后先切到对应标签页，再在当前窗口内闪出 diff。
    if (typeof window.__orbitOpenFile === 'function') {
      try {
        await window.__orbitOpenFile(activity.path, {
          line: activity.startLine || 1,
          silent: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch {
        // 文件被 OI 策略拒绝或已删除时不切换。
      }
    }
    flash(activity);
  }

  const timer = setInterval(() => {
    api = api || window.orbit;
    editorApi = editorApi || window.__orbitEditorApi || window.__orbitMonaco;
    if (!api || !editorApi || bound) return;
    bound = true;
    api.on('ai:activity', handle);
    clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 20000);

  // 便于调试和测试。
  window.__orbitDiffFlash = flash;
  window.__orbitDiffFlashEvent = handle;
})();

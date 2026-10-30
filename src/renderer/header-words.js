// 解析当前 C++ 编译器实际使用的系统头文件，把声明名注入补全。
(function () {
  let api = window.orbit;
  let loading = false;
  let lastSignature = '';

  window.__orbitCppWords = window.__orbitCppWords || [];

  function publish(data) {
    if (!data || !Array.isArray(data.words)) return;
    if (data.signature && data.signature === lastSignature) return;
    lastSignature = data.signature || '';
    window.__orbitCppWords = data.words;
    window.__orbitCppWordsMeta = data;
    window.dispatchEvent(new CustomEvent('orbit:cpp-words', { detail: data }));
    console.info(
      `[Orbit] C++ 头文件补全：${data.words.length} 个词条，来自 ${data.files || 0} 个头文件`
    );
  }

  async function load(force) {
    if (!api || loading) return;
    loading = true;
    try {
      const data = await api.invoke('completion:words', { force: Boolean(force) });
      publish(data);
    } catch (error) {
      console.warn('解析 C++ 头文件补全失败', error);
    } finally {
      loading = false;
    }
  }

  const timer = setInterval(() => {
    api = api || window.orbit;
    if (!api) return;
    clearInterval(timer);
    load(false);
  }, 200);
  setTimeout(() => clearInterval(timer), 20000);

  let compilerTimer = 0;
  const bind = setInterval(() => {
    api = api || window.orbit;
    if (!api?.on) return;
    clearInterval(bind);
    api.on('compilers:changed', () => {
      clearTimeout(compilerTimer);
      compilerTimer = setTimeout(() => load(false), 800);
    });
  }, 500);
  setTimeout(() => clearInterval(bind), 20000);
})();

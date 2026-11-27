export const snippetProvider = {
  id: 'snippet',
  languages: ['cpp', 'c', 'python', 'javascript', 'typescript', 'java', 'go', 'rust'],
  priority: 30,
  triggerCharacters: [],
  provide() {
    // 预留片段补全层。默认不返回大段模板，避免再次出现整块代码。
    return { suggestions: [] };
  },
};

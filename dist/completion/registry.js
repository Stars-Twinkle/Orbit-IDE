import { getWordRange } from './context.js';

export class CompletionRegistry {
  constructor(providers) {
    this.providers = providers.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.installed = false;
    this.disposables = [];
  }

  install() {
    if (this.installed) return true;
    const languages = window.__orbitLanguages;
    if (!languages) return false;

    const byLanguage = new Map();
    for (const provider of this.providers) {
      for (const language of provider.languages || []) {
        if (!byLanguage.has(language)) byLanguage.set(language, []);
        byLanguage.get(language).push(provider);
      }
    }

    for (const [language, providers] of byLanguage) {
      const triggerCharacters = [...new Set(providers.flatMap((p) => p.triggerCharacters || []))];
      const disposable = languages.registerCompletionItemProvider(language, {
        triggerCharacters,
        provideCompletionItems: async (model, position, context, token) => {
          const word = model.getWordUntilPosition(position);
          const ctx = {
            model,
            position,
            language,
            triggerKind: context?.triggerKind ?? 0,
            triggerCharacter: context?.triggerCharacter,
            word: word.word,
            range: getWordRange(model, position),
            token,
          };

          for (const provider of providers) {
            if (token?.isCancellationRequested) break;
            try {
              const result = await provider.provide(ctx);
              const suggestions = Array.isArray(result) ? result : result?.suggestions || [];
              if (!suggestions.length) continue;
              return {
                suggestions: suggestions.map((item) => ({
                  range: ctx.range,
                  ...item,
                })),
                incomplete: Boolean(result?.incomplete),
              };
            } catch (error) {
              console.warn(`[completion:${provider.id}]`, error);
            }
          }
          return { suggestions: [] };
        },
      });
      this.disposables.push(disposable);
    }

    this.installed = true;
    this.applyEditorOptions();
    return true;
  }

  applyEditorOptions() {
    const editors = window.__orbitEditorApi?.getEditors?.() || [];
    for (const editor of editors) {
      editor.updateOptions({
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'off',
        wordBasedSuggestions: 'off',
        snippetSuggestions: 'none',
        suggest: {
          showSnippets: false,
          showWords: false,
          preview: true,
          showStatusBar: true,
          shareSuggestSelections: true,
          filterGraceful: true,
        },
      });
    }
  }

  dispose() {
    for (const disposable of this.disposables) disposable?.dispose?.();
    this.disposables = [];
    this.installed = false;
  }
}

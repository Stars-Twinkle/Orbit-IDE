import * as monaco from 'monaco-editor';
import '../../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import '../../node_modules/monaco-editor/esm/vs/language/json/monaco.contribution.js';
import '../../node_modules/monaco-editor/esm/vs/language/css/monaco.contribution.js';
import '../../node_modules/monaco-editor/esm/vs/language/html/monaco.contribution.js';
import '../../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import {
  javascriptDefaults,
  typescriptDefaults,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  JsxEmit,
} from '../../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from '../../node_modules/monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from '../../node_modules/monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from '../../node_modules/monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from '../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// 供独立的 AI diff 高亮脚本使用（窗口内闪烁新增/删除/替换）。
window.__orbitEditorApi = monaco.editor;

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

const THEMES = {
  oi: {
    accent: '#ffb454',
    accentBg: '#3c2a1666',
    cursor: '#ffb454',
  },
  dev: {
    accent: '#6ea8fe',
    accentBg: '#1d355566',
    cursor: '#6ea8fe',
  },
};

function defineTheme(mode) {
  const theme = THEMES[mode] || THEMES.dev;
  monaco.editor.defineTheme('orbit-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd9e3f0' },
      { token: 'comment', foreground: '5f7186', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'keyword.control', foreground: 'c792ea' },
      { token: 'keyword.operator', foreground: '89ddff' },
      { token: 'number', foreground: 'f6c177' },
      { token: 'number.cpp', foreground: 'f6c177' },
      { token: 'string', foreground: '9ece9a' },
      { token: 'string.escape', foreground: 'f6c177' },
      { token: 'type', foreground: '7dd3fc' },
      { token: 'type.identifier', foreground: '7dd3fc' },
      { token: 'identifier', foreground: 'd9e3f0' },
      { token: 'delimiter', foreground: '899bb1' },
      { token: 'operator', foreground: '89ddff' },
      { token: 'predefined', foreground: '82aaff' },
      { token: 'preprocessor', foreground: 'ff9e64' },
      { token: 'function', foreground: '82aaff' },
      { token: 'variable', foreground: 'd9e3f0' },
      { token: 'constant', foreground: 'f6c177' },
      { token: 'tag', foreground: 'ff7b9c' },
      { token: 'attribute.name', foreground: 'ffd479' },
      { token: 'attribute.value', foreground: '9ece9a' },
      { token: 'metatag', foreground: 'ff9e64' },
      { token: 'key', foreground: '7dd3fc' },
      { token: 'regexp', foreground: 'f6c177' },
      { token: 'annotation', foreground: 'ffd479' },
    ],
    colors: {
      'editor.background': '#080c12',
      'editor.foreground': '#d9e3f0',
      'editorLineNumber.foreground': '#3b485a',
      'editorLineNumber.activeForeground': '#96a6ba',
      'editorGutter.background': '#080c12',
      'editorCursor.foreground': theme.cursor,
      'editor.selectionBackground': theme.accentBg,
      'editor.inactiveSelectionBackground': '#22314255',
      'editor.selectionHighlightBackground': '#2b426022',
      'editor.wordHighlightBackground': '#2f4a6a33',
      'editor.wordHighlightStrongBackground': '#3a5c8233',
      'editor.lineHighlightBackground': '#0d141d',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#18222f',
      'editorIndentGuide.activeBackground1': '#34465b',
      'editorWhitespace.foreground': '#243140',
      'editorBracketHighlight.foreground1': '#7dd3fc',
      'editorBracketHighlight.foreground2': '#c792ea',
      'editorBracketHighlight.foreground3': '#ffd479',
      'editorBracketHighlight.foreground4': '#9ece9a',
      'editorBracketHighlight.foreground5': '#89ddff',
      'editorBracketHighlight.foreground6': '#ff9e64',
      'editorBracketMatch.background': '#1d355544',
      'editorBracketMatch.border': '#6ea8fe66',
      'editor.findMatchBackground': theme.accentBg,
      'editor.findMatchHighlightBackground': '#ffffff18',
      'editor.findMatchBorder': theme.accent,
      'editorSuggestWidget.background': '#0d141d',
      'editorSuggestWidget.border': '#223040',
      'editorSuggestWidget.foreground': '#c9d5e3',
      'editorSuggestWidget.selectedBackground': '#1a2a3b',
      'editorSuggestWidget.selectedForeground': '#ffffff',
      'editorSuggestWidget.highlightForeground': theme.accent,
      'editorHoverWidget.background': '#0d141d',
      'editorHoverWidget.border': '#223040',
      'editorHoverWidget.foreground': '#c9d5e3',
      'editorWidget.background': '#0d141d',
      'editorWidget.border': '#223040',
      'editorWidget.foreground': '#c9d5e3',
      'editorSuggestWidgetStatus.foreground': '#617085',
      'editorOverviewRuler.border': '#00000000',
      'editorOverviewRuler.findMatchForeground': '#6ea8fe88',
      'editorError.foreground': '#fb7185',
      'editorWarning.foreground': '#fbbf24',
      'editorInfo.foreground': '#60a5fa',
      'editorError.border': '#00000000',
      'editorWarning.border': '#00000000',
      'editorScrollbar.shadow': '#00000000',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#94a3b81a',
      'scrollbarSlider.hoverBackground': '#94a3b82e',
      'scrollbarSlider.activeBackground': '#94a3b83c',
      'editorStickyScroll.background': '#080c12',
      'editorStickyScrollHover.background': '#0d141d',
      'minimap.background': '#080c12',
      'minimapSlider.background': '#94a3b812',
      'minimapSlider.hoverBackground': '#94a3b822',
      'editorLightBulb.foreground': theme.accent,
      'editorCodeLens.foreground': '#596a7e',
      'input.background': '#0a1119',
      'input.border': '#233041',
      'focusBorder': `${theme.accent}66`,
      'list.hoverBackground': '#121c28',
      'list.activeSelectionBackground': '#1a2a3b',
      'list.activeSelectionForeground': '#ffffff',
      'menu.background': '#0d141d',
      'menu.border': '#223040',
      'menu.selectionBackground': '#1a2a3b',
      'quickInput.background': '#0d141d',
      'quickInput.foreground': '#d9e3f0',
      'parameterHints.background': '#0d141d',
      'parameterHints.border': '#223040',
    },
  });
}

function setTsDefaults() {
  typescriptDefaults.setCompilerOptions({
    target: ScriptTarget.ES2022,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: false,
    jsx: JsxEmit.ReactJSX,
    esModuleInterop: true,
    skipLibCheck: true,
  });
  javascriptDefaults.setCompilerOptions({
    target: ScriptTarget.ES2022,
    module: ModuleKind.ESNext,
    allowNonTsExtensions: true,
    checkJs: false,
    allowJs: true,
  });
  javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  typescriptDefaults.addExtraLib(
    `declare const process: { argv: string[]; env: Record<string, string | undefined>; exit(code?: number): never; platform: string; version: string; cwd(): string; };
declare const require: (id: string) => any;
declare const module: any;
declare const __dirname: string;
declare const __filename: string;
declare const Buffer: any;`,
    'orbit-node-globals.d.ts'
  );
}

const CPP_STD_ITEMS = [
  'std::vector', 'std::map', 'std::unordered_map', 'std::set', 'std::unordered_set', 'std::queue', 'std::priority_queue',
  'std::stack', 'std::deque', 'std::string', 'std::string_view', 'std::pair', 'std::tuple', 'std::array', 'std::bitset',
  'std::sort', 'std::stable_sort', 'std::reverse', 'std::unique', 'std::lower_bound', 'std::upper_bound', 'std::binary_search',
  'std::min', 'std::max', 'std::min_element', 'std::max_element', 'std::accumulate', 'std::abs', 'std::swap', 'std::gcd',
  'std::lcm', 'std::pow', 'std::sqrt', 'std::ceil', 'std::floor', 'std::log', 'std::round', 'std::to_string', 'std::stoi',
  'std::stoll', 'std::getline', 'std::ios', 'std::cin', 'std::cout', 'std::cerr', 'std::endl', 'std::make_pair',
  'std::make_unique', 'std::make_shared', 'std::function', 'std::numeric_limits', 'std::chrono', 'std::mt19937',
  'std::shuffle', 'std::next_permutation', 'std::prev_permutation', 'std::is_sorted', 'std::fill', 'std::count',
  'std::find', 'std::includes', 'std::merge', 'std::partition', 'std::max_element', 'std::clamp', 'std::optional',
  'std::variant', 'std::any', 'std::span', 'std::ranges', 'std::views',
  'std::array', 'std::deque', 'std::list', 'std::forward_list', 'std::multimap', 'std::unordered_multimap',
  'std::multiset', 'std::unordered_multiset', 'std::stack', 'std::tie', 'std::make_tuple', 'std::complex',
  'std::filesystem', 'std::path', 'std::initializer_list', 'std::valarray',
  'std::partial_sort', 'std::nth_element', 'std::unique_copy', 'std::equal_range', 'std::minmax', 'std::reduce',
  'std::inner_product', 'std::iota', 'std::iter_swap', 'std::fill_n', 'std::count_if', 'std::find_if',
  'std::find_if_not', 'std::stable_partition', 'std::rotate', 'std::remove', 'std::remove_if', 'std::replace',
  'std::replace_if', 'std::transform', 'std::for_each', 'std::all_of', 'std::any_of', 'std::none_of',
  'std::copy', 'std::copy_if', 'std::move', 'std::move_backward', 'std::generate', 'std::generate_n',
  'std::sample', 'std::equal', 'std::lexicographical_compare',
  'std::cbrt', 'std::trunc', 'std::log2', 'std::log10', 'std::exp', 'std::sin', 'std::cos', 'std::tan',
  'std::asin', 'std::acos', 'std::atan', 'std::atan2', 'std::hypot', 'std::fmod', 'std::remainder',
  'std::fmax', 'std::fmin', 'std::lerp', 'std::midpoint',
  'std::to_wstring', 'std::stol', 'std::stoul', 'std::stoull', 'std::stof', 'std::stod', 'std::stold',
  'std::stringstream', 'std::istringstream', 'std::ostringstream', 'std::ios_base', 'std::clog', 'std::flush',
  'std::fixed', 'std::scientific', 'std::setprecision', 'std::setw', 'std::setfill', 'std::hex', 'std::dec',
  'std::oct', 'std::boolalpha', 'std::noskipws',
  'std::unique_ptr', 'std::shared_ptr', 'std::weak_ptr', 'std::allocator', 'std::addressof', 'std::bind',
  'std::ref', 'std::cref', 'std::invoke', 'std::hash',
  'std::is_same', 'std::is_integral', 'std::is_floating_point', 'std::is_arithmetic', 'std::is_pointer',
  'std::is_reference', 'std::is_const', 'std::is_signed', 'std::is_unsigned', 'std::enable_if',
  'std::conditional', 'std::decay', 'std::remove_reference', 'std::remove_const', 'std::remove_cv',
  'std::underlying_type', 'std::steady_clock', 'std::system_clock', 'std::high_resolution_clock', 'std::duration',
  'std::time_point', 'std::mt19937_64', 'std::random_device', 'std::uniform_int_distribution',
  'std::uniform_real_distribution', 'std::exception', 'std::runtime_error', 'std::logic_error', 'std::out_of_range',
  'std::invalid_argument', 'std::length_error', 'std::overflow_error', 'std::format', 'std::print', 'std::println',
  'std::expected', 'std::source_location', 'std::bit_cast', 'std::endian', 'std::to_array', 'std::ssize',
  'std::cmp_less', 'std::cmp_greater',
];

const C_KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float',
  'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct',
  'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', 'bool', 'true', 'false', 'nullptr', 'class',
  'namespace', 'template', 'typename', 'using', 'public', 'private', 'protected', 'virtual', 'override', 'final',
  'constexpr', 'consteval', 'constinit', 'decltype', 'explicit', 'friend', 'mutable', 'new', 'delete', 'operator',
  'this', 'throw', 'try', 'catch', 'noexcept', 'static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast',
  'alignas', 'alignof', 'static_assert', 'concept', 'requires', 'co_await', 'co_return', 'co_yield',
  'and', 'and_eq', 'asm', 'bitand', 'bitor', 'compl', 'not', 'not_eq', 'or', 'or_eq', 'xor', 'xor_eq',
  'export', 'import', 'module', 'thread_local',
  'printf', 'scanf', 'puts', 'gets', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'sprintf', 'snprintf',
  'sscanf', 'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove', 'memset', 'strlen', 'strcmp', 'strncmp',
  'strcpy', 'strncpy', 'strcat', 'strncat', 'strstr', 'strchr', 'strrchr', 'strtok', 'qsort', 'bsearch',
  'llabs', 'atoi', 'atol', 'atoll', 'strtol', 'strtoll', 'strtod', 'size_t', 'ssize_t', 'int64_t', 'uint64_t',
  'int32_t', 'uint32_t', 'int8_t', 'int16_t', 'uint8_t', 'uint16_t',
  'int_fast8_t', 'int_fast16_t', 'int_fast32_t', 'int_fast64_t', 'uint_fast8_t', 'uint_fast16_t',
  'uint_fast32_t', 'uint_fast64_t', 'int_least8_t', 'int_least16_t', 'int_least32_t', 'int_least64_t',
  'uint_least8_t', 'uint_least16_t', 'uint_least32_t', 'uint_least64_t', 'intptr_t', 'uintptr_t',
  'intmax_t', 'uintmax_t', 'ptrdiff_t', 'wchar_t', 'char8_t', 'char16_t', 'char32_t', 'max_align_t',
  'nullptr_t', 'sig_atomic_t', 'clock_t', 'time_t', 'va_list', 'div_t', 'ldiv_t', 'lldiv_t',
  'FILE', 'EOF', 'NULL', 'stdin', 'stdout', 'stderr',
];

function makeSnippetProvider(language, snippets, keywords = []) {
  return monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: language === 'cpp' || language === 'c' ? ['.', ':', '>', '<'] : ['.', ':'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = [];
      for (const snippet of snippets) {
        suggestions.push({
          label: snippet.label,
          kind: snippet.kind || monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail || 'Orbit 代码片段',
          documentation: snippet.documentation,
          insertText: snippet.insertText,
          insertTextRules: snippet.raw ? undefined : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: snippet.sortText || `0${snippet.label}`,
        });
      }
      for (const keyword of keywords) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: 'C++ 关键字',
          insertText: keyword,
          range,
          sortText: `1${keyword}`,
        });
      }
      if (language === 'cpp') {
        const usingStd = /using\s+namespace\s+std\s*;/.test(model.getValue());
        for (const item of CPP_STD_ITEMS) {
          const label = usingStd ? item.replace(/^std::/, '') : item;
          suggestions.push({
            label,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: 'C++ 标准库',
            insertText: label,
            range,
            sortText: `2${label}`,
          });
        }
        for (const word of window.__orbitCppWords || []) {
          suggestions.push({
            label: word,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: 'C++ 头文件',
            insertText: word,
            range,
            sortText: `3${word}`,
          });
        }
      }
      const fileSource = model.getValue()
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n\r]*/g, ' ')
        .replace(/"(?:\\.|[^"\\])*"/g, ' ');
      const fileWords = new Set();
      for (const match of fileSource.matchAll(/\b[A-Za-z_]\w*\b/g)) {
        const wordValue = match[0];
        if (wordValue.length < 2 || wordValue === word.word || fileWords.has(wordValue)) continue;
        fileWords.add(wordValue);
        if (fileWords.size >= 1200) break;
      }
      for (const wordValue of fileWords) {
        suggestions.push({
          label: wordValue,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: '当前文件变量',
          insertText: wordValue,
          range,
          sortText: `0${wordValue}`,
        });
      }
      const seen = new Set();
      return {
        suggestions: suggestions.filter((item) => {
          if (seen.has(item.label)) return false;
          seen.add(item.label);
          return true;
        }),
      };
    },
  });
}

const cppSnippets = [];

const cSnippets = [];

const pySnippets = [
  {
    label: 'py-main',
    detail: 'Python 主函数',
    insertText: 'def solve() -> None:\n    ${1:pass}\n\n\nif __name__ == "__main__":\n    solve()',
  },
  { label: 'fori', detail: 'range 循环', insertText: 'for ${1:i} in range(${2:n}):\n    ${3}' },
  { label: 'def', detail: '函数定义', insertText: 'def ${1:name}(${2:args}) -> ${3:None}:\n    ${4:pass}' },
  { label: 'class', detail: '类定义', insertText: 'class ${1:Name}:\n    def __init__(self, ${2:args}):\n        ${3:pass}' },
  { label: 'read', detail: '读取一行', insertText: '${1:line} = input()' },
  { label: 'readints', detail: '读取整数', insertText: '${1:n} = int(input())\n${2:a} = list(map(int, input().split()))' },
  { label: 'with', detail: '文件上下文', insertText: 'with open(${1:"file.txt"}, "r", encoding="utf-8") as f:\n    ${2:data} = f.read()' },
  { label: 'try', detail: '异常处理', insertText: 'try:\n    ${1}\nexcept ${2:Exception} as e:\n    ${3:pass}' },
];

const jsSnippets = [
  { label: 'log', detail: 'console.log', insertText: 'console.log(${1});' },
  { label: 'fn', detail: '函数', insertText: 'function ${1:name}(${2:args}) {\n  ${3}\n}' },
  { label: 'arrow', detail: '箭头函数', insertText: 'const ${1:name} = (${2:args}) => {\n  ${3}\n};' },
  { label: 'forof', detail: 'for...of', insertText: 'for (const ${1:item} of ${2:items}) {\n  ${3}\n}' },
];

const goSnippets = [
  { label: 'gomain', detail: 'Go main 包', insertText: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(${1:"Hello"})\n}' },
  { label: 'fori', detail: 'for 循环', insertText: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t${3}\n}' },
  { label: 'iferr', detail: '错误处理', insertText: 'if err != nil {\n\t${1:return}\n}' },
];

const javaSnippets = [
  { label: 'javamain', detail: 'Java 主类', insertText: 'public class ${1:Main} {\n    public static void main(String[] args) {\n        ${2}\n    }\n}' },
  { label: 'sout', detail: 'System.out.println', insertText: 'System.out.println(${1});' },
  { label: 'fori', detail: 'for 循环', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${3}\n}' },
];

const rustSnippets = [
  { label: 'fnmain', detail: 'Rust main', insertText: 'fn main() {\n    ${1:println!("Hello, Orbit");}\n}' },
  { label: 'println', detail: 'println!', insertText: 'println!("${1}");' },
  { label: 'fori', detail: 'for 区间', insertText: 'for ${1:i} in 0..${2:n} {\n    ${3}\n}' },
];

let providersRegistered = false;

export function registerLanguageFeatures() {
  if (providersRegistered) return;
  providersRegistered = true;
  setTsDefaults();
  makeSnippetProvider('cpp', cppSnippets, C_KEYWORDS);
  makeSnippetProvider('c', cSnippets, C_KEYWORDS);
  makeSnippetProvider('python', pySnippets, ['def', 'class', 'return', 'yield', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'lambda', 'pass', 'break', 'continue', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'async', 'await', 'global', 'nonlocal', 'raise', 'assert', 'del']);
  makeSnippetProvider('javascript', jsSnippets, ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'async', 'await', 'import', 'export', 'default', 'try', 'catch', 'throw']);
  makeSnippetProvider('typescript', jsSnippets, ['interface', 'type', 'enum', 'implements', 'extends', 'public', 'private', 'protected', 'readonly', 'namespace', 'declare', 'as']);
  makeSnippetProvider('go', goSnippets, ['func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'return', 'if', 'else', 'for', 'range', 'go', 'defer', 'chan', 'select', 'switch', 'case', 'default']);
  makeSnippetProvider('java', javaSnippets, ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'int', 'long', 'double', 'String', 'boolean', 'new', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'throws']);
  makeSnippetProvider('rust', rustSnippets, ['fn', 'let', 'mut', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'async', 'await', 'move']);

  monaco.languages.registerHoverProvider('cpp', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const docs = {
        vector: '`std::vector` 动态数组，随机访问 O(1)，尾部插入均摊 O(1)。',
        unordered_map: '`std::unordered_map` 哈希表，平均 O(1) 查找；OI 中注意防哈希碰撞。',
        map: '`std::map` 有序关联容器，基于红黑树，操作 O(log n)。',
        priority_queue: '`std::priority_queue` 优先队列（默认大根堆），push/pop O(log n)。',
        sort: '`std::sort` 平均 O(n log n) 排序；要求严格弱序。',
        lower_bound: '`std::lower_bound` 在有序区间中二分查找第一个 ≥ value 的位置。',
        int: '32 位有符号整数，范围约 ±2.1×10⁹。',
        long: 'Windows 上 `long` 为 32 位；需要 64 位请使用 `long long`。',
        'long long': '64 位有符号整数，范围约 ±9.2×10¹⁸。',
      };
      const key = word.word;
      if (!docs[key]) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: docs[key] }],
      };
    },
  });
}

export class EditorHost {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.mode = 'oi';
    registerLanguageFeatures();
    defineTheme(this.mode);
    this.editor = monaco.editor.create(container, {
      theme: 'orbit-dark',
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 22,
      fontLigatures: true,
      minimap: { enabled: true, renderCharacters: false, maxColumn: 90, scale: 1, showSlider: 'mouseover' },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      cursorWidth: 1.5,
      renderLineHighlight: 'all',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
      padding: { top: 13, bottom: 14 },
      lineNumbersMinChars: 4,
      glyphMargin: false,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'mouseover',
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      suggest: {
        showSnippets: true,
        preview: true,
        showStatusBar: true,
        shareSuggestSelections: true,
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false,
      },
      parameterHints: { enabled: true },
      hover: { enabled: true, delay: 260 },
      links: true,
      colorDecorators: true,
      stickyScroll: { enabled: false },
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false,
        verticalSliderSize: 4,
        horizontalSliderSize: 4,
      },
      renderLineHighlightOnlyWhenFocus: false,
      unicodeHighlight: { ambiguousCharacters: false },
      fixedOverflowWidgets: true,
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => this.callbacks.onSave?.());
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => this.callbacks.onSaveAll?.());
    this.editor.addCommand(monaco.KeyCode.F5, () => this.callbacks.onRun?.());
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyB, () => this.callbacks.onBuild?.());
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => this.callbacks.onQuickOpen?.());
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => this.callbacks.onCommandPalette?.());

    this.editor.onDidChangeModelContent(() => {
      this.callbacks.onChange?.(this.editor.getModel());
    });
    this.editor.onDidChangeCursorPosition((event) => {
      this.callbacks.onCursor?.(event.position, this.editor.getSelection());
    });
    this.editor.onDidChangeCursorSelection((event) => {
      this.callbacks.onSelection?.(event.selection);
    });
    this.editor.onDidFocusEditorText(() => {
      this.callbacks.onFocus?.();
    });
  }

  createModel(tab) {
    const uri = monaco.Uri.parse(`orbit:///${encodeURI(tab.path)}`);
    const existing = monaco.editor.getModel(uri);
    if (existing) existing.dispose();
    const model = monaco.editor.createModel(tab.content, tab.language, uri);
    tab.model = model;
    return model;
  }

  showTab(tab) {
    if (!tab?.model) return;
    this.editor.setModel(tab.model);
    if (tab.viewState) this.editor.restoreViewState(tab.viewState);
    this.editor.focus();
  }

  saveViewState(tab) {
    if (tab?.model && this.editor.getModel() === tab.model) {
      tab.viewState = this.editor.saveViewState();
    }
  }

  disposeModel(tab) {
    if (!tab?.model) return;
    const current = this.editor.getModel() === tab.model;
    if (current) this.editor.setModel(null);
    tab.model.dispose();
    tab.model = null;
  }

  setMode(mode) {
    this.mode = mode;
    defineTheme(mode);
    monaco.editor.setTheme('orbit-dark');
    document.documentElement.style.setProperty('--editor-accent', THEMES[mode].accent);
  }

  setOptions(settings) {
    this.editor.updateOptions({
      fontSize: Number(settings.fontSize) || 14,
      tabSize: Number(settings.tabSize) || 4,
      wordWrap: settings.wordWrap || 'off',
      minimap: { enabled: settings.minimap !== false, renderCharacters: false, maxColumn: 90 },
      fontLigatures: settings.fontLigatures !== false,
      quickSuggestions: settings.autoComplete === false ? false : { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: settings.autoComplete !== false,
      acceptSuggestionOnEnter: settings.autoComplete === false ? 'off' : 'on',
      tabCompletion: settings.autoComplete === false ? 'off' : 'on',
      wordBasedSuggestions: settings.autoComplete === false ? 'off' : 'currentDocument',
    });
  }

  getState() {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    const selection = this.editor.getSelection();
    return {
      model,
      path: model ? decodeURI(model.uri.path).replace(/^\/+/, '') : null,
      content: model ? model.getValue() : '',
      language: model ? model.getLanguageId() : null,
      line: position?.lineNumber || 1,
      column: position?.column || 1,
      selection: selection
        ? {
            startLine: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLine: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null,
    };
  }

  getPosition() {
    return this.editor.getPosition() || { lineNumber: 1, column: 1 };
  }

  getSelection() {
    return this.editor.getSelection();
  }

  setContent(content) {
    const model = this.editor.getModel();
    if (!model) return false;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: String(content) }], () => null);
    return true;
  }

  insert(text, position) {
    const model = this.editor.getModel();
    if (!model) return false;
    const pos = position
      ? { lineNumber: Math.max(1, Number(position.line) || 1), column: Math.max(1, Number(position.column) || 1) }
      : this.editor.getPosition();
    if (!pos) return false;
    this.editor.executeEdits('orbit-ai', [
      {
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        text: String(text),
        forceMoveMarkers: true,
      },
    ]);
    this.editor.focus();
    return true;
  }

  replace(range, text) {
    const model = this.editor.getModel();
    if (!model) return false;
    const startLine = Math.max(1, Math.min(model.getLineCount(), Number(range.startLine) || 1));
    const endLine = Math.max(1, Math.min(model.getLineCount(), Number(range.endLine) || startLine));
    const startColumn = Math.max(1, Number(range.startColumn) || 1);
    const endColumn = Math.max(1, Number(range.endColumn) || 1);
    this.editor.executeEdits('orbit-ai', [
      {
        range: new monaco.Range(startLine, startColumn, endLine, endColumn),
        text: String(text),
        forceMoveMarkers: true,
      },
    ]);
    this.editor.focus();
    return true;
  }

  select(startLine, startColumn, endLine, endColumn) {
    if (!this.editor.getModel()) return false;
    this.editor.setSelection(
      new monaco.Selection(
        Math.max(1, Number(startLine) || 1),
        Math.max(1, Number(startColumn) || 1),
        Math.max(1, Number(endLine) || Number(startLine) || 1),
        Math.max(1, Number(endColumn) || Number(startColumn) || 1)
      )
    );
    this.editor.revealPositionInCenter({ lineNumber: Math.max(1, Number(startLine) || 1), column: Math.max(1, Number(startColumn) || 1) });
    this.editor.focus();
    return true;
  }

  reveal(line, column = 1) {
    if (!this.editor.getModel()) return;
    this.editor.revealPositionInCenter({ lineNumber: Math.max(1, Number(line) || 1), column: Math.max(1, Number(column) || 1) });
    this.editor.setPosition({ lineNumber: Math.max(1, Number(line) || 1), column: Math.max(1, Number(column) || 1) });
    this.editor.focus();
  }

  setMarkers(model, problems) {
    if (!model) return;
    const modelPath = decodeURI(model.uri.path || '').replace(/^\/+/, '').replace(/\\/g, '/');
    const modelName = modelPath.split('/').pop();
    const markers = (problems || [])
      .filter((item) => {
        if (!item.file) return false;
        const problemPath = String(item.file).replace(/\\/g, '/').replace(/^\/+/, '');
        return (
          problemPath === modelPath ||
          modelPath.endsWith(`/${problemPath}`) ||
          problemPath.endsWith(`/${modelPath}`) ||
          problemPath.split('/').pop() === modelName
        );
      })
      .map((item) => ({
        severity:
          item.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : item.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        message: item.message,
        startLineNumber: item.line || 1,
        startColumn: item.column || 1,
        endLineNumber: item.line || 1,
        endColumn: (item.column || 1) + 1,
        source: 'orbit-compiler',
      }));
    monaco.editor.setModelMarkers(model, 'orbit-build', markers);
  }

  clearMarkers(model) {
    if (model) monaco.editor.setModelMarkers(model, 'orbit-build', []);
  }

  setModelLanguage(model, language) {
    if (model && model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
  }

  async format() {
    const model = this.editor.getModel();
    if (!model) return { formatted: false };
    const language = model.getLanguageId();
    if (!['json', 'css', 'scss', 'less', 'html', 'typescript', 'javascript'].includes(language)) {
      return { formatted: false, changed: false, language };
    }
    const action = this.editor.getAction('editor.action.formatDocument');
    if (!action) return { formatted: false };
    const before = model.getValue();
    try {
      await action.run();
      const changed = model.getValue() !== before;
      return { formatted: true, changed, language };
    } catch {
      return { formatted: false, changed: false, language };
    }
  }

  focus() {
    this.editor.focus();
  }

  layout() {
    this.editor.layout();
  }

  getMonaco() {
    return monaco;
  }
}

export { monaco };

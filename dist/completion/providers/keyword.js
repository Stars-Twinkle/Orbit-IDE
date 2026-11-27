import { getWordRange, isVariableDeclarationContext } from '../context.js';

const CPP = `alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const const_cast consteval constexpr constinit continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq __alignof __asm __assume __based __cdecl __declspec __event __except __fastcall __finally __forceinline __hook __if_exists __if_not_exists __inline __int8 __int16 __int32 __int64 __interface __leave __m128 __m128d __m128i __m64 __multiple_inheritance __ptr32 __ptr64 __raise __restrict __single_inheritance __sptr __stdcall __super __thiscall __unaligned __unhook __uptr __uuidof __vectorcall __virtual_inheritance __w64 __wchar_t`.split(' ');

const C = `auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local alignas alignof bool constexpr false nullptr static_assert thread_local true typeof typeof_unqual`.split(' ');

const SETS = { cpp: new Set(CPP), c: new Set(C) };

export const keywordProvider = {
  id: 'keyword',
  languages: ['cpp', 'c'],
  priority: 50,
  triggerCharacters: [],
  provide({ model, position, language }) {
    if (isVariableDeclarationContext(model, position, SETS[language])) {
      return { suggestions: [] };
    }
    const range = getWordRange(model, position);
    return {
      suggestions: (language === 'cpp' ? CPP : C).map((keyword) => ({
        label: keyword,
        kind: 13, // Monaco CompletionItemKind.Keyword
        detail: language === 'cpp' ? 'C++ 关键字' : 'C 关键字',
        insertText: keyword,
        range,
        sortText: `5${keyword}`,
      })),
    };
  },
};

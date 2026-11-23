// LIFEOS internationalisation.
//  - English (`en`) is the source of truth; every other language is type-checked against it,
//    so a missing translation is a build error.
//  - Non-English dictionaries are lazy-loaded chunks bundled in the APK (work offline).
//  - `t(key, vars)` interpolates {placeholders}. Strings avoid plural forms on purpose.
import { en } from "./en";

export type TKey = keyof typeof en;
export type Dict = Record<TKey, string>;
export type LangCode = "en" | "zh" | "hi" | "es" | "ar" | "fr" | "bn" | "pt" | "ru" | "id";

/** The 10 most spoken languages in the world (total speakers). */
export const LANGUAGES: { code: LangCode; native: string; english: string; rtl?: boolean; intl: string }[] = [
  { code: "en", native: "English", english: "English", intl: "en" },
  { code: "zh", native: "中文（简体）", english: "Chinese (Simplified)", intl: "zh-CN" },
  { code: "hi", native: "हिन्दी", english: "Hindi", intl: "hi-IN" },
  { code: "es", native: "Español", english: "Spanish", intl: "es" },
  { code: "ar", native: "العربية", english: "Arabic", rtl: true, intl: "ar" },
  { code: "fr", native: "Français", english: "French", intl: "fr" },
  { code: "bn", native: "বাংলা", english: "Bengali", intl: "bn-BD" },
  { code: "pt", native: "Português (Brasil)", english: "Portuguese", intl: "pt-BR" },
  { code: "ru", native: "Русский", english: "Russian", intl: "ru" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", intl: "id" },
];

const loaders: Record<Exclude<LangCode, "en">, () => Promise<{ default: Dict }>> = {
  zh: () => import("./locales/zh"),
  hi: () => import("./locales/hi"),
  es: () => import("./locales/es"),
  ar: () => import("./locales/ar"),
  fr: () => import("./locales/fr"),
  bn: () => import("./locales/bn"),
  pt: () => import("./locales/pt"),
  ru: () => import("./locales/ru"),
  id: () => import("./locales/id"),
};

let dict: Dict = en;
let lang: LangCode = "en";

function isLang(x: string): x is LangCode {
  return LANGUAGES.some((l) => l.code === x);
}

/** "auto" follows the phone's language list; falls back to English. */
export function resolveLanguage(setting: string | undefined): LangCode {
  if (setting && setting !== "auto" && isLang(setting)) return setting;
  const prefs = typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const p of prefs) {
    const base = (p || "").toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return "en";
}

export async function loadLanguage(setting: string | undefined): Promise<LangCode> {
  const code = resolveLanguage(setting);
  if (code === "en") dict = en;
  else {
    try {
      dict = { ...en, ...(await loaders[code]()).default };
    } catch (e) {
      console.error("Could not load language", code, e);
      dict = en;
      lang = "en";
      applyDocument("en");
      return "en";
    }
  }
  lang = code;
  applyDocument(code);
  return code;
}

function applyDocument(code: LangCode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = LANGUAGES.find((l) => l.code === code)!.intl;
  document.documentElement.dir = isRtl(code) ? "rtl" : "ltr";
}

export function currentLanguage(): LangCode {
  return lang;
}

export function isRtl(code: LangCode = lang) {
  return !!LANGUAGES.find((l) => l.code === code)?.rtl;
}

/** BCP 47 tag for Intl (dates, weekdays, relative time). Latin digits keep numbers consistent app-wide. */
export function intlLocale(): string {
  const base = LANGUAGES.find((l) => l.code === lang)!.intl;
  return `${base}-u-nu-latn`;
}

export type Vars = Record<string, string | number>;

export function t(key: TKey, vars?: Vars): string {
  const s = dict[key] ?? en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Translate a key built at runtime (e.g. `cat.${category}`), falling back to the raw value. */
export function tDyn(key: string, fallback: string, vars?: Vars): string {
  return key in en ? t(key as TKey, vars) : fallback;
}

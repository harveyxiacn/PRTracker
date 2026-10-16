// Supported UI languages. `intl` is the locale used for dates/numbers/country names.
export interface LanguageInfo {
  code: string;
  /** Name in the language itself. */
  name: string;
  /** English name (for docs and search). */
  english: string;
  dir: 'ltr' | 'rtl';
  intl: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', english: 'English', dir: 'ltr', intl: 'en-CA' },
  { code: 'fr', name: 'Français', english: 'French', dir: 'ltr', intl: 'fr-CA' },
  { code: 'zh', name: '简体中文', english: 'Chinese (Simplified)', dir: 'ltr', intl: 'zh-CN' },
  { code: 'zh-Hant', name: '繁體中文', english: 'Chinese (Traditional)', dir: 'ltr', intl: 'zh-TW' },
  { code: 'es', name: 'Español', english: 'Spanish', dir: 'ltr', intl: 'es' },
  { code: 'pt', name: 'Português', english: 'Portuguese', dir: 'ltr', intl: 'pt-BR' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', dir: 'ltr', intl: 'hi-IN' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', english: 'Punjabi', dir: 'ltr', intl: 'pa-IN' },
  { code: 'tl', name: 'Tagalog', english: 'Tagalog/Filipino', dir: 'ltr', intl: 'fil-PH' },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr', intl: 'vi-VN' },
  { code: 'ko', name: '한국어', english: 'Korean', dir: 'ltr', intl: 'ko-KR' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali', dir: 'ltr', intl: 'bn-BD' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil', dir: 'ltr', intl: 'ta-IN' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati', dir: 'ltr', intl: 'gu-IN' },
  { code: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr', intl: 'ru-RU' },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', dir: 'ltr', intl: 'uk-UA' },
  { code: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl', intl: 'ar' },
  { code: 'fa', name: 'فارسی', english: 'Persian', dir: 'rtl', intl: 'fa-IR' },
  { code: 'ur', name: 'اردو', english: 'Urdu', dir: 'rtl', intl: 'ur-PK' },
];

export type Lang = string;

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Pick a supported language from the browser/OS preferences. */
export function matchLanguage(prefs: readonly string[]): string {
  for (const p of prefs) {
    const lower = p.toLowerCase();
    if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-Hant' : 'zh';
    if (lower.startsWith('fil')) return 'tl';
    const primary = lower.split('-')[0];
    const hit = LANGUAGES.find((l) => l.code === primary);
    if (hit) return hit.code;
  }
  return 'en';
}

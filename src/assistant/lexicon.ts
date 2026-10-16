// Per-language keyword lists for Maple. English and Chinese patterns live in engine.ts;
// every other language ships a lexicon with its locale file and registers it here.
// Matching is plain lower-case substring search, so lexicon entries should be short,
// distinctive phrases a user would actually type.

export type IntentId =
  | 'glossary' | 'log_return' | 'log_departure' | 'plan_target' | 'plan_best' | 'explain' | 'residency'
  | 'trips_query' | 'days_outside' | 'whatif' | 'faq' | 'pr_card' | 'citizenship' | 'application'
  | 'crs' | 'rules' | 'privacy' | 'summary' | 'documents' | 'doc_checklist' | 'history' | 'crs_plan' | 'household';

export interface Lexicon {
  /** Keywords per intent. */
  intents?: Partial<Record<IntentId, string[]>>;
  /** Duration units: number + unit, e.g. "3 meses". */
  units?: { day?: string[]; week?: string[]; month?: string[]; year?: string[] };
  /** Relative day words. */
  relative?: { today?: string[]; tomorrow?: string[]; yesterday?: string[]; nextMonth?: string[] };
  /** Data-query words. */
  query?: { longest?: string[]; shortest?: string[]; last?: string[]; next?: string[]; most?: string[]; count?: string[]; total?: string[] };
  /** Extra keywords per knowledge-base entry id. */
  kb?: Record<string, string[]>;
}

const registry = new Map<string, Lexicon>();

export function registerLexicon(lang: string, lex: Lexicon) {
  registry.set(lang, lex);
}

export function lexicons(): Lexicon[] {
  return [...registry.values()];
}

/** Does the (lower-cased) question contain any lexicon keyword for this intent? */
export function lexHas(q: string, intent: IntentId): boolean {
  for (const l of registry.values()) for (const w of l.intents?.[intent] ?? []) if (w && q.includes(w.toLowerCase())) return true;
  return false;
}

export function lexWords<K extends keyof NonNullable<Lexicon['query']>>(key: K): string[] {
  return lexicons().flatMap((l) => l.query?.[key] ?? []).map((w) => w.toLowerCase());
}

export function lexUnits(): Required<NonNullable<Lexicon['units']>> {
  const u = { day: [] as string[], week: [] as string[], month: [] as string[], year: [] as string[] };
  for (const l of registry.values()) for (const k of ['day', 'week', 'month', 'year'] as const) u[k].push(...(l.units?.[k] ?? []).map((w) => w.toLowerCase()));
  return u;
}

export function lexRelative(): Required<NonNullable<Lexicon['relative']>> {
  const r = { today: [] as string[], tomorrow: [] as string[], yesterday: [] as string[], nextMonth: [] as string[] };
  for (const l of registry.values()) for (const k of ['today', 'tomorrow', 'yesterday', 'nextMonth'] as const) r[k].push(...(l.relative?.[k] ?? []).map((w) => w.toLowerCase()));
  return r;
}

export function lexKb(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of registry.values()) for (const [id, words] of Object.entries(l.kb ?? {})) out[id] = [...(out[id] ?? []), ...words];
  return out;
}

/** Locales whose month names the date parser should recognise. */
const locales = new Set<string>(['en']);
export function registerLocale(code: string) {
  locales.add(code);
}
export function activeLocales(): string[] {
  return [...locales];
}

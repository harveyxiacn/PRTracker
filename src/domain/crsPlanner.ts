// CRS improvement planner: "which change raises my score most?"
// Every candidate change is scored with calculateCrs, so the planner never duplicates CRS tables.
// Estimates only; job-offer points were removed on 2025-03-25 and are never suggested.
import { calculateCrs, minClb, type CrsInput, type Education, type LanguageScores } from './crs';

export type ImprovementKind =
  | 'first_lang_up' // raise first official language to the next CLB level that adds points
  | 'first_lang_clb9' // reach CLB 9 in all abilities
  | 'first_lang_clb10'
  | 'second_lang' // take a French (or English) test: NCLC/CLB 7 all abilities
  | 'french_bonus' // NCLC 7+ French (25 or 50 points)
  | 'cdn_work_plus1' // one more year of Canadian skilled work
  | 'foreign_work_3' // reach 3 years of foreign work
  | 'education_up' // next education level (e.g. master's)
  | 'canadian_education' // Canadian post-secondary credential
  | 'spouse_lang' // spouse language test CLB 7/9
  | 'spouse_cdn_work' // spouse one year of Canadian work
  | 'pnp' // provincial nomination (+600)
  | 'cert_qualification'; // trades certificate of qualification

export interface Improvement {
  kind: ImprovementKind;
  /** The modified input that produces `score`. */
  input: CrsInput;
  score: number;
  delta: number;
  /** Rough effort: 'low' (a test retake), 'medium', 'high' (years of work/study). */
  effort: 'low' | 'medium' | 'high';
  /** i18n key `crsp.<kind>` + vars for the description. */
  vars: Record<string, string | number>;
}

export type Effort = Improvement['effort'];

/** Generation order. Used for de-duplication (first wins) and as the final sort tie-breaker. */
export const IMPROVEMENT_KINDS: ImprovementKind[] = [
  'french_bonus', 'first_lang_up', 'first_lang_clb9', 'first_lang_clb10', 'second_lang',
  'spouse_lang', 'pnp', 'cert_qualification', 'cdn_work_plus1', 'foreign_work_3',
  'education_up', 'canadian_education', 'spouse_cdn_work',
];

export const EFFORT: Record<ImprovementKind, Effort> = {
  first_lang_up: 'low', first_lang_clb9: 'low', first_lang_clb10: 'low', second_lang: 'low', french_bonus: 'low',
  spouse_lang: 'low', pnp: 'medium', cert_qualification: 'medium',
  cdn_work_plus1: 'high', foreign_work_3: 'high', education_up: 'high', canadian_education: 'high', spouse_cdn_work: 'high',
};
const EFFORT_RANK: Record<Effort, number> = { low: 0, medium: 1, high: 2 };

/** Education ladder, lowest to highest (same order as the CRS tables). */
export const EDUCATION_LADDER: Education[] = ['none', 'secondary', 'one_year', 'two_year', 'bachelor', 'two_or_more', 'master', 'phd'];

const ABILITIES = ['listening', 'reading', 'writing', 'speaking'] as const;
const atLeast = (l: LanguageScores | undefined, n: number): LanguageScores => {
  const out = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  for (const a of ABILITIES) out[a] = Math.max(l?.[a] ?? 0, n);
  return out;
};
const hasTest = (l?: LanguageScores) => !!l && ABILITIES.some((a) => (l[a] ?? 0) > 0);
const score = (i: CrsInput) => calculateCrs(i).totals.total;

type Step = { input: CrsInput; vars: Record<string, string | number> } | null;

/** Builds the single change `kind` on top of `input`, or null when it doesn't apply. */
function step(kind: ImprovementKind, input: CrsInput): Step {
  const fl = input.firstLanguage;
  const m = minClb(fl);
  switch (kind) {
    case 'first_lang_up': {
      if (m >= 10) return null;
      const base = score(input);
      // Smallest target level that adds points; every ability below it is raised to it.
      for (let to = Math.max(1, Math.floor(m) + 1); to <= 10; to++) {
        const next = { ...input, firstLanguage: atLeast(fl, to) };
        if (score(next) > base) return { input: next, vars: { from: m, to } };
      }
      return null;
    }
    case 'first_lang_clb9':
    case 'first_lang_clb10': {
      const to = kind === 'first_lang_clb9' ? 9 : 10;
      if (m >= to) return null;
      return { input: { ...input, firstLanguage: atLeast(fl, to) }, vars: { from: m, to } };
    }
    case 'second_lang': {
      if (hasTest(input.secondLanguage)) return null;
      return { input: { ...input, secondLanguage: atLeast(undefined, 7) }, vars: { to: 7 } };
    }
    case 'french_bonus': {
      if (calculateCrs(input).additional.french > 0) return null;
      if (input.firstLanguageIsFrench) {
        if (m >= 7) return null;
        return { input: { ...input, firstLanguage: atLeast(fl, 7) }, vars: { from: m, to: 7 } };
      }
      const from = minClb(input.secondLanguage);
      if (from >= 7) return null;
      return { input: { ...input, secondLanguage: atLeast(input.secondLanguage, 7) }, vars: { from, to: 7 } };
    }
    case 'cdn_work_plus1': {
      const from = Math.floor(input.canadianWorkYears);
      if (from >= 5) return null;
      return { input: { ...input, canadianWorkYears: from + 1 }, vars: { from, to: from + 1 } };
    }
    case 'foreign_work_3': {
      const from = Math.floor(input.foreignWorkYears);
      if (from < 1 || from > 2) return null;
      return { input: { ...input, foreignWorkYears: 3 }, vars: { from, to: 3 } };
    }
    case 'education_up': {
      const idx = EDUCATION_LADDER.indexOf(input.education);
      if (idx < 0 || idx >= EDUCATION_LADDER.length - 1) return null;
      const to = EDUCATION_LADDER[idx + 1];
      return { input: { ...input, education: to }, vars: { from: input.education, to } };
    }
    case 'canadian_education': {
      if (input.canadianEducation === 3) return null;
      const to: 1 | 3 = input.canadianEducation === 1 ? 3 : 1;
      return { input: { ...input, canadianEducation: to }, vars: { from: input.canadianEducation, to } };
    }
    case 'spouse_lang': {
      if (!input.hasSpouse || !input.spouse) return null;
      const from = minClb(input.spouse.language);
      const to = from < 7 ? 7 : from < 9 ? 9 : 0;
      if (!to) return null;
      return { input: { ...input, spouse: { ...input.spouse, language: atLeast(input.spouse.language, to) } }, vars: { from, to } };
    }
    case 'spouse_cdn_work': {
      if (!input.hasSpouse || !input.spouse) return null;
      const from = Math.floor(input.spouse.canadianWorkYears);
      if (from >= 5) return null;
      return { input: { ...input, spouse: { ...input.spouse, canadianWorkYears: from + 1 } }, vars: { from, to: from + 1 } };
    }
    case 'pnp':
      return input.provincialNomination ? null : { input: { ...input, provincialNomination: true }, vars: {} };
    case 'cert_qualification':
      if (input.certificateOfQualification || m < 5) return null;
      return { input: { ...input, certificateOfQualification: true }, vars: {} };
  }
}

/** All applicable single changes with delta > 0, sorted by delta desc (ties: lower effort first). */
export function improvements(input: CrsInput): Improvement[] {
  const base = score(input);
  const seen = new Set<string>();
  const out: Improvement[] = [];
  for (const kind of IMPROVEMENT_KINDS) {
    const s = step(kind, input);
    if (!s) continue;
    // Identical changes appear once (e.g. "next level" is CLB 9, or a first test is a French test).
    const key = JSON.stringify(s.input);
    if (seen.has(key)) continue;
    const sc = score(s.input);
    const delta = sc - base;
    if (delta <= 0) continue;
    seen.add(key);
    out.push({ kind, input: s.input, score: sc, delta, effort: EFFORT[kind], vars: { ...s.vars, delta } });
  }
  const order = (k: ImprovementKind) => IMPROVEMENT_KINDS.indexOf(k);
  return out.sort((a, b) => b.delta - a.delta || EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort] || order(a.kind) - order(b.kind));
}

/** Combined effect of several chosen improvements (applied in order). */
export function combine(input: CrsInput, kinds: ImprovementKind[]): { input: CrsInput; score: number } {
  let cur = input;
  for (const kind of kinds) {
    const s = step(kind, cur);
    if (s) cur = s.input;
  }
  return { input: cur, score: score(cur) };
}

/** Localised one-line description of an improvement (shared by the planner card and Maple). */
export function describeImprovement(x: Improvement, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const vars = { ...x.vars };
  if (x.kind === 'education_up') vars.to = t(`edu.${x.vars.to}`);
  if (x.kind === 'canadian_education') vars.years = t(`crsp.canadian_education.${x.vars.to}`);
  return t(`crsp.${x.kind}`, vars);
}

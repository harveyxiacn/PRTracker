// Express Entry draw categories and "how do I compare?" logic.
import type { Draw } from '../data/remote';

export type DrawCategory =
  | 'general' | 'cec' | 'fsw' | 'fst' | 'pnp' | 'french' | 'healthcare' | 'stem' | 'trades' | 'education'
  | 'transport' | 'agriculture' | 'physicians' | 'research' | 'senior_managers' | 'military' | 'other';

const RULES: [DrawCategory, RegExp][] = [
  ['general', /no program specified|general/i],
  ['cec', /canadian experience/i],
  ['fsw', /federal skilled worker/i],
  ['fst', /skilled trades program|federal skilled trades/i],
  ['pnp', /provincial nominee/i],
  ['french', /french/i],
  ['physicians', /physician|doctor/i],
  ['healthcare', /health/i],
  ['stem', /\bstem\b|science, technology/i],
  ['trades', /trade/i],
  ['education', /education/i],
  ['transport', /transport/i],
  ['agriculture', /agricult|agri-food/i],
  ['research', /research/i],
  ['senior_managers', /senior manag/i],
  ['military', /military|armed forces/i],
];

export function drawCategory(name: string): DrawCategory {
  return RULES.find(([, re]) => re.test(name))?.[0] ?? 'other';
}

/**
 * Categories where eligibility depends on occupation; the user ticks them. Current 2026
 * categories (IRCC category-based selection page, 2026-06-22). 'agriculture' is a past category:
 * still recognised in old draws (label "past category") but no longer offered as a choice.
 */
export const OCCUPATION_CATEGORIES: DrawCategory[] = ['healthcare', 'stem', 'trades', 'education', 'transport', 'physicians', 'research', 'senior_managers', 'military'];

export interface CategoryStanding {
  category: DrawCategory;
  latest: Draw;
  /** Your score minus the cutoff. */
  margin: number;
  /** Draws in this category in the last 12 months. */
  count12m: number;
  /** Lowest cutoff in the last 12 months. */
  min12m: number;
}

/** Latest draw per category the user is eligible for, compared with their score. */
export function standings(draws: Draw[], eligible: Set<DrawCategory>, score: number, today: string): CategoryStanding[] {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const byCat = new Map<DrawCategory, Draw[]>();
  for (const d of draws) {
    const c = drawCategory(d.name);
    if (!eligible.has(c) && c !== 'general') continue;
    byCat.set(c, [...(byCat.get(c) ?? []), d]);
  }
  const out: CategoryStanding[] = [];
  for (const [category, list] of byCat) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const recent = sorted.filter((d) => d.date >= yearAgo);
    out.push({
      category,
      latest: sorted[0],
      margin: score - sorted[0].crs,
      count12m: recent.length,
      min12m: recent.length ? Math.min(...recent.map((d) => d.crs)) : sorted[0].crs,
    });
  }
  return out.sort((a, b) => b.margin - a.margin);
}

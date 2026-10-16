import { describe, expect, it } from 'vitest';
import { calculateCrs, type CrsInput } from './crs';
import { combine, improvements, type ImprovementKind } from './crsPlanner';

const clb = (n: number) => ({ listening: n, reading: n, writing: n, speaking: n });
const total = (i: CrsInput) => calculateCrs(i).totals.total;
const byKind = (i: CrsInput) => Object.fromEntries(improvements(i).map((x) => [x.kind, x]));

// Single, 29, bachelor, CLB 7, 1 year Canadian work.
// age 110 + education 120 + language 4×17=68 + Cdn work 40
// + transferability (edu+lang CLB7 13, edu+Cdn work 1y 13) 26 = 364
const single: CrsInput = {
  age: 29, hasSpouse: false, education: 'bachelor', firstLanguage: clb(7),
  canadianWorkYears: 1, foreignWorkYears: 0, certificateOfQualification: false,
  provincialNomination: false, siblingInCanada: false, canadianEducation: 0,
};

// French first language NCLC 6, single, 29, bachelor, no work.
// age 110 + education 120 + language 4×9=36, transferability 0 (CLB < 7) = 266
const francophone: CrsInput = { ...single, firstLanguage: clb(6), firstLanguageIsFrench: true, canadianWorkYears: 0 };

// With spouse: 31, bachelor, CLB 8, 2y Cdn work; spouse bachelor, CLB 5, no Cdn work.
// age 90 + edu 112 + lang 4×22=88 + Cdn work 46 = 336; spouse edu 8 + lang 4×1=4 = 12;
// transferability: edu+lang (CLB7-8) 13 + edu+Cdn work 2y 25 = 38. Total 386.
const couple: CrsInput = {
  ...single, age: 31, hasSpouse: true, firstLanguage: clb(8), canadianWorkYears: 2,
  spouse: { education: 'bachelor', language: clb(5), canadianWorkYears: 0 },
};

describe('crsPlanner improvements', () => {
  it('fixtures match the hand-computed totals', () => {
    expect(total(single)).toBe(364);
    expect(total(francophone)).toBe(266);
    expect(total(couple)).toBe(386);
  });

  it('scores each change for a single CLB 7 candidate', () => {
    const k = byKind(single);
    // CLB 8: 4×(23-17)=+24, no transferability change (still CLB 7-8).
    expect(k.first_lang_up).toMatchObject({ delta: 24, score: 388, effort: 'low', vars: { from: 7, to: 8, delta: 24 } });
    // CLB 9: 4×(31-17)=+56, edu+lang 13→25 (+12) = +68.
    expect(k.first_lang_clb9).toMatchObject({ delta: 68, vars: { from: 7, to: 9 } });
    // CLB 10: 4×(34-17)=+68, +12 = +80.
    expect(k.first_lang_clb10.delta).toBe(80);
    // French NCLC 7: second language 4×3=12 + French bonus with English CLB 5+ 50 = +62.
    expect(k.french_bonus).toMatchObject({ delta: 62, effort: 'low' });
    expect(k.french_bonus.input.secondLanguage).toEqual(clb(7));
    // second_lang is the same change (a French test) and is listed once, as french_bonus.
    expect(k.second_lang).toBeUndefined();
    expect(k.pnp).toMatchObject({ delta: 600, effort: 'medium' });
    // Certificate with CLB 7+: 50; transferability 26+50=76 (< 100 cap).
    expect(k.cert_qualification).toMatchObject({ delta: 50, effort: 'medium' });
    // Cdn work 2y: 40→53 (+13), edu+Cdn work 13→25 (+12) = +25.
    expect(k.cdn_work_plus1).toMatchObject({ delta: 25, effort: 'high', vars: { from: 1, to: 2 } });
    // two_or_more: 120→128 (+8), edu+lang 13→25, edu+work 13→25 => edu factor 26→50 (+24) = +32.
    expect(k.education_up).toMatchObject({ delta: 32, vars: { from: 'bachelor', to: 'two_or_more' } });
    // Canadian 1-2 year credential: +15.
    expect(k.canadian_education).toMatchObject({ delta: 15, vars: { from: 0, to: 1 } });
    // No foreign work (0 years): not offered.
    expect(k.foreign_work_3).toBeUndefined();
  });

  it('sorts by delta, then effort', () => {
    expect(improvements(single).map((x) => x.kind)).toEqual([
      'pnp', 'first_lang_clb10', 'first_lang_clb9', 'french_bonus', 'cert_qualification',
      'education_up', 'cdn_work_plus1', 'first_lang_up', 'canadian_education',
    ]);
    const rank = { low: 0, medium: 1, high: 2 };
    for (const input of [single, francophone, couple]) {
      const list = improvements(input);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        expect(a.delta > b.delta || (a.delta === b.delta && rank[a.effort] <= rank[b.effort])).toBe(true);
      }
    }
  });

  it('breaks delta ties by lower effort', () => {
    // Single 29, secondary, CLB 6, 1y Cdn work, 1y foreign work.
    // 110 + 30 + 4×9=36 + 40 = 216; transferability: no post-secondary, CLB < 7,
    // foreign 1-2y + Cdn 1y = 13. Total 229.
    const i: CrsInput = { ...single, education: 'secondary', firstLanguage: clb(6), foreignWorkYears: 1 };
    expect(total(i)).toBe(229);
    const list = improvements(i);
    // Certificate at CLB 5-6: +25 (medium). Cdn work 2y: 40→53 (+13), foreign+Cdn 13→25 (+12) = +25 (high).
    const cert = list.findIndex((x) => x.kind === 'cert_qualification');
    const work = list.findIndex((x) => x.kind === 'cdn_work_plus1');
    expect(list[cert]).toMatchObject({ delta: 25, effort: 'medium' });
    expect(list[work]).toMatchObject({ delta: 25, effort: 'high' });
    expect(work).toBe(cert + 1);
    // CLB 7 (next level that adds points): 4×(17-9)=+32, foreign+lang 0→13 = +45.
    expect(list.find((x) => x.kind === 'first_lang_up')).toMatchObject({ delta: 45, vars: { from: 6, to: 7 } });
  });

  it('skips language levels that add no points', () => {
    // CLB 4 → 5 is worth nothing (both 6 per ability), so the next step is CLB 6: 4×(9-6) = +12.
    const k = byKind({ ...single, firstLanguage: clb(4) });
    expect(k.first_lang_up).toMatchObject({ delta: 12, vars: { from: 4, to: 6 } });
  });

  it('handles a French first language', () => {
    const k = byKind(francophone);
    // NCLC 7: language 4×(17-9)=+32, edu+lang +13, French bonus (no English test) 25 = +70.
    expect(k.french_bonus).toMatchObject({ delta: 70, vars: { from: 6, to: 7 } });
    expect(k.french_bonus.input.firstLanguage).toEqual(clb(7));
    // first_lang_up to 7 is the identical change, listed once as french_bonus.
    expect(k.first_lang_up).toBeUndefined();
    // English CLB 7: second language 4×3 = +12 (French still < 7, no bonus).
    expect(k.second_lang.delta).toBe(12);
    // CLB 9: 4×(31-9)=88, edu+lang 25, bonus 25 = +138.
    expect(k.first_lang_clb9.delta).toBe(138);
    // Certificate with CLB 5-6: +25.
    expect(k.cert_qualification.delta).toBe(25);
    // Cdn work 0→1: 40 + edu+work 13 = +53.
    expect(k.cdn_work_plus1.delta).toBe(53);
    // two_or_more: +8 core, no transferability (CLB < 7, no Cdn work).
    expect(k.education_up.delta).toBe(8);
  });

  it('no French bonus suggestion once it is earned', () => {
    const i: CrsInput = { ...single, secondLanguage: clb(7) };
    expect(calculateCrs(i).additional.french).toBe(50);
    const k = byKind(i);
    expect(k.french_bonus).toBeUndefined();
    expect(k.second_lang).toBeUndefined();
  });

  it('offers foreign work only at 1-2 years', () => {
    // 1y foreign, CLB 7, 1y Cdn work: foreign+lang 13, foreign+Cdn 13 = 26.
    // At 3y: 25 + 25 = 50 → +24.
    const i: CrsInput = { ...single, foreignWorkYears: 1 };
    expect(byKind(i).foreign_work_3).toMatchObject({ delta: 24, effort: 'high', vars: { from: 1, to: 3 } });
    expect(byKind({ ...single, foreignWorkYears: 3 }).foreign_work_3).toBeUndefined();
    expect(byKind({ ...single, foreignWorkYears: 0 }).foreign_work_3).toBeUndefined();
  });

  it('caps Canadian work, education and Canadian study', () => {
    const top: CrsInput = { ...single, canadianWorkYears: 5, education: 'phd', canadianEducation: 3 };
    const k = byKind(top);
    expect(k.cdn_work_plus1).toBeUndefined();
    expect(k.education_up).toBeUndefined();
    expect(k.canadian_education).toBeUndefined();
    // 1-2 year Canadian credential → 3+ years: 15→30 = +15.
    expect(byKind({ ...single, canadianEducation: 1 }).canadian_education).toMatchObject({ delta: 15, vars: { from: 1, to: 3 } });
    // Cdn work 4→5: 72→80 = +8 (transferability already maxed at 2y).
    expect(byKind({ ...single, canadianWorkYears: 4 }).cdn_work_plus1.delta).toBe(8);
  });

  it('filters out zero-delta changes', () => {
    // Master's, CLB 9, 1y Cdn work, 3y foreign: transferability already 100 (capped).
    const i: CrsInput = { ...single, education: 'master', firstLanguage: clb(9), foreignWorkYears: 3 };
    expect(total(i)).toBe(509);
    const k = byKind(i);
    expect(k.cert_qualification).toBeUndefined();
    // first_lang_up: CLB 10 = 4×3 = +12; clb9 already met.
    expect(k.first_lang_up).toMatchObject({ delta: 12, vars: { from: 9, to: 10 } });
    expect(k.first_lang_clb9).toBeUndefined();
    expect(k.first_lang_clb10).toBeUndefined(); // identical to first_lang_up
    // Cdn work 2y: 40→53 = +13 only (transferability capped).
    expect(k.cdn_work_plus1.delta).toBe(13);
    expect(improvements(i).every((x) => x.delta > 0)).toBe(true);
  });

  it('omits the certificate below CLB 5 and PNP once nominated', () => {
    const i: CrsInput = { ...single, firstLanguage: clb(4), provincialNomination: true };
    const k = byKind(i);
    expect(k.cert_qualification).toBeUndefined();
    expect(k.pnp).toBeUndefined();
  });

  it('spouse changes only for applicants with a spouse', () => {
    const k = byKind(couple);
    // Spouse CLB 5 → 7: 4×(3-1) = +8, then a second step to CLB 9.
    expect(k.spouse_lang).toMatchObject({ delta: 8, effort: 'low', vars: { from: 5, to: 7 } });
    expect(k.spouse_cdn_work).toMatchObject({ delta: 5, effort: 'high', vars: { from: 0, to: 1 } });
    const spouse9 = byKind({ ...couple, spouse: { ...couple.spouse!, language: clb(7) } });
    // CLB 7 → 9: 4×(5-3) = +8.
    expect(spouse9.spouse_lang).toMatchObject({ delta: 8, vars: { from: 7, to: 9 } });

    for (const kind of ['spouse_lang', 'spouse_cdn_work'] as ImprovementKind[]) {
      expect(byKind(single)[kind]).toBeUndefined();
      // A leftover spouse object without hasSpouse does not count either.
      expect(byKind({ ...couple, hasSpouse: false })[kind]).toBeUndefined();
    }
  });
});

describe('crsPlanner combine', () => {
  it('returns the input unchanged for no kinds', () => {
    expect(combine(single, [])).toEqual({ input: single, score: 364 });
  });

  it('applies changes in order on the modified input', () => {
    // CLB 9 (lang 124, edu+lang 25) + Cdn work 2y (53, edu+work 25): edu factor 50.
    // 110 + 120 + 124 + 53 + 50 = 457.
    expect(combine(single, ['first_lang_clb9', 'cdn_work_plus1']).score).toBe(457);
    // Each step recomputes: first_lang_up twice = CLB 8 then CLB 9 = 364 + 68.
    const twice = combine(single, ['first_lang_up', 'first_lang_up']);
    expect(twice.input.firstLanguage).toEqual(clb(9));
    expect(twice.score).toBe(432);
    // Spouse language twice: CLB 7 then 9 = 4×5 = 20 (+16).
    expect(combine(couple, ['spouse_lang', 'spouse_lang']).score).toBe(402);
  });

  it('skips kinds that no longer apply', () => {
    // After CLB 10, first_lang_clb9 has nothing to do.
    const r = combine(single, ['first_lang_clb10', 'first_lang_clb9', 'pnp']);
    expect(r.score).toBe(364 + 80 + 600);
    // Spouse kinds ignored for singles.
    expect(combine(single, ['spouse_lang', 'spouse_cdn_work']).score).toBe(364);
  });

  it('does not mutate the input', () => {
    const copy = JSON.parse(JSON.stringify(couple));
    combine(couple, ['first_lang_clb10', 'spouse_lang', 'education_up', 'canadian_education']);
    improvements(couple);
    expect(couple).toEqual(copy);
  });
});

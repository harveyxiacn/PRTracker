import { describe, expect, it } from 'vitest';
import { agePoints, calculateCrs, checkPrograms, fswPoints, ieltsToClb, toClb, type EligibilityInput } from './crs';

const clb = (n: number) => ({ listening: n, reading: n, writing: n, speaking: n });

describe('CRS', () => {
  it('scores a single CEC candidate', () => {
    const r = calculateCrs({
      age: 29, hasSpouse: false, education: 'master', firstLanguage: clb(9),
      canadianWorkYears: 1, foreignWorkYears: 3, certificateOfQualification: false,
      provincialNomination: false, siblingInCanada: false, canadianEducation: 0,
    });
    expect(r.core).toEqual({ age: 110, education: 135, language: 124, secondLanguage: 0, canadianWork: 40 });
    expect(r.totals.transferability).toBe(100);
    expect(r.totals.total).toBe(509);
  });

  it('uses the with-spouse tables and spouse factors', () => {
    const r = calculateCrs({
      age: 31, hasSpouse: true, education: 'bachelor', firstLanguage: clb(8),
      canadianWorkYears: 2, foreignWorkYears: 0, certificateOfQualification: false,
      spouse: { education: 'bachelor', language: clb(7), canadianWorkYears: 1 },
      provincialNomination: false, siblingInCanada: true, canadianEducation: 3,
    });
    expect(r.core.age).toBe(90);
    expect(r.core.education).toBe(112);
    expect(r.core.language).toBe(88);
    expect(r.core.canadianWork).toBe(46);
    expect(r.spouse).toEqual({ education: 8, language: 12, canadianWork: 5 });
    // education+language (CLB7-8, bachelor) 13 + education+Cdn work (2y) 25
    expect(r.transferability.education).toBe(38);
    expect(r.additional).toEqual({ pnp: 0, canadianEducation: 30, french: 0, sibling: 15 });
    expect(r.totals.total).toBe(90 + 112 + 88 + 46 + 25 + 38 + 45);
  });

  it('awards French bonus and PNP', () => {
    const r = calculateCrs({
      age: 46, hasSpouse: false, education: 'secondary', firstLanguage: clb(5), secondLanguage: clb(7),
      canadianWorkYears: 0, foreignWorkYears: 0, certificateOfQualification: false,
      provincialNomination: true, siblingInCanada: false, canadianEducation: 0,
    });
    expect(r.additional.french).toBe(50);
    expect(r.additional.pnp).toBe(600);
    expect(r.core.age).toBe(0);
  });

  it('age table edges', () => {
    expect(agePoints(17, false)).toBe(0);
    expect(agePoints(20, false)).toBe(110);
    expect(agePoints(29, true)).toBe(100);
    expect(agePoints(44, false)).toBe(6);
    expect(agePoints(45, false)).toBe(0);
  });

  it('converts IELTS General to CLB', () => {
    expect(toClb('ielts', { listening: 8, reading: 7, writing: 7, speaking: 7 })).toEqual(clb(9));
    expect(ieltsToClb('reading', 6.5)).toBe(8);
    expect(ieltsToClb('listening', 5.5)).toBe(6);
    expect(ieltsToClb('writing', 3)).toBe(0);
  });
});

describe('program eligibility', () => {
  const base: EligibilityInput = {
    firstLanguage: clb(7), teer: 1, canadianSkilledMonthsLast3y: 12, skilledMonthsLast10y: 12,
    tradesMonthsLast5y: 0, education: 'bachelor', hasEcaOrCanadianCredential: true, age: 30,
    hasJobOffer: false, certificateOfQualification: false,
    adaptability: { spouseLanguageClb4: false, pastStudyInCanada: false, spousePastStudyInCanada: false, pastWorkInCanada: true, spousePastWorkInCanada: false, relativeInCanada: false },
  };
  it('CEC needs 12 months of Canadian skilled work and CLB 7 for TEER 0/1', () => {
    expect(checkPrograms(base)[0].eligible).toBe(true);
    expect(checkPrograms({ ...base, canadianSkilledMonthsLast3y: 11 })[0].reasons).toContain('elig.reason.cecWork');
    expect(checkPrograms({ ...base, firstLanguage: clb(6) })[0].eligible).toBe(false);
    expect(checkPrograms({ ...base, firstLanguage: clb(5), teer: 2 })[0].eligible).toBe(true);
  });
  it('FSW 67-point grid', () => {
    // language 16 + education 21 + experience 9 + age 12 + adaptability 10 = 68
    expect(fswPoints(base)).toBe(68);
    const fsw = checkPrograms(base)[1];
    expect(fsw.eligible).toBe(true);
    expect(fsw.reasons).toContain('elig.note.funds');
    expect(checkPrograms({ ...base, adaptability: { ...base.adaptability, pastWorkInCanada: false } })[1].eligible).toBe(false);
  });
});

// The Eligibility screen's saved answers (AppData.eligibilityForm) and their mapping to the
// CRS calculator input. Shared by the Eligibility screen, the CRS planner and Maple.
import { toClb, type CrsInput, type Education, type LanguageScores, type TestKind } from './crs';
import type { DrawCategory } from './draws';

export interface CrsForm {
  tab: 'crs' | 'programs' | 'all';
  /** Occupation-based draw categories the user believes they qualify for. */
  drawCats: DrawCategory[];
  age: number;
  hasSpouse: boolean;
  education: Education;
  testKind: TestKind;
  lang1: LanguageScores;
  hasLang2: boolean;
  lang2: LanguageScores; // CLB/NCLC
  firstIsFrench: boolean;
  canadianWorkYears: number;
  foreignWorkYears: number;
  coq: boolean;
  spouseEducation: Education;
  spouseLang: LanguageScores;
  spouseCanadianWork: number;
  pnp: boolean;
  sibling: boolean;
  canadianEducation: 0 | 1 | 3;
  // programs
  teer: number;
  cdnSkilledMonths: number;
  skilledMonths10y: number;
  tradesMonths: number;
  eca: boolean;
  jobOffer: boolean;
  fundsExempt: boolean;
  adapt: Record<'spouseLanguageClb4' | 'pastStudyInCanada' | 'spousePastStudyInCanada' | 'pastWorkInCanada' | 'spousePastWorkInCanada' | 'relativeInCanada', boolean>;
}

const L = (n: number): LanguageScores => ({ listening: n, reading: n, writing: n, speaking: n });

export const CRS_FORM_DEFAULT: CrsForm = {
  tab: 'crs', drawCats: [], age: 29, hasSpouse: false, education: 'bachelor', testKind: 'ielts', lang1: { listening: 7, reading: 6.5, writing: 6.5, speaking: 6.5 },
  hasLang2: false, lang2: L(0), firstIsFrench: false, canadianWorkYears: 1, foreignWorkYears: 0, coq: false,
  spouseEducation: 'bachelor', spouseLang: L(0), spouseCanadianWork: 0, pnp: false, sibling: false, canadianEducation: 0,
  teer: 1, cdnSkilledMonths: 12, skilledMonths10y: 12, tradesMonths: 0, eca: true, jobOffer: false, fundsExempt: false,
  adapt: { spouseLanguageClb4: false, pastStudyInCanada: false, spousePastStudyInCanada: false, pastWorkInCanada: false, spousePastWorkInCanada: false, relativeInCanada: false },
};


/** Saved form (possibly partial or from an older version) merged over the defaults. */
export function readCrsForm(saved: unknown): CrsForm {
  return { ...CRS_FORM_DEFAULT, ...((saved as Partial<CrsForm> | undefined) ?? {}) };
}

export function formToCrsInput(f: CrsForm): CrsInput {
  return {
    age: f.age, hasSpouse: f.hasSpouse, education: f.education, firstLanguage: toClb(f.testKind, f.lang1),
    secondLanguage: f.hasLang2 ? f.lang2 : undefined, firstLanguageIsFrench: f.firstIsFrench,
    canadianWorkYears: f.canadianWorkYears, foreignWorkYears: f.foreignWorkYears, certificateOfQualification: f.coq,
    spouse: f.hasSpouse ? { education: f.spouseEducation, language: f.spouseLang, canadianWorkYears: f.spouseCanadianWork } : undefined,
    provincialNomination: f.pnp, siblingInCanada: f.sibling, canadianEducation: f.canadianEducation,
  };
}

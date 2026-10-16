// Express Entry: Comprehensive Ranking System (CRS) estimate and program eligibility checks.
// Points follow IRCC's published CRS criteria. Arranged-employment (job offer) points were
// removed on 2025-03-25 and are therefore not counted.
// This is an estimate for planning, not legal advice.

export type Education =
  | 'none'
  | 'secondary'
  | 'one_year'
  | 'two_year'
  | 'bachelor' // bachelor's or 3+ year program
  | 'two_or_more' // two or more credentials, one of them 3+ years
  | 'master' // master's or entry-to-practice professional degree
  | 'phd';

export interface LanguageScores {
  /** CLB/NCLC levels per ability. 0 = no test. */
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export interface CrsInput {
  age: number;
  hasSpouse: boolean; // spouse/partner coming to Canada and not a Canadian citizen/PR
  education: Education;
  firstLanguage: LanguageScores;
  secondLanguage?: LanguageScores;
  /** Is the first official language French? (affects the French bonus) */
  firstLanguageIsFrench?: boolean;
  canadianWorkYears: number;
  foreignWorkYears: number;
  certificateOfQualification: boolean;
  spouse?: {
    education: Education;
    language?: LanguageScores;
    canadianWorkYears: number;
  };
  provincialNomination: boolean;
  siblingInCanada: boolean;
  /** Canadian post-secondary study: 0 none, 1 = one or two years, 3 = three years or longer */
  canadianEducation: 0 | 1 | 3;
}

export interface CrsBreakdown {
  core: { age: number; education: number; language: number; secondLanguage: number; canadianWork: number };
  spouse: { education: number; language: number; canadianWork: number };
  transferability: { education: number; foreignWork: number; certificate: number };
  additional: { pnp: number; canadianEducation: number; french: number; sibling: number };
  totals: { core: number; spouse: number; transferability: number; additional: number; total: number };
}

const AGE_SINGLE: Record<number, number> = {
  18: 99, 19: 105, 30: 105, 31: 99, 32: 94, 33: 88, 34: 83, 35: 77, 36: 72, 37: 66, 38: 61, 39: 55,
  40: 50, 41: 39, 42: 28, 43: 17, 44: 6,
};
const AGE_SPOUSE: Record<number, number> = {
  18: 90, 19: 95, 30: 95, 31: 90, 32: 85, 33: 80, 34: 75, 35: 70, 36: 65, 37: 60, 38: 55, 39: 50,
  40: 45, 41: 35, 42: 25, 43: 15, 44: 5,
};

export function agePoints(age: number, spouse: boolean): number {
  if (age < 18 || age >= 45) return 0;
  if (age >= 20 && age <= 29) return spouse ? 100 : 110;
  return (spouse ? AGE_SPOUSE : AGE_SINGLE)[Math.floor(age)] ?? 0;
}

const EDU_SINGLE: Record<Education, number> = {
  none: 0, secondary: 30, one_year: 90, two_year: 98, bachelor: 120, two_or_more: 128, master: 135, phd: 150,
};
const EDU_SPOUSE: Record<Education, number> = {
  none: 0, secondary: 28, one_year: 84, two_year: 91, bachelor: 112, two_or_more: 119, master: 126, phd: 140,
};
const EDU_OF_SPOUSE: Record<Education, number> = {
  none: 0, secondary: 2, one_year: 6, two_year: 7, bachelor: 8, two_or_more: 9, master: 10, phd: 10,
};

export function educationPoints(e: Education, spouse: boolean): number {
  return (spouse ? EDU_SPOUSE : EDU_SINGLE)[e];
}

function firstLangAbility(clb: number, spouse: boolean): number {
  if (clb >= 10) return spouse ? 32 : 34;
  if (clb === 9) return spouse ? 29 : 31;
  if (clb === 8) return spouse ? 22 : 23;
  if (clb === 7) return spouse ? 16 : 17;
  if (clb === 6) return spouse ? 8 : 9;
  if (clb >= 4) return 6;
  return 0;
}

function secondLangAbility(clb: number): number {
  if (clb >= 9) return 6;
  if (clb >= 7) return 3;
  if (clb >= 5) return 1;
  return 0;
}

function spouseLangAbility(clb: number): number {
  if (clb >= 9) return 5;
  if (clb >= 7) return 3;
  if (clb >= 5) return 1;
  return 0;
}

const abilities = (l: LanguageScores) => [l.listening, l.reading, l.writing, l.speaking];
export const minClb = (l?: LanguageScores) => (l ? Math.min(...abilities(l)) : 0);

function canadianWorkPoints(years: number, spouse: boolean): number {
  const y = Math.min(5, Math.floor(years));
  const single = [0, 40, 53, 64, 72, 80];
  const withSp = [0, 35, 46, 56, 63, 70];
  return (spouse ? withSp : single)[y];
}

function spouseCanadianWork(years: number): number {
  return [0, 5, 7, 8, 9, 10][Math.min(5, Math.floor(years))];
}

const POST_SECONDARY: Education[] = ['one_year', 'two_year', 'bachelor', 'two_or_more', 'master', 'phd'];
const ADVANCED: Education[] = ['two_or_more', 'master', 'phd'];

export function calculateCrs(input: CrsInput): CrsBreakdown {
  const sp = input.hasSpouse;
  const fl = input.firstLanguage;
  const lang = abilities(fl).reduce((s, c) => s + firstLangAbility(c, sp), 0);
  const second = input.secondLanguage
    ? Math.min(sp ? 22 : 24, abilities(input.secondLanguage).reduce((s, c) => s + secondLangAbility(c), 0))
    : 0;
  const core = {
    age: agePoints(input.age, sp),
    education: educationPoints(input.education, sp),
    language: lang,
    secondLanguage: second,
    canadianWork: canadianWorkPoints(input.canadianWorkYears, sp),
  };

  const spouse = { education: 0, language: 0, canadianWork: 0 };
  if (sp && input.spouse) {
    spouse.education = EDU_OF_SPOUSE[input.spouse.education];
    spouse.language = input.spouse.language
      ? Math.min(20, abilities(input.spouse.language).reduce((s, c) => s + spouseLangAbility(c), 0))
      : 0;
    spouse.canadianWork = spouseCanadianWork(input.spouse.canadianWorkYears);
  }

  // Skill transferability (max 100).
  const m = minClb(fl);
  const lang7 = m >= 7;
  const lang9 = m >= 9;
  const hasPS = POST_SECONDARY.includes(input.education);
  const adv = ADVANCED.includes(input.education);
  const cw = Math.floor(input.canadianWorkYears);
  const fw = Math.floor(input.foreignWorkYears);

  let eduLang = 0;
  if (hasPS && lang9) eduLang = adv ? 50 : 25;
  else if (hasPS && lang7) eduLang = adv ? 25 : 13;
  let eduWork = 0;
  if (hasPS && cw >= 2) eduWork = adv ? 50 : 25;
  else if (hasPS && cw >= 1) eduWork = adv ? 25 : 13;
  const eduT = Math.min(50, eduLang + eduWork);

  let fwLang = 0;
  if (fw >= 3) fwLang = lang9 ? 50 : lang7 ? 25 : 0;
  else if (fw >= 1) fwLang = lang9 ? 25 : lang7 ? 13 : 0;
  let fwCdn = 0;
  if (fw >= 3) fwCdn = cw >= 2 ? 50 : cw >= 1 ? 25 : 0;
  else if (fw >= 1) fwCdn = cw >= 2 ? 25 : cw >= 1 ? 13 : 0;
  const fwT = Math.min(50, fwLang + fwCdn);

  let cert = 0;
  if (input.certificateOfQualification) cert = m >= 7 ? 50 : m >= 5 ? 25 : 0;

  const transferability = { education: eduT, foreignWork: fwT, certificate: cert };
  const transferTotal = Math.min(100, eduT + fwT + cert);

  // Additional points (max 600).
  const frenchScores = input.firstLanguageIsFrench ? fl : input.secondLanguage;
  const englishScores = input.firstLanguageIsFrench ? input.secondLanguage : fl;
  let french = 0;
  if (frenchScores && minClb(frenchScores) >= 7) french = minClb(englishScores) >= 5 ? 50 : 25;
  const additional = {
    pnp: input.provincialNomination ? 600 : 0,
    canadianEducation: input.canadianEducation === 3 ? 30 : input.canadianEducation === 1 ? 15 : 0,
    french,
    sibling: input.siblingInCanada ? 15 : 0,
  };
  const addTotal = Math.min(600, additional.pnp + additional.canadianEducation + additional.french + additional.sibling);

  const coreTotal = core.age + core.education + core.language + core.secondLanguage + core.canadianWork;
  const spouseTotal = spouse.education + spouse.language + spouse.canadianWork;
  return {
    core,
    spouse,
    transferability,
    additional,
    totals: {
      core: coreTotal,
      spouse: spouseTotal,
      transferability: transferTotal,
      additional: addTotal,
      total: coreTotal + spouseTotal + transferTotal + addTotal,
    },
  };
}

// ---------- Language test conversion ----------

export type TestKind = 'clb' | 'ielts' | 'celpip';

/** IELTS General Training -> CLB thresholds (listening, reading, writing, speaking). */
const IELTS: [number, number, number, number, number][] = [
  // clb, L, R, W, S
  [10, 8.5, 8, 7.5, 7.5],
  [9, 8, 7, 7, 7],
  [8, 7.5, 6.5, 6.5, 6.5],
  [7, 6, 6, 6, 6],
  [6, 5.5, 5, 5.5, 5.5],
  [5, 5, 4, 5, 5],
  [4, 4.5, 3.5, 4, 4],
];

export function ieltsToClb(ability: 'listening' | 'reading' | 'writing' | 'speaking', band: number): number {
  const col = { listening: 1, reading: 2, writing: 3, speaking: 4 }[ability];
  for (const row of IELTS) if (band >= row[col]) return row[0];
  return 0;
}

/** CELPIP-General level equals CLB level (capped at 10, below 4 = 0 for CRS). */
export function celpipToClb(level: number): number {
  if (level >= 10) return 10;
  return level >= 4 ? Math.floor(level) : 0;
}

export function toClb(kind: TestKind, raw: LanguageScores): LanguageScores {
  if (kind === 'clb') return raw;
  if (kind === 'celpip')
    return {
      listening: celpipToClb(raw.listening),
      reading: celpipToClb(raw.reading),
      writing: celpipToClb(raw.writing),
      speaking: celpipToClb(raw.speaking),
    };
  return {
    listening: ieltsToClb('listening', raw.listening),
    reading: ieltsToClb('reading', raw.reading),
    writing: ieltsToClb('writing', raw.writing),
    speaking: ieltsToClb('speaking', raw.speaking),
  };
}

// ---------- Program eligibility (minimum requirements) ----------

export interface EligibilityInput {
  firstLanguage: LanguageScores;
  /** Highest TEER of the skilled experience (0-3), or 4/5 if not skilled. */
  teer: number;
  /** Skilled Canadian work in the last 3 years, in months (full-time equivalent). */
  canadianSkilledMonthsLast3y: number;
  /** Continuous skilled foreign/any work in the last 10 years, in months. */
  skilledMonthsLast10y: number;
  /** Trades experience in the last 5 years, in months. */
  tradesMonthsLast5y: number;
  education: Education;
  hasEcaOrCanadianCredential: boolean;
  age: number;
  hasJobOffer: boolean;
  certificateOfQualification: boolean;
  adaptability: {
    spouseLanguageClb4: boolean;
    pastStudyInCanada: boolean;
    spousePastStudyInCanada: boolean;
    pastWorkInCanada: boolean;
    spousePastWorkInCanada: boolean;
    relativeInCanada: boolean;
  };
  secondLanguage?: LanguageScores;
  /** Authorized to work in Canada and has a valid job offer = exempt from proof of funds. */
  fundsExempt?: boolean;
}

export interface ProgramCheck {
  program: 'cec' | 'fsw' | 'fst';
  eligible: boolean;
  reasons: string[]; // i18n keys of unmet requirements
  points?: number; // FSW 100-point grid
}

const FSW_EDU: Record<Education, number> = {
  none: 0, secondary: 5, one_year: 15, two_year: 19, bachelor: 21, two_or_more: 22, master: 23, phd: 25,
};

export function fswPoints(i: EligibilityInput): number {
  const perAbility = (c: number) => (c >= 9 ? 6 : c === 8 ? 5 : c === 7 ? 4 : 0);
  const lang = Math.min(24, abilities(i.firstLanguage).reduce((s, c) => s + perAbility(c), 0)) +
    (i.secondLanguage && minClb(i.secondLanguage) >= 5 ? 4 : 0);
  const edu = FSW_EDU[i.education];
  const yrs = Math.floor(i.skilledMonthsLast10y / 12);
  const exp = yrs >= 6 ? 15 : yrs >= 4 ? 13 : yrs >= 2 ? 11 : yrs >= 1 ? 9 : 0;
  const a = Math.floor(i.age);
  const age = a >= 18 && a <= 35 ? 12 : a >= 36 && a <= 46 ? 47 - a : 0;
  const job = i.hasJobOffer ? 10 : 0;
  const ad = i.adaptability;
  const adapt = Math.min(
    10,
    (ad.spouseLanguageClb4 ? 5 : 0) +
      (ad.pastStudyInCanada ? 5 : 0) +
      (ad.spousePastStudyInCanada ? 5 : 0) +
      (ad.pastWorkInCanada ? 10 : 0) +
      (ad.spousePastWorkInCanada ? 5 : 0) +
      (i.hasJobOffer ? 5 : 0) +
      (ad.relativeInCanada ? 5 : 0),
  );
  return lang + edu + exp + age + job + adapt;
}

export function checkPrograms(i: EligibilityInput): ProgramCheck[] {
  const m = minClb(i.firstLanguage);
  const skilled = i.teer <= 3;

  const cec: string[] = [];
  if (!skilled) cec.push('elig.reason.notSkilled');
  if (i.canadianSkilledMonthsLast3y < 12) cec.push('elig.reason.cecWork');
  const cecClb = i.teer <= 1 ? 7 : 5;
  if (m < cecClb) cec.push(i.teer <= 1 ? 'elig.reason.clb7' : 'elig.reason.clb5');

  const fsw: string[] = [];
  if (!skilled) fsw.push('elig.reason.notSkilled');
  if (i.skilledMonthsLast10y < 12) fsw.push('elig.reason.fswWork');
  if (m < 7) fsw.push('elig.reason.clb7');
  if (!i.hasEcaOrCanadianCredential || i.education === 'none') fsw.push('elig.reason.eca');
  const pts = fswPoints(i);
  if (pts < 67) fsw.push('elig.reason.fsw67');
  if (!i.fundsExempt) fsw.push('elig.note.funds');

  const fst: string[] = [];
  if (i.tradesMonthsLast5y < 24) fst.push('elig.reason.fstWork');
  const l = i.firstLanguage;
  if (l.speaking < 5 || l.listening < 5 || l.reading < 4 || l.writing < 4) fst.push('elig.reason.fstLang');
  if (!i.hasJobOffer && !i.certificateOfQualification) fst.push('elig.reason.fstOffer');

  const blocking = (r: string[]) => r.filter((x) => !x.startsWith('elig.note.'));
  return [
    { program: 'cec', eligible: blocking(cec).length === 0, reasons: cec },
    { program: 'fsw', eligible: blocking(fsw).length === 0, reasons: fsw, points: pts },
    { program: 'fst', eligible: blocking(fst).length === 0, reasons: fst },
  ];
}

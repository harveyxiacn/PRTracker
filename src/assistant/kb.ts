// Maple's knowledge base: curated FAQ answers (i18n `kb.<id>`) with an official source, and a
// glossary of forum/IRCC jargon (i18n `gl.<term>`). Retrieval is keyword scoring, so no text
// is generated; answers are exactly what is written here, reviewed for accuracy.

import { lexHas } from './lexicon';

const IRCC = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/';

export interface KbEntry {
  id: string;
  /** English + Chinese keywords; other languages add theirs via the lexicon (`kb.<id>`). */
  keywords: string[];
  source: string;
  /** The question must also match this (e.g. citizenship context), or the entry is skipped. */
  requires?: RegExp;
}

export const KB: KbEntry[] = [
  { id: 'ro_spouse', keywords: ['citizen spouse', 'accompanying', 'spouse abroad', 'partner abroad', 'outside with my spouse', '陪同', '公民配偶'], source: 'https://laws-lois.justice.gc.ca/eng/acts/i-2.5/section-28.html' },
  { id: 'ro_employed', keywords: ['work abroad', 'employed abroad', 'canadian company abroad', 'posted abroad', 'assignment abroad', '外派', '海外工作'], source: 'https://laws-lois.justice.gc.ca/eng/acts/i-2.5/section-28.html' },
  { id: 'expired_card_cit', requires: /citizen|入籍|公民|國籍/, keywords: ['expired card', 'expired pr card', 'card expired', 'without card', '卡过期', '卡過期'], source: IRCC + 'canadian-citizenship/become-canadian-citizen/eligibility.html' },
  { id: 'travel_after_cit', keywords: ['travel after applying', 'after i apply', 'leave after applying', 'after submitting citizenship', '递交后出国', '申请后出国'], source: IRCC + 'canadian-citizenship/become-canadian-citizen/eligibility.html' },
  { id: 'prtd', keywords: ['prtd', 'travel document', 'expired while abroad', 'expired abroad', 'card expired abroad', 'stuck abroad', 'return without card', 'outside canada without', '旅行证件', '旅行證件', '回不来', '回不來', '在国外过期', '在國外過期'], source: IRCC + 'permanent-residents/travel-document.html' },
  { id: 'tax', keywords: ['tax', 'taxes', 'file taxes', 'income tax', '报税', '税'], source: IRCC + 'canadian-citizenship/become-canadian-citizen/eligibility.html' },
  { id: 'language', requires: /citizen|入籍|公民|test|考试|考試|clb/, keywords: ['language test', 'language proof', 'citizenship test', 'clb 4', 'knowledge test', '语言', '語言', '入籍考试', '入籍考試'], source: IRCC + 'canadian-citizenship/become-canadian-citizen/eligibility.html' },
  { id: 'biometrics_valid', keywords: ['biometrics valid', 'biometrics again', 'reuse biometrics', 'fingerprints valid', '指纹有效', '指纹多久'], source: IRCC + 'campaigns/biometrics.html' },
  { id: 'medical_valid', keywords: ['medical valid', 'medical expire', 'medical exam valid', 'ime valid', '体检有效', '体检过期'], source: IRCC + 'application/medical-police/medical-exams.html' },
  { id: 'police', keywords: ['police certificate', 'police clearance', 'pcc', '无犯罪', '无犯罪证明'], source: IRCC + 'immigrate-canada/express-entry/documents/police-certificates.html' },
  { id: 'pof', keywords: ['proof of funds', 'settlement funds', 'pof', 'money required', '资金证明'], source: IRCC + 'immigrate-canada/express-entry/documents/proof-funds.html' },
  { id: 'job_offer_points', keywords: ['job offer points', 'lmia points', 'arranged employment', 'job offer crs', '工作offer', '雇主担保加分'], source: IRCC + 'immigrate-canada/express-entry/check-score/crs-criteria.html' },
  { id: 'check_status', keywords: ['check status', 'application status', 'tracker', 'how to check', 'gcms', 'atip', '查进度', '查询进度'], source: IRCC + 'application/check-status.html' },
  { id: 'boundary', keywords: ['departure day', 'day i leave', 'return day', 'travel day count', '出境当天', '入境当天'], source: 'https://eservices.cic.gc.ca/rescalc/resCalcStartNew.do' },
  { id: 'half_day', keywords: ['half day', 'before pr count', 'work permit days count', 'student days count', 'pre-pr', '半天', 'pr之前'], source: IRCC + 'canadian-citizenship/become-canadian-citizen/eligibility.html' },
  { id: 'ro_new', keywords: ['less than 5 years', 'new pr', 'just landed', 'first five years', '不满5年', '刚登陆'], source: 'https://laws-lois.justice.gc.ca/eng/acts/i-2.5/section-28.html' },
  { id: 'card_renew', keywords: ['renew card', 'renewal', 'when to renew', 'card renewal', '续卡', '换卡'], source: IRCC + 'new-immigrants/pr-card/apply-renew-replace.html' },
  { id: 'bowp', keywords: ['bowp', 'bridging', 'work permit expiring', 'keep working while waiting', '过渡工签'], source: IRCC + 'work-canada/extend/eligibility.html' },
];

/** Glossary terms (matched as whole words, case-insensitive). */
export const GLOSSARY = [
  'aor', 'bil', 'ppr', 'copr', 'ecopr', 'gu', 'p1', 'p2', 'pvo', 'svo', 'ita', 'noi', 'eoi', 'crs', 'clb', 'nclc', 'eca', 'teer',
  'loe', 'uci', 'ime', 'mep', 'owp', 'sowp', 'bowp', 'pgwp', 'lmia', 'pnp', 'csq', 'gcms', 'prtd', 'fd',
] as const;

export type GlossaryTerm = (typeof GLOSSARY)[number];

/**
 * "What is AOR?", "AOR?", "AOR meaning", "AOR是什么" -> the glossary term, but only when the
 * question is essentially just about the term ("what is my CRS?" or "我的AOR是什么时候" are not).
 */
export function glossaryLookup(q: string): GlossaryTerm | undefined {
  const text = q.toLowerCase().replace(/[?？!！.。,，"“”'’]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const term of GLOSSARY) {
    const t = term;
    const patterns = [
      new RegExp(`^${t}$`),
      new RegExp(`^(what('s| is| does| are)|whats) (an? |the )?${t}( mean| stand for| stands for)?$`),
      new RegExp(`^${t} (meaning|means|mean|stands for|definition)$`),
      new RegExp(`^(meaning of|define) ${t}$`),
      new RegExp(`^${t} ?(是什么|是什麼|什么意思|什麼意思|啥意思|是啥|指什么|指什麼)( ?意思)?$`),
    ];
    if (patterns.some((re) => re.test(text))) return term;
  }
  return undefined;
}

/** Best FAQ entry for a question: keyword hits, longer phrases weigh more. */
export function kbSearch(q: string, extra: Record<string, string[]> = {}): KbEntry | undefined {
  const text = q.toLowerCase();
  let best: KbEntry | undefined;
  let bestScore = 0;
  for (const e of KB) {
    // Context can come from the built-in pattern or from any language's citizenship keywords.
    if (e.requires && !e.requires.test(text) && !lexHas(text, 'citizenship')) continue;
    let score = 0;
    for (const k of [...e.keywords, ...(extra[e.id] ?? [])]) {
      // Long phrases (≥8 Latin chars or ≥3 CJK/other chars) and IRCC acronyms count double.
      if (!k || !text.includes(k.toLowerCase())) continue;
      const nonLatin = /[^\x00-\x7f]/.test(k);
      score += (nonLatin ? k.length >= 3 : k.length >= 8) || /^(prtd|bowp|pof|pcc|atip|gcms)$/.test(k) ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore >= 2 ? best : undefined;
}

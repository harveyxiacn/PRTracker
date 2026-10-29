// CONTRACT (v0.3): Documents & expiries module — identity/status documents and test results
// with validity rules, per-program checklists and reminders. Metadata only: no files or
// document numbers are stored.
// Validity rules (verified on canada.ca, 2026-10-16):
//  • Language test results: must be less than 2 years old (Express Entry profile and PR application).
//  • ECA: accepted for 5 years from the issue date.
//  • Immigration medical exam: generally valid 12 months.
//  • Biometrics: valid 10 years for temporary residence; PR applicants give them every time.
// Implementation owner: documents agent. Keep every exported name and signature below.
import { addDays, addMonths, diffDays, type ISODate } from './dates';
import type { Reminder } from './insights';
import { PR_CARD_RENEWAL_DAYS } from './presence';
import { program } from './programs';

export type DocKind =
  | 'passport' | 'work_permit' | 'study_permit' | 'visitor_record' | 'trv' | 'language_test' | 'eca'
  | 'medical' | 'police_certificate' | 'biometrics' | 'copr' | 'pr_card_copy' | 'other';

export const DOC_KINDS: DocKind[] = [
  'passport', 'work_permit', 'study_permit', 'visitor_record', 'trv', 'language_test', 'eca',
  'medical', 'police_certificate', 'biometrics', 'copr', 'pr_card_copy', 'other',
];

export interface DocItem {
  id: string;
  kind: DocKind;
  /** Free label, e.g. "IELTS General", "Passport (spouse)". Never a document number. */
  label?: string;
  /** Whose document: 'me' | 'spouse' | 'child' | other free text. */
  holder?: string;
  issued?: ISODate | null;
  /** Printed expiry; for kinds with a validity rule, computed from `issued` when missing. */
  expires?: ISODate | null;
  /** ISO country (passport, police certificate). */
  country?: string;
  note?: string;
}

export interface DocumentsData {
  items: DocItem[];
  /** applicationId -> checklist item key -> done */
  checklist: Record<string, Record<string, boolean>>;
}

export type DocStatus = 'ok' | 'soon' | 'expired' | 'unknown';

export function emptyDocuments(): DocumentsData {
  return { items: [], checklist: {} };
}

/** Validity in months from `issued` for kinds with an IRCC validity rule. */
export const VALIDITY_MONTHS: Partial<Record<DocKind, number>> = {
  language_test: 24,
  eca: 60,
  medical: 12,
  biometrics: 120,
};

/** Warning lead time in months before the effective expiry ('soon' status, first reminder). */
export const LEAD_MONTHS: Record<DocKind, number> = {
  passport: 6,
  work_permit: 4,
  study_permit: 4,
  visitor_record: 4,
  trv: 2,
  language_test: 3,
  eca: 3,
  medical: 3,
  police_certificate: 3,
  biometrics: 3,
  copr: 2,
  // PR card: the warning starts when the renewal window opens (expiry − 270 days, see warnFrom).
  pr_card_copy: 9,
  other: 3,
};

/**
 * First warning day ('soon' status, first reminder). The PR card uses IRCC's renewal window,
 * expiry − 270 days (IMM 5444), not 9 calendar months; other kinds use LEAD_MONTHS.
 */
export function warnFrom(kind: DocKind, exp: ISODate): ISODate {
  return kind === 'pr_card_copy' ? addDays(exp, -PR_CARD_RENEWAL_DAYS) : addMonths(exp, -(LEAD_MONTHS[kind] ?? 3));
}

/** Days before expiry for the second, critical reminder. */
export const CRITICAL_DAYS = 30;

/** Expiry computed from the validity rule alone (ignores the printed expiry). */
export function ruleExpiry(item: Pick<DocItem, 'kind' | 'issued'>): ISODate | undefined {
  const months = VALIDITY_MONTHS[item.kind];
  return months && item.issued ? addMonths(item.issued, months) : undefined;
}

/** Printed expiry, or issued + validity rule (language 2y, ECA 5y, medical 12m, biometrics 10y). */
export function effectiveExpiry(item: DocItem): ISODate | undefined {
  return item.expires || ruleExpiry(item);
}

/** 'soon' = within the kind's warning lead time (e.g. passport 6 months, permits 4 months, tests 3 months). */
export function documentStatus(item: DocItem, today: ISODate): DocStatus {
  const exp = effectiveExpiry(item);
  if (!exp) return 'unknown';
  // A document is valid through its expiry date.
  if (exp < today) return 'expired';
  if (today >= warnFrom(item.kind, exp)) return 'soon';
  return 'ok';
}

/** Reminders (category 'documents') for upcoming expiries; i18n keys `doc.rem.*`. */
export function documentReminders(data: DocumentsData, today: ISODate): Reminder[] {
  const out: Reminder[] = [];
  for (const item of data.items) {
    const exp = effectiveExpiry(item);
    if (!exp || exp < today) continue;
    const lead = LEAD_MONTHS[item.kind] ?? 3;
    const title = `doc.rem.title.${item.kind}`;
    const warnDate = warnFrom(item.kind, exp);
    if (warnDate >= today) {
      out.push({
        id: `doc-${item.id}-${lead}m`, date: warnDate, category: 'documents', severity: 'warn',
        title, body: 'doc.rem.body', vars: { date: exp, days: diffDays(exp, warnDate) },
      });
    }
    const critDate = addDays(exp, -CRITICAL_DAYS);
    if (critDate >= today) {
      out.push({
        id: `doc-${item.id}-${CRITICAL_DAYS}d`, date: critDate, category: 'documents', severity: 'critical',
        title, body: 'doc.rem.bodyCritical', vars: { date: exp, days: CRITICAL_DAYS },
      });
    } else if (warnDate < today) {
      // Added inside the last 30 days before expiry: remind once, tomorrow.
      const tomorrow = addDays(today, 1);
      if (tomorrow <= exp)
        out.push({
          id: `doc-${item.id}-late`, date: tomorrow, category: 'documents', severity: 'critical',
          title, body: 'doc.rem.bodyCritical', vars: { date: exp, days: diffDays(exp, tomorrow) },
        });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// Checklists: common IRCC document lists, kept general. Keys map to i18n `doc.chk.<key>`.
const PR_BASE = ['passport', 'photos', 'national_id', 'birth_certificate', 'police_certificates', 'medical', 'travel_history'];
const EE_WORK = ['language_test', 'employment_letters', 'pay_stubs'];

const CHECKLISTS: Record<string, string[]> = {
  ee_cec: [...PR_BASE, ...EE_WORK, 'permit_copy'],
  ee_fsw: [...PR_BASE, ...EE_WORK, 'eca', 'proof_of_funds'],
  ee_fst: [...PR_BASE, ...EE_WORK, 'trade_certificate', 'proof_of_funds'],
  pnp_ee: [...PR_BASE, ...EE_WORK, 'nomination_certificate', 'permit_copy'],
  pnp_base: [...PR_BASE, ...EE_WORK, 'nomination_certificate', 'permit_copy'],
  qc_skilled: [...PR_BASE, 'csq', 'employment_letters', 'education_documents', 'permit_copy'],
  qc_peq: [...PR_BASE, 'csq', 'employment_letters', 'education_documents', 'permit_copy'],
  aip: [...PR_BASE, ...EE_WORK, 'eca', 'job_offer_letter', 'endorsement'],
  rcip: [...PR_BASE, ...EE_WORK, 'eca', 'job_offer_letter', 'community_recommendation'],
  fcip: [...PR_BASE, ...EE_WORK, 'eca', 'job_offer_letter', 'community_recommendation'],
  caregiver: [...PR_BASE, ...EE_WORK, 'eca', 'job_offer_letter', 'permit_copy'],
  startup: [...PR_BASE, 'language_test', 'letter_of_support', 'proof_of_funds', 'education_documents'],
  spousal_out: [...PR_BASE, 'marriage_certificate', 'relationship_proof', 'previous_marriage_documents', 'sponsor_documents'],
  spousal_in: [...PR_BASE, 'marriage_certificate', 'relationship_proof', 'previous_marriage_documents', 'sponsor_documents', 'permit_copy'],
  spousal: [...PR_BASE, 'marriage_certificate', 'relationship_proof', 'previous_marriage_documents', 'sponsor_documents'],
  child: [...PR_BASE, 'sponsor_documents'],
  pgp: [...PR_BASE, 'sponsor_documents', 'tax_documents'],
  protected: ['passport', 'photos', 'national_id', 'birth_certificate', 'medical', 'protected_decision'],
  hc: [...PR_BASE, 'hc_submissions'],
  study_permit: ['passport', 'photos', 'national_id', 'study_acceptance', 'pal', 'tuition_proof', 'financial_support', 'travel_history', 'police_certificates', 'medical'],
  study_ext: ['passport', 'photos', 'permit_copy', 'study_acceptance', 'tuition_proof', 'financial_support'],
  work_permit: ['passport', 'photos', 'national_id', 'job_offer_letter', 'education_documents', 'employment_letters', 'travel_history', 'police_certificates', 'medical'],
  work_ext: ['passport', 'photos', 'permit_copy', 'job_offer_letter', 'employment_letters', 'pay_stubs'],
  // Since 2024-11-01 PGWP applicants need a language test (CLB/NCLC 7 university, 5 college).
  pgwp: ['passport', 'photos', 'permit_copy', 'completion_letter', 'final_transcript', 'language_test'],
  owp_spouse: ['passport', 'photos', 'marriage_certificate', 'relationship_proof', 'spouse_documents', 'permit_copy'],
  visitor_visa: ['passport', 'photos', 'national_id', 'financial_support', 'travel_purpose', 'ties_home', 'travel_history'],
  super_visa: ['passport', 'photos', 'invitation_letter', 'host_income', 'medical_insurance', 'birth_certificate', 'medical', 'travel_history'],
  visitor_record: ['passport', 'photos', 'permit_copy', 'financial_support', 'travel_purpose'],
  // Citizenship: you declare tax filing (CRA verifies it); police certificates only in some cases.
  citizenship: ['passport', 'photos', 'pr_card_copy', 'id_documents', 'language_proof_cit', 'tax_filing_info', 'travel_history', 'police_if_required'],
  pr_card: ['pr_card_copy', 'photos_pr_card', 'passport', 'copr_copy', 'id_documents', 'travel_history'],
  prtd: ['passport', 'photos', 'pr_card_copy', 'copr_copy', 'travel_history'],
  other: ['passport', 'photos'],
};

/** Every checklist key used by any program (for i18n coverage). */
export const CHECKLIST_KEYS: string[] = [...new Set(Object.values(CHECKLISTS).flat())];

/** Checklist item keys for a program id (from programs.ts); i18n `doc.chk.<key>`. */
export function checklistFor(programId: string): string[] {
  return [...(CHECKLISTS[programId] ?? CHECKLISTS[program(programId).id] ?? CHECKLISTS.other)];
}

/** Soonest known expiries (expired ones included, with negative `days`), for Maple and Home. */
export function nextExpiries(data: DocumentsData, today: ISODate, n = 3): { item: DocItem; expires: ISODate; days: number; status: DocStatus }[] {
  return data.items
    .map((item) => ({ item, expires: effectiveExpiry(item) }))
    .filter((x): x is { item: DocItem; expires: ISODate } => !!x.expires)
    .map((x) => ({ ...x, days: diffDays(x.expires, today), status: documentStatus(x.item, today) }))
    .sort((a, b) => a.expires.localeCompare(b.expires) || a.item.id.localeCompare(b.item.id))
    .slice(0, Math.max(0, n));
}

import { describe, expect, it } from 'vitest';
import { documentsEn } from '../i18n/parts/documents';
import {
  CHECKLIST_KEYS, DOC_KINDS, checklistFor, documentReminders, documentStatus, effectiveExpiry, emptyDocuments, nextExpiries,
  type DocItem, type DocumentsData,
} from './documents';
import { PROGRAMS } from './programs';

const item = (p: Partial<DocItem>): DocItem => ({ id: 'x', kind: 'other', ...p });

describe('effectiveExpiry', () => {
  it('applies the validity rules from the issue/test date', () => {
    expect(effectiveExpiry(item({ kind: 'language_test', issued: '2025-03-10' }))).toBe('2027-03-10');
    expect(effectiveExpiry(item({ kind: 'eca', issued: '2024-02-29' }))).toBe('2029-02-28');
    expect(effectiveExpiry(item({ kind: 'medical', issued: '2026-01-31' }))).toBe('2027-01-31');
    expect(effectiveExpiry(item({ kind: 'biometrics', issued: '2020-05-01' }))).toBe('2030-05-01');
  });
  it('printed expiry wins when present', () => {
    expect(effectiveExpiry(item({ kind: 'language_test', issued: '2025-03-10', expires: '2026-12-01' }))).toBe('2026-12-01');
    expect(effectiveExpiry(item({ kind: 'medical', issued: '2026-01-31', expires: null }))).toBe('2027-01-31');
  });
  it('printed-expiry kinds and police certificates have no computed expiry', () => {
    expect(effectiveExpiry(item({ kind: 'passport', issued: '2020-01-01' }))).toBeUndefined();
    expect(effectiveExpiry(item({ kind: 'passport', expires: '2030-01-01' }))).toBe('2030-01-01');
    expect(effectiveExpiry(item({ kind: 'police_certificate', issued: '2026-01-01' }))).toBeUndefined();
    expect(effectiveExpiry(item({ kind: 'work_permit', expires: '2027-04-30' }))).toBe('2027-04-30');
    expect(effectiveExpiry(item({ kind: 'eca' }))).toBeUndefined();
  });
});

describe('documentStatus', () => {
  const today = '2026-10-16';
  it('passport: 6-month lead, boundaries exact', () => {
    // expires 2027-04-16 -> soon from 2026-10-16
    expect(documentStatus(item({ kind: 'passport', expires: '2027-04-16' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'passport', expires: '2027-04-17' }), today)).toBe('ok');
  });
  it('permits and visitor record: 4 months; TRV: 2 months', () => {
    expect(documentStatus(item({ kind: 'work_permit', expires: '2027-02-16' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'study_permit', expires: '2027-02-17' }), today)).toBe('ok');
    expect(documentStatus(item({ kind: 'visitor_record', expires: '2027-02-16' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'trv', expires: '2026-12-16' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'trv', expires: '2026-12-17' }), today)).toBe('ok');
  });
  it('PR card: soon when the IRCC renewal window opens (expiry − 270 days)', () => {
    expect(documentStatus(item({ kind: 'pr_card_copy', expires: '2027-07-13' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'pr_card_copy', expires: '2027-07-14' }), today)).toBe('ok');
  });
  it('tests: 3 months on the computed expiry', () => {
    // language test taken 2025-01-16 -> expires 2027-01-16 -> soon from 2026-10-16
    expect(documentStatus(item({ kind: 'language_test', issued: '2025-01-16' }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'language_test', issued: '2025-01-17' }), today)).toBe('ok');
    expect(documentStatus(item({ kind: 'medical', issued: '2026-01-16' }), today)).toBe('soon');
  });
  it('valid through the expiry day, expired the day after', () => {
    expect(documentStatus(item({ kind: 'passport', expires: today }), today)).toBe('soon');
    expect(documentStatus(item({ kind: 'passport', expires: '2026-10-15' }), today)).toBe('expired');
    expect(documentStatus(item({ kind: 'medical', issued: '2025-10-15' }), today)).toBe('expired');
    expect(documentStatus(item({ kind: 'medical', issued: '2025-10-16' }), today)).toBe('soon');
  });
  it('unknown without an expiry', () => {
    expect(documentStatus(item({ kind: 'police_certificate', issued: '2026-01-01' }), today)).toBe('unknown');
    expect(documentStatus(item({ kind: 'passport' }), today)).toBe('unknown');
    expect(documentStatus(item({ kind: 'police_certificate', expires: '2027-02-01' }), today)).toBe('ok');
  });
});

describe('documentReminders', () => {
  const today = '2026-10-16';
  it('creates a lead reminder and a 30-day reminder with stable ids', () => {
    const data: DocumentsData = { ...emptyDocuments(), items: [item({ id: 'p1', kind: 'passport', expires: '2027-06-30' })] };
    const r = documentReminders(data, today);
    expect(r.map((x) => [x.id, x.date, x.severity])).toEqual([
      ['doc-p1-6m', '2026-12-30', 'warn'],
      ['doc-p1-30d', '2027-05-31', 'critical'],
    ]);
    expect(r.every((x) => x.category === 'documents' && x.title === 'doc.rem.title.passport')).toBe(true);
    expect(r[0].vars).toEqual({ date: '2027-06-30', days: 182 });
    expect(r[1].vars).toEqual({ date: '2027-06-30', days: 30 });
    // Deterministic.
    expect(documentReminders(data, today)).toEqual(r);
  });
  it('skips reminder dates before today and expired items', () => {
    const data: DocumentsData = {
      ...emptyDocuments(),
      items: [
        item({ id: 'a', kind: 'passport', expires: '2026-12-01' }), // lead date passed, 30-day is 2026-11-01
        item({ id: 'b', kind: 'trv', expires: '2026-10-20' }), // both passed -> one "late" reminder tomorrow
        item({ id: 'c', kind: 'passport', expires: '2026-10-01' }), // expired
        item({ id: 'd', kind: 'police_certificate', issued: '2026-01-01' }), // no expiry
        item({ id: 'e', kind: 'medical', issued: '2026-03-01' }), // expires 2027-03-01
      ],
    };
    const r = documentReminders(data, today);
    expect(r.map((x) => [x.id, x.date])).toEqual([
      ['doc-b-late', '2026-10-17'],
      ['doc-a-30d', '2026-11-01'],
      ['doc-e-3m', '2026-12-01'],
      ['doc-e-30d', '2027-01-30'],
    ]);
    expect(r.every((x) => x.date >= today)).toBe(true);
  });
  it('includes a reminder dated today', () => {
    const data: DocumentsData = { ...emptyDocuments(), items: [item({ id: 't', kind: 'trv', expires: '2026-11-15' })] };
    expect(documentReminders(data, today).map((x) => [x.id, x.date])).toEqual([['doc-t-30d', '2026-10-16']]);
  });
});

describe('checklistFor', () => {
  it('program-specific items', () => {
    expect(checklistFor('ee_cec')).not.toContain('proof_of_funds');
    expect(checklistFor('ee_fsw')).toContain('proof_of_funds');
    expect(checklistFor('ee_fsw')).toContain('eca');
    expect(checklistFor('ee_fst')).toContain('proof_of_funds');
    expect(checklistFor('spousal_in')).toContain('relationship_proof');
    expect(checklistFor('spousal_out')).toContain('sponsor_documents');
    expect(checklistFor('citizenship')).toContain('tax_filing_info');
    expect(checklistFor('citizenship')).toContain('police_if_required');
    expect(checklistFor('ee_cec')).not.toContain('tax_documents');
    expect(checklistFor('pgwp')).toContain('language_test');
    expect(checklistFor('citizenship')).toContain('language_proof_cit');
    expect(checklistFor('pnp_ee')).toContain('nomination_certificate');
    expect(checklistFor('qc_skilled')).toContain('csq');
    expect(checklistFor('aip')).toContain('endorsement');
    expect(checklistFor('rcip')).toContain('community_recommendation');
    expect(checklistFor('startup')).toContain('letter_of_support');
    expect(checklistFor('study_permit')).toContain('study_acceptance');
    expect(checklistFor('pr_card')).toContain('photos_pr_card');
  });
  it('covers every program, without duplicates, and unknown ids fall back', () => {
    for (const p of PROGRAMS) {
      const list = checklistFor(p.id);
      expect(list.length, p.id).toBeGreaterThanOrEqual(2);
      expect(list.length, p.id).toBeLessThanOrEqual(16);
      expect(new Set(list).size, p.id).toBe(list.length);
    }
    expect(checklistFor('nope')).toEqual(checklistFor('other'));
  });
  it('returns a copy', () => {
    checklistFor('ee_cec').push('zzz');
    expect(checklistFor('ee_cec')).not.toContain('zzz');
  });
  it('every key, kind and reminder title has an English string', () => {
    const missing = [
      ...CHECKLIST_KEYS.map((k) => `doc.chk.${k}`),
      ...DOC_KINDS.flatMap((k) => [`doc.kind.${k}`, `doc.rem.title.${k}`]),
      'doc.rem.body', 'doc.rem.bodyCritical',
    ].filter((k) => !(k in documentsEn));
    expect(missing).toEqual([]);
    expect(Object.keys(documentsEn).every((k) => k.startsWith('doc.'))).toBe(true);
  });
});

describe('nextExpiries', () => {
  it('orders by effective expiry, skips unknown, limits to n', () => {
    const data: DocumentsData = {
      ...emptyDocuments(),
      items: [
        item({ id: 'pass', kind: 'passport', expires: '2030-01-01' }),
        item({ id: 'lang', kind: 'language_test', issued: '2025-01-16' }), // 2027-01-16
        item({ id: 'pol', kind: 'police_certificate', issued: '2026-01-01' }),
        item({ id: 'old', kind: 'trv', expires: '2026-10-06' }),
        item({ id: 'wp', kind: 'work_permit', expires: '2027-05-01' }),
      ],
    };
    const r = nextExpiries(data, '2026-10-16');
    expect(r.map((x) => [x.item.id, x.expires, x.days, x.status])).toEqual([
      ['old', '2026-10-06', -10, 'expired'],
      ['lang', '2027-01-16', 92, 'soon'],
      ['wp', '2027-05-01', 197, 'ok'],
    ]);
    expect(nextExpiries(data, '2026-10-16', 10)).toHaveLength(4);
    expect(nextExpiries(emptyDocuments(), '2026-10-16')).toEqual([]);
  });
});

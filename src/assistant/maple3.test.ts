// Maple intents added in v0.3: documents, personal history, CRS improvement.
import { describe, expect, it } from 'vitest';
import { CRS_FORM_DEFAULT } from '../domain/crsForm';
import { emptyData, type AppData } from '../domain/types';
import { en } from '../i18n/en';
import { answer } from './engine';

const t = (k: string, v?: Record<string, string | number>) => (en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v?.[x] ?? `{${x}}`));
const TODAY = '2026-10-16';
const base = (): AppData => {
  const d = emptyData();
  d.profile.prDate = '2023-01-01';
  d.profile.prCardExpiry = '2028-01-01';
  return d;
};
const ask = (q: string, d = base()) => answer(q, d, t, undefined, TODAY);

describe('Maple v3', () => {
  it('lists the next documents to expire', () => {
    const d = base();
    d.documents = {
      items: [
        { id: 'p', kind: 'passport', expires: '2027-02-01' },
        { id: 'l', kind: 'language_test', issued: '2025-01-10', label: 'IELTS' },
      ],
      checklist: {},
    };
    const r = ask('When does my passport expire?', d);
    expect(r.intent).toBe('documents');
    expect(r.text).toContain('2027-01-10'); // IELTS expires 2 years after the test
    expect(r.text.indexOf('2027-01-10')).toBeLessThan(r.text.indexOf('2027-02-01'));
    expect(ask('护照什么时候过期', d).intent).toBe('documents');
  });

  it('keeps PR card questions on the PR card answer', () => {
    expect(ask('When does my PR card expire?').intent).toBe('pr_card');
  });

  it('suggests adding documents when there are none', () => {
    expect(ask('Which of my documents are expiring?').text).toBe(en['as.docNone']);
  });

  it('reports gaps in the personal history', () => {
    const d = base();
    d.history = {
      addresses: [{ id: 'a', from: '2016-01-01', to: '2020-12-31', city: 'Toronto', country: 'CA' }, { id: 'b', from: '2021-03-01', city: 'Ottawa', country: 'CA' }],
      activities: [],
    };
    const r = ask('Are there any gaps in my address history?', d);
    expect(r.intent).toBe('history');
    expect(r.text).toMatch(/gap/);
    expect(r.text).toContain('2021-01-01');
  });

  it('ranks CRS improvements from the saved calculator answers', () => {
    const d = base();
    d.eligibilityForm = { ...CRS_FORM_DEFAULT, testKind: 'clb', lang1: { listening: 7, reading: 7, writing: 7, speaking: 7 } };
    const r = ask('How can I raise my CRS score?', d);
    expect(r.intent).toBe('crs_plan');
    expect(r.text.split('\n').length).toBeGreaterThan(2);
    expect(ask('How can I raise my CRS score?').text).toBe(en['as.crsPlanNone']);
  });
});

describe('Maple v3 routing guards', () => {
  it('generic expiry/points questions still reach the FAQ', () => {
    expect(ask('卡过期了还能入籍吗').intent).toBe('faq');
    expect(ask('Can I apply for citizenship with an expired PR card?').intent).toBe('faq');
    expect(ask('雇主担保加分还有吗').intent).not.toBe('crs_plan');
  });
});

describe('Maple v3: QA routing cases', () => {
  it('answers checklist questions with a checklist', () => {
    const r = ask('What documents do I need for citizenship?');
    expect(r.intent).toBe('doc_checklist');
    expect(r.text).toContain(en['doc.chk.language_proof_cit']);
  });
  it('PR card and eligibility questions are not captured by documents/history', () => {
    expect(ask('when does my card expire').intent).not.toBe('documents');
    expect(ask('My work permit expires in 2 months, can I still apply for CEC?').intent).not.toBe('history');
    expect(ask('how much work history do I need for CEC?').intent).not.toBe('history');
  });
  it('CRS improvement phrasings', () => {
    expect(ask('How can I get more CRS points?').intent).toBe('crs_plan');
  });
});

describe('Maple v3: BOWP vs expiry list', () => {
  it('work-permit-expiring-keep-working goes to the BOWP FAQ', () => {
    const r = ask('My work permit expires next month, can I keep working while waiting for PR?');
    expect(r.intent).toBe('faq');
    expect(r.text).toBe(en['kb.bowp']);
  });
});

describe('Maple v4: household', () => {
  it('reports each person and the apply-together date', () => {
    const d = base();
    d.household = {
      activeId: 'me',
      activeName: 'Alex',
      others: [{ id: 'sam', name: 'Sam', profile: { prDate: '2025-01-01', statusPeriods: [], taxYearsFiled: [] }, trips: [] }],
    };
    const r = ask('When can we apply together?', d);
    expect(r.intent).toBe('household');
    expect(r.text).toContain('Sam');
    expect(r.text).toContain('Apply together from 2028-01-01');
  });
  it('falls through to the normal answers for a single person or other topics', () => {
    expect(ask('When can we apply for citizenship together?').intent).not.toBe('household');
    const d = base();
    d.household = { activeId: 'me', activeName: 'Alex', others: [{ id: 'sam', name: 'Sam', profile: { prDate: '2025-01-01', statusPeriods: [], taxYearsFiled: [] }, trips: [] }] };
    expect(ask('can we apply together for spousal sponsorship?', d).intent).not.toBe('household');
  });
});

describe('Maple v5: forms, CBSA, finish curve', () => {
  it('sends absence and presence-report questions to the application helper', () => {
    for (const q of ['Export my absences for the citizenship application', 'print my physical presence report', 'PR card renewal check']) {
      const r = ask(q);
      expect(r.intent, q).toBe('forms');
      expect(r.actions?.[0]).toMatchObject({ kind: 'navigate', to: 'forms' });
    }
  });

  it('points CBSA questions to the travel-history import', () => {
    const r = ask('How do I check my trips against CBSA records?');
    expect(r.intent).toBe('cbsa');
    expect(r.actions?.[0]).toMatchObject({ to: 'trips' });
  });

  it('answers "% finished by now" from community timelines', () => {
    const d = base();
    d.applications = [{ id: 'a', kind: 'ee_cec', submitted: '2026-05-01', milestones: [] }];
    const records = [100, 120, 140, 160, 180, 200, 220, 240, 260, 280].map((copr) => ({ kind: 'ee_cec', submittedMonth: '2025-01', days: { aor: 10, copr } }));
    const open = { origin: 'bundled' as const, community: { updated: '2026-10-01', records } };
    // 2026-05-01 → 2026-10-16 is day 168: 4 of 10 had finished (100, 120, 140, 160).
    const r = answer('What percent of people finished by now?', d, t, open as never, TODAY);
    expect(r.intent).toBe('curve');
    expect(r.text).toContain('40%');
    expect(r.text).toContain('day 168');
    expect(ask('What percent of people finished by now?', d).text).toBe(en['c2.maple.noCurve']);
  });
});

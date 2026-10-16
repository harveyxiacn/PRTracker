// Regressions for the v0.2 review findings.
import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/dates';
import { parseTimelineText } from '../domain/pasteParser';
import { PresenceModel } from '../domain/presence';
import { emptyData, type AppData } from '../domain/types';
import { en } from '../i18n/en';
import { answer } from './engine';
import { glossaryLookup, kbSearch } from './kb';
import { findDates, findDuration } from './parse';
import { travelBudget } from './query';

const t = (k: string, v?: Record<string, string | number>) => (en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v?.[x] ?? `{${x}}`));
const TODAY = '2026-10-16';
const data = (): AppData => {
  const d = emptyData();
  d.profile.prDate = '2023-01-01';
  return d;
};
const ms = (r: ReturnType<typeof parseTimelineText>) => Object.fromEntries(r.milestones.map((m) => [m.key, m.date]));

describe('planner', () => {
  it('travel budget subtracts trips already planned before the target', () => {
    const profile = { prDate: '2023-01-01', statusPeriods: [], taxYearsFiled: [] };
    const planned = [{ id: 'p', departure: '2026-11-01', return: '2026-11-22' }];
    const b = travelBudget(new PresenceModel({ profile, trips: planned, today: TODAY }), '2026-12-01');
    // Oct 17 → Nov 30 is 45 days; 20 are already away; the departure day is spent in Canada.
    expect(b.budget).toBe(45 - 20 - 1);
  });
});

describe('dates and durations', () => {
  it('keeps a year-less range in order', () => {
    expect(findDates('from Oct 1 to Oct 30', TODAY).map((f) => f.date)).toEqual(['2027-10-01', '2027-10-30']);
    expect(findDates('Dec 20 to Jan 10', '2026-12-25').map((f) => f.date)).toEqual(['2027-12-20', '2028-01-10']);
  });
  it('reads "March 2028" as the month, not March 20', () => {
    expect(findDates('before applying in March 2028', TODAY)[0].date).toBe('2028-03-01');
  });
  it('understands "a month", "a week", 一年半', () => {
    expect(findDuration('what if I go abroad for a month')).toBe(30);
    expect(findDuration('a week in Paris')).toBe(7);
    expect(findDuration('一年半')).toBe(548);
    expect(findDuration('5 de mayo')).toBeNull();
  });
});

describe('intent routing', () => {
  const ask = (q: string, d = data()) => answer(q, d, t, undefined, TODAY);
  it('logs a future departure with its length as a planned trip', () => {
    const r = ask("I'm leaving for India on Dec 1 for 3 weeks");
    expect(r.actions?.[0]).toMatchObject({ kind: 'addTrip', departure: '2026-12-01', return: '2026-12-23' });
  });
  it('glossary only for "what is X" questions', () => {
    expect(glossaryLookup('what is my crs?')).toBeUndefined();
    expect(glossaryLookup('我的aor是什么时候')).toBeUndefined();
    expect(glossaryLookup('ppr之后多久能拿到copr')).toBeUndefined();
    expect(glossaryLookup('what does gu mean?')).toBe('gu');
    expect(glossaryLookup('AOR是什么')).toBe('aor');
  });
  it('questions about returning are not logged as a return', () => {
    expect(ask('When do I need to be back in Canada?').intent).not.toBe('log_return');
    expect(ask('什么时候必须回到加拿大').intent).not.toBe('log_return');
  });
  it('routes common questions to the right place', () => {
    expect(ask("What's the longest I can stay outside Canada?").intent).toBe('residency');
    expect(ask('When will I get my passport back?').intent).not.toBe('citizenship');
    expect(ask('我能在国外待多久').intent).toBe('residency');
    expect(ask('why do I need a PRTD?').intent).toBe('faq');
    expect(ask('how many days can I travel before I apply for citizenship').intent).not.toBe('residency');
  });
  it('FAQ: expired card abroad -> PRTD; unrelated 过期 does not hit the citizenship FAQ', () => {
    expect(kbSearch('my pr card expired while abroad, how do I come back')?.id).toBe('prtd');
    expect(kbSearch('体检过期了怎么办')?.id).not.toBe('expired_card_cit');
    expect(kbSearch('怎么切换语言')?.id).toBeUndefined();
  });
  it('strict counting: what-if shows the real days away', () => {
    const d = data();
    d.settings.boundaryDaysPresent = false;
    expect(ask('What if I travel for 30 days?', d).text).toContain('30 days outside');
  });
});

describe('paste parser on forum formats', () => {
  it('"LABEL - date" lines', () => {
    const r = parseTimelineText('CEC\nITA - Jan 8 2026\nAOR - 20 Jan 2026\nBIL - Feb 2 2026\nPPR - Jun 3 2026', TODAY);
    expect(ms(r)).toEqual({ ita: '2026-01-08', aor: '2026-01-20', biometrics_request: '2026-02-02', ppr: '2026-06-03' });
  });
  it('decides MM/DD vs DD/MM once per post, and reads 2-digit years', () => {
    const r = parseTimelineText('CEC | AOR: 03/02/2026 | BIL: 03/15/2026 | PPR: 07/09/2026', TODAY);
    expect(ms(r)).toEqual({ aor: '2026-03-02', biometrics_request: '2026-03-15', ppr: '2026-07-09' });
    expect(ms(parseTimelineText('FSW | AOR: 1/5/26 | BIL 1/20/26', TODAY))).toEqual({ aor: '2026-01-05', biometrics_request: '2026-01-20' });
  });
  it('provincial base stream: program and submission date', () => {
    const r = parseTimelineText('SINP base (non-EE)\nEOI submitted: 2025-06-01\nSINP app submitted: 2025-08-01\nNomination: 2025-11-01\nIRCC PR app submitted: 2025-12-01\nAOR: 2025-12-10', TODAY);
    expect(r.kind).toBe('pnp_base');
    expect(r.province).toBe('SK');
    expect(ms(r)).toMatchObject({ eoi: '2025-06-01', pnp_submitted: '2025-08-01', nomination: '2025-11-01', submitted: '2025-12-01', aor: '2025-12-10' });
  });
  it('spelled-out programs, citizenship with landing, shorthands', () => {
    expect(parseTimelineText('Federal Skilled Worker\nAOR: 2026-01-01', TODAY).kind).toBe('ee_fsw');
    expect(parseTimelineText('Landed: 2021-03-01\nCitizenship application submitted: 2025-01-10\nTest: 2025-06-01\nOath: 2025-09-01', TODAY).kind).toBe('citizenship');
    expect(ms(parseTimelineText('CEC\nAOR: 2026-01-01\nBio: 2026-03-15\nMed Passed- Jan 20 2026', TODAY))).toMatchObject({ biometrics: '2026-03-15', medical: '2026-01-20' });
  });
  it('a labelled "Express Entry" beats a later PGWP mention', () => {
    const r = parseTimelineText('Application type: Express Entry\nAOR: 2026-03-04\nBIL: 2026-05-01\nI was on a PGWP before.', TODAY);
    expect(r.kind).toBe('ee_cec');
    expect(ms(r).aor).toBe('2026-03-04');
  });
});

describe('budget sanity with a simulated trip', () => {
  it('still exact after the fix', () => {
    const profile = { prDate: '2024-01-01', statusPeriods: [], taxYearsFiled: [] };
    const m = new PresenceModel({ profile, trips: [], today: TODAY });
    const b = travelBudget(m, '2028-06-01');
    const dep = '2027-01-10';
    const ok = new PresenceModel({ profile, trips: [{ id: 'x', departure: dep, return: addDays(dep, b.budget + 1) }], today: TODAY });
    expect(ok.citizenshipAt('2028-06-01').credited).toBeGreaterThanOrEqual(1095);
  });
});

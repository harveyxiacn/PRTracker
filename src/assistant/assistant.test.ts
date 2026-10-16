import { describe, expect, it } from 'vitest';
import { emptyData, type AppData } from '../domain/types';
import { en } from '../i18n/en';
import { answer } from './engine';
import { findDates, findDuration, normalizeChineseNumbers } from './parse';

const t = (k: string, v?: Record<string, string | number>) => (en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v?.[x] ?? `{${x}}`));
const TODAY = '2026-10-16';

function data(): AppData {
  const d = emptyData();
  d.profile.prDate = '2024-01-01';
  d.profile.prCardExpiry = '2029-01-01';
  d.trips = [{ id: 'a', departure: '2025-07-01', return: '2025-07-21' }];
  return d;
}

describe('parse', () => {
  it('finds ISO, English and Chinese dates', () => {
    expect(findDates('from 2027-03-01 to 2027/04/15', TODAY).map((f) => f.date)).toEqual(['2027-03-01', '2027-04-15']);
    expect(findDates('June 1 to Aug 15th, 2027', TODAY).map((f) => f.date)).toEqual(['2027-06-01', '2027-08-15']);
    expect(findDates('3月1日到4月2日', TODAY).map((f) => f.date)).toEqual(['2027-03-01', '2027-04-02']);
    expect(findDates('2027年三月一日', TODAY).map((f) => f.date)).toEqual(['2027-03-01']);
    expect(findDates('tomorrow', TODAY)[0].date).toBe('2026-10-17');
  });
  it('parses durations', () => {
    expect(findDuration('for 2 months')).toBe(61);
    expect(findDuration('两个月')).toBe(61);
    expect(findDuration('10天')).toBe(10);
    expect(findDuration('3 weeks')).toBe(21);
    expect(findDuration('半年')).toBe(182);
    expect(normalizeChineseNumbers('二十五天')).toBe('25天');
  });
});

describe('assistant', () => {
  it('answers citizenship questions in both languages', () => {
    expect(answer('When can I apply for citizenship?', data(), t, undefined, TODAY).intent).toBe('citizenship');
    expect(answer('我什么时候可以入籍', data(), t, undefined, TODAY).intent).toBe('citizenship');
  });
  it('simulates a trip and offers to save it', () => {
    // Eligible on 2027-01-19 without the trip; 60 days away pushes it by 60 days.
    const r = answer('What if I travel from 2026-11-01 to 2027-01-01?', data(), t, undefined, TODAY);
    expect(r.intent).toBe('whatif');
    expect(r.text).toContain('2026-11-01');
    expect(r.text).toMatch(/moves from 2027-01-19 to .* \(\+60 days\)/);
    expect(r.actions?.[0]).toMatchObject({ kind: 'addTrip', departure: '2026-11-01', return: '2027-01-01' });
    const late = answer('What if I travel from 2027-06-01 to 2027-08-01?', data(), t, undefined, TODAY);
    expect(late.text).toContain('no change');
  });
  it('simulates a duration-only trip in Chinese', () => {
    const r = answer('如果我出国三个月会怎样', data(), t, undefined, TODAY);
    expect(r.intent).toBe('whatif');
  });
  it('counts days outside in a year', () => {
    const r = answer('How many days was I outside Canada in 2025?', data(), t, undefined, TODAY);
    expect(r.intent).toBe('days_outside');
    expect(r.text).toContain('19 days outside');
  });
  it('logs a return for an ongoing trip', () => {
    const d = data();
    d.trips.push({ id: 'b', departure: '2026-10-01' });
    const r = answer("I'm back today", d, t, undefined, TODAY);
    expect(r.intent).toBe('log_return');
    expect(r.actions?.[0]).toMatchObject({ kind: 'addTrip', departure: '2026-10-01', return: TODAY });
  });
  it('answers residency and PR card questions', () => {
    expect(answer('how long can I stay outside canada', data(), t, undefined, TODAY).intent).toBe('residency');
    expect(answer('枫叶卡什么时候续', data(), t, undefined, TODAY).intent).toBe('pr_card');
  });
  it('asks for the PR date when missing', () => {
    expect(answer('when can I apply for citizenship', emptyData(), t, undefined, TODAY).intent).toBe('need_pr');
  });
  it('falls back gracefully', () => {
    expect(answer('blah', data(), t, undefined, TODAY).intent).toBe('fallback');
  });
});

describe('assistant review regressions', () => {
  it('does not treat "landed" (PR landing) as a return', () => {
    expect(answer('I landed in Canada on 2024-05-01, when can I apply for citizenship?', data(), t, undefined, TODAY).intent).toBe('citizenship');
  });
  it('does not route words containing "ee" to CRS', () => {
    expect(answer('I need help keeping my data private', data(), t, undefined, TODAY).intent).toBe('privacy');
  });
  it('does not read Chinese month dates as durations', () => {
    expect(findDuration('3月5日出国')).toBeNull();
    expect(findDuration('10月1日出国2周')).toBe(14);
    expect(findDuration('3 more weeks')).toBe(21);
  });
  it('routes max-absence questions to residency', () => {
    for (const q of ['How many days can I be away?', '最多出国多少天', '我能出国多久']) {
      expect(answer(q, data(), t, undefined, TODAY).intent).toBe('residency');
    }
  });
  it('uses past dates when logging trips and accepts curly apostrophes', () => {
    const r = answer('I left on Oct 1 and came back Oct 10', data(), t, undefined, TODAY);
    expect(r.actions?.[0]).toMatchObject({ kind: 'addTrip', departure: '2026-10-01', return: '2026-10-10' });
    const d = data();
    d.trips.push({ id: 'b', departure: '2026-10-01' });
    expect(answer('I’m back', d, t, undefined, TODAY).intent).toBe('log_return');
  });
  it('treats "status" as a summary, not application progress', () => {
    expect(answer("What's my status?", data(), t, undefined, TODAY).intent).toBe('summary');
  });
});

describe('Maple v2', () => {
  const d2 = () => {
    const d = data();
    d.trips = [
      { id: '1', departure: '2024-07-01', return: '2024-07-31', destination: 'Shanghai, China' },
      { id: '2', departure: '2025-02-10', return: '2025-02-20', destination: 'Mexico' },
    ];
    return d;
  };
  it('explains jargon from forums', () => {
    expect(answer('What is BIL?', data(), t, undefined, TODAY)).toMatchObject({ intent: 'glossary' });
    expect(answer('AOR是什么意思', data(), t, undefined, TODAY)).toMatchObject({ intent: 'glossary' });
    expect(answer('ppr?', data(), t, undefined, TODAY)).toMatchObject({ intent: 'glossary' });
  });
  it('answers questions about the trip history', () => {
    expect(answer('What was my longest trip?', d2(), t, undefined, TODAY).text).toContain('29 days');
    expect(answer('How many times did I go to China?', d2(), t, undefined, TODAY).text).toMatch(/1 trip/);
    expect(answer('最长的一次出国是哪次', d2(), t, undefined, TODAY).intent).toBe('trips_query');
    expect(answer('How many days was I away in the last 12 months?', d2(), t, undefined, TODAY).intent).toBe('trips_query');
  });
  it('plans towards a target date and finds the best time for a trip', () => {
    expect(answer('I want to apply for citizenship by 2028-06-01, how many days can I still travel?', d2(), t, undefined, TODAY).intent).toBe('plan_target');
    expect(answer('When is the best time for a 2 month trip?', d2(), t, undefined, TODAY).intent).toBe('plan_best');
    expect(answer('为什么是这个日期', d2(), t, undefined, TODAY).intent).toBe('explain');
  });
  it('remembers the previous what-if for follow-ups', () => {
    const first = answer('What if I travel for 2 months?', d2(), t, undefined, TODAY);
    expect(first.memory).toMatchObject({ intent: 'whatif' });
    const second = answer('and 3 months?', d2(), t, undefined, TODAY, first.memory);
    expect(second.intent).toBe('whatif');
    expect(second.text).toContain('91 days');
  });
  it('answers FAQs with a source link', () => {
    const r = answer('Can I apply for citizenship with an expired PR card?', data(), t, undefined, TODAY);
    expect(r.intent).toBe('faq');
    expect(r.source).toMatch(/^https:\/\//);
    expect(answer('Does time abroad with my citizen spouse count?', data(), t, undefined, TODAY).intent).toBe('faq');
  });
  it('understands non-ASCII digits', () => {
    expect(answer('What if I travel for ٣ months?', d2(), t, undefined, TODAY).text).toContain('91 days');
  });
});

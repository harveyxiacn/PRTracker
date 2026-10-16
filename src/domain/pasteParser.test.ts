import { describe, expect, it } from 'vitest';
import { extractDate, guessKind, parseTimelineText } from './pasteParser';

const TODAY = '2026-10-16';
const get = (r: ReturnType<typeof parseTimelineText>) => Object.fromEntries(r.milestones.map((m) => [m.key, m.date]));

describe('paste timeline parser', () => {
  it('parses a typical Reddit "finally PR" post and ignores the story', () => {
    // Synthetic post with the same structure as real ones.
    const post = `Finally PR! Sharing my CEC Inland timeline:
AOR: Feb 8, 2026
Biometrics: Apr 21
Medical: May 14
Ghost updates: many during processing
Final Decision: Sep 15
P1: Sep 16
P2: Sep 25
eCOPR: Oct 1, 2026 🎉
PVO: Ottawa | SVO: Sydney → Montreal
AOR → eCOPR: 235 days
Fun fact: I submitted my study permit application on October 1, 2021, and got my eCOPR exactly five years later.`;
    const r = parseTimelineText(post, TODAY);
    expect(r.kind).toBe('ee_cec');
    expect(r.office).toBe('Ottawa');
    expect(get(r)).toEqual({
      aor: '2026-02-08',
      biometrics: '2026-04-21',
      medical: '2026-05-14',
      ppr: '2026-09-15',
      portal1: '2026-09-16',
      portal2: '2026-09-25',
      copr: '2026-10-01',
    });
    expect(r.submitted).toBe('2026-02-08');
    expect(r.milestones.find((m) => m.key === 'biometrics')!.uncertain).toBe(true);
  });

  it('parses a pipe-separated signature line', () => {
    const r = parseTimelineText('OINP HCP → EE | NOI: 2025-11-02 | Nomination: 2026-01-10 | ITA: Jan 22, 2026 | AOR: 2026-02-01 | BIL: 02/14/2026 | PPR: 2026-07-30', TODAY);
    expect(r.kind).toBe('pnp_ee');
    expect(r.province).toBe('ON');
    expect(get(r)).toMatchObject({ pnp_invite: '2025-11-02', nomination: '2026-01-10', ita: '2026-01-22', aor: '2026-02-01', biometrics_request: '2026-02-14', ppr: '2026-07-30' });
  });

  it('handles spousal inland, citizenship and Chinese posts', () => {
    expect(guessKind('Spousal sponsorship inland, AOR1 Jan 3').kind).toBe('spousal_in');
    const c = parseTimelineText('Citizenship: applied 2025-12-01, AOR 2026-01-05, test invite 2026-04-02, test 2026-04-20, oath invite 2026-08-01', TODAY);
    expect(c.kind).toBe('citizenship');
    expect(get(c)).toMatchObject({ submitted: '2025-12-01', aor: '2026-01-05', test_invite: '2026-04-02', test: '2026-04-20', oath_invite: '2026-08-01' });
    const zh = parseTimelineText('CEC 递交: 2026-01-10\n体检: 2026-02-01\n护照信: 2026-06-01', TODAY);
    expect(get(zh)).toMatchObject({ submitted: '2026-01-10', medical: '2026-02-01', ppr: '2026-06-01' });
  });

  it('flags ambiguous numeric dates', () => {
    expect(extractDate('BIL 03/04/2026')).toMatchObject({ date: '2026-04-03', uncertain: true });
    expect(extractDate('BIL 13/04/2026')).toMatchObject({ date: '2026-04-13' });
    expect(extractDate('BIL 04/13/2026')).toMatchObject({ date: '2026-04-13' });
  });
});

describe('paste timeline parser: more real-world shapes', () => {
  it('outland CEC post with a "Stream:" line, FD/PPR, passport steps, office and country', () => {
    const post = `PR approval Outland!
After a long journey (I had to go home when my work permit expired), sharing my timeline.

ITA: January 21, 2026

AOR: March 12, 2026

BIL: May 11, 2026

GU: July 27, 2026

FD and PPR: July 28, 2026

Passport sent: July 31, 2026

Passport received: August 3, 2026

Stream: CEC

3 yr Canadian work exp. 0 foreign exp

PVO/SVO: Vancouver, Sydney

Applied from Kenya`;
    const r = parseTimelineText(post, TODAY);
    expect(r.kind).toBe('ee_cec');
    expect(r.kindUncertain).toBe(false);
    expect(r.office).toBe('Vancouver');
    expect(r.country).toBe('KE');
    expect(get(r)).toEqual({
      ita: '2026-01-21',
      aor: '2026-03-12',
      biometrics_request: '2026-05-11',
      ppr: '2026-07-28',
      passport_sent: '2026-07-31',
      passport_returned: '2026-08-03',
    });
  });

  it('generic "Express Entry" post with year-less dates', () => {
    const post = `Application Type: Express Entry
Family: Single Applicant
AOR: March 4th
BIL: May 1st
P1: August 12
P2: August 18
eCOPR: August 24
PR Card Received- September 14
I had 1 year of foreign work experience and submitted an LOE with pay stubs.`;
    const r = parseTimelineText(post, TODAY);
    expect(r.kind).toBe('ee_cec');
    expect(r.kindUncertain).toBe(true);
    expect(get(r)).toEqual({
      aor: '2026-03-04',
      biometrics_request: '2026-05-01',
      portal1: '2026-08-12',
      portal2: '2026-08-18',
      copr: '2026-08-24',
    });
    expect(r.milestones.every((m) => m.uncertain)).toBe(true);
  });

  it('rolls year-less dates back a year when they would be in the future', () => {
    const r = parseTimelineText('CEC\nAOR: Nov 20\nBIL: Dec 5\nPPR: Mar 2', '2026-04-01');
    expect(get(r)).toEqual({ aor: '2025-11-20', biometrics_request: '2025-12-05', ppr: '2026-03-02' });
  });
});

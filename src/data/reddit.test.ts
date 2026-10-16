import { describe, expect, it } from 'vitest';
import { hashPostId, normalizePostId, parseSeen, postToRecord, seenHashInput, type RedditPost } from './redditCore';

const TODAY = '2026-10-16';

// Synthetic posts modelled on typical r/ImmigrationCanada timeline posts (no real content).
const cec: RedditPost = {
  id: 't3_abc1',
  title: 'CEC Inland eCOPR received! My timeline',
  selftext: 'Stream: CEC\nITA: Jan 8, 2026\nAOR: Feb 2, 2026\nBIL: Feb 10, 2026\nMedical passed: Mar 1, 2026\nPPR: Jun 3, 2026\neCOPR: Jun 20, 2026\nPVO: Ottawa\nGood luck everyone!',
  created_utc: 1781000000,
};
const spousal: RedditPost = {
  id: 'abc3',
  title: 'Outland spousal sponsorship timeline - COPR!',
  selftext: 'Applied from India\nSubmitted: 2025-11-05\nAOR: 2025-11-20\nBiometrics done: 2025-12-10\nSponsorship approved: 2026-03-01\nCOPR: 2026-08-01\nVO: New Delhi',
};

describe('postToRecord', () => {
  it('turns a CEC timeline into an anonymised record (days from AOR, ITA dropped)', () => {
    // Feb 2 -> Feb 10 = 8, -> Mar 1 = 27, -> Jun 3 = 121, -> Jun 20 = 138; ITA (before AOR) is not shared.
    expect(postToRecord(cec, TODAY)).toEqual({
      record: { kind: 'ee_cec', submittedMonth: '2026-02', days: { aor: 0, biometrics_request: 8, medical: 27, ppr: 121, copr: 138 }, office: 'Ottawa', source: 'reddit' },
    });
  });

  it('keeps country and an allowed office for an outland spousal timeline', () => {
    // Nov 5 -> Nov 20 = 15, -> Dec 10 = 35, -> Mar 1 = 116, -> Aug 1 = 269.
    const r = postToRecord(spousal, TODAY).record!;
    expect(r).toEqual({ kind: 'spousal_out', submittedMonth: '2025-11', days: { aor: 15, biometrics: 35, sponsor_approved: 116, copr: 269 }, office: 'New Delhi', country: 'IN', source: 'reddit' });
  });

  it('never copies the id, title or text into the record', () => {
    const json = JSON.stringify(postToRecord(cec, TODAY).record);
    expect(json).not.toContain('abc1');
    expect(json).not.toContain('Good luck');
    expect(Object.keys(postToRecord(cec, TODAY).record!).sort()).toEqual(['days', 'kind', 'office', 'source', 'submittedMonth']);
  });

  it('drops an office that is not in the allowed list', () => {
    const r = postToRecord({ ...cec, selftext: cec.selftext!.replace('PVO: Ottawa', 'PVO: Smalltown') }, TODAY).record!;
    expect(r.office).toBeUndefined();
  });

  it('rejects "Express Entry" without a sub-program (would be guessed as CEC)', () => {
    const p = { id: 'x', title: 'Express Entry timeline', selftext: 'AOR: 2026-02-02\nBiometrics: 2026-02-15\nPPR: 2026-06-03\neCOPR: 2026-06-20' };
    expect(postToRecord(p, TODAY)).toEqual({ reason: 'kind_uncertain' });
  });

  it('rejects ambiguous numeric dates and dates without a year', () => {
    expect(postToRecord({ id: 'x', title: 'OINP base AOR timeline', selftext: 'OINP base\nAOR: 03/04/2026\nBiometrics: 05/05/2026\nPPR: 07/07/2026' }, TODAY).reason).toBe('uncertain_dates');
    expect(postToRecord({ id: 'x', title: 'FSW timeline', selftext: 'FSW\nAOR: Mar 3\nBIL: Mar 10\nPPR: Jul 1' }, TODAY).reason).toBe('uncertain_dates');
  });

  it('rejects posts with fewer than 3 milestones', () => {
    expect(postToRecord({ id: 'x', title: 'FSW ecopr', selftext: 'FSW\nAOR: 2026-01-10\neCOPR: 2026-05-10' }, TODAY).reason).toBe('few_milestones');
  });

  it('rejects posts without a program, without a submission date, removed, or with future dates', () => {
    expect(postToRecord({ id: 'x', title: 'My timeline', selftext: 'AOR: 2026-01-10\nBiometrics: 2026-01-20\nPPR: 2026-05-10' }, TODAY).reason).toBe('no_kind');
    expect(postToRecord({ id: 'x', title: 'CEC timeline', selftext: 'CEC\nBiometrics: 2026-01-20\nMedical: 2026-02-01\nPPR: 2026-05-10' }, TODAY).reason).toBe('no_submitted');
    expect(postToRecord({ id: 'x', title: 'CEC timeline', selftext: '[removed]' }, TODAY).reason).toBe('removed');
    expect(postToRecord({ ...cec, removed_by_category: 'moderator' }, TODAY).reason).toBe('removed');
    expect(postToRecord({ ...cec, selftext: cec.selftext!.replace('eCOPR: Jun 20, 2026', 'eCOPR: Dec 20, 2026') }, TODAY).reason).toBe('future_dates');
  });
});

describe('post id hashing', () => {
  it('normalises ids so the fullname and bare id match', () => {
    expect(normalizePostId('t3_1AbCd')).toBe('1abcd');
    expect(normalizePostId(' 1abcd ')).toBe('1abcd');
    expect(seenHashInput('T3_abc1', 's3cret')).toBe('pr-tracker-reddit:s3cret:abc1');
  });

  it('is a salted SHA-256 (hex)', async () => {
    // python3 -c "import hashlib;print(hashlib.sha256(b'pr-tracker-reddit:s3cret:abc1').hexdigest())"
    const h = await hashPostId('t3_abc1', 's3cret');
    expect(h).toBe('0d3f113c460f7d46e7469dfe04016f6995ac0e6dd721563f0871d5d29cd92a6d');
    expect(await hashPostId('abc1', 's3cret')).toBe(h);
    expect(await hashPostId('abc1', 'other')).not.toBe(h);
  });

  it('requires a salt', async () => {
    await expect(hashPostId('abc1', '')).rejects.toThrow();
  });

  it('reads only hex hashes from the seen list', () => {
    const h = '0d3f113c460f7d46e7469dfe04016f6995ac0e6dd721563f0871d5d29cd92a6d';
    expect([...parseSeen(`${h}\n\nabc1\n${h}\n`)]).toEqual([h]);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSON_NAME, SELF_ID, type Household } from '../domain/people';
import { emptyData, type AppData, type Trip } from '../domain/types';
import { encryptText } from './crypto';
import {
  MAX_SHARED_TRIPS,
  buildSharedPerson,
  exportPersonEncrypted,
  findSameName,
  importPerson,
  readPersonFile,
  sanitizeSharedPerson,
  shareFileName,
  type SharedPerson,
} from './share';

const PASS = 'correct horse battery';

function trip(id: string, departure: string, ret: string | null, extra: Partial<Trip> = {}): Trip {
  return { id, departure, return: ret, ...extra };
}

/** Two people: Alex (active) and Sam (member "m1"), plus things that must never be shared. */
function household(): AppData {
  const d = emptyData();
  const h: Household = {
    activeId: SELF_ID,
    activeName: 'Alex',
    others: [{ id: 'm1', name: 'Sam', profile: { prDate: '2022-03-01', statusPeriods: [], taxYearsFiled: [2023] }, trips: [trip('s1', '2023-05-01', '2023-05-10')] }],
  };
  return {
    ...d,
    onboarded: true,
    profile: { displayName: 'Alex', prDate: '2021-06-15', statusPeriods: [{ id: 'sp', kind: 'worker', start: '2019-01-01', end: '2021-06-14' }], taxYearsFiled: [2021, 2022] },
    trips: [trip('a1', '2022-01-01', '2022-01-20', { destination: 'Paris', purpose: 'vacation' }), trip('a2', '2024-02-01', null)],
    applications: [{ id: 'app1', kind: 'citizenship', milestones: [] }],
    chat: [{ role: 'user', text: 'secret chat', at: '2026-01-01' }],
    lock: { pinHash: 'HASH', salt: 'SALT' },
    household: h,
  };
}

const shared = (over: Partial<SharedPerson> = {}): SharedPerson => ({
  format: 'pr-tracker-person-v1',
  name: 'Sam',
  profile: { prDate: '2020-01-01', statusPeriods: [], taxYearsFiled: [] },
  trips: [trip('x1', '2024-01-01', '2024-01-05')],
  exportedAt: '2026-10-16T12:00:00.000Z',
  ...over,
});

// PBKDF2 runs 600,000 iterations per encrypt/decrypt, so the crypto tests get a longer timeout.
const SLOW = 30_000;

describe('share: export and read', () => {
  it('round-trips the active person: export → read → import on another phone', async () => {
    const data = household();
    const file = await exportPersonEncrypted(data, SELF_ID, PASS);
    expect(file).not.toContain('Alex');
    expect(file).not.toContain('Paris');
    const p = await readPersonFile(file, PASS);
    expect(p.format).toBe('pr-tracker-person-v1');
    expect(p.name).toBe('Alex');
    expect(p.profile.prDate).toBe('2021-06-15');
    expect(p.profile.statusPeriods).toHaveLength(1);
    expect(p.trips.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(p.trips[0]).toEqual({ id: 'a1', departure: '2022-01-01', return: '2022-01-20', destination: 'Paris', purpose: 'vacation' });

    const other = { ...emptyData(), profile: { displayName: 'Jo', statusPeriods: [], taxYearsFiled: [] }, trips: [trip('j1', '2025-01-01', '2025-01-02')] };
    const after = importPerson(other, p);
    // The receiver stays active; the household is created with them as SELF_ID.
    expect(after.profile).toBe(other.profile);
    expect(after.trips).toBe(other.trips);
    expect(after.household?.activeId).toBe(SELF_ID);
    expect(after.household?.activeName).toBe('Jo');
    expect(after.household?.others).toHaveLength(1);
    const added = after.household!.others[0];
    expect(added.name).toBe('Alex');
    expect(added.id).not.toBe(SELF_ID);
    expect(added.trips).toHaveLength(2);
    expect(added.profile.prDate).toBe('2021-06-15');
  }, SLOW);

  it('exports a member by id and never includes shared or private data', async () => {
    const data = household();
    const plain = buildSharedPerson(data, 'm1', new Date('2026-10-16T00:00:00Z'));
    expect(plain).toEqual({
      format: 'pr-tracker-person-v1',
      name: 'Sam',
      profile: { prDate: '2022-03-01', statusPeriods: [], taxYearsFiled: [2023] },
      trips: [{ id: 's1', departure: '2023-05-01', return: '2023-05-10' }],
      exportedAt: '2026-10-16T00:00:00.000Z',
    });
    const json = JSON.stringify(buildSharedPerson(data, SELF_ID));
    for (const leak of ['secret chat', 'HASH', 'app1', 'citizenship', 'dataUrl', 'Sam']) expect(json).not.toContain(leak);
    const p = await readPersonFile(await exportPersonEncrypted(data, 'm1', PASS), PASS);
    expect(p.name).toBe('Sam');
    expect(p.trips).toHaveLength(1);
  }, SLOW);

  it('names a single user from displayName, else "Me"; unknown id throws', () => {
    const d = { ...emptyData(), profile: { displayName: '  Lee  ', statusPeriods: [], taxYearsFiled: [] } };
    expect(buildSharedPerson(d, SELF_ID).name).toBe('Lee');
    expect(buildSharedPerson(emptyData(), SELF_ID).name).toBe('Me');
    expect(() => buildSharedPerson(household(), 'nope')).toThrow('not-found');
  });

  it('refuses a short passphrase', async () => {
    await expect(exportPersonEncrypted(household(), SELF_ID, 'short')).rejects.toThrow('weak-passphrase');
  }, SLOW);

  it('rejects a wrong passphrase', async () => {
    const file = await exportPersonEncrypted(household(), SELF_ID, PASS);
    await expect(readPersonFile(file, 'wrong passphrase')).rejects.toThrow('bad-passphrase');
  }, SLOW);

  it('rejects a tampered file', async () => {
    const file = await exportPersonEncrypted(household(), SELF_ID, PASS);
    const o = JSON.parse(file);
    const bytes = Uint8Array.from(atob(o.data), (c) => c.charCodeAt(0));
    bytes[5] ^= 1;
    o.data = btoa(String.fromCharCode(...bytes));
    await expect(readPersonFile(JSON.stringify(o), PASS)).rejects.toThrow('bad-passphrase');
    await expect(readPersonFile('not json', PASS)).rejects.toThrow('bad-format');
    await expect(readPersonFile(JSON.stringify({ ...o, format: 'enc-v9' }), PASS)).rejects.toThrow('bad-format');
  }, SLOW);

  it('rejects other formats and versions inside a valid envelope', async () => {
    for (const payload of [
      '{"version":1,"profile":{},"trips":[]}', // a full backup, not a person
      JSON.stringify({ ...shared(), format: 'pr-tracker-person-v2' }),
      JSON.stringify({ ...shared(), trips: 'x' }),
      JSON.stringify({ ...shared(), profile: null }),
      '[1,2,3]',
      'plain text',
    ]) {
      await expect(readPersonFile(await encryptText(payload, PASS), PASS)).rejects.toThrow('bad-format');
    }
  }, SLOW);
});

describe('share: sanitizing untrusted input', () => {
  it('repairs bad dates, drops unknown fields and caps huge arrays', () => {
    const many = Array.from({ length: 12_000 }, (_, i) => trip(`t${i}`, '2020-01-01', '2020-01-02'));
    const p = sanitizeSharedPerson({
      format: 'pr-tracker-person-v1',
      name: '  <b>Evil</b>   name that is far too long to be a sensible household label ',
      exportedAt: 'yesterday',
      profile: JSON.parse(
        JSON.stringify({
          prDate: '2021-02-30',
          prCardExpiry: 'soon',
          firstEntry: '2019-12-31',
          statusPeriods: [{ id: 'a', kind: 'hacker', start: '2019-01-01', end: '2018-01-01' }, { id: 'b', start: 'bad' }, 'junk'],
          taxYearsFiled: [2022, 2022, 1.5, '2023', 99999, 2021],
          pinHash: 'stolen',
        }).replace('{', '{"__proto__":{"polluted":true},'),
      ),
      trips: [
        trip('bad1', '2020-13-01', null),
        trip('bad2', '2020-05-10', '2020-05-01'), // returns before it leaves
        { id: 'ok', departure: '2020-06-01', return: 'later', purpose: 'smuggling', destination: 'x'.repeat(500), note: 7, extra: 'drop' },
        { id: 'ok', departure: '2020-07-01', return: '2020-07-03' }, // duplicate id
        null,
        ...many,
      ],
    });
    expect(p.name.length).toBeLessThanOrEqual(40);
    expect(p.name.startsWith('<b>Evil</b> name')).toBe(true);
    expect(p.exportedAt).toBe('');
    expect(p.profile).toEqual({
      firstEntry: '2019-12-31',
      statusPeriods: [{ id: 'a', kind: 'other', start: '2019-01-01', end: null }],
      taxYearsFiled: [2021, 2022],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(p.trips).toHaveLength(MAX_SHARED_TRIPS);
    expect(p.trips[0]).toEqual({ id: 'ok', departure: '2020-06-01', return: null, destination: 'x'.repeat(100) });
    expect(p.trips[1].id).not.toBe('ok');
    expect(p.trips[1].departure).toBe('2020-07-01');
    expect(new Set(p.trips.map((t) => t.id)).size).toBe(MAX_SHARED_TRIPS);
  });

  it('a missing name falls back to "Me"', () => {
    expect(sanitizeSharedPerson({ ...shared(), name: 42 }).name).toBe('Me');
  });
});

describe('share: import', () => {
  it('adds a member with a new id without switching; same names get a suffix', () => {
    const data = household();
    const a = importPerson(data, shared());
    expect(a.profile).toBe(data.profile);
    expect(a.household!.activeId).toBe(SELF_ID);
    expect(a.household!.others.map((o) => o.name)).toEqual(['Sam', 'Sam (2)']);
    const ids = [a.household!.activeId, ...a.household!.others.map((o) => o.id)];
    expect(new Set(ids).size).toBe(3);
    expect(a.applications).toBe(data.applications);
    expect(a.lock).toBe(data.lock);
  });

  it('replace updates the same-named member (case-insensitive) in place', () => {
    const data = household();
    const r = importPerson(data, shared({ name: 'sam' }), { replace: true });
    expect(r.household!.others).toHaveLength(1);
    const sam = r.household!.others[0];
    expect(sam.id).toBe('m1');
    expect(sam.name).toBe('Sam');
    expect(sam.profile.prDate).toBe('2020-01-01');
    expect(sam.trips.map((t) => t.id)).toEqual(['x1']);
    expect(r.profile).toBe(data.profile);
  });

  it('replace on the ACTIVE member replaces data.profile/trips', () => {
    const data = household();
    const r = importPerson(data, shared({ name: 'Alex' }), { replace: true });
    expect(r.profile.prDate).toBe('2020-01-01');
    expect(r.trips.map((t) => t.id)).toEqual(['x1']);
    expect(r.household!.activeId).toBe(SELF_ID);
    expect(r.household!.activeName).toBe('Alex');
    expect(r.household!.others).toEqual(data.household!.others);
  });

  it('replace with no match adds instead', () => {
    const r = importPerson(household(), shared({ name: 'Kim' }), { replace: true });
    expect(r.household!.others.map((o) => o.name)).toEqual(['Sam', 'Kim']);
  });

  it('creates the household for a single user (name from displayName, else "Me")', () => {
    const single = emptyData();
    const r = importPerson(single, shared());
    expect(r.household).toMatchObject({ activeId: SELF_ID, activeName: 'Me' });
    expect(r.household!.others[0].name).toBe('Sam');
    // Replace when the single user's implicit name matches: their own data is replaced.
    const named = { ...emptyData(), profile: { displayName: 'Sam', statusPeriods: [], taxYearsFiled: [] } };
    const rr = importPerson(named, shared(), { replace: true });
    expect(rr.household).toEqual({ activeId: SELF_ID, activeName: 'Sam', others: [] });
    expect(rr.trips.map((t) => t.id)).toEqual(['x1']);
  });

  it('sanitizes what it imports even when called directly', () => {
    const bad = shared({ trips: [trip('t', 'nope', null)] as Trip[], profile: { prDate: 'x', statusPeriods: [], taxYearsFiled: [] } });
    const r = importPerson(emptyData(), bad);
    expect(r.household!.others[0].trips).toEqual([]);
    expect(r.household!.others[0].profile.prDate).toBeUndefined();
    expect(() => importPerson(emptyData(), { ...shared(), format: 'x' } as unknown as SharedPerson)).toThrow('bad-format');
  });

  it('findSameName finds active and other members', () => {
    const data = household();
    expect(findSameName(data, ' ALEX ')).toEqual({ id: SELF_ID, name: 'Alex', active: true });
    expect(findSameName(data, 'sam')).toEqual({ id: 'm1', name: 'Sam', active: false });
    expect(findSameName(data, 'Kim')).toBeNull();
  });

  it('never matches the unnamed default, and lets the receiver name the person', () => {
    const data = emptyData(); // the receiver is also the unnamed "Me"
    expect(findSameName(data, DEFAULT_PERSON_NAME)).toBeNull();
    const r = importPerson(data, shared({ name: DEFAULT_PERSON_NAME }), { replace: true, name: '  Kim ' });
    expect(r.profile).toEqual(data.profile); // own data untouched
    expect(r.household!.others.map((o) => o.name)).toEqual(['Kim']);
  });
});

describe('share: file name', () => {
  it('builds a safe .prperson name', () => {
    // The name never appears in the file name (it would sit outside the encryption).
    expect(shareFileName('Sam Lee', '2026-10-16')).toBe('pr-tracker-person-2026-10-16.prperson');
    expect(shareFileName('../a/b:c', 'bad')).toBe('pr-tracker-person-export.prperson');
    expect(shareFileName('小明', '2026-10-16')).toBe('pr-tracker-person-2026-10-16.prperson');
    expect(shareFileName('   ', 'bad')).toBe('pr-tracker-person-export.prperson');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addPerson,
  applyTogetherDate,
  DEFAULT_PERSON_NAME,
  householdReminders,
  householdSummary,
  listPeople,
  peopleCount,
  removePerson,
  renamePerson,
  sanitizeHousehold,
  SELF_ID,
  switchPerson,
} from './people';
import { emptyData, type AppData } from './types';

/** Alex (active, PR 2026-01-01, no trips) and Sam (PR 2026-03-01, one 9-day absence). */
function couple(): { data: AppData; alexId: string; samId: string } {
  let d = emptyData();
  d.profile.prDate = '2026-01-01';
  d.profile.prCardExpiry = '2031-01-01';
  d = renamePerson(d, SELF_ID, 'Alex');
  d = addPerson(d, 'Sam');
  const samId = listPeople(d)[1].id;
  d = switchPerson(d, samId);
  d = {
    ...d,
    profile: { ...d.profile, prDate: '2026-03-01' },
    trips: [{ id: 't1', departure: '2026-06-01', return: '2026-06-11', destination: 'Lisbon' }],
  };
  d = switchPerson(d, SELF_ID);
  return { data: d, alexId: SELF_ID, samId };
}

describe('people: no household', () => {
  it('is one person named from displayName or the default', () => {
    const d = emptyData();
    expect(listPeople(d)).toEqual([{ id: SELF_ID, name: DEFAULT_PERSON_NAME, active: true }]);
    expect(peopleCount(d)).toBe(1);
    d.profile.displayName = '  Ana ';
    expect(listPeople(d)[0].name).toBe('Ana');
  });

  it('switch/remove are no-ops and the summary has one entry', () => {
    const d = emptyData();
    expect(switchPerson(d, 'nobody')).toBe(d);
    expect(removePerson(d, SELF_ID)).toBe(d);
    const s = householdSummary(d, '2026-10-16');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: SELF_ID, active: true, isPr: false, citizenshipDate: null, credited: 0, residencyOk: null, abroad: false });
    expect(householdReminders(d, '2026-10-16')).toEqual([]);
    expect(applyTogetherDate(s)).toBeNull();
  });
});

describe('people: add / rename / remove', () => {
  it('adds an empty person without switching', () => {
    const d = emptyData();
    d.profile.prDate = '2025-05-05';
    const d2 = addPerson(d, '  Sam  ');
    expect(d2.profile).toBe(d.profile);
    expect(d2.household!.activeId).toBe(SELF_ID);
    expect(d2.household!.others).toHaveLength(1);
    expect(d2.household!.others[0]).toMatchObject({ name: 'Sam', profile: { statusPeriods: [], taxYearsFiled: [] }, trips: [] });
    expect(listPeople(d2).map((p) => [p.name, p.active])).toEqual([[DEFAULT_PERSON_NAME, true], ['Sam', false]]);
    expect(addPerson(d, '   ')).toBe(d); // blank names are ignored
    expect(d.household).toBeUndefined(); // input not mutated
  });

  it('renames the active and other people; ignores blank names and unknown ids', () => {
    let d = addPerson(emptyData(), 'Sam');
    const sam = listPeople(d)[1].id;
    d = renamePerson(d, SELF_ID, 'Alex');
    d = renamePerson(d, sam, 'Samira');
    expect(listPeople(d).map((p) => p.name)).toEqual(['Alex', 'Samira']);
    expect(renamePerson(d, sam, '  ')).toBe(d);
    expect(renamePerson(d, 'nope', 'X')).toBe(d);
  });

  it('removes others, removing the active one activates another, and refuses the last', () => {
    const { data, alexId, samId } = couple();
    const withoutSam = removePerson(data, samId);
    expect(listPeople(withoutSam).map((p) => p.id)).toEqual([alexId]);
    expect(withoutSam.profile).toBe(data.profile);
    expect(removePerson(withoutSam, alexId)).toBe(withoutSam); // last person

    const withoutAlex = removePerson(data, alexId);
    expect(withoutAlex.household!.activeId).toBe(samId);
    expect(withoutAlex.household!.activeName).toBe('Sam');
    expect(withoutAlex.profile.prDate).toBe('2026-03-01');
    expect(withoutAlex.trips.map((t) => t.id)).toEqual(['t1']);
    expect(removePerson(withoutAlex, samId)).toBe(withoutAlex);
    expect(removePerson(data, 'unknown')).toBe(data);
  });
});

describe('people: switching', () => {
  it('swaps profile/trips and round-trips identically', () => {
    const { data, samId } = couple();
    const a = data;
    const b = switchPerson(a, samId);
    expect(b.household!.activeId).toBe(samId);
    expect(b.household!.activeName).toBe('Sam');
    expect(b.profile.prDate).toBe('2026-03-01');
    expect(b.trips).toHaveLength(1);
    expect(b.household!.others[0]).toMatchObject({ id: SELF_ID, name: 'Alex' });
    expect(b.household!.others[0].profile).toBe(a.profile);
    expect(b.applications).toBe(a.applications); // shared
    const back = switchPerson(b, SELF_ID);
    expect(back.profile).toBe(a.profile);
    expect(back.trips).toBe(a.trips);
    expect(back.household).toEqual(a.household);
    expect(switchPerson(a, SELF_ID)).toBe(a); // already active
    expect(switchPerson(a, 'unknown')).toBe(a);
  });

  it('keeps three people intact across switches', () => {
    let d = addPerson(addPerson(emptyData(), 'B'), 'C');
    const [, b, c] = listPeople(d).map((p) => p.id);
    d = switchPerson(d, c);
    d = { ...d, trips: [{ id: 'tc', departure: '2025-01-01', return: '2025-01-05' }] };
    d = switchPerson(switchPerson(d, b), SELF_ID);
    expect(peopleCount(d)).toBe(3);
    const cPerson = d.household!.others.find((p) => p.id === c)!;
    expect(cPerson.trips.map((t) => t.id)).toEqual(['tc']);
    expect(d.trips).toEqual([]);
  });
});

describe('people: household summary', () => {
  it('computes per-person citizenship dates and the joint date', () => {
    const { data, samId } = couple();
    const s = householdSummary(data, '2026-10-16');
    // Alex: PR 2026-01-01, never away → 1,095 days counted by 2028-12-30, eligible to sign 2028-12-31
    // (same as insights.test). Sam: PR 2026-03-01 + 1,095 = 2029-02-28, plus 9 days away
    // (Jun 2–10; the departure and return days count as present) → 2029-03-09.
    expect(s.map((x) => [x.name, x.citizenshipDate])).toEqual([
      ['Alex', '2028-12-31'],
      ['Sam', '2029-03-09'],
    ]);
    expect(s[0]).toMatchObject({ active: true, isPr: true, residencyOk: true, prCardExpiry: '2031-01-01', abroad: false });
    expect(s[1]).toMatchObject({ id: samId, active: false, isPr: true, residencyOk: true, abroad: false });
    expect(s[1].prCardExpiry).toBeUndefined();
    // Credited on 2026-10-16 (window ends the day before): Alex Jan 1–Oct 15 = 288 days;
    // Sam Mar 1–Oct 15 = 229 days − 9 away = 220.
    expect(s[0].credited).toBe(288);
    expect(s[1].credited).toBe(220);
    expect(applyTogetherDate(s)).toBe('2029-03-09');
  });

  it('flags someone abroad and skips people without a PR date for the joint date', () => {
    let d = addPerson(emptyData(), 'Kid');
    d.profile.prDate = '2024-01-01';
    const kid = listPeople(d)[1].id;
    d = switchPerson(d, kid);
    d = { ...d, trips: [{ id: 'k', departure: '2026-10-01', return: null }] };
    const s = householdSummary(d, '2026-10-16');
    const kidRow = s.find((x) => x.id === kid)!;
    expect(kidRow).toMatchObject({ active: true, abroad: true, isPr: false, citizenshipDate: null, residencyOk: null });
    expect(applyTogetherDate(s)).toBeNull();
  });
});

describe('people: reminders for others', () => {
  it('prefixes ids and adds the name; none for the active person', () => {
    const { data, samId } = couple();
    const r = householdReminders(data, '2026-10-16');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.id.startsWith(`ppl-${samId}-`) && x.vars.name === 'Sam')).toBe(true);
    expect(r.find((x) => x.id === `ppl-${samId}-cit-eligible`)!.date).toBe('2029-03-09');
  });
});

describe('people: sanitizeHousehold', () => {
  it('rejects non-objects and repairs people like migrate()', () => {
    expect(sanitizeHousehold(undefined)).toBeUndefined();
    expect(sanitizeHousehold('x')).toBeUndefined();
    const h = sanitizeHousehold({
      activeId: 'a',
      activeName: '',
      others: [
        { id: 'b', name: 'B', profile: { prDate: 'bad', statusPeriods: [{ id: 's', kind: 'worker', start: '2020-01-01', end: 'x' }, null], taxYearsFiled: [2024, 'x'] }, trips: [{ id: 't', departure: '2024-01-01', return: 'oops' }, { id: 5, departure: '2024-01-01' }, { id: 'u', departure: 'no' }] },
        { id: 'a', name: 'Dup', profile: {}, trips: [] },
        { id: 'c', name: 'NoProfile' },
        null,
      ],
    })!;
    expect(h.activeId).toBe('a');
    expect(h.activeName).toBe(DEFAULT_PERSON_NAME);
    expect(h.others).toHaveLength(2);
    expect(h.others[0].profile).toMatchObject({ prDate: undefined, statusPeriods: [{ id: 's', end: null }], taxYearsFiled: [2024] });
    expect(h.others[0].trips).toEqual([{ id: 't', departure: '2024-01-01', return: null }]);
    expect(h.others[1].id).not.toBe('a'); // duplicate id replaced, data kept
    expect(h.others[1].name).toBe('Dup');
    expect(h.others[1].profile).toMatchObject({ statusPeriods: [], taxYearsFiled: [] });
  });
});

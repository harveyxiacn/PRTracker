// Mirrors IRCC open data into public/data/ (run by the scheduled data workflow).
// Usage: node scripts/fetch-ircc.mjs [outDir=public/data]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2]?.endsWith('.json') ? path.dirname(process.argv[2]) : process.argv[2] ?? 'public/data';
const BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
// The first two files are what IRCC's processing-time tool uses today; the others are
// probed in case IRCC republishes permanent-residence/citizenship times separately.
const SOURCES = ['data-ptime-non-country-en.json', 'data-ptime-en.json', 'data-ptime-pr-en.json', 'data-ptime-citizenship-en.json'];
const DRAWS = BASE + 'ee_rounds_123_en.json';

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'pr-tracker-open-data-mirror (+https://github.com/harveyxiacn/PRTracker)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function previous(file) {
  try {
    return JSON.parse(await readFile(path.join(outDir, file), 'utf8'));
  } catch {
    return undefined;
  }
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

export function parseDuration(s) {
  const m = /([\d.]+)\s*(day|week|month|year)s?/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return Math.round(n * (unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30.44 : 365.25));
}

// Program id / time key -> patterns tried against flattened non-country IRCC keys.
// Only PR card and in-Canada extensions are published today; the PR-program patterns
// are kept in case IRCC adds those series back.
const MAP = {
  pr_card: [/pr_card\.existing_pr/i, /pr_card\.renew/i],
  pr_card_new: [/pr_card\.new_pr/i],
  study_ext: [/study_extension/i],
  work_ext: [/work_extension/i],
  visitor_ext: [/visitor_extension/i],
  citizenship: [/cit[^.]*grant/i, /grant[^.]*cit/i],
  ee_cec: [/\bcec\b/i, /canadian[_ ]?experience/i],
  ee_fsw: [/\bfsw\b/i, /fed[^.]*skilled[^.]*worker/i],
  ee_fst: [/skilled_trades_ee/i],
  pnp_ee: [/pnp[^.]*ee/i],
  pnp_base: [/pnp(?![^.]*ee)/i],
  spousal: [/spous/i],
};

// Per-country series kept for the app (applicant's country of residence -> days).
const COUNTRY_SERIES = ['visitor-outside-canada', 'supervisa', 'study', 'work', 'child_dependent', 'child_adopted'];

async function main() {
  await mkdir(outDir, { recursive: true });
  const entries = {};
  let updated = '';
  let primaryOk = false;
  for (const f of SOURCES) {
    try {
      const j = await get(BASE + f, f === SOURCES[0] ? 3 : 1);
      Object.assign(entries, flatten(j, f.replace(/\.json$/, '')));
      if (f === SOURCES[0]) primaryOk = true;
    } catch (e) {
      console.warn('skip', f, e.message);
    }
  }
  for (const [k, v] of Object.entries(entries)) if (k.endsWith('lastupdated') && !updated) updated = v;
  const times = {};
  // Skip per-country rows (any path segment that is a 2-letter country code).
  const keys = Object.keys(entries).filter((k) => !k.split('.').some((seg) => /^[A-Z]{2}$/.test(seg)));
  for (const [kind, pats] of Object.entries(MAP)) {
    for (const p of pats) {
      const k = keys.find((key) => p.test(key) && parseDuration(entries[key]) !== null);
      if (k) {
        times[kind] = parseDuration(entries[k]);
        console.log(`${kind} <- ${k} = ${entries[k]}`);
        break;
      }
    }
  }
  console.log('non-country keys:', keys.join(', '));
  const nonCountry = Object.fromEntries(keys.filter((k) => !k.endsWith('lastupdated')).map((k) => [k, entries[k]]));
  const byCountry = {};
  for (const series of COUNTRY_SERIES) {
    const prefix = `data-ptime-en.${series}.`;
    const map = {};
    for (const [k, v] of Object.entries(entries)) {
      const m = k.startsWith(prefix) && /^([A-Z]{2})$/.exec(k.slice(prefix.length));
      const d = m && parseDuration(v);
      if (d) map[m[1]] = d;
    }
    if (Object.keys(map).length) byCountry[series] = map;
    console.log(`${series}: ${Object.keys(map).length} countries`);
  }
  // Never replace good data with partial data: keep previous values for anything missing.
  const prev = await previous('ircc.json');
  if (!primaryOk && prev) {
    console.warn('primary IRCC file unavailable; keeping previous ircc.json');
  } else if (Object.keys(entries).length) {
    const merged = {
      updated: updated || prev?.updated || '',
      fetchedAt: new Date().toISOString(),
      times: { ...(prev?.times ?? {}), ...times },
      byCountry: { ...(prev?.byCountry ?? {}), ...byCountry },
      entries: Object.keys(nonCountry).length ? nonCountry : prev?.entries ?? {},
    };
    await writeFile(path.join(outDir, 'ircc.json'), JSON.stringify(merged, null, 1));
  }

  try {
    const d = await get(DRAWS);
    const rounds = (d.rounds ?? d.Rounds ?? []).map((r) => ({
      number: Number(r.drawNumber ?? r.drawNumberURL ?? 0),
      date: String(r.drawDate ?? r.drawDateFull ?? ''),
      name: String(r.drawName ?? r.drawText2 ?? ''),
      size: Number(String(r.drawSize ?? '0').replace(/,/g, '')),
      crs: Number(String(r.drawCRS ?? '0').replace(/,/g, '')),
    })).filter((r) => r.date && r.crs > 0).slice(0, 60);
    console.log('draws:', rounds.length, rounds[0]);
    if (rounds.length) await writeFile(path.join(outDir, 'draws.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), draws: rounds }, null, 1));
  } catch (e) {
    console.warn('draws skipped:', e.message);
  }
  try {
    await readFile(path.join(outDir, 'community.json'));
  } catch {
    await writeFile(path.join(outDir, 'community.json'), JSON.stringify({ updated: new Date().toISOString(), records: [] }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

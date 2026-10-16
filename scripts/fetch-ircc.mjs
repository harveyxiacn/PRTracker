// Mirrors IRCC open data into public/data/ (run by the scheduled data workflow).
// Usage: node scripts/fetch-ircc.mjs [outDir=public/data]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2]?.endsWith('.json') ? path.dirname(process.argv[2]) : process.argv[2] ?? 'public/data';
const BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const SOURCES = ['data-ptime-non-country-en.json', 'data-ptime-en.json'];
const DRAWS = BASE + 'ee_rounds_123_en.json';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'pr-tracker-open-data-mirror (+https://github.com/harveyxiacn/PRTracker)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
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

// Application kind -> patterns tried against flattened IRCC keys (first match wins).
const MAP = {
  citizenship: [/cit[^.]*grant/i, /grant[^.]*cit/i, /citizenship\.(cit_)?grant/i],
  pr_card: [/pr_card\.existing_pr/i, /pr_card\.renew/i],
  ee_cec: [/\bcec\b/i, /canadian[_ ]?experience/i, /_cec/i],
  ee_fsw: [/\bfsw\b/i, /fed[^.]*skilled[^.]*worker/i, /_fsw/i],
  ee_fst: [/skilled_trades_ee/i, /\bfst\b/i],
  pnp_ee: [/pnp[^.]*ee/i, /provincial[^.]*express/i],
  pnp_base: [/pnp(?![^.]*ee)/i, /provincial[^.]*(paper|base)/i],
  spousal: [/spouse[^.]*(outside|out)[^.]*quebec/i, /spous/i, /partner/i],
};

async function main() {
  await mkdir(outDir, { recursive: true });
  const entries = {};
  let updated = '';
  for (const f of SOURCES) {
    try {
      const j = await get(BASE + f);
      Object.assign(entries, flatten(j, f.replace(/\.json$/, '')));
    } catch (e) {
      console.warn('skip', f, e.message);
    }
  }
  for (const [k, v] of Object.entries(entries)) if (k.endsWith('lastupdated') && !updated) updated = v;
  const times = {};
  const keys = Object.keys(entries).filter((k) => !/\.([A-Z]{2})$/.test(k)); // skip per-country rows
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
  const nonCountry = Object.fromEntries(keys.map((k) => [k, entries[k]]));
  if (Object.keys(entries).length) {
    await writeFile(path.join(outDir, 'ircc.json'), JSON.stringify({ updated, fetchedAt: new Date().toISOString(), times, entries: nonCountry }, null, 1));
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

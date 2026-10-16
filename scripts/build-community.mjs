// Validates anonymised community timelines (community/records.jsonl, plus the optional
// community/reddit.jsonl from scripts/fetch-reddit.ts) and writes
// public/data/community.json. Also used by the intake workflow to add a record from an
// approved GitHub issue: node scripts/build-community.mjs --add-from-issue issue.md
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';

// Keep in sync with PROGRAMS in src/domain/programs.ts (checked by a unit test).
export const KINDS = ['ee_cec', 'ee_fsw', 'ee_fst', 'pnp_ee', 'pnp_base', 'qc_skilled', 'qc_peq', 'aip', 'rcip', 'fcip', 'caregiver', 'startup',
  'spousal_out', 'spousal_in', 'spousal', 'child', 'pgp', 'protected', 'hc', 'study_permit', 'work_permit', 'visitor_visa', 'super_visa',
  'study_ext', 'work_ext', 'pgwp', 'owp_spouse', 'visitor_record', 'citizenship', 'pr_card', 'prtd', 'other'];
const KEY_RE = /^[a-z_0-9]{2,24}$/;
// Keep in sync with OFFICES in src/domain/programs.ts (checked by a unit test).
export const OFFICES = ['Ottawa', 'Sydney', 'Edmonton', 'Mississauga', 'Montreal', 'Vancouver', 'Winnipeg', 'Etobicoke', 'Calgary', 'Toronto', 'Halifax',
  'Case Processing Centre', 'Domestic Network', 'International Network', 'Centralized Intake Office',
  'New Delhi', 'Chandigarh', 'Manila', 'Beijing', 'Hong Kong', 'Islamabad', 'Nairobi', 'Dakar', 'Abu Dhabi', 'Ankara', 'Paris', 'London',
  'Mexico City', 'Bogota', 'Sao Paulo', 'Lima', 'Port of Spain', 'Accra', 'Lagos', 'Rabat', 'Cairo', 'Singapore', 'Ho Chi Minh City', 'Tokyo', 'Seoul'];

export function validate(r) {
  if (!r || typeof r !== 'object') return 'not an object';
  if (!KINDS.includes(r.kind)) return 'bad kind';
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(r.submittedMonth ?? '')) return 'bad submittedMonth';
  if (!r.days || typeof r.days !== 'object') return 'bad days';
  for (const [k, v] of Object.entries(r.days)) {
    if (!KEY_RE.test(k) || !Number.isInteger(v) || v < 0 || v > 3650) return `bad day value ${k}`;
  }
  if (r.office !== undefined && !OFFICES.includes(r.office)) return 'office not in the allowed list';
  if (r.province !== undefined && !/^[A-Z]{2}$/.test(r.province)) return 'bad province';
  if (r.country !== undefined && !/^[A-Z]{2}$/.test(r.country)) return 'bad country';
  if (r.source !== undefined && !['app', 'reddit', 'paste'].includes(r.source)) return 'bad source';
  const extra = Object.keys(r).filter((k) => !['kind', 'submittedMonth', 'days', 'office', 'province', 'country', 'source'].includes(k));
  if (extra.length) return `unexpected fields: ${extra.join(',')}`;
  return null;
}

async function addFromIssue(file) {
  const body = await readFile(file, 'utf8');
  // The issue form wraps the record in a ```json fence; take the outermost {...}.
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON record found in issue');
  const rec = JSON.parse(body.slice(start, end + 1));
  const err = validate(rec);
  if (err) throw new Error(`Invalid record: ${err}`);
  const clean = { kind: rec.kind, submittedMonth: rec.submittedMonth, days: rec.days };
  for (const k of ['office', 'province', 'country']) if (rec[k]) clean[k] = rec[k];
  clean.source = rec.source === 'paste' ? 'paste' : 'app';
  await mkdir('community', { recursive: true });
  await appendFile('community/records.jsonl', JSON.stringify(clean) + '\n');
  console.log('added', clean);
}

// App/paste submissions first, then timelines collected from public Reddit posts
// (scripts/fetch-reddit.ts, optional). Missing files are fine.
export const SOURCES = ['community/records.jsonl', 'community/reddit.jsonl'];

async function build() {
  const lines = [];
  for (const file of SOURCES) {
    try {
      (await readFile(file, 'utf8')).split('\n').forEach((l, i) => {
        if (l.trim()) lines.push({ l, where: `${file}:${i + 1}`, reddit: file.endsWith('reddit.jsonl') });
      });
    } catch {
      /* none yet */
    }
  }
  const records = [];
  const seen = new Set();
  lines.forEach(({ l, where, reddit }) => {
    try {
      const r = JSON.parse(l);
      // Records from the Reddit file are always marked as such.
      const err = validate(r) ?? (reddit && r.source !== 'reddit' ? 'reddit record without source "reddit"' : null);
      // The same public post pasted by several people (or also collected from Reddit) must count once.
      const key = JSON.stringify([r.kind, r.submittedMonth, r.province, r.country, Object.entries(r.days ?? {}).sort()]);
      if (err) console.warn(`${where}: ${err}`);
      else if (seen.has(key)) console.warn(`${where}: duplicate, skipped`);
      else {
        seen.add(key);
        records.push(r);
      }
    } catch {
      console.warn(`${where}: invalid JSON`);
    }
  });
  await mkdir('public/data', { recursive: true });
  // One record per line so the data workflow can ignore the `updated` line when diffing.
  const body = records.map((r) => '  ' + JSON.stringify(r)).join(',\n');
  await writeFile('public/data/community.json', `{\n "updated": "${new Date().toISOString()}",\n "records": [\n${body}\n ]\n}\n`);
  console.log(`community.json: ${records.length} records`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-community.mjs')) {
  const i = process.argv.indexOf('--add-from-issue');
  if (i > 0) {
    try {
      await addFromIssue(process.argv[i + 1]);
    } catch (e) {
      // One clean line (no stack trace): the intake workflow posts it on the issue.
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
  await build();
}

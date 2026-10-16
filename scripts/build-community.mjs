// Validates anonymised community timelines (community/records.jsonl) and writes
// public/data/community.json. Also used by the intake workflow to add a record from an
// approved GitHub issue: node scripts/build-community.mjs --add-from-issue issue.md
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';

const KINDS = ['ee_cec', 'ee_fsw', 'ee_fst', 'pnp_ee', 'pnp_base', 'spousal', 'citizenship', 'pr_card', 'other'];
const KEY_RE = /^[a-z_]{2,24}$/;

export function validate(r) {
  if (!r || typeof r !== 'object') return 'not an object';
  if (!KINDS.includes(r.kind)) return 'bad kind';
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(r.submittedMonth ?? '')) return 'bad submittedMonth';
  if (!r.days || typeof r.days !== 'object') return 'bad days';
  for (const [k, v] of Object.entries(r.days)) {
    if (!KEY_RE.test(k) || !Number.isInteger(v) || v < 0 || v > 3650) return `bad day value ${k}`;
  }
  if (r.office !== undefined && (typeof r.office !== 'string' || r.office.length > 40)) return 'bad office';
  const extra = Object.keys(r).filter((k) => !['kind', 'submittedMonth', 'days', 'office'].includes(k));
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
  const clean = { kind: rec.kind, submittedMonth: rec.submittedMonth, days: rec.days, ...(rec.office ? { office: rec.office } : {}) };
  await mkdir('community', { recursive: true });
  await appendFile('community/records.jsonl', JSON.stringify(clean) + '\n');
  console.log('added', clean);
}

async function build() {
  let lines = [];
  try {
    lines = (await readFile('community/records.jsonl', 'utf8')).split('\n').filter((l) => l.trim());
  } catch {
    /* none yet */
  }
  const records = [];
  lines.forEach((l, i) => {
    try {
      const r = JSON.parse(l);
      const err = validate(r);
      if (err) console.warn(`line ${i + 1}: ${err}`);
      else records.push(r);
    } catch {
      console.warn(`line ${i + 1}: invalid JSON`);
    }
  });
  await mkdir('public/data', { recursive: true });
  // One record per line so the data workflow can ignore the `updated` line when diffing.
  const body = records.map((r) => '  ' + JSON.stringify(r)).join(',\n');
  await writeFile('public/data/community.json', `{\n "updated": "${new Date().toISOString()}",\n "records": [\n${body}\n ]\n}\n`);
  console.log(`community.json: ${records.length} records`);
}

const i = process.argv.indexOf('--add-from-issue');
if (i > 0) await addFromIssue(process.argv[i + 1]);
await build();

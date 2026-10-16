// Moderation report for the open community dataset (community/*.jsonl). Read-only: it never
// edits the data, it lists what a maintainer should look at, as Markdown.
//
//   node scripts/moderate-community.mjs            # report on stdout
//   node scripts/moderate-community.mjs --strict   # also exit 1 when anything is flagged
//
// Flags
// - invalid: the same validation build-community.mjs applies (those lines are skipped by the build)
// - exact duplicates (also skipped by the build) and near-duplicates: same kind, month and
//   office/province/country, at least 2 shared milestones, every shared milestone within ±1 day
// - outliers: final-milestone days > 1.5 × p99 of the OTHER records of that kind (leave-one-out,
//   so one extreme record can't hide itself), or < 5 days for permanent-residence programs
// - order violations: e.g. COPR before AOR, biometrics before the biometrics request
import { readFile } from 'node:fs/promises';
import { KINDS, SOURCES, validate } from './build-community.mjs';

// Final milestone per kind. Keep in sync with FINAL_MILESTONE in src/domain/timeline.ts
// (checked by src/domain/curves.test.ts).
const TEMPORARY = ['study_permit', 'work_permit', 'visitor_visa', 'super_visa', 'study_ext', 'work_ext', 'pgwp', 'owp_spouse', 'visitor_record'];
const NOT_PR = { citizenship: 'oath', pr_card: 'card_received', prtd: 'decision', other: 'decision' };
export const FINAL_BY_KIND = Object.fromEntries(KINDS.map((k) => [k, NOT_PR[k] ?? (TEMPORARY.includes(k) ? 'decision' : 'copr')]));
/** Kinds whose final milestone is COPR (permanent residence). */
export const PR_KINDS = KINDS.filter((k) => FINAL_BY_KIND[k] === 'copr');

/** Pairs [earlier, later]: when both are present, `earlier` must not come after `later`. */
export const ORDER_RULES = [
  ['aor', 'ppr'], ['aor', 'copr'], ['ppr', 'copr'], ['copr', 'landed'], ['aor', 'landed'],
  ['biometrics_request', 'biometrics'], ['passport_sent', 'passport_returned'], ['portal1', 'portal2'],
  ['sponsor_approved', 'copr'], ['stage1', 'copr'],
  ['decision', 'permit_issued'], ['passport_request', 'permit_issued'],
  ['aor', 'test_invite'], ['test_invite', 'test'], ['oath_invite', 'oath'], ['aor', 'oath'],
  ['aor', 'card_mailed'], ['card_mailed', 'card_received'], ['aor', 'card_received'],
];

export const MIN_PR_DAYS = 5;
export const P99_FACTOR = 1.5;

/** Nearest-rank quantile of an ascending list. */
function quantile(sorted, q) {
  if (!sorted.length) return undefined;
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length - 1e-9))) - 1];
}

const dupKey = (r) => JSON.stringify([r.kind, r.submittedMonth, r.province, r.country, Object.entries(r.days ?? {}).sort()]);
const groupKey = (r) => JSON.stringify([r.kind, r.submittedMonth, r.office, r.province, r.country]);

function nearDuplicate(a, b) {
  const shared = Object.keys(a.days).filter((k) => k in b.days);
  return shared.length >= 2 && shared.every((k) => Math.abs(a.days[k] - b.days[k]) <= 1);
}

/**
 * Check parsed lines. `lines`: [{ where: 'file:line', text }]. Returns findings
 * [{ where, type: 'invalid'|'duplicate'|'outlier'|'order', reason, record? }].
 */
export function moderate(lines) {
  const findings = [];
  const ok = [];
  const seen = new Map();
  for (const { where, text } of lines) {
    let r;
    try {
      r = JSON.parse(text);
    } catch {
      findings.push({ where, type: 'invalid', reason: 'invalid JSON' });
      continue;
    }
    const err = validate(r) ?? (where.includes('reddit.jsonl') && r.source !== 'reddit' ? 'reddit record without source "reddit"' : null);
    if (err) {
      findings.push({ where, type: 'invalid', reason: err, record: r });
      continue;
    }
    const k = dupKey(r);
    if (seen.has(k)) {
      findings.push({ where, type: 'duplicate', reason: `exact duplicate of ${seen.get(k)} (skipped by the build)`, record: r });
      continue;
    }
    seen.set(k, where);
    ok.push({ where, r });
  }

  // Near-duplicates within the same kind/month/office/province/country.
  const groups = new Map();
  for (const x of ok) {
    const g = groupKey(x.r);
    const prev = groups.get(g) ?? [];
    const twin = prev.find((p) => nearDuplicate(p.r, x.r));
    if (twin) findings.push({ where: x.where, type: 'duplicate', reason: `looks like a duplicate of ${twin.where}`, record: x.r });
    prev.push(x);
    groups.set(g, prev);
  }

  // Outliers on the final milestone, per kind (leave-one-out p99).
  const byKind = new Map();
  for (const x of ok) {
    const d = x.r.days[FINAL_BY_KIND[x.r.kind]];
    if (typeof d !== 'number') continue;
    const list = byKind.get(x.r.kind) ?? [];
    list.push({ ...x, d });
    byKind.set(x.r.kind, list);
  }
  for (const [kind, list] of byKind) {
    const final = FINAL_BY_KIND[kind];
    const sorted = list.map((x) => x.d).sort((a, b) => a - b);
    for (const x of list) {
      const others = sorted.slice();
      others.splice(others.indexOf(x.d), 1);
      const p99 = quantile(others, 0.99);
      if (p99 !== undefined && x.d > p99 * P99_FACTOR) {
        findings.push({ where: x.where, type: 'outlier', reason: `${final} on day ${x.d} is more than ${P99_FACTOR}× the p99 of other ${kind} records (${p99})`, record: x.r });
      } else if (PR_KINDS.includes(kind) && x.d < MIN_PR_DAYS) {
        findings.push({ where: x.where, type: 'outlier', reason: `${final} on day ${x.d} (under ${MIN_PR_DAYS} days for a PR program)`, record: x.r });
      }
    }
  }

  // Milestone order.
  for (const x of ok) {
    for (const [a, b] of ORDER_RULES) {
      const da = x.r.days[a];
      const db = x.r.days[b];
      if (typeof da === 'number' && typeof db === 'number' && da > db) {
        findings.push({ where: x.where, type: 'order', reason: `${b} (day ${db}) before ${a} (day ${da})`, record: x.r });
      }
    }
  }
  return { total: lines.length, valid: ok.length, findings };
}

const SECTIONS = [
  ['invalid', 'Invalid (skipped by the build)'],
  ['duplicate', 'Duplicates'],
  ['outlier', 'Outliers'],
  ['order', 'Milestone order'],
];

/** Markdown report. */
export function report({ total, valid, findings }, date = new Date().toISOString().slice(0, 10)) {
  const out = [`# Community data moderation report (${date})`, '', `${total} lines, ${valid} valid unique records, ${findings.length} flagged.`, ''];
  for (const [type, title] of SECTIONS) {
    const items = findings.filter((f) => f.type === type);
    out.push(`## ${title} (${items.length})`, '');
    if (!items.length) out.push('None.', '');
    else {
      for (const f of items) out.push(`- [ ] \`${f.where}\` ${f.reason}${f.record ? ` — \`${JSON.stringify(f.record)}\`` : ''}`);
      out.push('');
    }
  }
  return out.join('\n');
}

async function readLines(files = SOURCES) {
  const lines = [];
  for (const file of files) {
    try {
      (await readFile(file, 'utf8')).split('\n').forEach((text, i) => {
        if (text.trim()) lines.push({ where: `${file}:${i + 1}`, text });
      });
    } catch {
      /* missing file is fine */
    }
  }
  return lines;
}

if (process.argv[1]?.endsWith('moderate-community.mjs')) {
  const result = moderate(await readLines());
  console.log(report(result));
  if (process.argv.includes('--strict') && result.findings.length) process.exit(1);
}

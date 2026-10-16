// Appends today's IRCC processing times (public/data/ircc.json) to the history used by the
// Trends card (public/data/ircc-history.json). Run after fetch-ircc.mjs by the data workflow.
// A point is stored only when a value changed or the last point is 30+ days old, so the file
// stays small. The rules live in src/data/trendsCore.ts (shared with the app and its tests),
// which Node loads directly with type stripping (Node >= 22.18, or 22.6+ with
// --experimental-strip-types).
// Usage: node scripts/ircc-history.mjs [dataDir=public/data] [--date YYYY-MM-DD]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appendSnapshot, validateTrends } from '../src/data/trendsCore.ts';

const args = process.argv.slice(2);
const dateIdx = args.indexOf('--date');
const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date') ?? 'public/data';

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

const ircc = await readJson(path.join(dir, 'ircc.json'));
if (!ircc || typeof ircc !== 'object') {
  console.warn('ircc-history: no ircc.json; history unchanged');
  process.exit(0);
}
const historyFile = path.join(dir, 'ircc-history.json');
const raw = await readJson(historyFile);
const prev = validateTrends(raw);
if (raw !== undefined && !prev) throw new Error(`${historyFile} is malformed; refusing to overwrite it`);
const next = appendSnapshot(prev, ircc, date, new Date().toISOString());
const before = JSON.stringify(prev?.series ?? {});
if (JSON.stringify(next.series) === before && prev) {
  console.log('ircc-history: no new points');
} else {
  // One series per line so diffs stay readable; `updated` changes alone are ignored by the workflow.
  const lines = Object.entries(next.series).map(([k, pts]) => `  ${JSON.stringify(k)}: ${JSON.stringify(pts)}`);
  await writeFile(historyFile, `{\n "updated": ${JSON.stringify(next.updated)},\n "series": {\n${lines.join(',\n')}\n }\n}\n`);
  const points = Object.values(next.series).reduce((n, p) => n + p.length, 0);
  console.log(`ircc-history: ${Object.keys(next.series).length} series, ${points} points (${date})`);
}

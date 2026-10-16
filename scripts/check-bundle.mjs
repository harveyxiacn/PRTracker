// Performance budget for the web build. Run after `vite build`:
//   node scripts/check-bundle.mjs [distDir]
// Fails (exit 1) when the entry chunk (the <script type="module" src> in dist/index.html) is over
// 140 kB gzip or 450 kB raw, or when any other JS chunk (lazy screens, language packs, shared
// chunks) is over 120 kB gzip. Prints a table of every chunk either way.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1000;
export const BUDGET = {
  entryGzip: 140 * KB,
  entryRaw: 450 * KB,
  chunkGzip: 120 * KB,
};

/** The entry chunk's file name, from the first <script type="module" src="..."> in index.html. */
export function entryFromHtml(html) {
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (!/\btype\s*=\s*["']?module\b/i.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) return path.posix.basename(src.split(/[?#]/)[0]);
  }
  return null;
}

/** Chunks the browser fetches up front via <link rel="modulepreload">. */
export function preloadsFromHtml(html) {
  const out = [];
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    if (!/\brel\s*=\s*["']?modulepreload\b/i.test(m[1])) continue;
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) out.push(path.posix.basename(href.split(/[?#]/)[0]));
  }
  return out;
}

/** Pure check: rows of { file, raw, gzip } plus the entry name → { rows (with kind/over), failures }. */
export function evaluate(chunks, entry, preloads = [], budget = BUDGET) {
  const failures = [];
  const rows = chunks.map((c) => {
    const kind = c.file === entry ? 'entry' : preloads.includes(c.file) ? 'preload' : 'lazy';
    const over = [];
    if (kind === 'entry') {
      if (c.gzip > budget.entryGzip) over.push(`gzip ${fmt(c.gzip)} > ${fmt(budget.entryGzip)}`);
      if (c.raw > budget.entryRaw) over.push(`raw ${fmt(c.raw)} > ${fmt(budget.entryRaw)}`);
    } else if (c.gzip > budget.chunkGzip) {
      over.push(`gzip ${fmt(c.gzip)} > ${fmt(budget.chunkGzip)}`);
    }
    for (const o of over) failures.push(`${c.file} (${kind}): ${o}`);
    return { ...c, kind, ok: over.length === 0 };
  });
  if (!rows.some((r) => r.kind === 'entry')) failures.push(`entry chunk ${entry ?? '(none)'} not found in assets`);
  const order = { entry: 0, preload: 1, lazy: 2 };
  rows.sort((a, b) => order[a.kind] - order[b.kind] || b.gzip - a.gzip);
  return { rows, failures };
}

export function fmt(bytes) {
  return `${(bytes / KB).toFixed(1)} kB`;
}

export function table(rows) {
  const head = ['kind', 'file', 'raw', 'gzip', ''];
  const body = rows.map((r) => [r.kind, r.file, fmt(r.raw), fmt(r.gzip), r.ok ? 'ok' : 'OVER']);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => cells.map((c, i) => (i >= 2 && i <= 3 ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ').trimEnd();
  return [line(head), w.map((n) => '-'.repeat(n)).join('  '), ...body.map(line)].join('\n');
}

async function main() {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const assets = path.join(dist, 'assets');
  let html;
  try {
    html = await readFile(path.join(dist, 'index.html'), 'utf8');
  } catch {
    console.error(`check-bundle: ${path.join(dist, 'index.html')} not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
  const entry = entryFromHtml(html);
  const preloads = preloadsFromHtml(html);
  const files = (await readdir(assets)).filter((f) => f.endsWith('.js'));
  const chunks = await Promise.all(
    files.map(async (file) => {
      const buf = await readFile(path.join(assets, file));
      return { file, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
    }),
  );
  const { rows, failures } = evaluate(chunks, entry, preloads);
  console.log(table(rows));
  const initial = rows.filter((r) => r.kind !== 'lazy').reduce((s, r) => s + r.gzip, 0);
  const all = rows.reduce((s, r) => s + r.gzip, 0);
  console.log(`\n${rows.length} chunks; initial JS ${fmt(initial)} gzip; all JS ${fmt(all)} gzip`);
  console.log(`Budget: entry ≤ ${fmt(BUDGET.entryGzip)} gzip and ≤ ${fmt(BUDGET.entryRaw)} raw; every other chunk ≤ ${fmt(BUDGET.chunkGzip)} gzip`);
  if (failures.length) {
    console.error(`\nPerformance budget exceeded:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Performance budget OK');
}

if (process.argv[1]?.endsWith('check-bundle.mjs')) {
  await main();
}

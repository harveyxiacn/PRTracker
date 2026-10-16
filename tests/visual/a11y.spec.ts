// Accessibility audit: runs axe-core (WCAG 2.0 A/AA + 2.1 AA rules) on every screen with demo data
// in a left-to-right and a right-to-left language. Writes screenshots/a11y/<lang>-<route>.json and
// fails only on critical/serious violations; moderate/minor ones are logged for triage.
// Setup mirrors screens.spec.ts (not imported: importing a spec file would register its tests too).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LANGS = ['en', 'ar'] as const;
const ROUTES = ['home', 'calendar', 'trips', 'timeline', 'assistant', 'eligibility', 'community', 'settings', 'documents', 'history'] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const BLOCKING = new Set(['critical', 'serious']);

/** Same frozen clock as screens.spec.ts so the demo data is identical on every run. */
const FIXED_NOW = new Date('2026-10-16T12:00:00');
const OUT_DIR = path.join('screenshots', 'a11y');

async function open(page: Page, lang: string, route: string) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(`/?demo=1&lang=${lang}#/${route}`, { waitUntil: 'networkidle' });
  await page.locator('main').first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Let entry animations (sheet/progress transitions) settle so colours are final for the contrast rule.
  await page.waitForTimeout(250);
}

interface Summary {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  nodes: { target: string; html: string; summary: string }[];
}

for (const lang of LANGS) {
  test.describe(`a11y (${lang})`, () => {
    for (const route of ROUTES) {
      test(`${lang} ${route}`, async ({ page }, testInfo) => {
        await open(page, lang, route);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        const violations: Summary[] = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? 'unknown',
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 300), summary: n.failureSummary ?? '' })),
        }));
        await mkdir(OUT_DIR, { recursive: true });
        await writeFile(
          path.join(OUT_DIR, `${lang}-${route}.json`),
          JSON.stringify({ lang, route, url: page.url(), tags: TAGS, axe: results.testEngine.version, violations, incomplete: results.incomplete.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) }, null, 2),
        );

        const blocking = violations.filter((v) => BLOCKING.has(v.impact));
        const minor = violations.filter((v) => !BLOCKING.has(v.impact));
        for (const v of minor) console.log(`[a11y ${lang}/${route}] ${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}`);
        if (minor.length) testInfo.annotations.push({ type: 'a11y-minor', description: minor.map((v) => `${v.impact}:${v.id}`).join(', ') });

        const report = blocking.map((v) => `${v.impact}: ${v.id} — ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target}\n      ${n.summary.replace(/\n/g, '\n      ')}`).join('\n')}`);
        expect(report, `critical/serious axe violations on ${lang}/${route}`).toEqual([]);
      });
    }
  });
}

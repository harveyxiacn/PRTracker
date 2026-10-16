// Screenshot every screen with demo data and check for layout and i18n regressions.
// Output: screenshots/<lang>/<route>.png (plus screenshots/en-dark/ and screenshots/en/trips-add.png).
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const LANGS = ['en', 'zh', 'ar', 'hi'] as const;
const ROUTES = ['home', 'calendar', 'trips', 'timeline', 'assistant', 'eligibility', 'community', 'settings', 'documents', 'history'] as const;

/** Frozen clock so the relative demo data (and every "days left" number) is identical on every run. */
const FIXED_NOW = new Date('2026-10-16T12:00:00');

/** Looks like an untranslated key, e.g. "trips.add" or "doc.chk.passport". */
const RAW_KEY = /^[a-z]+\.[a-zA-Z0-9_.]+$/;
/** …but domain names shown as link text ("canada.ca") are fine. */
const DOMAIN = /\.(ca|com|org|net|io|gov|app|dev)$/;

/** Collects console errors and uncaught exceptions; ignores failed loads of the optional open data (/data/*.json). */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  const isDataFetch = (s: string) => /\/data\/[^/?#]+\.json/.test(s);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location()?.url ?? '';
    if (isDataFetch(url) || isDataFetch(msg.text())) return;
    errors.push(`${msg.text()}${url ? ` (${url})` : ''}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function open(page: Page, lang: string, route: string) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(`/?demo=1&lang=${lang}#/${route}`, { waitUntil: 'networkidle' });
  await page.locator('main').first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function checkLayout(page: Page, errors: string[]) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'horizontal overflow').toBeLessThanOrEqual(innerWidth + 1);

  const rawKeys = await page.evaluate(
    ({ keySrc, domainSrc }) => {
      const key = new RegExp(keySrc);
      const domain = new RegExp(domainSrc);
      const visible = (el: Element | null) => {
        if (!el) return false;
        const he = el as HTMLElement;
        if (typeof he.checkVisibility === 'function' && !he.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const r = he.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const looksRaw = (s: string | null | undefined) => {
        const v = (s ?? '').trim();
        return !!v && key.test(v) && !domain.test(v);
      };
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p || p.closest('script,style,noscript')) continue;
        if (looksRaw(n.textContent) && visible(p)) found.push(n.textContent!.trim());
      }
      for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
        for (const a of ['aria-label', 'placeholder', 'title']) {
          if (looksRaw(el.getAttribute(a)) && visible(el)) found.push(`${a}=${el.getAttribute(a)}`);
        }
      }
      return [...new Set(found)];
    },
    { keySrc: RAW_KEY.source, domainSrc: DOMAIN.source },
  );
  expect(rawKeys, 'raw i18n keys on screen').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
}

const shot = (dir: string, name: string) => path.join('screenshots', dir, `${name}.png`);

for (const lang of LANGS) {
  test.describe(`screens (${lang})`, () => {
    for (const route of ROUTES) {
      test(`${lang} ${route}`, async ({ page }) => {
        const errors = trackErrors(page);
        await open(page, lang, route);
        await page.screenshot({ path: shot(lang, route), fullPage: true, animations: 'disabled' });
        await checkLayout(page, errors);
      });
    }
  });
}

test.describe('dark mode (en)', () => {
  test.use({ colorScheme: 'dark' });
  for (const route of ['home', 'calendar'] as const) {
    test(`dark ${route}`, async ({ page }) => {
      const errors = trackErrors(page);
      await open(page, 'en', route);
      await page.screenshot({ path: shot('en-dark', route), fullPage: true, animations: 'disabled' });
      await checkLayout(page, errors);
    });
  }
});

test('trips: add-trip sheet', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'en', 'trips');
  await page.locator('main').getByRole('button', { name: 'Add trip' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add trip' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(300); // let the slide-up transition finish
  await page.screenshot({ path: shot('en', 'trips-add'), animations: 'disabled' });
  await checkLayout(page, errors);
});

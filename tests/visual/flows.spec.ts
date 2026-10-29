// End-to-end user flows on a REAL, initially empty app (no ?demo): every test starts in a fresh
// browser context (empty IndexedDB), drives the UI like a user and checks the visible results
// against numbers worked out by hand from the rules in docs/RULES.md.
//
// Setup mirrors screens.spec.ts (frozen clock, same config/viewport). Differences:
//  • no demo data; onboarding is done through the UI;
//  • the remote open-data mirror is blocked, so predictions use the bundled copy (deterministic);
//  • service workers are blocked so reloads always hit the preview server;
//  • window.confirm() dialogs are accepted (Playwright dismisses them by default).
//
// Hand-computed reference (today = 2026-10-16, PR landing 2024-01-15, boundary days count as in Canada):
//  • PR days in Canada before today: 2024-01-15 … 2026-10-15 = 1,005 → ring "1005 of 1095".
//  • Earliest citizenship date: 2024-01-15 + 1,095 days = 2027-01-14 (90 days from today).
//  • Trip 2025-03-01 → 2025-03-21: 19 days outside (03-02 … 03-20) → 986 credited, eligible 2027-02-02 (109 days).
//  • PR card expiring 2028-03-01: 502 days left; renewal window opens 2027-06-01 (228 days).
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const FIXED_NOW = new Date('2026-10-16T12:00:00');
const PR_DATE = '2024-01-15';
const CARD_EXPIRY = '2028-03-01';
const PASSPHRASE = 'maple syrup on pancakes';

test.use({ locale: 'en-CA', timezoneId: 'America/Toronto', serviceWorkers: 'block' });

// ---------- helpers ----------

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Accept every confirm() (delete, restore, wipe).
  page.on('dialog', (d) => void d.accept());
  // Use the bundled open data only (no network dependency on GitHub Pages).
  await page.route(/harveyxiacn\.github\.io/, (r) => r.abort());
});

test.afterEach(() => {
  expect(pageErrors, 'uncaught exceptions').toEqual([]);
});

/** Open the app at a frozen time with no stored data. */
async function start(page: Page, now: Date = FIXED_NOW) {
  await page.clock.setFixedTime(now);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your days in Canada, counted right' })).toBeVisible();
}

/** Onboarding through the UI: Get started → status → Finish. */
async function onboard(page: Page, opts: { prDate?: string; cardExpiry?: string } = {}) {
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your status' })).toBeVisible();
  if (opts.prDate) await page.getByLabel('PR landing date').fill(opts.prDate);
  if (opts.cardExpiry) await page.getByLabel('PR card expiry date').fill(opts.cardExpiry);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Trips outside Canada' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

async function tab(page: Page, name: 'Home' | 'Calendar' | 'Trips' | 'Timeline' | 'Maple') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name === 'Home' ? 'PR Tracker' : name);
}

async function openSettings(page: Page) {
  // The top-bar Settings button is hidden while Settings is open.
  if (!page.url().endsWith('#/settings')) await page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
}

/** Add a completed trip with the trip editor on the Trips screen. */
async function addTrip(page: Page, departure: string, ret: string, extra: { destination?: string; purpose?: string } = {}) {
  await tab(page, 'Trips');
  await page.locator('main').getByRole('button', { name: 'Add trip' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add trip' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Left Canada').fill(departure);
  await sheet.getByLabel('Back in Canada').fill(ret);
  if (extra.destination) await sheet.getByLabel('Destination').fill(extra.destination);
  if (extra.purpose) await sheet.getByLabel('Purpose').selectOption(extra.purpose);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
}

/** The "Total days outside / Trips" summary card on the Trips screen. */
const tripsSummary = (page: Page) => page.locator('section.card').filter({ hasText: 'Total days outside' });

/** Same formatting as fmtDate(iso, 'en') in src/i18n/index.ts, computed in the browser's ICU. */
function fmt(page: Page, iso: string): Promise<string> {
  return page.evaluate((d) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day)));
  }, iso);
}

/**
 * The app's saved data, read straight from the app's own IndexedDB store ('pr-tracker' / 'kv', since v0.8). Never creates the
 * database: if it doesn't exist yet the upgrade is aborted, so the app's own schema still applies.
 */
function stored(page: Page): Promise<{ onboarded?: boolean; trips?: unknown[]; settings?: { language?: string }; lock?: unknown } | null> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('pr-tracker');
        req.onupgradeneeded = () => req.transaction?.abort();
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            return resolve(null);
          }
          const get = db.transaction('kv', 'readonly').objectStore('kv').get('prtracker.data.v1');
          get.onsuccess = () => {
            db.close();
            resolve(typeof get.result === 'string' ? JSON.parse(get.result) : null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

/** Wait until the debounced save has written `n` trips. */
async function waitForSavedTrips(page: Page, n: number) {
  await expect.poll(async () => (await stored(page))?.trips?.length ?? -1, { message: `saved trips = ${n}` }).toBe(n);
}

/** Export an encrypted backup from Settings and return the downloaded file's path. */
async function exportEncrypted(page: Page, outPath: string): Promise<string> {
  await openSettings(page);
  await page.getByRole('button', { name: 'Export encrypted' }).click();
  const sheet = page.getByRole('dialog', { name: 'Encrypt backup' });
  await sheet.getByLabel(/^Passphrase/).fill(PASSPHRASE);
  await sheet.getByLabel('Repeat passphrase').fill(PASSPHRASE);
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await sheet.getByRole('button', { name: 'Export encrypted' }).click();
  const file = await download;
  // The toast is transient: check it before the (possibly slow) copy of the download.
  await expect(page.getByText('Encrypted backup saved')).toBeVisible();
  expect(file.suggestedFilename()).toBe('pr-tracker-backup-2026-10-16.enc.json');
  await file.saveAs(outPath);
  return outPath;
}

async function wipeAll(page: Page) {
  await openSettings(page);
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await expect(page.getByRole('heading', { name: 'Your days in Canada, counted right' })).toBeVisible();
  await expect.poll(async () => (await stored(page))?.onboarded ?? false).toBe(false);
}

// ---------- 1. onboarding → Home numbers ----------

test('onboarding with PR date and card expiry shows hand-computed Home numbers', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE, cardExpiry: CARD_EXPIRY });

  const cit = page.getByRole('region', { name: 'Citizenship', exact: true });
  await expect(cit.getByRole('img', { name: '1005 of 1095 days credited' })).toBeVisible();
  await expect(cit).toContainText('Earliest date you meet physical presence');
  await expect(cit).toContainText(await fmt(page, '2027-01-14'));
  await expect(cit).toContainText('90 days from today · 90 more days needed');

  const res = page.getByRole('region', { name: 'PR residency obligation' });
  await expect(res).toContainText('1,005');
  await expect(res).toContainText('/ 730 days');
  await expect(res).toContainText('On track');
  await expect(res).toContainText(`PR under 5 years: reach 730 days by ${await fmt(page, '2029-01-15')}.`);
  await expect(res.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1005');

  const card = page.getByRole('region', { name: 'PR card', exact: true });
  await expect(card).toContainText(await fmt(page, CARD_EXPIRY));
  await expect(card).toContainText('502 days left');
  // Renewal opens when fewer than 270 days remain (pre-launch review), not at "9 months".
  await expect(card).toContainText(`Renewal window opens in 232 days (${await fmt(page, '2027-06-05')}), when fewer than 270 days (about 9 months) remain.`);

  // Reminders are listed on Home (scheduling on the OS is native-only).
  await expect(page.getByRole('heading', { name: 'Upcoming reminders' })).toBeVisible();
});

// ---------- 2. add a past trip → counts change; persistence ----------

test('adding a past trip updates Trips and Home by the hand-computed amount and survives a reload', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });

  await tab(page, 'Trips');
  await expect(page.getByText('No trips yet.', { exact: false })).toBeVisible();
  await expect(tripsSummary(page)).toContainText('0 days');

  await page.locator('main').getByRole('button', { name: 'Add trip' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add trip' });
  await sheet.getByLabel('Left Canada').fill('2025-03-01');
  await sheet.getByLabel('Back in Canada').fill('2025-03-21');
  // Live preview in the editor: days away and the new citizenship date.
  await expect(sheet).toContainText('19 days outside Canada');
  await expect(sheet).toContainText(`This trip moves your citizenship date to ${await fmt(page, '2027-02-02')}.`);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Trip saved')).toBeVisible();

  await expect(tripsSummary(page)).toContainText('19 days');
  const row = page.locator('main').getByRole('button', { name: /Abroad/ });
  await expect(row).toContainText(`${await fmt(page, '2025-03-01')} → ${await fmt(page, '2025-03-21')}`);
  await expect(row).toContainText('19');

  await tab(page, 'Home');
  const cit = page.getByRole('region', { name: 'Citizenship', exact: true });
  await expect(cit.getByRole('img', { name: '986 of 1095 days credited' })).toBeVisible();
  await expect(cit).toContainText(await fmt(page, '2027-02-02'));
  await expect(cit).toContainText('109 days from today · 109 more days needed');

  // Persistence: the debounced save reaches IndexedDB, then a reload shows the same numbers.
  await waitForSavedTrips(page, 1);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Citizenship', exact: true }).getByRole('img', { name: '986 of 1095 days credited' })).toBeVisible();
  await tab(page, 'Trips');
  await expect(tripsSummary(page)).toContainText('19 days');
});

// ---------- 4c. PIN lock (the lock screen is loaded on demand) ----------

test('a PIN lock shows the lock screen after a reload and the keypad unlocks it', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await openSettings(page);
  await page.getByRole('button', { name: 'Set PIN' }).click();
  const sheet = page.getByRole('dialog', { name: 'Set PIN' });
  await sheet.getByLabel('New PIN (4–8 digits)').fill('2468');
  await sheet.getByLabel('Repeat new PIN').fill('2468');
  await sheet.getByRole('button', { name: /save/i }).click();
  await expect(page.getByText('PIN saved')).toBeVisible();
  await expect.poll(async () => !!(await stored(page))?.lock).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'PR Tracker is locked' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  for (const d of '2468') await page.getByRole('button', { name: `Digit ${d}`, exact: true }).click();
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

// ---------- 4b. delete an application → Undo restores it ----------

test('deleting an application needs no confirm dialog and Undo puts it back', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await tab(page, 'Timeline');
  await page.getByRole('button', { name: 'Track an application' }).click();
  const sheet = page.getByRole('dialog', { name: 'Track an application' });
  await sheet.getByLabel('Name', { exact: true }).fill('My CEC');
  await sheet.getByRole('button', { name: 'Create' }).click();
  await page.locator('main').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('main').getByRole('button', { name: /My CEC/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('main').getByRole('button', { name: /My CEC/ })).toBeVisible();
});

// ---------- 2b. delete a trip → Undo restores it ----------

test('deleting a trip needs no confirm dialog and Undo puts it back', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await addTrip(page, '2025-03-01', '2025-03-21', { destination: 'Lisbon' });
  await expect(tripsSummary(page)).toContainText('19 days');

  await page.locator('main').getByRole('button', { name: /Lisbon/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit trip' });
  await sheet.getByRole('button', { name: 'Delete' }).click();
  await expect(sheet).toBeHidden();
  await expect(tripsSummary(page)).toContainText('0 days');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tripsSummary(page)).toContainText('19 days');
  await expect(page.locator('main').getByRole('button', { name: /Lisbon/ })).toBeVisible();
});

// ---------- 3. Leaving today → I'm back ----------

test('"Leaving today" then "I’m back" opens and closes an ongoing trip', async ({ page }) => {
  // Leave on 2026-10-02 …
  await start(page, new Date('2026-10-02T12:00:00'));
  await onboard(page, { prDate: PR_DATE });
  await tab(page, 'Trips');
  await page.getByRole('button', { name: 'Leaving today' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add trip' });
  await expect(sheet.getByLabel('Left Canada')).toHaveValue('2026-10-02');
  await expect(sheet.getByLabel('I’m still outside Canada')).toBeChecked();
  await expect(sheet.getByLabel('Back in Canada')).toBeDisabled();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('main')).toContainText('still abroad');

  await tab(page, 'Home');
  await expect(page.getByText('Abroad · day 0')).toBeVisible();
  await waitForSavedTrips(page, 1);

  // … two weeks later the app is opened again.
  await page.clock.setFixedTime(FIXED_NOW);
  await page.reload();
  await expect(page.getByText('Abroad · day 14')).toBeVisible();
  await page.getByRole('button', { name: 'I’m back' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit trip' });
  await expect(edit.getByLabel('Back in Canada')).toHaveValue('2026-10-16');
  await expect(edit).toContainText('13 days outside Canada');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText(/Abroad · day/)).toHaveCount(0);

  await tab(page, 'Trips');
  await expect(tripsSummary(page)).toContainText('13 days');
  await expect(page.locator('main')).toContainText(`${await fmt(page, '2026-10-02')} → ${await fmt(page, '2026-10-16')}`);
});

// ---------- 4. Express Entry timeline ----------

test('tracking an Express Entry application with milestones shows progress and a prediction', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await tab(page, 'Timeline');
  await expect(page.getByText('Track your PR, citizenship or PR card application', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Track an application' }).click();
  const sheet = page.getByRole('dialog', { name: 'Track an application' });
  await expect(sheet.getByLabel('Type')).toHaveValue('ee_cec');
  await sheet.getByLabel('Name', { exact: true }).fill('My CEC');
  await sheet.getByLabel('Submitted / received date').fill('2026-06-01');
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet).toBeHidden();

  // Detail screen: summary first; the editable details are folded once the application is submitted.
  await expect(page.getByRole('region', { name: 'My CEC' })).toContainText(`Submitted ${await fmt(page, '2026-06-01')}`);
  await page.getByText('Application details').click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My CEC');
  await page.getByLabel('Acknowledgement of receipt (AOR)').fill('2026-06-03');
  await page.getByLabel('Biometrics done', { exact: true }).fill('2026-06-20');
  await expect(page.locator('main')).toContainText('day 2');
  await expect(page.locator('main')).toContainText('day 19');

  // Override the expected duration so the prediction is hand-computable:
  // 137 days elapsed of 160 → 86 %, expected 2026-06-01 + 160 = 2026-11-08.
  await page.getByLabel('Expected days').fill('160');
  const pred = page.getByRole('region', { name: 'Prediction' });
  await expect(pred).toContainText('Using your expected duration');
  await expect(pred).toContainText('86%');
  await expect(pred).toContainText('day 137 of ~160');
  await expect(pred).toContainText('COPR / eCOPR issued');
  await expect(pred).toContainText(await fmt(page, '2026-11-08'));

  // List and Home summaries.
  await page.locator('main').getByRole('button', { name: 'Timeline', exact: true }).click();
  const item = page.locator('main').getByRole('button', { name: /My CEC/ });
  await expect(item).toContainText(`Submitted ${await fmt(page, '2026-06-01')} · 3/16 steps`);
  await expect(item).toContainText(`Expected ${await fmt(page, '2026-11-08')} · day 137`);

  await tab(page, 'Home');
  const app = page.locator('main').getByRole('button', { name: /My CEC/ });
  await expect(app).toContainText('86%');
  await expect(app).toContainText(`Expected around ${await fmt(page, '2026-11-08')}`);
});

// ---------- 5. Maple ----------

test('Maple answers citizenship and what-if questions and logs a trip from a sentence', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await tab(page, 'Maple');
  await expect(page.getByText('Your private assistant.', { exact: false })).toBeVisible();

  const input = page.getByRole('textbox', { name: /Ask about citizenship/ });
  const lastAnswer = page.locator('.msg.assistant').last();
  const ask = async (q: string) => {
    await input.fill(q);
    await input.press('Enter');
    await expect(page.locator('.msg.user').last()).toHaveText(q);
  };

  await ask('When can I apply for citizenship?');
  await expect(lastAnswer).toContainText('You have 1005 credited days and need 90 more.');
  await expect(lastAnswer).toContainText(`you would meet the physical presence requirement on ${await fmt(page, '2027-01-14')}, 90 days from now`);

  // 2026-11-01 → 2027-01-01: 60 days away, all before the eligibility date → +60 days.
  await ask('What if I travel from 2026-11-01 to 2027-01-01?');
  await expect(lastAnswer).toContainText(`${await fmt(page, '2026-11-01')} → ${await fmt(page, '2027-01-01')}: 60 days outside Canada`);
  await expect(lastAnswer).toContainText(`moves from ${await fmt(page, '2027-01-14')} to ${await fmt(page, '2027-03-15')} (+60 days)`);
  await expect(lastAnswer).toContainText('you stay compliant');
  await expect(page.getByRole('button', { name: 'Save as planned trip' })).toBeVisible();

  await ask('I left on 2025-05-01 and came back 2025-05-20');
  await expect(lastAnswer).toContainText(`Log a trip from ${await fmt(page, '2025-05-01')} to ${await fmt(page, '2025-05-20')}?`);
  await page.getByRole('button', { name: 'Log this trip' }).click();
  await expect(page.getByText('Trip saved')).toBeVisible();

  await tab(page, 'Trips');
  // 2025-05-01 → 2025-05-20: 18 days outside.
  await expect(tripsSummary(page)).toContainText('18 days');
  await expect(page.locator('main')).toContainText(`${await fmt(page, '2025-05-01')} → ${await fmt(page, '2025-05-20')}`);
});

// ---------- 6. Application helper ----------

test('application helper lists the trip as an absence and exports it as CSV', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE, cardExpiry: CARD_EXPIRY });
  await addTrip(page, '2025-03-01', '2025-03-21', { destination: 'Lisbon', purpose: 'vacation' });

  await tab(page, 'Home');
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Application helper' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Application helper');

  // Default application date = the earliest eligible date, where credited days are exactly 1,095.
  await expect(page.getByLabel('Planned application date')).toHaveValue('2027-02-02');
  await expect(page.locator('main')).toContainText('1,095 / 1,095');
  await expect(page.getByText('Meets the 1,095-day physical presence requirement (estimate)')).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: 'Lisbon' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(await fmt(page, '2025-03-01'));
  await expect(row).toContainText(await fmt(page, '2025-03-21'));
  await expect(row.getByRole('cell').nth(2)).toHaveText('19');
  await expect(row).toContainText('Vacation');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('pr-tracker-absences-2027-02-02.csv');
  const csv = (await readFile((await file.path())!, 'utf8')).replace(/^﻿/, '');
  expect(csv).toBe('From,To,Number of days,Destination,Reason\r\n2025-03-01,2025-03-21,19,Lisbon,Vacation\r\n');

  // PR card renewal check on today's signing date.
  await expect(page.locator('main')).toContainText(`986 of 730 days in Canada since ${await fmt(page, PR_DATE)}`);
  await expect(page.getByText('Meets the residency obligation')).toBeVisible();
  await expect(page.locator('main')).toContainText(`You can apply from ${await fmt(page, '2027-06-05')}`);
});

// ---------- 7. Settings: languages, encrypted backup round trip ----------

test('language switch: Français, العربية (RTL, persisted) and back to English', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await openSettings(page);
  const html = page.locator('html');
  const h1 = page.getByRole('heading', { level: 1 });
  // The select's aria-label keeps "(Language)" in every UI language, so a substring match finds it.
  const language = page.getByRole('combobox', { name: 'Language' });

  await language.selectOption('fr');
  await expect(h1).toHaveText('Réglages');
  await expect(html).toHaveAttribute('lang', 'fr');
  await expect(html).toHaveAttribute('dir', 'ltr');

  await language.selectOption('ar');
  await expect(h1).toHaveText('الإعدادات');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('navigation').getByRole('button', { name: 'الرحلات' })).toBeVisible();

  await expect.poll(async () => (await stored(page))?.settings?.language).toBe('ar');
  await page.reload();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(h1).toHaveText('الإعدادات');

  await language.selectOption('en');
  await expect(h1).toHaveText('Settings');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
});

test('encrypted backup: export → delete all data → restore with the passphrase', async ({ page }, testInfo) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE, cardExpiry: CARD_EXPIRY });
  await addTrip(page, '2025-03-01', '2025-03-21', { destination: 'Lisbon' });
  await waitForSavedTrips(page, 1);

  const path = await exportEncrypted(page, testInfo.outputPath('backup.enc.json'));
  const raw = await readFile(path, 'utf8');
  expect(JSON.parse(raw)).toMatchObject({ app: 'pr-tracker', format: 'enc-v1' });
  expect(raw, 'backup must not contain plaintext').not.toContain('Lisbon');
  expect(raw).not.toContain(PR_DATE);

  await wipeAll(page);
  await onboard(page); // fresh start, nothing entered
  // (The route survives the wipe, so onboarding ends on Settings, not Home.)
  await tab(page, 'Home');
  await expect(page.getByText('Add your PR landing date to see citizenship and residency counts.')).toBeVisible();

  await openSettings(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup' }).click();
  await (await chooser).setFiles(path);
  const sheet = page.getByRole('dialog', { name: 'Open encrypted backup' });
  await expect(sheet).toBeVisible();

  // A wrong passphrase is refused …
  await sheet.getByLabel('Passphrase').fill('not the right one');
  await sheet.getByRole('button', { name: 'Decrypt' }).click();
  await expect(sheet.getByText('Wrong passphrase, or the file was changed.')).toBeVisible({ timeout: 20_000 });
  // … the right one restores everything (confirm() is accepted).
  await sheet.getByLabel('Passphrase').fill(PASSPHRASE);
  await sheet.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toBeHidden();

  await expect(page.getByLabel('PR landing date')).toHaveValue(PR_DATE);
  await expect(page.getByLabel('PR card expiry date')).toHaveValue(CARD_EXPIRY);
  await tab(page, 'Trips');
  await expect(tripsSummary(page)).toContainText('19 days');
  await expect(page.locator('main')).toContainText('Lisbon');
});

// Regression (fixed in the pre-launch review): onboarding restore used to read only plain JSON
// and "restored" an encrypted backup as an empty profile. It now asks for the passphrase.
test('onboarding restore accepts an encrypted backup', async ({ page }, testInfo) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await waitForSavedTrips(page, 0);
  const path = await exportEncrypted(page, testInfo.outputPath('backup.enc.json'));
  await wipeAll(page);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from a backup file' }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('dialog', { name: 'Open encrypted backup' })).toBeVisible({ timeout: 5_000 });
});

// Regression (fixed in the pre-launch review): Settings had a separate plain-JSON "Restore backup"
// that parsed an encrypted file as an empty backup and replaced all data. There is now one
// "Import backup" flow: an encrypted file asks for the passphrase and nothing changes until then.
test('Settings "Import backup" never replaces data with an encrypted file it has not decrypted', async ({ page }, testInfo) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await waitForSavedTrips(page, 0);
  const path = await exportEncrypted(page, testInfo.outputPath('backup.enc.json'));

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup' }).click();
  await (await chooser).setFiles(path);
  const sheet = page.getByRole('dialog', { name: 'Open encrypted backup' });
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel('PR landing date')).toHaveValue(PR_DATE);
});

// ---------- 8. CBSA import ----------

test('CBSA import: a pasted report shows an unmatched entry and "Add trip" logs it', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await tab(page, 'Trips');
  await page.getByRole('button', { name: 'Import CBSA report' }).click();
  const sheet = page.getByRole('dialog', { name: 'Import CBSA travel history' });
  await expect(sheet).toBeVisible();

  await sheet.getByLabel('Report text').fill(['ENTRIES', '21-MAR-2025  Entry  Port: YVR', 'EXITS', '01-MAR-2025  Exit   Port: YVR'].join('\n'));
  await sheet.getByRole('button', { name: 'Find dates' }).click();
  await expect(sheet).toContainText('Found 1 entries and 1 exits');
  await expect(sheet).toContainText('Entries with no logged trip (1)');
  await expect(sheet).toContainText(`Back in Canada ${await fmt(page, '2025-03-21')}`);
  await expect(sheet).toContainText('via YVR');
  // The departure is filled in from the matching exit record.
  await expect(sheet.getByLabel('Left Canada')).toHaveValue('2025-03-01');
  await expect(sheet).toContainText('From the exit record');

  await sheet.getByRole('button', { name: 'Add trip', exact: true }).click();
  await expect(page.getByText('Trips added: 1')).toBeVisible();
  await expect(sheet).toContainText('1 entries match your logged trips');
  await expect(sheet).toContainText('Every entry in the report matches a trip you logged.');

  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(tripsSummary(page)).toContainText('19 days');
  await expect(page.locator('main')).toContainText(`${await fmt(page, '2025-03-01')} → ${await fmt(page, '2025-03-21')}`);
});

// ---------- 9. Household ----------

test('household: add a member, switch, and each person keeps their own data', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await addTrip(page, '2025-03-01', '2025-03-21');

  await openSettings(page);
  await expect(page.getByText('Only you are tracked on this device.')).toBeVisible();
  await page.getByPlaceholder('e.g. Sam').fill('Sam');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Sam added')).toBeVisible();
  // The top-bar switcher appears once there are two people.
  await expect(page.getByRole('button', { name: 'Viewing Me. Switch person' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  await expect(page.getByText('Now viewing Sam')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viewing Sam. Switch person' })).toBeVisible();
  await expect(page.getByLabel('PR landing date')).toHaveValue('');

  // Sam starts empty; give Sam a trip of their own (9 days).
  await tab(page, 'Trips');
  await expect(page.getByText('No trips yet.', { exact: false })).toBeVisible();
  await addTrip(page, '2026-01-10', '2026-01-20');
  await expect(tripsSummary(page)).toContainText('9 days');

  await tab(page, 'Home');
  await expect(page.getByText('Add your PR landing date to see citizenship and residency counts.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Citizenship', exact: true })).toHaveCount(0);

  // Switch back from the Home household card (the top-bar switcher is covered by its own test below).
  const household = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Household' }) });
  await expect(household).toContainText(`Citizenship from ${await fmt(page, '2027-02-02')}`);
  await household.getByRole('button', { name: /^Me\b/ }).click();
  await expect(page.getByText('Now viewing Me')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Citizenship', exact: true }).getByRole('img', { name: '986 of 1095 days credited' })).toBeVisible();

  await tab(page, 'Trips');
  await expect(tripsSummary(page)).toContainText('19 days');
  await expect(page.locator('main')).not.toContainText(await fmt(page, '2026-01-10'));
});

// Regression: the switcher's Sheet used to render inside <header class="topbar">, whose
// backdrop-filter clipped the fixed backdrop to the 64px header. Sheets are now portalled to <body>.
test('top-bar person switcher sheet is usable', async ({ page }) => {
  await start(page);
  await onboard(page, { prDate: PR_DATE });
  await openSettings(page);
  await page.getByPlaceholder('e.g. Sam').fill('Sam');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Viewing Me. Switch person' }).click();
  const sw = page.getByRole('dialog', { name: 'Switch person' });
  await expect(sw.getByRole('button', { name: /^Sam\b/ })).toBeInViewport();
  await sw.getByRole('button', { name: /^Sam\b/ }).click({ timeout: 5_000 });
  await expect(page.getByText('Now viewing Sam')).toBeVisible();
});

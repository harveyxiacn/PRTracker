import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeInsights, type Insights } from '../domain/insights';
import { todayISO } from '../domain/dates';
import type { AppData } from '../domain/types';
import { loadOpenData, type OpenData } from '../data/remote';
import { detectLang, languageInfo, loadLanguage, makeT, type Lang } from '../i18n';
import { en } from '../i18n/en';
import { syncNotifications } from '../notify/notifications';
import { updateWidgetSnapshot, type WidgetSnapshot } from '../native/widget';
import { setPrivacyScreen } from '../native/privacy';
import { DEFAULT_PERSON_NAME, SELF_ID, householdReminders } from '../domain/people';
import { diffDays } from '../domain/dates';
import { fmtDate } from '../i18n';
import { loadData, saveData } from './storage';

export type Route =
  | 'home' | 'calendar' | 'trips' | 'timeline' | 'assistant'
  | 'eligibility' | 'community' | 'settings' | 'documents' | 'history';

interface Ctx {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replaceAll: (d: AppData) => void;
  insights: Insights;
  t: ReturnType<typeof makeT>;
  lang: Lang;
  open: OpenData;
  refreshOpen: () => Promise<void>;
  route: Route;
  go: (r: Route, param?: string) => void;
  param?: string;
  toast: (msg: string) => void;
  /** Showing sample data (nothing is saved). */
  demo: boolean;
  /** Reschedule all OS reminders (all household members); no-op in demo. Returns how many. */
  resyncNotifications: () => Promise<number>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

function routeFromHash(): { route: Route; param?: string } {
  const [r, p] = window.location.hash.replace(/^#\/?/, '').split('/');
  const routes: Route[] = ['home', 'calendar', 'trips', 'timeline', 'assistant', 'eligibility', 'community', 'settings', 'documents', 'history'];
  return { route: (routes.includes(r as Route) ? r : 'home') as Route, param: p ? decodeURIComponent(p) : undefined };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [open, setOpen] = useState<OpenData>({ origin: 'none' });
  const [{ route, param }, setRoute] = useState(routeFromHash);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO());
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<AppData | null>(null);
  // Demo mode (?demo=1): sample data in memory only — never saved, so real data is untouched.
  const demoMode = useRef(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1');
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      void saveData(pending.current);
      pending.current = null;
    }
  }, []);

  useEffect(() => {
    if (demoMode.current) {
      const lang = new URLSearchParams(window.location.search).get('lang') ?? detectLang();
      void import('../domain/demo').then(({ demoData }) => setData(demoData(todayISO(), lang)));
    } else {
      loadData().then((d) => {
        if (!d.onboarded && !d.trips.length) d.settings.language = detectLang();
        setData(d);
      });
    }
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    // Never lose the last edit when the app is closed or sent to the background.
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    // Keep "today" fresh if the app stays open past midnight.
    const tick = window.setInterval(() => setToday(todayISO()), 60_000);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.clearInterval(tick);
    };
  }, []);

  const lang: Lang = data?.settings.language ?? 'en';
  const [dict, setDict] = useState<Record<string, string>>(en);
  // The language whose strings are actually loaded (falls back to English on failure).
  const [loadedLang, setLoadedLang] = useState<Lang>('en');
  useEffect(() => {
    let live = true;
    loadLanguage(lang).then(
      (d) => {
        if (!live) return;
        setDict(d);
        setLoadedLang(d === en && lang !== 'en' ? 'en' : lang);
      },
      () => {
        if (!live) return;
        setDict(en);
        setLoadedLang('en');
      },
    );
    return () => {
      live = false;
    };
  }, [lang]);
  const t = useMemo(() => makeT(dict), [dict]);

  const refreshOpen = useCallback(async () => {
    if (!data) return;
    setOpen(await loadOpenData(data.settings.dataUrl));
  }, [data?.settings.dataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data) void refreshOpen();
  }, [data?.settings.dataUrl, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => (prev ? fn(prev) : prev));
  }, []);

  // Debounced persistence of every change (flushed on hide/close).
  const loaded = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (demoMode.current) return;
    pending.current = data;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 250);
  }, [data, flush]);

  const replaceAll = useCallback((d: AppData) => {
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    setData(d);
  }, []);

  const insights = useMemo(() => {
    if (!data) return null;
    try {
      return computeInsights(data, today);
    } catch (e) {
      // Malformed data must never blank the whole app.
      console.error('insights failed', e);
      return computeInsights({ ...data, trips: [], applications: [], profile: { statusPeriods: [], taxYearsFiled: [] } }, today);
    }
  }, [data, today]);

  // Theme
  useEffect(() => {
    const th = data?.settings.theme ?? 'system';
    if (th === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    // Direction and lang follow the strings actually shown, so a missing locale never mirrors English.
    document.documentElement.lang = loadedLang;
    document.documentElement.dir = languageInfo(loadedLang).dir;
  }, [data?.settings.theme, loadedLang]);

  // Reschedule local notifications when anything that affects them changes.
  const reminderSig = insights ? JSON.stringify(insights.reminders.map((r) => [r.id, r.date])) + JSON.stringify(data?.household ?? null) + JSON.stringify(data?.settings.notifications) + loadedLang : '';
  /** The single place that schedules OS notifications: every household member, never in demo mode. */
  const resyncNotifications = useCallback(async (): Promise<number> => {
    if (!data || !insights || demoMode.current) return 0;
    // Other household members' reminders carry their name in the title ("Me" is translated).
    const others = householdReminders(data, insights.today);
    const nameOf = (n: unknown) => (n === DEFAULT_PERSON_NAME ? t('ppl.me') : String(n));
    const tt: typeof t = (k, v) => (k === 'ppl.remTitle' && v ? t(k, { name: nameOf(v.name), title: t(String(v.personTitle), v) }) : t(k, v));
    const all = [...insights.reminders, ...others.map((r) => ({ ...r, title: 'ppl.remTitle', vars: { ...r.vars, personTitle: r.title } }))];
    return syncNotifications(all, data.settings, tt);
  }, [data, insights, t]);
  useEffect(() => {
    if (!data || !insights || !data.onboarded || demoMode.current) return;
    resyncNotifications().catch((e) => console.warn('notifications', e));
  }, [reminderSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android home-screen widget: a small precomputed, already-localised snapshot (no names, no free text).
  useEffect(() => {
    if (!data || !insights || demoMode.current) return;
    // Only the primary person (the one who set up the app) appears on the home screen.
    if (data.household && data.household.activeId !== SELF_ID) return;
    const lines: WidgetSnapshot['lines'] = [];
    // With a PIN or screenshot block on, the home screen shows no status at all.
    if (data.lock || data.privacyScreen) {
      void updateWidgetSnapshot({ updated: new Date().toISOString(), title: t('nat.widgetTitle'), lines: [{ label: '🔒', value: t('sec.lockOn') }], route: 'home' });
      return;
    }
    const c = insights.citizenship;
    // Dates, not countdowns: the widget only refreshes when the app runs, so a date never goes stale.
    if (c) lines.push({ label: t('nat.citizenship'), value: c.eligible ? t('nat.eligible') : c.eligibleDate ? fmtDate(c.eligibleDate, lang) : '—', tone: 'good' });
    const r = insights.residency;
    if (r) lines.push({ label: t('nat.residency'), value: r.compliant ? t('nat.onTrack') : t('nat.atRisk'), tone: r.compliant ? 'good' : 'critical' });
    if (insights.ongoingTrip) lines.push({ label: t('nat.abroadSince'), value: fmtDate(insights.ongoingTrip.departure, lang), tone: 'warn' });
    else if (insights.prCard) {
      const left = diffDays(insights.prCard.expiry, insights.today);
      lines.push({ label: t('nat.prCard'), value: t('nat.expires', { date: fmtDate(insights.prCard.expiry, lang) }), tone: left < 0 ? 'critical' : left < 270 ? 'warn' : 'good' });
    }
    void updateWidgetSnapshot({ updated: new Date().toISOString(), title: t('nat.widgetTitle'), lines: data.onboarded ? lines : [], route: 'home' });
  }, [insights, t, data?.lock, data?.privacyScreen, data?.household?.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the native screenshot block in sync with the saved setting (e.g. after a restore).
  useEffect(() => {
    if (data && !demoMode.current) void setPrivacyScreen(!!data.privacyScreen);
  }, [data?.privacyScreen, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((r: Route, p?: string) => {
    window.location.hash = `/${r}${p ? '/' + encodeURIComponent(p) : ''}`;
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  if (!data || !insights) return <div className="empty-state" style={{ paddingTop: 120 }}>…</div>;

  return (
    <AppCtx.Provider value={{ data, update, replaceAll, insights, t, lang, open, refreshOpen, route, go, param, toast, demo: demoMode.current, resyncNotifications }}>
      {children}
      {toastMsg && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom))', zIndex: 60, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'var(--text)', color: 'var(--bg)', padding: '10px 16px', borderRadius: 12, fontSize: 14, maxWidth: 480 }}>{toastMsg}</div>
        </div>
      )}
    </AppCtx.Provider>
  );
}

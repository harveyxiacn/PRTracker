import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeInsights, type Insights } from '../domain/insights';
import { todayISO } from '../domain/dates';
import type { AppData } from '../domain/types';
import { loadOpenData, type OpenData } from '../data/remote';
import { detectLang, languageInfo, loadLanguage, makeT, type Lang } from '../i18n';
import { en } from '../i18n/en';
import { syncNotifications } from '../notify/notifications';
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
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      void saveData(pending.current);
      pending.current = null;
    }
  }, []);

  useEffect(() => {
    loadData().then((d) => {
      if (!d.onboarded && !d.trips.length) d.settings.language = detectLang();
      setData(d);
    });
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
  const reminderSig = insights ? JSON.stringify(insights.reminders.map((r) => [r.id, r.date])) + JSON.stringify(data?.settings.notifications) + loadedLang : '';
  useEffect(() => {
    if (!data || !insights || !data.onboarded) return;
    syncNotifications(insights.reminders, data.settings, t).catch((e) => console.warn('notifications', e));
  }, [reminderSig]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <AppCtx.Provider value={{ data, update, replaceAll, insights, t, lang, open, refreshOpen, route, go, param, toast }}>
      {children}
      {toastMsg && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom))', zIndex: 60, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'var(--text)', color: 'var(--bg)', padding: '10px 16px', borderRadius: 12, fontSize: 14, maxWidth: 480 }}>{toastMsg}</div>
        </div>
      )}
    </AppCtx.Provider>
  );
}

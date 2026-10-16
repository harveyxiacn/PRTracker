import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeInsights, type Insights } from '../domain/insights';
import { todayISO } from '../domain/dates';
import type { AppData } from '../domain/types';
import { loadOpenData, type OpenData } from '../data/remote';
import { detectLang, makeT, type Lang } from '../i18n';
import { syncNotifications } from '../notify/notifications';
import { loadData, saveData } from './storage';

export type Route =
  | 'home' | 'calendar' | 'trips' | 'timeline' | 'assistant'
  | 'eligibility' | 'community' | 'settings';

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
  const routes: Route[] = ['home', 'calendar', 'trips', 'timeline', 'assistant', 'eligibility', 'community', 'settings'];
  return { route: (routes.includes(r as Route) ? r : 'home') as Route, param: p ? decodeURIComponent(p) : undefined };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [open, setOpen] = useState<OpenData>({ origin: 'none' });
  const [{ route, param }, setRoute] = useState(routeFromHash);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO());
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadData().then((d) => {
      if (!d.onboarded && !d.trips.length) d.settings.language = detectLang();
      setData(d);
    });
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    // Keep "today" fresh if the app stays open past midnight.
    const tick = window.setInterval(() => setToday(todayISO()), 60_000);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.clearInterval(tick);
    };
  }, []);

  const lang: Lang = data?.settings.language ?? 'en';
  const t = useMemo(() => makeT(lang), [lang]);

  const refreshOpen = useCallback(async () => {
    if (!data) return;
    setOpen(await loadOpenData(data.settings.dataUrl));
  }, [data?.settings.dataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data) void refreshOpen();
  }, [data?.settings.dataUrl, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveData(next), 250);
      return next;
    });
  }, []);

  const replaceAll = useCallback((d: AppData) => {
    setData(d);
    void saveData(d);
  }, []);

  const insights = useMemo(() => (data ? computeInsights(data, today) : null), [data, today]);

  // Theme
  useEffect(() => {
    const th = data?.settings.theme ?? 'system';
    if (th === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [data?.settings.theme, lang]);

  // Reschedule local notifications when anything that affects them changes.
  const reminderSig = insights ? JSON.stringify(insights.reminders.map((r) => [r.id, r.date])) + JSON.stringify(data?.settings.notifications) + lang : '';
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

import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { App as CapApp } from '@capacitor/app';
import { LockScreen } from './screens/Security';
import { inExternalActivity } from './platform';
import { PersonSwitcher } from './screens/People';
import { Icon } from './components/Icon';
import { useApp, type Route } from './store/AppContext';
import { CalendarScreen } from './screens/Calendar';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { TripsScreen } from './screens/Trips';

// Home, Calendar and Trips are the everyday screens and ship in the main bundle;
// everything else (including the Maple engine and knowledge base) loads on first visit.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const TimelineScreen = named(() => import('./screens/Timeline'), 'TimelineScreen');
const AssistantScreen = named(() => import('./screens/Assistant'), 'AssistantScreen');
const EligibilityScreen = named(() => import('./screens/Eligibility'), 'EligibilityScreen');
const CommunityScreen = named(() => import('./screens/Community'), 'CommunityScreen');
const SettingsScreen = named(() => import('./screens/Settings'), 'SettingsScreen');
const DocumentsScreen = named(() => import('./screens/Documents'), 'DocumentsScreen');
const HistoryScreen = named(() => import('./screens/History'), 'HistoryScreen');
const FormsScreen = named(() => import('./screens/Forms'), 'FormsScreen');

const TABS: { route: Route; icon: string; key: string }[] = [
  { route: 'home', icon: 'home', key: 'nav.home' },
  { route: 'calendar', icon: 'calendar', key: 'nav.calendar' },
  { route: 'trips', icon: 'plane', key: 'nav.trips' },
  { route: 'timeline', icon: 'timeline', key: 'nav.timeline' },
  { route: 'assistant', icon: 'maple', key: 'nav.assistant' },
];

/** Re-lock when the app was hidden for longer than this. */
const RELOCK_AFTER_MS = 30_000;

export function App() {
  const { data, route, go, t, demo } = useApp();
  const [locked, setLocked] = useState(() => !!data.lock);
  // While backgrounded with a lock set, render nothing so the OS app-switcher snapshot is blank.
  const [obscured, setObscured] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    if (!data.lock) return;
    const hide = () => {
      if (inExternalActivity()) return; // our own file picker / share sheet
      hiddenAt.current = Date.now();
      setObscured(true);
    };
    const show = () => {
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) setLocked(true);
      hiddenAt.current = null;
      setObscured(false);
    };
    const onVis = () => (document.visibilityState === 'hidden' ? hide() : show());
    document.addEventListener('visibilitychange', onVis);
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => (isActive ? show() : hide())).catch(() => null);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void sub.then((h) => h?.remove());
    };
  }, [!!data.lock]); // eslint-disable-line react-hooks/exhaustive-deps

  // The lock screen replaces the app (not an overlay) so nothing behind it is reachable.
  if (locked && data.lock) return <LockScreen onUnlock={() => setLocked(false)} />;
  if (obscured && data.lock) return <div className="app" aria-hidden="true" style={{ background: 'var(--bg)' }} />;
  if (!data.onboarded) return <Onboarding />;

  const screen = {
    home: <Home />,
    calendar: <CalendarScreen />,
    trips: <TripsScreen />,
    timeline: <TimelineScreen />,
    assistant: <AssistantScreen />,
    eligibility: <EligibilityScreen />,
    community: <CommunityScreen />,
    settings: <SettingsScreen />,
    documents: <DocumentsScreen />,
    history: <HistoryScreen />,
    forms: <FormsScreen />,
  }[route];

  const title = route === 'home' ? t('app.name') : t(`nav.${route}`);
  return (
    <div className="app">
      {/* Hash routing (#/route) means a plain href="#main" would navigate, so move focus by hand. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {t('a11y.skip')}
      </a>
      <header className="topbar">
        {!TABS.some((x) => x.route === route) && (
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => history.length > 1 ? history.back() : go('home')}>
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        <PersonSwitcher />
        {route !== 'settings' && (
          <button className="icon-btn" aria-label={t('nav.settings')} onClick={() => go('settings')}>
            <Icon name="settings" />
          </button>
        )}
      </header>
      {demo && (
        <div className="tip warn" role="status" style={{ margin: '0 16px' }}>
          <Icon name="info" />
          <div className="grow">{t('demo.banner')}</div>
          <button className="btn sm" onClick={() => (window.location.href = window.location.pathname)}>{t('demo.exit')}</button>
        </div>
      )}
      <main className="main" id="main" tabIndex={-1}>
        <Suspense fallback={<div className="empty-state" aria-busy="true">…</div>}>{screen}</Suspense>
      </main>
      <nav className="tabbar" aria-label={t('nav.main')}>
        <div className="tabbar-inner">
          {TABS.map((x) => (
            <button key={x.route} className="tab" aria-current={route === x.route ? 'page' : undefined} onClick={() => go(x.route)}>
              <Icon name={x.icon} />
              {t(x.key)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

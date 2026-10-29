import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { App as CapApp } from '@capacitor/app';
import { inExternalActivity } from './platform';
import { PersonSwitcher } from './screens/People';
import { Icon } from './components/Icon';
import { prefersReducedMotion } from './components/ui';
import { useApp, type Route } from './store/AppContext';
import { CalendarScreen } from './screens/Calendar';
import { Home } from './screens/Home';
import { TripsScreen } from './screens/Trips';

// Home, Calendar and Trips are the everyday screens and ship in the main bundle;
// everything else (including onboarding, the Maple engine and knowledge base) loads on first visit.
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
// Shown once per install, so it (and the profile form) stays out of the first-load bundle.
const Onboarding = named(() => import('./screens/Onboarding'), 'Onboarding');
// Only needed when a PIN is set; pulls in PIN hashing, biometrics and backup code.
const LockScreen = lazy(() => import('./screens/Security').then((m) => ({ default: m.LockScreen })));

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
  // (The native side covers the snapshot too: FLAG_SECURE on Android, a cover view on iOS.)
  const [obscured, setObscured] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  // The top bar gets a hairline and shadow once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 4));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  useEffect(() => {
    if (!data.lock) return;
    const hide = () => {
      // Always note when we left (the first of the two hide events wins), so a long absence relocks
      // even if it started in our own share sheet / file picker and the user switched apps from there.
      hiddenAt.current ??= Date.now();
      // Our own picker / share sheet: don't blank the screen, it would lose its state on return.
      if (inExternalActivity()) return;
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
  // While the lock screen's code loads, show a blank screen: nothing behind the lock is ever drawn.
  if (locked && data.lock)
    return (
      <Suspense fallback={<div className="app" aria-busy="true" style={{ background: 'var(--bg)' }} />}>
        <LockScreen onUnlock={() => setLocked(false)} />
      </Suspense>
    );
  if (obscured && data.lock) return <div className="app" aria-hidden="true" style={{ background: 'var(--bg)' }} />;
  if (!data.onboarded) return <Suspense fallback={<div className="onb"><ScreenSkeleton /></div>}><Onboarding /></Suspense>;

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
      <header className="topbar" data-scrolled={scrolled || undefined}>
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
        <div className="demo-strip" role="status">
          <Icon name="info" size={16} />
          <span className="grow">{t('demo.banner')}</span>
          <button className="btn sm" onClick={() => (window.location.href = window.location.pathname)}>{t('demo.exit')}</button>
        </div>
      )}
      <main className="main" id="main" tabIndex={-1}>
        {/* Keyed by route: each screen fades in on arrival (opacity only, so fixed children such as
            the Maple composer are never re-anchored by a transform). */}
        <div className="screen" key={route}>
          <Suspense fallback={<ScreenSkeleton />}>{screen}</Suspense>
        </div>
      </main>
      <nav className="tabbar" aria-label={t('nav.main')}>
        <div className="tabbar-inner">
          {TABS.map((x) => (
            <button key={x.route} className="tab" aria-current={route === x.route ? 'page' : undefined} onClick={() => (route === x.route ? window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }) : go(x.route))}>
              <span className="tab-pill"><Icon name={x.icon} /></span>
              {t(x.key)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Placeholder while a lazily loaded screen arrives: card shapes instead of a bare ellipsis. */
function ScreenSkeleton() {
  return (
    <div aria-busy="true" className="skeleton-stack">
      <div className="skeleton" style={{ height: 132 }} />
      <div className="skeleton" style={{ height: 88 }} />
      <div className="skeleton" style={{ height: 88 }} />
    </div>
  );
}

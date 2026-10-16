import { Icon } from './components/Icon';
import { useApp, type Route } from './store/AppContext';
import { AssistantScreen } from './screens/Assistant';
import { CalendarScreen } from './screens/Calendar';
import { CommunityScreen } from './screens/Community';
import { EligibilityScreen } from './screens/Eligibility';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { SettingsScreen } from './screens/Settings';
import { TimelineScreen } from './screens/Timeline';
import { TripsScreen } from './screens/Trips';

const TABS: { route: Route; icon: string; key: string }[] = [
  { route: 'home', icon: 'home', key: 'nav.home' },
  { route: 'calendar', icon: 'calendar', key: 'nav.calendar' },
  { route: 'trips', icon: 'plane', key: 'nav.trips' },
  { route: 'timeline', icon: 'timeline', key: 'nav.timeline' },
  { route: 'assistant', icon: 'maple', key: 'nav.assistant' },
];

export function App() {
  const { data, route, go, t } = useApp();
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
  }[route];

  const title = route === 'home' ? t('app.name') : t(`nav.${route}`);
  return (
    <div className="app">
      <header className="topbar">
        {!TABS.some((x) => x.route === route) && (
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => history.length > 1 ? history.back() : go('home')}>
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {route !== 'settings' && (
          <button className="icon-btn" aria-label={t('nav.settings')} onClick={() => go('settings')}>
            <Icon name="settings" />
          </button>
        )}
      </header>
      <main className="main">{screen}</main>
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

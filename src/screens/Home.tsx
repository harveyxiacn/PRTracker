import { lazy, Suspense, useState } from 'react';
import { proactiveTips } from '../assistant/tips';
import { Icon } from '../components/Icon';
import { Ring, Status } from '../components/ui';
import { diffDays } from '../domain/dates';
import { CITIZENSHIP_REQUIRED, RESIDENCY_REQUIRED } from '../domain/presence';
import { predict } from '../domain/timeline';
import { fmtDate, fmtNum } from '../i18n';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';
import { MiniYear } from './Calendar';
import { TripEditor, useTripEditor } from './Trips';
import { HouseholdCard } from './People';
import { crossChecks } from '../domain/crossChecks';

// Loaded after first paint: it fetches trend data and is not needed for the core counts.
// IRPA s.28: days abroad that count as days in Canada (spouse/parent, Canadian employer).
const IRPA_S28_URL = 'https://laws-lois.justice.gc.ca/eng/acts/i-2.5/section-28.html';

/** Alerts shown before "Show more": the most severe come first. */
const VISIBLE_TIPS = 2;

const ProcessingAlertsCard = lazy(() => import('./Curves').then((m) => ({ default: m.ProcessingAlertsCard })));

export function Home() {
  const { data, insights, t, lang, go, open } = useApp();
  const editor = useTripEditor();
  const [showAll, setShowAll] = useState(false);
  const checks = crossChecks(data, insights);
  const rank = { critical: 0, warn: 1, info: 2 } as const;
  const tips = [...checks, ...proactiveTips(data, insights)]
    .filter((x) => !(x.key === 'tip.citEligible' && checks.some((c) => c.key === 'xc.citNoApp')))
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
  const c = insights.citizenship;
  const r = insights.residency;
  const card = insights.prCard;
  const trip = insights.ongoingTrip;
  const apps = data.applications.filter((a) => !a.archived && a.submitted);
  // Critical alerts sit above the numbers; the rest wait in a short, expandable stack.
  const urgent = tips.filter((x) => x.severity === 'critical');
  const rest = tips.filter((x) => x.severity !== 'critical');
  const renderTip = (tip: (typeof tips)[number]) => (
    <div key={tip.key} className={`tip ${tip.severity}`} role={tip.severity === 'critical' ? 'alert' : undefined}>
      <Icon name={tip.severity === 'info' ? 'info' : 'alert'} />
      <div className="grow">
        {t(tip.key, Object.fromEntries(Object.entries(tip.vars ?? {}).map(([k, v]) => [k, /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDate(String(v), lang) : v])))}
        {(tip.key === 'tip.setPr' || tip.key === 'tip.setCard' || tip.key === 'tip.tax') && (
          <>
            {' '}
            <button className="btn ghost sm" onClick={() => go('settings')}>{t('common.update')}</button>
          </>
        )}
        {tip.key === 'tip.tripIssues' && (
          <>
            {' '}
            <button className="btn ghost sm" onClick={() => go('trips')}>{t('common.review')}</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {trip && (
        <div className="card" style={{ borderColor: 'var(--d-out)' }}>
          <div className="row">
            <Icon name="plane" />
            <div className="grow">
              <b>{t('home.abroad', { days: Math.max(0, diffDays(insights.today, trip.departure)) })}</b>
              <div className="small muted">
                {t('home.abroadSince', { date: fmtDate(trip.departure, lang), place: trip.destination || t('trips.abroad') })}
                {r?.mustReturnBy && <> · {t('home.returnBy', { date: fmtDate(r.mustReturnBy, lang) })}</>}
              </div>
            </div>
            <button className="btn sm primary" onClick={() => editor.edit({ ...trip, return: insights.today })}>
              {t('home.imBack')}
            </button>
          </div>
        </div>
      )}


      {urgent.map(renderTip)}

      {c && (
        <section className="card hero-card" aria-labelledby="cit-h">
          <h2 id="cit-h"><Icon name="flag" /> {t('home.citizenship')}</h2>
          <div className="row">
            <Ring value={c.credited} max={CITIZENSHIP_REQUIRED} label={t('home.citRing', { n: c.credited, req: CITIZENSHIP_REQUIRED })}>
              <b>{fmtNum(Math.min(c.credited, 9999), lang)}</b>
              <span className="tiny">/ {fmtNum(CITIZENSHIP_REQUIRED, lang)}</span>
            </Ring>
            <div className="grow stack">
              {c.eligible ? (
                <Status kind="good">{t('home.citEligibleNow')}</Status>
              ) : c.eligibleDate ? (
                <>
                  <div className="label">{t('home.citEarliest')}</div>
                  <div className="hero-date">{fmtDate(c.eligibleDate, lang)}</div>
                  <div className="small muted">{t('home.citDaysLeft', { days: fmtNum(c.daysUntilEligible ?? 0, lang), need: c.remaining })}</div>
                </>
              ) : (
                <div className="small muted">{t('home.citFar')}</div>
              )}
              {c.prePrDays > 0 && <div className="tiny">{t('home.citPrePr', { credit: Math.floor(c.prePrCredit) })}</div>}
              {c.safeDate && !c.eligible && <div className="tiny">{t('home.citSafe', { date: fmtDate(c.safeDate, lang), buffer: data.settings.citizenshipBuffer })}</div>}
            </div>
          </div>
          <details className="disclose">
            <summary>{t('ux.howCounted')}</summary>
            <p className="tiny">{t('common.citExclusions')}</p>
          </details>
        </section>
      )}

      {r && (
        <section className="card" aria-labelledby="res-h">
          <h2 id="res-h"><Icon name="shield" /> {t('home.residency')}</h2>
          <div className="row spread">
            <div>
              <span className="hero-num">{fmtNum(r.present, lang)}</span>
              <span className="muted"> / {RESIDENCY_REQUIRED} {t('common.days')}</span>
            </div>
            {r.compliant ? <Status kind="good">{t('home.resOk')}</Status> : <Status kind="critical">{t('home.resBad')}</Status>}
          </div>
          <div className="progress" style={{ margin: '10px 0' }} role="progressbar" aria-valuemin={0} aria-valuemax={RESIDENCY_REQUIRED} aria-valuenow={r.present} aria-label={t('home.residency')}>
            <div style={{ width: `${Math.min(100, (r.present / RESIDENCY_REQUIRED) * 100)}%` }} />
          </div>
          <div className="small muted">
            {r.anniversary ? t('home.resNew', { date: fmtDate(r.anniversary, lang) }) : t('home.resWindow', { date: fmtDate(r.windowStart, lang) })}
          </div>
          {r.compliant && r.mustReturnBy && (
            <div className="small" style={{ marginTop: 6 }}>
              {trip
                ? t('home.resReturnBy', { date: fmtDate(r.mustReturnBy, lang), days: fmtNum(r.maxAbsence, lang) })
                : t('home.resMaxAway', { days: fmtNum(r.maxAbsence, lang), date: fmtDate(r.mustReturnBy, lang) })}
            </div>
          )}
          {!r.compliant && (
            <div className="small" style={{ marginTop: 6, color: 'var(--critical-text)' }}>
              {t('home.resShort', { days: r.shortfall })}
              {r.regainDate && <> {t('home.resRegain', { date: fmtDate(r.regainDate, lang) })}</>}
            </div>
          )}
          <details className="disclose">
            <summary>{t('ux.howCounted')}</summary>
            <p className="tiny">
              {t('home.resCredits')}{' '}
              <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => openExternal(IRPA_S28_URL)}>
                <Icon name="external" size={14} /> {t('home.resCreditsLink')}
              </button>
            </p>
          </details>
        </section>
      )}

      {card && (
        <section className="card" aria-labelledby="card-h">
          <h2 id="card-h"><Icon name="card" /> {t('home.prCard')}</h2>
          <div className="row spread">
            <div>
              <div className="label">{t('home.cardExpires')}</div>
              <div className="hero-date sm">{fmtDate(card.expiry, lang)}</div>
            </div>
            {card.state === 'ok' && <Status kind="good">{t('home.cardDays', { days: fmtNum(card.daysUntilExpiry, lang) })}</Status>}
            {card.state === 'renew_now' && <Status kind="warn">{t('home.cardRenewNow')}</Status>}
            {card.state === 'expired' && <Status kind="critical">{t('home.cardExpired')}</Status>}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {card.state === 'ok'
              ? t('home.cardRenewIn', { days: fmtNum(card.daysUntilRenewal, lang), date: fmtDate(card.renewalOpens, lang) })
              : t('home.cardHow')}
          </div>
        </section>
      )}


      <nav className="quick" aria-label={t('ux.quickActions')}>
        <button className="quick-btn primary" onClick={() => editor.create()}><span className="quick-ic"><Icon name="plus" /></span>{t('home.logTrip')}</button>
        <button className="quick-btn" onClick={() => go('assistant')}><span className="quick-ic"><Icon name="sparkle" /></span>{t('home.askMaple')}</button>
        {data.profile.prDate && <button className="quick-btn" onClick={() => go('forms')}><span className="quick-ic"><Icon name="card" /></span>{t('form.title')}</button>}
        <button className="quick-btn" onClick={() => go('eligibility')}><span className="quick-ic"><Icon name="target" /></span>{t('nav.eligibility')}</button>
        <button className="quick-btn" onClick={() => go('documents')}><span className="quick-ic"><Icon name="card" /></span>{t('nav.documents')}</button>
        <button className="quick-btn" onClick={() => go('history')}><span className="quick-ic"><Icon name="home2" /></span>{t('nav.history')}</button>
        <button className="quick-btn" onClick={() => go('community')}><span className="quick-ic"><Icon name="users" /></span>{t('nav.community')}</button>
      </nav>

      {rest.length > 0 && (
        <section aria-label={t('ux.alerts')} className="alerts">
          {(showAll ? rest : rest.slice(0, VISIBLE_TIPS)).map(renderTip)}
          {rest.length > VISIBLE_TIPS && (
            <button className="btn ghost sm more-toggle" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
              {showAll ? t('ux.showLess') : t('ux.showMore', { n: rest.length - VISIBLE_TIPS })}
              <Icon name="chevron" size={16} />
            </button>
          )}
        </section>
      )}

      <Suspense fallback={null}>
        <ProcessingAlertsCard />
      </Suspense>

      <HouseholdCard />

      {apps.length > 0 && (
        <section className="card">
          <div className="row spread">
            <h2 style={{ margin: 0 }}><Icon name="timeline" /> {t('home.applications')}</h2>
            <button className="btn ghost sm" onClick={() => go('timeline')}>{t('common.open')} <Icon name="chevron" size={16} /></button>
          </div>
          {apps.map((a) => {
            const p = predict(a, insights.today, open.ircc ?? {}, open.community?.records ?? []);
            return (
              <button key={a.id} className="app-row" onClick={() => go('timeline', a.id)}>
                <div className="row spread"><b>{a.label || t(`app.kind.${a.kind}`)}</b><span className="small muted">{p ? `${p.percent}%` : ''}</span></div>
                {p && (
                  <>
                    <div className="progress accent" style={{ margin: '8px 0 4px' }}><div style={{ width: `${p.percent}%` }} /></div>
                    <div className="tiny" style={{ textAlign: 'start' }}>{t('home.appEta', { date: fmtDate(p.p50, lang) })}</div>
                  </>
                )}
              </button>
            );
          })}
        </section>
      )}

      <section className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}><Icon name="calendar" /> {t('home.thisYear')}</h2>
          <button className="btn ghost sm" onClick={() => go('calendar')}>{t('common.open')} <Icon name="chevron" size={16} /></button>
        </div>
        <MiniYear year={Number(insights.today.slice(0, 4))} />
      </section>


      {insights.reminders.length > 0 && (
        <section className="card">
          <h2><Icon name="bell" /> {t('home.upcoming')}</h2>
          <ul className="list">
            {insights.reminders.slice(0, 5).map((rm) => (
              <li key={rm.id}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{t(rm.title, fmtVars(rm.vars, lang))}</div>
                  <div className="tiny">{fmtDate(rm.date, lang)} · {t('home.inDays', { days: fmtNum(diffDays(rm.date, insights.today), lang) })}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="tiny" style={{ textAlign: 'center', marginTop: 20 }}>{t('common.disclaimer')}</p>
      <TripEditor state={editor} />
    </>
  );
}

export function fmtVars(vars: Record<string, string | number>, lang: string) {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v, lang) : v]));
}

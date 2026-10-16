import { lazy, Suspense } from 'react';
import { proactiveTips } from '../assistant/tips';
import { Icon } from '../components/Icon';
import { Ring, Status } from '../components/ui';
import { diffDays } from '../domain/dates';
import { CITIZENSHIP_REQUIRED, RESIDENCY_REQUIRED } from '../domain/presence';
import { predict } from '../domain/timeline';
import { fmtDate, fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';
import { MiniYear } from './Calendar';
import { TripEditor, useTripEditor } from './Trips';
import { HouseholdCard } from './People';
import { crossChecks } from '../domain/crossChecks';

// Loaded after first paint: it fetches trend data and is not needed for the core counts.
const ProcessingAlertsCard = lazy(() => import('./Curves').then((m) => ({ default: m.ProcessingAlertsCard })));

export function Home() {
  const { data, insights, t, lang, go, open } = useApp();
  const editor = useTripEditor();
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

  return (
    <>
      <HouseholdCard />
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

      <Suspense fallback={null}>
        <ProcessingAlertsCard />
      </Suspense>

      {tips.map((tip) => (
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
      ))}

      {c && (
        <section className="card" aria-labelledby="cit-h">
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
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtDate(c.eligibleDate, lang)}</div>
                  <div className="small muted">{t('home.citDaysLeft', { days: fmtNum(c.daysUntilEligible ?? 0, lang), need: c.remaining })}</div>
                </>
              ) : (
                <div className="small muted">{t('home.citFar')}</div>
              )}
              {c.prePrDays > 0 && <div className="tiny">{t('home.citPrePr', { credit: Math.floor(c.prePrCredit) })}</div>}
              {c.safeDate && !c.eligible && <div className="tiny">{t('home.citSafe', { date: fmtDate(c.safeDate, lang), buffer: data.settings.citizenshipBuffer })}</div>}
            </div>
          </div>
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
        </section>
      )}

      {card && (
        <section className="card" aria-labelledby="card-h">
          <h2 id="card-h"><Icon name="card" /> {t('home.prCard')}</h2>
          <div className="row spread">
            <div>
              <div className="label">{t('home.cardExpires')}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtDate(card.expiry, lang)}</div>
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

      {data.profile.prDate && (
        <section className="card">
          <div className="row spread">
            <h2 style={{ margin: 0 }}><Icon name="card" /> {t('form.title')}</h2>
            <button className="btn ghost sm" onClick={() => go('forms')}>{t('common.open')} <Icon name="chevron" size={16} /></button>
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>{t('form.intro')}</p>
        </section>
      )}

      <section className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}><Icon name="calendar" /> {t('home.thisYear')}</h2>
          <button className="btn ghost sm" onClick={() => go('calendar')}>{t('common.open')} <Icon name="chevron" size={16} /></button>
        </div>
        <MiniYear year={Number(insights.today.slice(0, 4))} />
      </section>

      {apps.length > 0 && (
        <section className="card">
          <div className="row spread">
            <h2 style={{ margin: 0 }}><Icon name="timeline" /> {t('home.applications')}</h2>
            <button className="btn ghost sm" onClick={() => go('timeline')}>{t('common.open')} <Icon name="chevron" size={16} /></button>
          </div>
          {apps.map((a) => {
            const p = predict(a, insights.today, open.ircc ?? {}, open.community?.records ?? []);
            return (
              <button key={a.id} className="btn block" style={{ justifyContent: 'flex-start', marginTop: 10, height: 'auto', padding: 12, flexDirection: 'column', alignItems: 'stretch', fontWeight: 400 }} onClick={() => go('timeline', a.id)}>
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

      <div className="grid2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => editor.create()}><Icon name="plus" /> {t('home.logTrip')}</button>
        <button className="btn" onClick={() => go('assistant')}><Icon name="sparkle" /> {t('home.askMaple')}</button>
        <button className="btn" onClick={() => go('eligibility')}><Icon name="target" /> {t('nav.eligibility')}</button>
        <button className="btn" onClick={() => go('community')}><Icon name="users" /> {t('nav.community')}</button>
        <button className="btn" onClick={() => go('documents')}><Icon name="card" /> {t('nav.documents')}</button>
        <button className="btn" onClick={() => go('history')}><Icon name="home2" /> {t('nav.history')}</button>
      </div>
      <p className="tiny" style={{ textAlign: 'center', marginTop: 20 }}>{t('common.disclaimer')}</p>
      <TripEditor state={editor} />
    </>
  );
}

export function fmtVars(vars: Record<string, string | number>, lang: string) {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v, lang) : v]));
}

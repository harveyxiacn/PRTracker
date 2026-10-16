// Community 2.0 (v0.7): "% of similar applicants finished by day N" curve for an application
// (Timeline detail) and processing-time change alerts (Home).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Status } from '../components/ui';
import { countryName } from '../domain/countries';
import { CURVE_MIN_N, finishCurve, finishedShare, type CurvePoint, type FinishCurve } from '../domain/curves';
import { addDays, diffDays, isISODate } from '../domain/dates';
import { knownOffice } from '../domain/programs';
import { processingChanges } from '../domain/ptAlerts';
import { FINAL_MILESTONE } from '../domain/timeline';
import type { Application } from '../domain/types';
import { loadTrends, type TrendsData } from '../data/trends';
import { niceTicks } from '../data/trendsCore';
import { fmtDate, fmtNum, type Lang } from '../i18n';
import { useApp } from '../store/AppContext';

type T = ReturnType<typeof useApp>['t'];

const SCOPE_KEY: Record<FinishCurve['scope'], string> = {
  office: 'c2.scope.office',
  province: 'c2.scope.province',
  country: 'c2.scope.country',
  program: 'c2.scope.program',
};

/** Day the user is at: the final milestone's day if reached, else days since submission. */
export function userDay(app: Application, today: string): number | undefined {
  if (!app.submitted) return undefined;
  const final = FINAL_MILESTONE[app.kind] ?? 'decision';
  const done = app.milestones.find((m) => m.key === final && m.date)?.date;
  return Math.max(0, diffDays(done ?? today, app.submitted));
}

/** "office (Ottawa)", "country (India)", "program (Canadian Experience Class)". */
export function scopeText(curve: FinishCurve, app: Application, t: T, lang: Lang): string {
  const name =
    curve.scope === 'office' ? knownOffice(app.office)
    : curve.scope === 'province' && app.province ? t(`prov.${app.province}`)
    : curve.scope === 'country' && app.country ? countryName(app.country.toUpperCase(), lang)
    : t(`app.kind.${app.kind}`);
  return name ? t('c2.scopeWith', { scope: t(SCOPE_KEY[curve.scope]), name }) : t(SCOPE_KEY[curve.scope]);
}

const pctText = (pct: number, lang: Lang) => fmtNum(Math.round(pct), lang);

export function FinishCurveCard({ app }: { app: Application }) {
  const { t, lang, open, insights } = useApp();
  const [showTable, setShowTable] = useState(false);
  const records = open.community?.records;
  const curve = useMemo(() => finishCurve(app, records ?? []), [app, records]);
  const final = FINAL_MILESTONE[app.kind] ?? 'decision';
  const milestone = t(`ms.${final}`);
  const day = userDay(app, insights.today);

  return (
    <section className="card" aria-labelledby="c2-curve-h">
      <h2 id="c2-curve-h"><Icon name="users" /> {t('c2.curve.title')}</h2>
      {!curve ? (
        <Empty icon="users">{t('c2.curve.empty', { n: CURVE_MIN_N })}</Empty>
      ) : (
        <>
          <p className="small muted">{t('c2.curve.intro', { milestone })}</p>
          {day !== undefined ? (
            <p style={{ fontWeight: 600, margin: '4px 0' }}>
              {t('c2.curve.share', { pct: pctText(finishedShare(curve, day), lang), day: fmtNum(day, lang) })}
            </p>
          ) : (
            <p className="small muted">{t('c2.curve.noSubmitted')}</p>
          )}
          <div className="tiny">{t('c2.curve.scope', { scope: scopeText(curve, app, t, lang), n: fmtNum(curve.n, lang) })}</div>
          <StepChart curve={curve} day={day} t={t} lang={lang} />
          <div className="legend" style={{ marginTop: 6 }}>
            <span><i style={{ height: 2, borderRadius: 1, background: 'var(--d-tr)' }} />{t('c2.curve.series')}</span>
            {day !== undefined && <span><i style={{ height: 2, borderRadius: 1, background: 'var(--accent)' }} />{t('c2.curve.you')}</span>}
          </div>
          <div className="row wrap" style={{ gap: 16, margin: '10px 0 4px' }}>
            {(['p50', 'p80', 'p90'] as const).map((k) =>
              curve[k] !== undefined ? (
                <div key={k}>
                  <div className="label">{t(`c2.curve.${k}`)}</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{t('c2.curve.dayN', { n: fmtNum(curve[k]!, lang) })}</div>
                </div>
              ) : null,
            )}
          </div>
          <p className="tiny">{t('c2.curve.onlyFinished', { milestone })}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm" type="button" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? t('c2.curve.hideTable') : t('c2.curve.showTable')}
            </button>
          </div>
          {showTable && (
            <table className="data" style={{ marginTop: 8 }}>
              <caption className="visually-hidden">{t('c2.curve.chartLabel')}</caption>
              <thead><tr><th>{t('c2.curve.colDay')}</th><th className="n">{t('c2.curve.colPct')}</th></tr></thead>
              <tbody>
                {curve.points.slice(1).map((p, i) => (
                  <tr key={i}><td>{fmtNum(p.day, lang)}</td><td className="n">{pctText(p.pct, lang)}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

const HEIGHT = 196;
const M = { top: 22, end: 14, bottom: 24, start: 40 };
const Y_TICKS = [0, 25, 50, 75, 100];

/** Step chart of the empirical CDF, with the user's day marked, crosshair + tooltip and keyboard support. */
function StepChart({ curve, day, t, lang }: { curve: FinishCurve; day?: number; t: T; lang: Lang }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Points after the (0,0) origin: one per distinct finish day.
  const steps: CurvePoint[] = curve.points.slice(1);
  const lastDay = steps.length ? steps[steps.length - 1].day : 0;
  const xTicks = niceTicks(0, Math.max(1, lastDay, day ?? 0), 4).filter((v) => v >= 0);
  const xMax = xTicks[xTicks.length - 1] || 1;
  const plotW = width - M.start - M.end;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (d: number) => M.start + (Math.min(d, xMax) / xMax) * plotW;
  const y = (pct: number) => M.top + plotH - (pct / 100) * plotH;

  let line = `M${x(0)},${y(0)}`;
  for (const p of steps) line += `H${x(p.day)}V${y(p.pct)}`;
  line += `H${x(xMax)}`;
  const area = `${line}V${y(0)}H${x(0)}Z`;

  const nearest = (px: number) => {
    let best = 0;
    for (let i = 1; i < steps.length; i++) if (Math.abs(x(steps[i].day) - px) < Math.abs(x(steps[best].day) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!steps.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    setActive(nearest(((e.clientX - r.left) / r.width) * width));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = steps.length - 1;
    if (last < 0) return;
    const cur = active ?? 0;
    const next = e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : e.key === 'ArrowRight' ? Math.min(last, cur + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  const a = active !== null ? steps[active] : undefined;
  const tipX = a ? x(a.day) : 0;
  const describe = (p: CurvePoint) => `${t('c2.curve.tipPct', { pct: pctText(p.pct, lang) })} ${t('c2.curve.tipDay', { day: fmtNum(p.day, lang) })}`;
  const youX = day !== undefined ? x(day) : 0;
  const youPct = day !== undefined ? finishedShare(curve, day) : 0;
  const youRight = youX > M.start + plotW / 2;
  const summary =
    t('c2.curve.chartLabel') +
    (curve.p50 !== undefined ? `. ${t('c2.curve.p50')} ${t('c2.curve.dayN', { n: fmtNum(curve.p50, lang) })}` : '') +
    (day !== undefined ? `. ${t('c2.curve.share', { pct: pctText(youPct, lang), day: fmtNum(day, lang) })}` : '');

  return (
    // Days since submission always run left to right, also in RTL languages.
    <div ref={wrap} dir="ltr" style={{ position: 'relative', width: '100%', marginTop: 8 }}>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="group"
        aria-roledescription="chart"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(0)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        style={{ display: 'block', touchAction: 'pan-y', borderRadius: 8 }}
      >
        {Y_TICKS.map((tk) => (
          <g key={tk}>
            <line x1={M.start} x2={width - M.end} y1={y(tk)} y2={y(tk)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.start - 6} y={y(tk)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(tk, lang)}%</text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <text
            key={tk}
            x={x(tk)}
            y={HEIGHT - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--text-3)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtNum(tk, lang)}
          </text>
        ))}
        <path d={area} fill="var(--d-tr)" fillOpacity={0.1} stroke="none" />
        <path d={line} fill="none" stroke="var(--d-tr)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {day !== undefined && (
          <g>
            <line x1={youX} x2={youX} y1={M.top - 4} y2={M.top + plotH} stroke="var(--accent)" strokeWidth={2} />
            <circle cx={youX} cy={y(youPct)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            <text x={youRight ? youX - 6 : youX + 6} y={12} textAnchor={youRight ? 'end' : 'start'} fontSize={11} fontWeight={600} fill="var(--text-2)">
              {t('c2.curve.youDay', { day: fmtNum(day, lang) })}
            </text>
          </g>
        )}
        {a && (
          <>
            <line x1={tipX} x2={tipX} y1={M.top} y2={M.top + plotH} stroke="var(--text-3)" strokeWidth={1} shapeRendering="crispEdges" />
            <circle cx={tipX} cy={y(a.pct)} r={5} fill="var(--d-tr)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {a && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: M.top,
            insetInlineStart: Math.min(Math.max(tipX - 60, 0), width - 120),
            width: 120,
            pointerEvents: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow)',
            padding: '4px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('c2.curve.tipPct', { pct: pctText(a.pct, lang) })}</div>
          <div className="tiny">{t('c2.curve.tipDay', { day: fmtNum(a.day, lang) })}</div>
        </div>
      )}
      <div className="tiny" style={{ textAlign: 'center' }}>{t('c2.curve.axisX')}</div>
      <div className="visually-hidden" aria-live="polite">{a ? describe(a) : ''}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Processing-time alerts (Home)

const SERIES_LABEL: Record<string, string> = {
  pr_card: 'trend.s.pr_card',
  work_ext: 'trend.s.work_ext',
  study_ext: 'trend.s.study_ext',
  visitor_ext: 'trend.s.visitor_ext',
  study: 'trend.s.study',
  work: 'trend.s.work',
  'visitor-outside-canada': 'trend.s.visitor',
  supervisa: 'trend.s.supervisa',
  child_dependent: 'c2.s.child',
  child_adopted: 'c2.s.childAdopted',
};

/** Human label for a trend series key ("pr_card", "work:IN"). */
export function seriesLabel(key: string, t: T, lang: Lang): string {
  const [base, cc] = key.split(':');
  const name = SERIES_LABEL[base] ? t(SERIES_LABEL[base]) : base;
  return cc ? t('trend.forCountry', { series: name, country: countryName(cc, lang) }) : name;
}

export function ProcessingAlertsCard() {
  const { data, update, t, lang, insights } = useApp();
  const [trends, setTrends] = useState<TrendsData | undefined>();
  const dataUrl = data.settings.dataUrl;

  useEffect(() => {
    let alive = true;
    loadTrends(dataUrl).then((d) => alive && setTrends(d));
    return () => {
      alive = false;
    };
  }, [dataUrl]);

  const since = data.ptSeen && isISODate(data.ptSeen) ? data.ptSeen : addDays(insights.today, -30);
  const changes = useMemo(() => (trends ? processingChanges(trends, data.applications, since) : []), [trends, data.applications, since]);
  if (!changes.length) return null;

  return (
    <section className="card" aria-labelledby="c2-pt-h">
      <h2 id="c2-pt-h"><Icon name="bell" /> {t('c2.pt.title')}</h2>
      <p className="small muted">{t('c2.pt.intro')}</p>
      <ul className="list">
        {changes.map((c) => {
          const delta = c.to - c.from;
          const signed = `${delta > 0 ? '+' : '−'}${fmtNum(Math.abs(delta), lang)}`;
          return (
            <li key={c.series}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {t('c2.pt.change', { series: seriesLabel(c.series, t, lang), from: fmtNum(c.from, lang), to: fmtNum(c.to, lang), delta: signed })}
                </div>
                <div className="tiny">{t('c2.pt.date', { date: fmtDate(c.date, lang) })}</div>
              </div>
              {/* Longer waits are worse news; the word carries the meaning, colour only supports it. */}
              <Status kind={delta > 0 ? 'warn' : 'good'}>{t(delta > 0 ? 'c2.pt.longer' : 'c2.pt.shorter')}</Status>
            </li>
          );
        })}
      </ul>
      <p className="tiny">{t('c2.pt.note')}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn sm primary" type="button" onClick={() => update((d) => ({ ...d, ptSeen: changes.map((c) => c.date).sort().pop() }))}>
          <Icon name="check" size={16} /> {t('c2.pt.gotIt')}
        </button>
      </div>
    </section>
  );
}

// Processing-time trends card for the Community screen: how IRCC's published times moved,
// from the daily history in public/data/ircc-history.json.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field } from '../components/ui';
import { countryName } from '../domain/countries';
import { loadTrends, type TrendPoint, type TrendsData } from '../data/trends';
import { changeSince, dayNumber, mostCommon, niceTicks } from '../data/trendsCore';
import { fmtDate, fmtNum, type Lang } from '../i18n';
import { useApp } from '../store/AppContext';

interface SeriesOption {
  id: string;
  label: string;
  /** Per-country IRCC series: key is `${id}:${country}`. */
  perCountry?: boolean;
}

const OPTIONS: SeriesOption[] = [
  { id: 'pr_card', label: 'trend.s.pr_card' },
  { id: 'work_ext', label: 'trend.s.work_ext' },
  { id: 'study_ext', label: 'trend.s.study_ext' },
  { id: 'visitor_ext', label: 'trend.s.visitor_ext' },
  { id: 'study', label: 'trend.s.study', perCountry: true },
  { id: 'work', label: 'trend.s.work', perCountry: true },
  { id: 'visitor-outside-canada', label: 'trend.s.visitor', perCountry: true },
  { id: 'supervisa', label: 'trend.s.supervisa', perCountry: true },
];

const WINDOW_DAYS = 90;

export function ProcessingTrends() {
  const { t, lang, data } = useApp();
  const [trends, setTrends] = useState<TrendsData | undefined | null>(null); // null = loading
  const [choice, setChoice] = useState('pr_card');
  const [country, setCountry] = useState<string | undefined>();
  const [showTable, setShowTable] = useState(false);
  const dataUrl = data.settings.dataUrl;

  useEffect(() => {
    let alive = true;
    loadTrends(dataUrl).then((d) => alive && setTrends(d));
    return () => {
      alive = false;
    };
  }, [dataUrl]);

  // Countries that have at least one per-country series, by localised name.
  const countries = useMemo(() => {
    const codes = new Set(Object.keys(trends?.series ?? {}).map((k) => k.split(':')[1]).filter((c): c is string => !!c));
    const coll = new Intl.Collator(lang);
    return [...codes].map((code) => ({ code, name: countryName(code, lang) })).sort((a, b) => coll.compare(a.name, b.name));
  }, [trends, lang]);
  const myCountry = useMemo(
    () => mostCommon(data.applications.filter((a) => !a.archived).map((a) => a.country?.toUpperCase())),
    [data.applications],
  );
  const cc = country ?? (myCountry && countries.some((c) => c.code === myCountry) ? myCountry : countries[0]?.code ?? myCountry);

  const option = OPTIONS.find((o) => o.id === choice) ?? OPTIONS[0];
  const key = option.perCountry ? (cc ? `${option.id}:${cc}` : '') : option.id;
  const points: TrendPoint[] = (key && trends?.series[key]) || [];
  const seriesName = option.perCountry && cc ? t('trend.forCountry', { series: t(option.label), country: countryName(cc, lang) }) : t(option.label);
  const change = changeSince(points, WINDOW_DAYS);
  const latest = points[points.length - 1];

  return (
    <section className="card">
      <h2><Icon name="timeline" /> {t('trend.title')}</h2>
      <p className="small muted">{t('trend.intro')}</p>
      <div className="grid2">
        <Field label={t('trend.series')}>
          <select className="input" value={option.id} onChange={(e) => setChoice(e.target.value)}>
            <optgroup label={t('trend.group.inCanada')}>
              {OPTIONS.filter((o) => !o.perCountry).map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
            </optgroup>
            <optgroup label={t('trend.group.country')}>
              {OPTIONS.filter((o) => o.perCountry).map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
            </optgroup>
          </select>
        </Field>
        {option.perCountry && (
          <Field label={t('trend.country')} hint={myCountry && cc === myCountry ? t('trend.countryHint') : undefined}>
            <select className="input" value={cc ?? ''} onChange={(e) => setCountry(e.target.value)} disabled={!countries.length}>
              {!countries.length && <option value="">{t('trend.noCountries')}</option>}
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      {trends === null ? (
        <p className="small muted">{t('trend.loading')}</p>
      ) : points.length < 2 ? (
        <Empty icon="timeline">{t('trend.empty')}</Empty>
      ) : (
        <>
          <div className="row wrap" style={{ alignItems: 'baseline', gap: 16, margin: '8px 0' }}>
            <div>
              <div className="label">{t('trend.latest')}</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{t('trend.days', { n: fmtNum(latest.days, lang) })}</div>
              <div className="tiny">{fmtDate(latest.date, lang)}</div>
            </div>
            {change && changeBadge(change.change, change.partial, fmtDate(change.referenceDate, lang))}
          </div>
          <h3>{t('trend.chartTitle', { series: seriesName })}</h3>
          <LineChart points={points} lang={lang} label={t('trend.chartTitle', { series: seriesName })} unit={(n) => t('trend.days', { n: fmtNum(n, lang) })} />
          <div className="row spread wrap" style={{ marginTop: 8 }}>
            <span className="tiny">{t('trend.source', { date: fmtDate(points[0].date, lang) })}</span>
            <button className="btn sm" type="button" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? t('trend.hideTable') : t('trend.showTable')}
            </button>
          </div>
          {showTable && (
            <table className="data" style={{ marginTop: 8 }}>
              <caption className="visually-hidden">{t('trend.chartTitle', { series: seriesName })}</caption>
              <thead><tr><th>{t('trend.date')}</th><th className="n">{t('trend.daysCol')}</th></tr></thead>
              <tbody>
                {points.slice().reverse().map((p) => (
                  <tr key={p.date}><td>{fmtDate(p.date, lang)}</td><td className="n">{fmtNum(p.days, lang)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );

  function changeBadge(change: number, partial: boolean, since: string) {
    const n = fmtNum(Math.abs(change), lang);
    const text = change === 0 ? t('trend.noChange') : t(change > 0 ? 'trend.up' : 'trend.down', { n });
    // Longer waits are worse news; the sign and words carry the meaning, colour only supports it.
    const color = change > 0 ? 'var(--critical-text)' : change < 0 ? 'var(--good-text)' : 'var(--text-2)';
    return (
      <div>
        <div className="label">{partial ? t('trend.sinceDate', { date: since }) : t('trend.vs90')}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color }}>{text}</div>
      </div>
    );
  }
}

const HEIGHT = 184;
const M = { top: 10, end: 14, bottom: 26, start: 44 };

/** Single-series step line (a value holds until IRCC publishes a new one), with crosshair + tooltip. */
function LineChart({ points, lang, label, unit }: { points: TrendPoint[]; lang: Lang; label: string; unit: (n: number) => string }) {
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

  const values = points.map((p) => p.days);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const d0 = dayNumber(points[0].date);
  const d1 = dayNumber(points[points.length - 1].date);
  const plotW = width - M.start - M.end;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (iso: string) => M.start + (d1 === d0 ? plotW / 2 : ((dayNumber(iso) - d0) / (d1 - d0)) * plotW);
  const y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;

  let path = '';
  points.forEach((p, i) => {
    path += i === 0 ? `M${x(p.date)},${y(p.days)}` : `H${x(p.date)}V${y(p.days)}`;
  });

  const nearest = (px: number) => {
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setActive(nearest(((e.clientX - r.left) / r.width) * width));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = points.length - 1;
    const cur = active ?? last;
    const next = e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : e.key === 'ArrowRight' ? Math.min(last, cur + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  const a = active !== null ? points[active] : undefined;
  const tipX = a ? x(a.date) : 0;
  const lastP = points[points.length - 1];
  const describe = (p: TrendPoint) => `${fmtDate(p.date, lang)}: ${unit(p.days)}`;

  return (
    // The time axis always runs left to right, also in RTL languages.
    <div ref={wrap} dir="ltr" style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`${label}. ${describe(points[0])} → ${describe(lastP)}`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        style={{ display: 'block', touchAction: 'pan-y', borderRadius: 8 }}
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={M.start} x2={width - M.end} y1={y(tk)} y2={y(tk)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.start - 6} y={y(tk)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(tk, lang)}</text>
          </g>
        ))}
        <text x={M.start} y={HEIGHT - 8} textAnchor="start" fontSize={11} fill="var(--text-3)">{fmtDate(points[0].date, lang, { month: 'short', year: 'numeric' })}</text>
        <text x={width - M.end} y={HEIGHT - 8} textAnchor="end" fontSize={11} fill="var(--text-3)">{fmtDate(lastP.date, lang, { month: 'short', year: 'numeric' })}</text>
        <path d={path} fill="none" stroke="var(--d-tr)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {!a && <circle cx={x(lastP.date)} cy={y(lastP.days)} r={4} fill="var(--d-tr)" stroke="var(--surface)" strokeWidth={2} />}
        {a && (
          <>
            <line x1={tipX} x2={tipX} y1={M.top} y2={M.top + plotH} stroke="var(--text-3)" strokeWidth={1} shapeRendering="crispEdges" />
            <circle cx={tipX} cy={y(a.days)} r={5} fill="var(--d-tr)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {a && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>{unit(a.days)}</div>
          <div className="tiny">{fmtDate(a.date, lang)}</div>
        </div>
      )}
      <div className="visually-hidden" aria-live="polite">{a ? describe(a) : ''}</div>
    </div>
  );
}

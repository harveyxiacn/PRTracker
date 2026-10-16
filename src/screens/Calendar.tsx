import { useMemo, useState, type ReactElement } from 'react';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/ui';
import { addDays, daysInYear, toDay, weekdayMon0, type ISODate } from '../domain/dates';
import type { DayKind, PresenceModel } from '../domain/presence';
import type { Trip } from '../domain/types';
import { fmtDate, fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';

const pad = (n: number) => String(n).padStart(2, '0');

function cellClass(model: PresenceModel, iso: ISODate): string {
  const k = model.dayKind(iso);
  if (k === 'travel' && model.dayStatus(iso) === 'tr') return 'travel pre';
  return k;
}

function tripOn(trips: Trip[], iso: ISODate, today: ISODate): Trip | undefined {
  return trips.find((t) => t.departure <= iso && iso <= (t.return ?? today));
}

/** GitHub-style 53-week strip used on the Home screen. */
export function MiniYear({ year }: { year: number }) {
  const { insights, lang, go, t } = useApp();
  const cell = 10;
  const gap = 2;
  const start = `${year}-01-01`;
  const offset = weekdayMon0(start);
  const n = daysInYear(year);
  const weeks = Math.ceil((n + offset) / 7);
  const rects: ReactElement[] = [];
  const colors: Record<string, string> = {
    pr_in: 'var(--d-pr)', tr_in: 'var(--d-tr)', none_in: 'var(--d-none)', out: 'var(--d-out)',
    out_planned: 'var(--d-out)', travel: 'var(--d-pr)', future: 'var(--d-future)',
  };
  for (let i = 0; i < n; i++) {
    const iso = addDays(start, i);
    const k = insights.model.dayKind(iso);
    const w = Math.floor((i + offset) / 7);
    const d = (i + offset) % 7;
    rects.push(
      <rect key={i} x={w * (cell + gap)} y={d * (cell + gap) + 14} width={cell} height={cell} rx={2}
        fill={colors[k]} opacity={k === 'out_planned' ? 0.45 : 1}
        stroke={iso === insights.today ? 'var(--text)' : k === 'future' ? 'var(--border)' : 'none'} strokeWidth={iso === insights.today ? 1.5 : 1}>
        <title>{`${fmtDate(iso, lang)} · ${t(`cal.kind.${k}`)}`}</title>
      </rect>,
    );
  }
  const labels = Array.from({ length: 12 }, (_, m) => {
    const first = `${year}-${pad(m + 1)}-01`;
    const w = Math.floor((toDay(first) - toDay(start) + offset) / 7);
    return (
      <text key={m} x={w * (cell + gap)} y={10} fontSize={9} fill="var(--text-3)">
        {new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-CA', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, m, 1)))}
      </text>
    );
  });
  const width = weeks * (cell + gap);
  return (
    <>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <svg viewBox={`0 0 ${width} ${14 + 7 * (cell + gap)}`} style={{ width: '100%', minWidth: 420, display: 'block', cursor: 'pointer' }} onClick={() => go('calendar')} role="img" aria-label={t('cal.miniLabel', { year })}>
          {labels}
          {rects}
        </svg>
      </div>
      <Legend />
    </>
  );
}

export function Legend() {
  const { t } = useApp();
  return (
    <div className="legend" style={{ marginTop: 10 }}>
      <span><i style={{ background: 'var(--d-pr)' }} />{t('cal.kind.pr_in')}</span>
      <span><i style={{ background: 'var(--d-tr)' }} />{t('cal.kind.tr_in')}</span>
      <span><i style={{ background: 'var(--d-out)' }} />{t('cal.kind.out')}</span>
      <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--d-out) 0 2px, var(--d-future) 2px 4px)' }} />{t('cal.kind.out_planned')}</span>
      <span><i style={{ background: 'var(--d-pr)', boxShadow: 'inset 0 0 0 2px var(--d-out)' }} />{t('cal.kind.travel')}</span>
      <span><i style={{ background: 'var(--d-none)' }} />{t('cal.kind.none_in')}</span>
    </div>
  );
}

export function CalendarScreen() {
  const { insights, data, t, lang } = useApp();
  const thisYear = Number(insights.today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState<'year' | 'month'>('year');
  const [month, setMonth] = useState(Number(insights.today.slice(5, 7)));
  const [sel, setSel] = useState<ISODate | null>(null);
  const model = insights.model;
  const minYear = Number(model.firstDay.slice(0, 4));

  const stats = useMemo(() => {
    const out: { year: number; inCanada: number; outside: number; trips: number }[] = [];
    for (let y = thisYear; y >= Math.max(minYear, thisYear - 7); y--) out.push(model.yearStats(y, data.trips));
    return out;
  }, [model, data.trips, thisYear, minYear]);

  const monthName = (m: number, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-CA', { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 1)));
  const dows = lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const renderMonth = (y: number, m: number, big: boolean) => {
    const first = `${y}-${pad(m)}-01`;
    const off = weekdayMon0(first);
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: ReactElement[] = [];
    for (let i = 0; i < off; i++) cells.push(<span key={`e${i}`} className="cell empty" />);
    for (let d = 1; d <= len; d++) {
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const k = model.dayKind(iso) as DayKind;
      cells.push(
        <button
          key={iso}
          className={`cell ${cellClass(model, iso)}${iso === insights.today ? ' today' : ''}${iso === sel ? ' sel' : ''}`}
          aria-label={`${fmtDate(iso, lang)}: ${t(`cal.kind.${k}`)}`}
          onClick={() => setSel(iso === sel ? null : iso)}
        >
          {big ? d : null}
        </button>,
      );
    }
    return (
      <div className={`month${big ? ' month-big' : ''}`} key={`${y}-${m}`}>
        {!big && <h4>{monthName(m, 'short')}</h4>}
        <div className="mgrid">
          {big && dows.map((d, i) => <span key={i} className="dow">{d}</span>)}
          {cells}
        </div>
      </div>
    );
  };

  const selTrip = sel ? tripOn(data.trips, sel, insights.today) : undefined;
  const ys = model.yearStats(year, data.trips);

  return (
    <>
      <div className="row spread" style={{ marginTop: 8 }}>
        <Segmented label={t('cal.view')} value={view} onChange={setView} options={[{ value: 'year', label: t('cal.year') }, { value: 'month', label: t('cal.month') }]} />
      </div>
      <section className="card">
        <div className="row spread">
          <button className="icon-btn" aria-label={t('common.previous')} onClick={() => (view === 'year' ? setYear(year - 1) : month === 1 ? (setMonth(12), setYear(year - 1)) : setMonth(month - 1))}>
            <Icon name="left" />
          </button>
          <h2 style={{ margin: 0 }}>{view === 'year' ? year : `${monthName(month)} ${year}`}</h2>
          <button className="icon-btn" aria-label={t('common.next')} onClick={() => (view === 'year' ? setYear(year + 1) : month === 12 ? (setMonth(1), setYear(year + 1)) : setMonth(month + 1))}>
            <Icon name="right" />
          </button>
        </div>
        {view === 'year' ? (
          <div className="months">{Array.from({ length: 12 }, (_, i) => renderMonth(year, i + 1, false))}</div>
        ) : (
          renderMonth(year, month, true)
        )}
        <div className="small" style={{ minHeight: 40, marginTop: 12 }} aria-live="polite">
          {sel ? (
            <>
              <b>{fmtDate(sel, lang, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</b> · {t(`cal.kind.${model.dayKind(sel)}`)}
              {selTrip && <> · {t('cal.trip', { place: selTrip.destination || t('trips.abroad'), dep: fmtDate(selTrip.departure, lang), ret: selTrip.return ? fmtDate(selTrip.return, lang) : t('trips.ongoing') })}</>}
              {model.dayStatus(sel) === 'tr' && <> · {t('cal.halfCredit')}</>}
            </>
          ) : (
            <span className="muted">{t('cal.tapHint')}</span>
          )}
        </div>
        <Legend />
      </section>

      <section className="card">
        <h2>{t('cal.yearSummary', { year })}</h2>
        <div className="grid2">
          <div><div className="label">{t('cal.inCanada')}</div><div className="hero-num" style={{ fontSize: 28 }}>{fmtNum(ys.inCanada, lang)}</div></div>
          <div><div className="label">{t('cal.outside')}</div><div className="hero-num" style={{ fontSize: 28 }}>{fmtNum(ys.outside, lang)}</div></div>
        </div>
        <h3>{t('cal.byYear')}</h3>
        <table className="data">
          <thead><tr><th>{t('cal.year')}</th><th className="n">{t('cal.inCanada')}</th><th className="n">{t('cal.outside')}</th><th className="n">{t('cal.trips')}</th></tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.year}><td>{s.year}</td><td className="n">{fmtNum(s.inCanada, lang)}</td><td className="n">{fmtNum(s.outside, lang)}</td><td className="n">{s.trips}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="tiny">{t(data.settings.boundaryDaysPresent ? 'cal.ruleBoundary' : 'cal.ruleStrict')}</p>
      </section>
    </>
  );
}

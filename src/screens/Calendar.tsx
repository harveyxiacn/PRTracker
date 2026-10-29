import { useMemo, useState, type ReactElement } from 'react';
import { Icon } from '../components/Icon';
import { Segmented, useSwipe } from '../components/ui';
import { addDays, daysInYear, toDay, weekdayMon0, type ISODate } from '../domain/dates';
import type { DayKind, PresenceModel } from '../domain/presence';
import type { Trip } from '../domain/types';
import { fmtDate, fmtNum, languageInfo } from '../i18n';
import { useApp } from '../store/AppContext';
import { TripEditor, useTripEditor } from './Trips';

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
        {new Intl.DateTimeFormat(languageInfo(lang).intl, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, m, 1)))}
      </text>
    );
  });
  const width = weeks * (cell + gap);
  return (
    <>
      {/* Scrolls sideways on narrow phones, so keyboard users must be able to focus it. */}
      <div style={{ overflowX: 'auto', marginTop: 10 }} tabIndex={0} role="region" aria-label={t('cal.miniLabel', { year })}>
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
  // Direction of the last page change, so the new month/year slides in from the side it came from.
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const editor = useTripEditor();
  const model = insights.model;
  const thisMonth = Number(insights.today.slice(5, 7));
  const atToday = year === thisYear && (view === 'year' || month === thisMonth);
  const page = (d: -1 | 1) => {
    setDir(d);
    if (view === 'year') setYear(year + d);
    else if (month + d === 0) (setMonth(12), setYear(year - 1));
    else if (month + d === 13) (setMonth(1), setYear(year + 1));
    else setMonth(month + d);
  };
  const goToday = () => {
    setDir(0);
    setYear(thisYear);
    setMonth(thisMonth);
    setSel(insights.today);
  };
  const openMonth = (m: number) => {
    setDir(0);
    setMonth(m);
    setView('month');
  };
  const swipe = useSwipe(page);
  const minYear = Number(model.firstDay.slice(0, 4));

  const stats = useMemo(() => {
    const out: { year: number; inCanada: number; outside: number; trips: number }[] = [];
    for (let y = thisYear; y >= Math.max(minYear, thisYear - 7); y--) out.push(model.yearStats(y, data.trips));
    return out;
  }, [model, data.trips, thisYear, minYear]);

  const monthName = (m: number, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(languageInfo(lang).intl, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 1)));
  // Narrow weekday names (Mon..Sun) in the UI language; 2001-01-01 was a Monday.
  const dows = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(languageInfo(lang).intl, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2001, 0, 1 + i))),
  );

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
        {!big && (
          <h4>
            <button type="button" className="month-link" aria-label={t('ux.openMonth', { month: `${monthName(m)} ${y}` })} onClick={() => openMonth(m)}>
              {monthName(m, 'short')}
            </button>
          </h4>
        )}
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
      <section className="card cal-card" aria-labelledby="cal-title">
        <div className="row spread cal-toolbar">
          <Segmented label={t('cal.view')} value={view} onChange={(v) => { setDir(0); setView(v); }} options={[{ value: 'year', label: t('cal.year') }, { value: 'month', label: t('cal.month') }]} />
          {!atToday && <button type="button" className="btn sm" onClick={goToday}>{t('ux.today')}</button>}
        </div>
        <div className="row spread">
          <button className="icon-btn" aria-label={t('common.previous')} onClick={() => page(-1)}>
            <Icon name="left" />
          </button>
          <h2 id="cal-title" style={{ margin: 0 }} aria-live="polite">{view === 'year' ? year : `${monthName(month)} ${year}`}</h2>
          <button className="icon-btn" aria-label={t('common.next')} onClick={() => page(1)}>
            <Icon name="right" />
          </button>
        </div>
        {/* Swipe sideways to page; the arrows above do the same for everyone else. */}
        <div className={`cal-page${dir ? (dir > 0 ? ' from-next' : ' from-prev') : ''}`} key={view === 'year' ? `y${year}` : `m${year}-${month}`} {...swipe}>
          {view === 'year' ? (
            <div className="months">{Array.from({ length: 12 }, (_, i) => renderMonth(year, i + 1, false))}</div>
          ) : (
            renderMonth(year, month, true)
          )}
        </div>
        <div className="day-detail" aria-live="polite">
          {sel ? (
            <>
              <i className={`swatch cell ${cellClass(model, sel)}`} aria-hidden="true" />
              <div className="grow small">
                <b>{fmtDate(sel, lang, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</b> · {t(`cal.kind.${model.dayKind(sel)}`)}
                {selTrip && <> · {t('cal.trip', { place: selTrip.destination || t('trips.abroad'), dep: fmtDate(selTrip.departure, lang), ret: selTrip.return ? fmtDate(selTrip.return, lang) : t('trips.ongoing') })}</>}
                {model.dayStatus(sel) === 'tr' && <> · {t('cal.halfCredit')}</>}
              </div>
              {selTrip ? (
                <button type="button" className="btn sm" onClick={() => editor.edit(selTrip)}>{t('trips.edit')}</button>
              ) : (
                <button type="button" className="btn sm" onClick={() => editor.create({ departure: sel })}><Icon name="plus" size={16} /> {t('trips.add')}</button>
              )}
            </>
          ) : (
            <span className="muted small">{t('cal.tapHint')}</span>
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
      <TripEditor state={editor} />
    </>
  );
}

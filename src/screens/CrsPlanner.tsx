import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Status } from '../components/ui';
import { calculateCrs, type CrsInput } from '../domain/crs';
import { combine, improvements, type Improvement, type ImprovementKind, describeImprovement } from '../domain/crsPlanner';
import { fmtDate, fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';

const TOP = 5;
const DRAWS_SHOWN = 4;

/** CRS improvement planner: best single changes, a "plan" of chosen ones, and how the plan compares with recent draws. */
export function CrsPlannerCard({ input, draws }: { input: CrsInput; draws?: { date: string; name: string; crs: number }[] }) {
  const { t, lang } = useApp();
  const [planned, setPlanned] = useState<ImprovementKind[]>([]);
  const [showAll, setShowAll] = useState(false);

  const key = JSON.stringify(input);
  const current = useMemo(() => calculateCrs(input).totals.total, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => improvements(input), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply chosen changes in list order so the result doesn't depend on click order.
  const chosen = list.filter((x) => planned.includes(x.kind)).map((x) => x.kind);
  const combined = useMemo(() => combine(input, chosen).score, [key, chosen.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = chosen.length ? combined : current;

  const recent = [...(draws ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DRAWS_SHOWN);
  const shown = showAll ? list : list.slice(0, TOP);

  const describe = (x: Improvement) => describeImprovement(x, t);
  const toggle = (kind: ImprovementKind, on: boolean) =>
    setPlanned((p) => (on ? [...p.filter((k) => k !== kind), kind] : p.filter((k) => k !== kind)));

  return (
    <section className="card" aria-labelledby="crsp-title">
      <h2 id="crsp-title"><Icon name="sparkle" /> {t('crsp.title')}</h2>
      <p className="small muted">{t('crsp.intro')}</p>

      <div className="grid2" aria-live="polite">
        <div>
          <div className="label">{t('crsp.current')}</div>
          <div className="hero-num">{fmtNum(current, lang)}</div>
        </div>
        <div>
          <div className="label">{t('crsp.planned')}</div>
          <div className="hero-num">{fmtNum(target, lang)}</div>
          {chosen.length > 0
            ? <Status kind="good">{t('crsp.plannedGain', { n: fmtNum(combined - current, lang) })}</Status>
            : <div className="tiny">{t('crsp.plannedNone')}</div>}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="tip info"><Icon name="info" /><div>{t('crsp.none')}</div></div>
      ) : (
        <ul className="list">
          {shown.map((x) => {
            const on = chosen.includes(x.kind);
            return (
              <li key={x.kind}>
                <label className="check grow" style={{ minHeight: 44, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle(x.kind, e.target.checked)} aria-label={`${t('crsp.plan')}: ${describe(x)}`} />
                  <span className="grow">
                    <span className="small">{describe(x)}</span>
                    <span className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      <span className="badge good">+{fmtNum(x.delta, lang)}</span>
                      <span className="badge">{t(`crsp.effort.${x.effort}`)}</span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > TOP && (
        <button className="btn ghost sm" style={{ minHeight: 44 }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          <Icon name="chevron" size={14} /> {showAll ? t('crsp.showFewer') : t('crsp.showAll', { n: list.length })}
        </button>
      )}

      {recent.length > 0 && (
        <>
          <h3>{t('crsp.draws')}</h3>
          <table className="data">
            <thead><tr><th>{t('elig.drawType')}</th><th>{t('elig.drawDate')}</th><th className="n">CRS</th><th className="n" /></tr></thead>
            <tbody>
              {recent.map((d) => (
                <tr key={`${d.date}-${d.name}-${d.crs}`}>
                  <td>{d.name}</td>
                  <td>{fmtDate(d.date, lang)}</td>
                  <td className="n">{fmtNum(d.crs, lang)}</td>
                  <td className="n">
                    {target >= d.crs
                      ? <Status kind="good">{t('crsp.meets')}</Status>
                      : <Status kind="warn">{t('crsp.need', { n: fmtNum(d.crs - target, lang) })}</Status>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <ul className="tiny" style={{ margin: '10px 0 0', paddingInlineStart: 18 }}>
        <li>{t('crsp.noteEstimate')}</li>
        <li>{t('crsp.notePnp')}</li>
        <li>{t('crsp.noteJobOffer')}</li>
      </ul>
    </section>
  );
}

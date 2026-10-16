import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import { CBSA_HISTORY_URL, parseCbsaText, reconcile, type CbsaEvent } from '../domain/cbsa';
import { isISODate, type ISODate } from '../domain/dates';
import { uid, type Trip } from '../domain/types';
import { fmtDate } from '../i18n';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';

/**
 * Paste a CBSA Travel History Report, compare it with logged trips and add the missing ones.
 * The pasted text only lives in component state and is never saved.
 */
export function CbsaImportSheet({ onClose }: { onClose: () => void }) {
  const { data, update, t, lang, toast } = useApp();
  const [text, setText] = useState('');
  const [events, setEvents] = useState<CbsaEvent[] | null>(null);
  // Departure typed per unmatched entry, keyed by the entry's (return) date.
  const [deps, setDeps] = useState<Record<ISODate, string>>({});

  const parse = () => {
    setEvents(parseCbsaText(text));
    setDeps({});
  };

  // Recomputed from current trips, so added trips move into "matched" right away.
  const rec = events ? reconcile(events, data.trips) : null;
  const entries = events?.filter((e) => e.kind === 'entry').length ?? 0;
  const exits = (events?.length ?? 0) - entries;

  const proposals = (rec?.proposals ?? []).map((p) => {
    const departure = deps[p.return] ?? p.departure ?? '';
    const ok = isISODate(departure) && departure <= p.return;
    return { ...p, departure, ok };
  });
  const ready = proposals.filter((p) => p.ok);

  const addTrips = (list: { departure: string; return: ISODate }[]) => {
    if (!list.length) return;
    const fresh: Trip[] = list.map((p) => ({ id: uid(), departure: p.departure, return: p.return }));
    update((d) => ({ ...d, trips: [...d.trips, ...fresh] }));
    toast(t('cbsa.added', { n: fresh.length }));
  };

  const tripById = new Map(data.trips.map((tr) => [tr.id, tr]));

  return (
    <Sheet title={t('cbsa.title')} onClose={onClose}>
      <p className="small muted">{t('cbsa.intro')}</p>

      <details className="card" style={{ margin: '8px 0' }}>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>{t('cbsa.how')}</summary>
        <p className="small">{t('cbsa.howBody')}</p>
        <p className="small">{t('cbsa.ircc')}</p>
        <p className="tiny">{t('cbsa.limits')}</p>
        <button className="btn sm" onClick={() => void openExternal(CBSA_HISTORY_URL)}>
          <Icon name="external" size={16} /> {t('cbsa.link')}
        </button>
      </details>

      <Field label={t('cbsa.text')} hint={t('cbsa.privacy')}>
        <textarea className="input" dir="auto" rows={6} value={text} placeholder={t('cbsa.placeholder')} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button className="btn block" disabled={!text.trim()} onClick={parse}>
        <Icon name="search" /> {t('cbsa.parse')}
      </button>

      {events && events.length === 0 && <p className="small" role="status">{t('cbsa.none')}</p>}

      {events && events.length > 0 && rec && (
        <div role="status" aria-live="polite">
          <p className="small" style={{ marginTop: 12 }}>{t('cbsa.found', { entries, exits })}</p>

          <details>
            <summary className="small" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>{t('cbsa.review')}</summary>
            <table className="data">
              <tbody>
                {events.map((e, i) => (
                  <tr key={`${e.date}-${e.kind}-${i}`}>
                    <td className="num">{fmtDate(e.date, lang)}</td>
                    <td>{t(`cbsa.kind.${e.kind}`)}</td>
                    <td dir="auto">{e.place ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          {rec.matched.length > 0 && <Status kind="good">{t('cbsa.matched', { n: rec.matched.length })}</Status>}
          {rec.unmatchedEntries.length === 0 && rec.tripsWithoutEntry.length === 0 && (
            <div className="tip info"><Icon name="check" /><div>{t('cbsa.allGood')}</div></div>
          )}

          {proposals.length > 0 && (
            <section style={{ marginTop: 12 }}>
              <h3>{t('cbsa.unmatched', { n: proposals.length })}</h3>
              <p className="tiny">{t('cbsa.unmatchedHelp')}</p>
              <ul className="list">
                {proposals.map((p) => (
                  <li key={p.return} style={{ flexWrap: 'wrap' }}>
                    <div className="grow" style={{ minWidth: 160 }}>
                      <b>{t('cbsa.returnOn', { date: fmtDate(p.return, lang) })}</b>
                      {p.place && <div className="small muted" dir="auto">{t('cbsa.via', { place: p.place })}</div>}
                      <Field label={t('cbsa.departure')} hint={!p.ok ? t('cbsa.departureNeeded') : deps[p.return] === undefined && p.departure ? t('cbsa.fromExit') : undefined}>
                        <input
                          className="input"
                          type="date"
                          value={p.departure}
                          max={p.return}
                          onChange={(e) => setDeps({ ...deps, [p.return]: e.target.value })}
                        />
                      </Field>
                    </div>
                    <button className="btn sm" disabled={!p.ok} onClick={() => addTrips([p])}>
                      <Icon name="plus" size={16} /> {t('cbsa.add')}
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn primary block" disabled={!ready.length} onClick={() => addTrips(ready)}>
                {t('cbsa.addAll', { n: ready.length })}
              </button>
            </section>
          )}

          {rec.tripsWithoutEntry.length > 0 && (
            <section style={{ marginTop: 12 }}>
              <h3>{t('cbsa.noEntry', { n: rec.tripsWithoutEntry.length })}</h3>
              <p className="tiny">{t('cbsa.noEntryHelp')}</p>
              <ul className="list">
                {rec.tripsWithoutEntry.map((id) => {
                  const tr = tripById.get(id);
                  if (!tr) return null;
                  return (
                    <li key={id}>
                      <Icon name="plane" />
                      <span className="grow">
                        <b dir="auto">{tr.destination || t('trips.abroad')}</b>
                        <div className="small muted">{t('cbsa.tripRange', { from: fmtDate(tr.departure, lang), to: fmtDate(tr.return, lang) })}</div>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

import { lazy, Suspense, useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field, Sheet, Status } from '../components/ui';
import { isISODate } from '../domain/dates';
import { tripLength, withExtraTrip } from '../domain/presence';
import { uid, type Trip } from '../domain/types';
import { fmtDate, fmtNum } from '../i18n';
import { pickTextFile, saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';
import { csvToTrips, tripsToCsv } from '../store/csv';

export interface TripEditorState {
  trip: Trip | null;
  isNew: boolean;
  edit: (t: Trip) => void;
  create: (init?: Partial<Trip>) => void;
  close: () => void;
}

export function useTripEditor(): TripEditorState {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isNew, setIsNew] = useState(false);
  return {
    trip,
    isNew,
    edit: (t) => {
      setIsNew(false);
      setTrip({ ...t, return: t.return ?? null });
    },
    create: (init) => {
      setIsNew(true);
      setTrip({ id: uid(), departure: '', return: '', ...init });
    },
    close: () => setTrip(null),
  };
}

export function TripEditor({ state }: { state: TripEditorState }) {
  const { data, update, t, lang, insights, toast } = useApp();
  const [draft, setDraft] = useState<Trip | null>(null);
  const trip = state.trip;
  if (!trip) {
    if (draft) setDraft(null);
    return null;
  }
  const d = draft && draft.id === trip.id ? draft : trip;
  const set = (patch: Partial<Trip>) => setDraft({ ...d, ...patch });
  // null = still abroad; '' = not filled in yet.
  const ongoing = d.return === null;
  const valid = isISODate(d.departure) && (ongoing || (isISODate(d.return) && d.return! >= d.departure));
  const isFuture = d.departure > insights.today;

  // Live impact preview for new/planned trips.
  let impact: string | null = null;
  if (valid && d.return && data.profile.prDate) {
    const others = data.trips.filter((x) => x.id !== d.id);
    const input = { profile: data.profile, trips: others, today: insights.today, boundaryDaysPresent: data.settings.boundaryDaysPresent };
    const before = withExtraTrip(input, insights.today, insights.today).citizenshipEligibleDate();
    const after = withExtraTrip(input, d.departure, d.return).citizenshipEligibleDate();
    if (before && after && after !== before) impact = t('trips.impact', { date: fmtDate(after, lang) });
  }

  const save = () => {
    if (!valid) return;
    const clean: Trip = { ...d, return: d.return || null, destination: d.destination?.trim() || undefined, note: d.note?.trim() || undefined };
    update((x) => ({ ...x, trips: state.isNew ? [...x.trips, clean] : x.trips.map((tr) => (tr.id === clean.id ? clean : tr)) }));
    toast(t('trips.saved'));
    setDraft(null);
    state.close();
  };
  const remove = () => {
    if (!confirm(t('trips.confirmDelete'))) return;
    update((x) => ({ ...x, trips: x.trips.filter((tr) => tr.id !== d.id) }));
    setDraft(null);
    state.close();
  };

  return (
    <Sheet title={state.isNew ? t('trips.add') : t('trips.edit')} onClose={() => { setDraft(null); state.close(); }}>
      <div className="grid2">
        <Field label={t('trips.departure')}>
          <input className="input" type="date" value={d.departure} onChange={(e) => set({ departure: e.target.value })} required />
        </Field>
        <Field label={t('trips.return')}>
          <input className="input" type="date" value={d.return ?? ''} min={d.departure || undefined} disabled={ongoing} onChange={(e) => set({ return: e.target.value })} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={ongoing} onChange={(e) => set({ return: e.target.checked ? null : '' })} />
        {t('trips.stillAbroad')}
      </label>
      <Field label={t('trips.destination')}>
        <input className="input" value={d.destination ?? ''} placeholder={t('trips.destinationPh')} onChange={(e) => set({ destination: e.target.value })} />
      </Field>
      <Field label={t('trips.purpose')}>
        <select className="input" value={d.purpose ?? ''} onChange={(e) => set({ purpose: (e.target.value || undefined) as Trip['purpose'] })}>
          <option value="">—</option>
          {(['vacation', 'family', 'work', 'study', 'other'] as const).map((p) => <option key={p} value={p}>{t(`trips.purpose.${p}`)}</option>)}
        </select>
      </Field>
      <Field label={t('trips.note')}>
        <input className="input" value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {valid && (
        <p className="small muted">
          {t('trips.daysAway', { days: tripLength({ ...d, return: d.return || null }, insights.today, data.settings.boundaryDaysPresent) })}
          {isFuture && <> · {t('trips.planned')}</>}
        </p>
      )}
      {impact && <div className="tip info"><Icon name="info" /><div>{impact}</div></div>}
      <div className="row" style={{ marginTop: 12 }}>
        {!state.isNew && <button className="btn danger" onClick={remove}><Icon name="trash" /> {t('common.delete')}</button>}
        <div className="grow" />
        <button className="btn primary" disabled={!valid} onClick={save}>{t('common.save')}</button>
      </div>
    </Sheet>
  );
}

const CbsaImportSheet = lazy(() => import('./CbsaImport').then((m) => ({ default: m.CbsaImportSheet })));

export function TripsScreen() {
  const { data, update, t, lang, insights, toast } = useApp();
  const editor = useTripEditor();
  const [cbsa, setCbsa] = useState(false);
  const trips = [...data.trips].sort((a, b) => b.departure.localeCompare(a.departure));
  const issues = new Map(insights.tripIssues.map((i) => [i.tripId, i.kind]));
  const groups = new Map<string, Trip[]>();
  for (const tr of trips) {
    const y = tr.departure.slice(0, 4);
    groups.set(y, [...(groups.get(y) ?? []), tr]);
  }
  const total = trips.reduce((s, tr) => s + tripLength(tr, insights.today, data.settings.boundaryDaysPresent), 0);

  const importCsv = async () => {
    const text = await pickTextFile('.csv,text/csv,text/plain');
    if (!text) return;
    const { trips: imported, errors } = csvToTrips(text);
    const existing = new Set(data.trips.map((x) => `${x.departure}|${x.return ?? ''}`));
    const fresh = imported.filter((x) => !existing.has(`${x.departure}|${x.return ?? ''}`));
    update((x) => ({ ...x, trips: [...x.trips, ...fresh] }));
    toast(t('trips.imported', { n: fresh.length, bad: errors.length }));
  };

  return (
    <>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary grow" onClick={() => editor.create()}><Icon name="plus" /> {t('trips.add')}</button>
        <button className="btn" onClick={() => editor.create({ departure: insights.today, return: null })}><Icon name="plane" /> {t('trips.leavingToday')}</button>
      </div>

      <section className="card">
        <div className="row spread">
          <div>
            <div className="label">{t('trips.total')}</div>
            <div className="hero-num" style={{ fontSize: 28 }}>{fmtNum(total, lang)} <span className="small muted">{t('common.days')}</span></div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div className="label">{t('trips.count')}</div>
            <div className="hero-num" style={{ fontSize: 28 }}>{trips.length}</div>
          </div>
        </div>
      </section>

      {trips.length === 0 && <Empty icon="plane">{t('trips.empty')}</Empty>}

      {[...groups.entries()].map(([year, list]) => (
        <section className="card" key={year}>
          <h2>{year}</h2>
          <ul className="list">
            {list.map((tr) => {
              const days = tripLength(tr, insights.today, data.settings.boundaryDaysPresent);
              const issue = issues.get(tr.id);
              return (
                <li key={tr.id}>
                  <button className="item" onClick={() => editor.edit(tr)}>
                    <span className="avatar" style={{ background: tr.departure > insights.today ? 'var(--d-tr)' : 'var(--d-out)' }}><Icon name="plane" /></span>
                    <span className="grow">
                      <b>{tr.destination || t('trips.abroad')}</b>
                      <div className="small muted">
                        {fmtDate(tr.departure, lang)} → {tr.return ? fmtDate(tr.return, lang) : t('trips.ongoing')}
                      </div>
                      {issue && <Status kind="warn">{t(`trips.issue.${issue}`)}</Status>}
                    </span>
                    <span className="num" style={{ fontWeight: 700 }}>{days}<span className="tiny"> {t('common.d')}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="card">
        <h2>{t('trips.importExport')}</h2>
        <p className="small muted">{t('trips.csvHelp')}</p>
        <div className="row wrap">
          <button className="btn sm" onClick={importCsv}><Icon name="upload" size={16} /> {t('trips.importCsv')}</button>
          <button className="btn sm" onClick={() => saveTextFile('pr-tracker-trips.csv', tripsToCsv(data.trips), 'text/csv')}><Icon name="download" size={16} /> {t('trips.exportCsv')}</button>
        </div>
        <p className="tiny">{t('trips.cbsaHint')}</p>
      </section>

      <section className="card">
        <h2><Icon name="search" /> {t('cbsa.cardTitle')}</h2>
        <p className="small muted">{t('cbsa.cardBody')}</p>
        <button className="btn sm" onClick={() => setCbsa(true)}><Icon name="search" size={16} /> {t('cbsa.open')}</button>
      </section>
      {cbsa && (
        <Suspense fallback={null}>
          <CbsaImportSheet onClose={() => setCbsa(false)} />
        </Suspense>
      )}
      <TripEditor state={editor} />
    </>
  );
}

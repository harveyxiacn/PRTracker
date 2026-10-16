import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field, Segmented, Sheet, Status } from '../components/ui';
import { countryName, sortedCountries } from '../domain/countries';
import { isISODate } from '../domain/dates';
import {
  ACTIVITY_KINDS,
  OPEN_END,
  emptyHistory,
  findOverlaps,
  historySummary,
  historyToCsv,
  historyToText,
  type ActivityEntry,
  type ActivityKind,
  type AddressEntry,
  type Gap,
  type HistoryData,
  type HistoryPurpose,
} from '../domain/history';
import { uid } from '../domain/types';
import { fmtDate, fmtNum, type Lang } from '../i18n';
import { saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';

type ListKind = 'addresses' | 'activities';
type T = ReturnType<typeof useApp>['t'];

/** In drafts, `to` is null for "current" and '' while not filled in yet. */
type Editing =
  | { type: 'address'; value: AddressEntry; isNew: boolean }
  | { type: 'activity'; value: ActivityEntry; isNew: boolean };

const PO_BOX_RE = /\b(p\.?\s*o\.?\s*box|post\s*office\s*box|case\s+postale|apartado\s+postal)\b/i;

const byNewest = <E extends { from: string; to?: string | null }>(a: E, b: E) =>
  b.from.localeCompare(a.from) || (b.to ?? OPEN_END).localeCompare(a.to ?? OPEN_END);

function useCountries(lang: Lang) {
  // Canada first: most PR applicants have lived here (it is not in the travel-destination list).
  return useMemo(() => [{ code: 'CA', name: countryName('CA', lang) }, ...sortedCountries(lang).filter((c) => c.code !== 'CA')], [lang]);
}

function rangeText(from: string, to: string | null | undefined, lang: Lang, t: T): string {
  return `${fmtDate(from, lang)} → ${to && to !== OPEN_END ? fmtDate(to, lang) : t('hist.present')}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function DateFields({ from, to, currentLabel, onChange, t }: { from: string; to: string | null | undefined; currentLabel: string; onChange: (p: { from?: string; to?: string | null }) => void; t: T }) {
  const current = to === null;
  return (
    <>
      <div className="grid2">
        <Field label={t('hist.from')}>
          <input className="input" type="date" value={from} onChange={(e) => onChange({ from: e.target.value })} required />
        </Field>
        <Field label={t('hist.to')}>
          <input className="input" type="date" value={to ?? ''} min={from || undefined} disabled={current} onChange={(e) => onChange({ to: e.target.value })} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={current} onChange={(e) => onChange({ to: e.target.checked ? null : '' })} />
        {currentLabel}
      </label>
      <p className="tiny">{t('hist.dateHint')}</p>
    </>
  );
}

const datesValid = (from: string, to: string | null | undefined) => isISODate(from) && (to === null || (isISODate(to) && to >= from));

function SheetActions({ isNew, valid, onSave, onDelete, t }: { isNew: boolean; valid: boolean; onSave: () => void; onDelete: () => void; t: T }) {
  return (
    <div className="row" style={{ marginTop: 12 }}>
      {!isNew && <button className="btn danger" onClick={onDelete}><Icon name="trash" /> {t('common.delete')}</button>}
      <div className="grow" />
      <button className="btn primary" disabled={!valid} onClick={onSave}>{t('common.save')}</button>
    </div>
  );
}

function AddressSheet({ initial, isNew, onClose }: { initial: AddressEntry; isNew: boolean; onClose: () => void }) {
  const { update, t, lang, toast } = useApp();
  const countries = useCountries(lang);
  const [d, setD] = useState<AddressEntry>(initial);
  const set = (p: Partial<AddressEntry>) => setD((x) => ({ ...x, ...p }));
  const valid = datesValid(d.from, d.to) && d.city.trim() !== '' && d.country !== '';
  const poBox = PO_BOX_RE.test(d.street ?? '');

  const save = () => {
    if (!valid) return;
    const clean: AddressEntry = {
      ...d,
      to: d.to || null,
      street: d.street?.trim() || undefined,
      city: d.city.trim(),
      region: d.region?.trim() || undefined,
      postal: d.postal?.trim() || undefined,
    };
    update((x) => {
      const h = x.history ?? emptyHistory();
      const addresses = isNew ? [...h.addresses, clean] : h.addresses.map((a) => (a.id === clean.id ? clean : a));
      return { ...x, history: { ...h, addresses } };
    });
    toast(t('hist.saved'));
    onClose();
  };
  const remove = () => {
    if (!confirm(t('hist.confirmDelete'))) return;
    update((x) => {
      const h = x.history ?? emptyHistory();
      return { ...x, history: { ...h, addresses: h.addresses.filter((a) => a.id !== d.id) } };
    });
    onClose();
  };

  return (
    <Sheet title={isNew ? t('hist.addAddress') : t('hist.editAddress')} onClose={onClose}>
      <DateFields from={d.from} to={d.to} currentLabel={t('hist.currentAddress')} onChange={set} t={t} />
      <Field label={t('hist.street')}>
        <input className="input" value={d.street ?? ''} placeholder={t('hist.streetPh')} autoComplete="street-address" onChange={(e) => set({ street: e.target.value })} />
      </Field>
      {poBox && <div className="tip warn"><Icon name="alert" /><div>{t('hist.poBox')}</div></div>}
      <div className="grid2">
        <Field label={t('hist.city')}>
          <input className="input" value={d.city} onChange={(e) => set({ city: e.target.value })} required />
        </Field>
        <Field label={t('hist.region')}>
          <input className="input" value={d.region ?? ''} onChange={(e) => set({ region: e.target.value })} />
        </Field>
      </div>
      <div className="grid2">
        <Field label={t('hist.postal')} hint={t('hist.postalHint')}>
          <input className="input" value={d.postal ?? ''} autoCapitalize="characters" onChange={(e) => set({ postal: e.target.value })} />
        </Field>
        <Field label={t('hist.country')}>
          <select className="input" value={d.country} onChange={(e) => set({ country: e.target.value })} required>
            <option value="">—</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <SheetActions isNew={isNew} valid={valid} onSave={save} onDelete={remove} t={t} />
    </Sheet>
  );
}

function ActivitySheet({ initial, isNew, onClose }: { initial: ActivityEntry; isNew: boolean; onClose: () => void }) {
  const { update, t, lang, toast } = useApp();
  const countries = useCountries(lang);
  const [d, setD] = useState<ActivityEntry>(initial);
  const set = (p: Partial<ActivityEntry>) => setD((x) => ({ ...x, ...p }));
  const valid = datesValid(d.from, d.to);

  const save = () => {
    if (!valid) return;
    const clean: ActivityEntry = {
      ...d,
      to: d.to || null,
      title: d.title?.trim() || undefined,
      organization: d.organization?.trim() || undefined,
      city: d.city?.trim() || undefined,
      country: d.country || undefined,
      note: d.note?.trim() || undefined,
    };
    update((x) => {
      const h = x.history ?? emptyHistory();
      const activities = isNew ? [...h.activities, clean] : h.activities.map((a) => (a.id === clean.id ? clean : a));
      return { ...x, history: { ...h, activities } };
    });
    toast(t('hist.saved'));
    onClose();
  };
  const remove = () => {
    if (!confirm(t('hist.confirmDelete'))) return;
    update((x) => {
      const h = x.history ?? emptyHistory();
      return { ...x, history: { ...h, activities: h.activities.filter((a) => a.id !== d.id) } };
    });
    onClose();
  };

  return (
    <Sheet title={isNew ? t('hist.addActivity') : t('hist.editActivity')} onClose={onClose}>
      <Field label={t('hist.kind')}>
        <select className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value as ActivityKind })}>
          {ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{t(`hist.kind.${k}`)}</option>)}
        </select>
      </Field>
      <DateFields from={d.from} to={d.to} currentLabel={t('hist.currentActivity')} onChange={set} t={t} />
      <Field label={t('hist.titleField')}>
        <input className="input" value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label={t('hist.org')}>
        <input className="input" value={d.organization ?? ''} onChange={(e) => set({ organization: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label={t('hist.city')}>
          <input className="input" value={d.city ?? ''} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label={t('hist.country')}>
          <select className="input" value={d.country ?? ''} onChange={(e) => set({ country: e.target.value })}>
            <option value="">—</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('hist.note')} hint={t('hist.privacyHint')}>
        <input className="input" value={d.note ?? ''} placeholder={t('hist.notePh')} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <SheetActions isNew={isNew} valid={valid} onSave={save} onDelete={remove} t={t} />
    </Sheet>
  );
}

export function HistoryScreen() {
  const { data, update, t, lang, insights, toast } = useApp();
  const history: HistoryData = data.history ?? emptyHistory();
  const [purpose, setPurpose] = useState<HistoryPurpose>('pr');
  const [tab, setTab] = useState<ListKind>('addresses');
  const [editing, setEditing] = useState<Editing | null>(null);

  const today = insights.today;
  const summary = historySummary(history, purpose, today);
  const w = summary.window;
  const gapTotal = summary.addressGaps.length + summary.activityGaps.length;
  const overlaps = findOverlaps('addresses', history.addresses);
  const overlapIds = new Set(overlaps.flatMap((o) => [o.aId, o.bId]));

  const addresses = [...history.addresses].sort(byNewest);
  const activities = [...history.activities].sort(byNewest);
  const gaps = tab === 'addresses' ? summary.addressGaps : summary.activityGaps;
  const addrLabel = (a: AddressEntry) => [a.city, a.country ? countryName(a.country, lang) : ''].filter(Boolean).join(', ');
  const addrById = new Map(history.addresses.map((a) => [a.id, a]));

  const newAddress = (init?: Partial<AddressEntry>) =>
    setEditing({ type: 'address', isNew: true, value: { id: uid(), from: '', to: '', city: '', country: '', ...init } });
  const newActivity = (init?: Partial<ActivityEntry>) =>
    setEditing({ type: 'activity', isNew: true, value: { id: uid(), from: '', to: '', kind: 'work', ...init } });

  const fillGap = (g: Gap, kind?: ActivityKind) => {
    // A gap that reaches today is most likely "still ongoing".
    const to = g.to === w.to ? null : g.to;
    if (g.list === 'addresses') newAddress({ from: g.from, to });
    else newActivity({ from: g.from, to, kind: kind ?? 'unemployed' });
  };

  const setBirth = (v: string) =>
    update((x) => ({ ...x, history: { ...(x.history ?? emptyHistory()), birthDate: isISODate(v) ? v : undefined } }));

  const exportCsv = () => saveTextFile(`pr-tracker-${tab}.csv`, '﻿' + historyToCsv(history, w, tab), 'text/csv');
  const copyTable = async () => toast((await copyText(historyToText(history, w, tab))) ? t('hist.copied') : t('hist.copyFailed'));

  const pct = (c: number) => t('hist.pct', { n: fmtNum(Math.floor(c * 100), lang) });
  const list = tab === 'addresses' ? addresses : activities;

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <Segmented<HistoryPurpose>
          label={t('hist.purpose')}
          value={purpose}
          onChange={setPurpose}
          options={[
            { value: 'pr', label: t('hist.purpose.pr') },
            { value: 'citizenship', label: t('hist.purpose.citizenship') },
          ]}
        />
      </div>

      <section className="card">
        <div className="label">{t('hist.window')}</div>
        <div style={{ fontWeight: 700 }}>{t('hist.windowRange', { from: fmtDate(w.from, lang), to: fmtDate(w.to, lang) })}</div>
        <p className="small muted">{t(purpose === 'pr' ? 'hist.windowHelp.pr' : 'hist.windowHelp.citizenship')}</p>
        <div className="grid2">
          <div>
            <div className="label">{t('hist.coverage.addresses')}</div>
            <div className="hero-num" style={{ fontSize: 28 }}>{pct(summary.addressCoverage)}</div>
            <div className="progress" role="presentation"><div style={{ width: `${summary.addressCoverage * 100}%` }} /></div>
          </div>
          <div>
            <div className="label">{t('hist.coverage.activities')}</div>
            <div className="hero-num" style={{ fontSize: 28 }}>{pct(summary.activityCoverage)}</div>
            <div className="progress" role="presentation"><div style={{ width: `${summary.activityCoverage * 100}%` }} /></div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {gapTotal === 0 ? <Status kind="good">{t('hist.gaps.none')}</Status> : <Status kind="warn">{t('hist.gaps.count', { n: fmtNum(gapTotal, lang) })}</Status>}
        </div>
      </section>

      <section className="card">
        <Field label={t('hist.birthDate')} hint={t('hist.birthPrivacy')}>
          <input className="input" type="date" value={history.birthDate ?? ''} max={today} autoComplete="bday" onChange={(e) => setBirth(e.target.value)} />
        </Field>
        {purpose === 'pr' && !history.birthDate && <div className="tip info"><Icon name="info" /><div>{t('hist.birthNeeded')}</div></div>}
      </section>

      <div className="tip info"><Icon name="info" /><div>{t('hist.tip')}</div></div>

      <Segmented<ListKind>
        label={t('hist.section')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'addresses', label: t('hist.tab.addresses') },
          { value: 'activities', label: t('hist.tab.activities') },
        ]}
      />

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary grow" onClick={() => (tab === 'addresses' ? newAddress() : newActivity())}>
          <Icon name="plus" /> {tab === 'addresses' ? t('hist.addAddress') : t('hist.addActivity')}
        </button>
      </div>

      {gaps.length > 0 && (
        <section className="card">
          <h2>{t('hist.gapsTitle')}</h2>
          <ul className="list">
            {gaps.map((g) => (
              <li key={`${g.from}|${g.to}`} style={{ flexWrap: 'wrap' }}>
                <span className="grow">
                  <Status kind="warn">{t('hist.gapRange', { from: fmtDate(g.from, lang), to: fmtDate(g.to, lang), days: fmtNum(g.days, lang) })}</Status>
                </span>
                {g.list === 'addresses' ? (
                  <button className="btn sm" onClick={() => fillGap(g)}><Icon name="plus" size={16} /> {t('hist.fillGap')}</button>
                ) : (
                  <span className="row wrap">
                    <button className="btn sm" onClick={() => fillGap(g, 'unemployed')}><Icon name="plus" size={16} /> {t('hist.fillUnemployed')}</button>
                    <button className="btn sm" onClick={() => fillGap(g, 'travel')}><Icon name="plane" size={16} /> {t('hist.fillTravel')}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'addresses' && overlaps.length > 0 && (
        <section className="card">
          <h2>{t('hist.overlapsTitle')}</h2>
          {overlaps.map((o) => {
            const a = addrById.get(o.aId);
            const b = addrById.get(o.bId);
            return (
              <div className="tip warn" key={`${o.aId}|${o.bId}`}>
                <Icon name="alert" />
                <div>
                  {t('hist.overlap', {
                    a: a ? addrLabel(a) : '?',
                    b: b ? addrLabel(b) : '?',
                    from: fmtDate(o.from, lang),
                    to: o.to === OPEN_END ? t('hist.present') : fmtDate(o.to, lang),
                  })}
                </div>
              </div>
            );
          })}
          <p className="tiny">{t('hist.overlapHelp')}</p>
        </section>
      )}

      {list.length === 0 ? (
        <Empty icon={tab === 'addresses' ? 'home' : 'flag'}>{tab === 'addresses' ? t('hist.emptyAddresses') : t('hist.emptyActivities')}</Empty>
      ) : (
        <section className="card">
          <h2>{tab === 'addresses' ? t('hist.tab.addresses') : t('hist.tab.activities')}</h2>
          <ul className="list">
            {tab === 'addresses'
              ? addresses.map((a) => (
                  <li key={a.id}>
                    <button className="item" onClick={() => setEditing({ type: 'address', isNew: false, value: { ...a, to: a.to ?? null } })}>
                      <span className="avatar"><Icon name="home" /></span>
                      <span className="grow">
                        <b>{addrLabel(a)}</b>
                        {(a.street || a.postal) && <div className="small muted">{[a.street, a.region, a.postal].filter(Boolean).join(', ')}</div>}
                        <div className="small muted">{rangeText(a.from, a.to, lang, t)}</div>
                        {a.to && a.to < w.from && <div className="tiny">{t('hist.outside')}</div>}
                        {overlapIds.has(a.id) && <Status kind="warn">{t('hist.overlapsTitle')}</Status>}
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </li>
                ))
              : activities.map((a) => (
                  <li key={a.id}>
                    <button className="item" onClick={() => setEditing({ type: 'activity', isNew: false, value: { ...a, to: a.to ?? null } })}>
                      <span className="avatar"><Icon name="flag" /></span>
                      <span className="grow">
                        <b>{t(`hist.kind.${a.kind}`)}{a.title ? ` · ${a.title}` : ''}</b>
                        {(a.organization || a.city || a.country) && (
                          <div className="small muted">{[a.organization, a.city, a.country ? countryName(a.country, lang) : ''].filter(Boolean).join(', ')}</div>
                        )}
                        <div className="small muted">{rangeText(a.from, a.to, lang, t)}</div>
                        {a.to && a.to < w.from && <div className="tiny">{t('hist.outside')}</div>}
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </li>
                ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>{t('hist.export')}</h2>
        <p className="small muted">{t('hist.exportHelp')}</p>
        <div className="row wrap">
          <button className="btn sm" disabled={list.length === 0} onClick={exportCsv}><Icon name="download" size={16} /> {t('hist.exportCsv')}</button>
          <button className="btn sm" disabled={list.length === 0} onClick={copyTable}><Icon name="check" size={16} /> {t('hist.copyTable')}</button>
        </div>
      </section>

      {editing?.type === 'address' && <AddressSheet key={editing.value.id} initial={editing.value} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.type === 'activity' && <ActivitySheet key={editing.value.id} initial={editing.value} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

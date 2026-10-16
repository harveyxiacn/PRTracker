import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field, Sheet, Status } from '../components/ui';
import { sortedCountries, countryName } from '../domain/countries';
import { diffDays, isISODate } from '../domain/dates';
import {
  DOC_KINDS, VALIDITY_MONTHS, checklistFor, documentStatus, effectiveExpiry, emptyDocuments, ruleExpiry,
  type DocItem, type DocKind, type DocStatus, type DocumentsData,
} from '../domain/documents';
import { uid } from '../domain/types';
import { fmtDate, fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';

const HOLDERS = ['me', 'spouse', 'child', 'other'] as const;
const STATUS_KIND: Record<DocStatus, 'good' | 'warn' | 'critical' | 'info'> = { ok: 'good', soon: 'warn', expired: 'critical', unknown: 'info' };
const PERMITS: DocKind[] = ['work_permit', 'study_permit', 'visitor_record'];
const WITH_COUNTRY: DocKind[] = ['passport', 'police_certificate'];

type Group = 'me' | 'spouse' | 'others';
const groupOf = (holder?: string): Group => (!holder || holder === 'me' ? 'me' : holder === 'spouse' ? 'spouse' : 'others');

function DocEditor({ item, isNew, onClose }: { item: DocItem; isNew: boolean; onClose: () => void }) {
  const { update, t, lang, toast } = useApp();
  const [d, setD] = useState<DocItem>(item);
  const set = (patch: Partial<DocItem>) => setD({ ...d, ...patch });
  const issuedOk = !d.issued || isISODate(d.issued);
  const expiresOk = !d.expires || isISODate(d.expires);
  const valid = issuedOk && expiresOk && (!d.issued || !d.expires || d.expires >= d.issued);
  const hasRule = VALIDITY_MONTHS[d.kind] !== undefined;
  const ruled = issuedOk ? ruleExpiry(d) : undefined;
  const holderSel = HOLDERS.includes(d.holder as (typeof HOLDERS)[number]) ? d.holder! : d.holder ? 'other' : 'me';

  const save = () => {
    if (!valid) return;
    const clean: DocItem = {
      ...d,
      label: d.label?.trim() || undefined,
      note: d.note?.trim() || undefined,
      issued: d.issued || null,
      expires: d.expires || null,
      country: WITH_COUNTRY.includes(d.kind) ? d.country || undefined : undefined,
    };
    update((x) => {
      const docs = x.documents ?? emptyDocuments();
      const items = isNew ? [...docs.items, clean] : docs.items.map((it) => (it.id === clean.id ? clean : it));
      return { ...x, documents: { ...docs, items } };
    });
    toast(t('doc.saved'));
    onClose();
  };
  const remove = () => {
    if (!confirm(t('doc.confirmDelete'))) return;
    update((x) => {
      const docs = x.documents ?? emptyDocuments();
      return { ...x, documents: { ...docs, items: docs.items.filter((it) => it.id !== d.id) } };
    });
    onClose();
  };

  return (
    <Sheet title={isNew ? t('doc.add') : t('doc.edit')} onClose={onClose}>
      <Field label={t('doc.f.kind')}>
        <select className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value as DocKind })}>
          {DOC_KINDS.map((k) => <option key={k} value={k}>{t(`doc.kind.${k}`)}</option>)}
        </select>
      </Field>
      <Field label={t('doc.f.label')}>
        <input className="input" value={d.label ?? ''} placeholder={t('doc.f.labelPh')} onChange={(e) => set({ label: e.target.value })} />
      </Field>
      <Field label={t('doc.f.holder')}>
        <select className="input" value={holderSel} onChange={(e) => set({ holder: e.target.value })}>
          {HOLDERS.map((h) => <option key={h} value={h}>{t(`doc.holder.${h}`)}</option>)}
        </select>
      </Field>
      <div className="grid2">
        <Field label={d.kind === 'language_test' ? t('doc.f.issuedTest') : t('doc.f.issued')}>
          <input className="input" type="date" value={d.issued ?? ''} onChange={(e) => set({ issued: e.target.value })} />
        </Field>
        <Field label={t('doc.f.expires')} hint={hasRule ? (ruled ? t('doc.f.validUntil', { date: fmtDate(ruled, lang) }) : t('doc.f.expiresRule')) : undefined}>
          <input className="input" type="date" value={d.expires ?? ''} min={d.issued || undefined} onChange={(e) => set({ expires: e.target.value })} />
        </Field>
      </div>
      {WITH_COUNTRY.includes(d.kind) && (
        <Field label={t('doc.f.country')}>
          <select className="input" value={d.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })}>
            <option value="">—</option>
            {sortedCountries(lang).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={t('doc.f.note')}>
        <input className="input" value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {PERMITS.includes(d.kind) && <div className="tip info"><Icon name="info" /><div>{t('doc.hint.permit')}</div></div>}
      {d.kind === 'police_certificate' && <div className="tip info"><Icon name="info" /><div>{t('doc.hint.police')}</div></div>}
      {d.kind === 'biometrics' && <div className="tip info"><Icon name="info" /><div>{t('doc.hint.biometrics')}</div></div>}
      <div className="tip"><Icon name="shield" /><div>{t('doc.privacy')}</div></div>
      <div className="row" style={{ marginTop: 12 }}>
        {!isNew && <button className="btn danger" onClick={remove}><Icon name="trash" /> {t('common.delete')}</button>}
        <div className="grow" />
        <button className="btn primary" disabled={!valid} onClick={save}>{t('common.save')}</button>
      </div>
    </Sheet>
  );
}

function Checklists({ docs }: { docs: DocumentsData }) {
  const { data, update, t, lang } = useApp();
  const apps = data.applications.filter((a) => !a.archived);
  const list = apps.length ? apps : data.applications;
  const [sel, setSel] = useState<string>('');
  const app = list.find((a) => a.id === sel) ?? list[0];

  if (!app) {
    return (
      <section className="card">
        <h2>{t('doc.chk.title')}</h2>
        <p className="small muted">{t('doc.chk.noApps')}</p>
      </section>
    );
  }
  const keys = checklistFor(app.kind);
  const state = docs.checklist[app.id] ?? {};
  const done = keys.filter((k) => state[k]).length;
  const toggle = (key: string, on: boolean) =>
    update((x) => {
      const cur = x.documents ?? emptyDocuments();
      return { ...x, documents: { ...cur, checklist: { ...cur.checklist, [app.id]: { ...(cur.checklist[app.id] ?? {}), [key]: on } } } };
    });

  return (
    <section className="card">
      <h2>{t('doc.chk.title')}</h2>
      <Field label={t('doc.chk.app')}>
        <select className="input" value={app.id} onChange={(e) => setSel(e.target.value)}>
          {list.map((a) => <option key={a.id} value={a.id}>{a.label || t('app.kind.' + a.kind)}</option>)}
        </select>
      </Field>
      <div className="row spread">
        <span className="small">{t('doc.chk.progress', { done: fmtNum(done, lang), total: fmtNum(keys.length, lang) })}</span>
      </div>
      <div className="progress accent" role="progressbar" aria-valuemin={0} aria-valuemax={keys.length} aria-valuenow={done} aria-label={t('doc.chk.title')}>
        <div style={{ width: `${keys.length ? (done / keys.length) * 100 : 0}%` }} />
      </div>
      <div style={{ marginTop: 8 }}>
        {keys.map((k) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={!!state[k]} onChange={(e) => toggle(k, e.target.checked)} />
            {t(`doc.chk.${k}`)}
          </label>
        ))}
      </div>
      <p className="tiny">{t('doc.chk.disclaimer')}</p>
    </section>
  );
}

export function DocumentsScreen() {
  const { data, t, lang, insights } = useApp();
  const docs = data.documents ?? emptyDocuments();
  const today = insights.today;
  const [editing, setEditing] = useState<{ item: DocItem; isNew: boolean } | null>(null);

  const rows = docs.items.map((item) => {
    const expires = effectiveExpiry(item);
    return { item, expires, status: documentStatus(item, today), days: expires ? diffDays(expires, today) : undefined };
  });
  const count = (s: DocStatus) => rows.filter((r) => r.status === s).length;
  const groups: Group[] = ['me', 'spouse', 'others'];
  const byGroup = groups
    .map((g) => ({
      g,
      list: rows
        .filter((r) => groupOf(r.item.holder) === g)
        // Unknown expiries go last.
        .sort((a, b) => (a.expires ?? '9999').localeCompare(b.expires ?? '9999')),
    }))
    .filter((x) => x.list.length);

  return (
    <>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary grow" onClick={() => setEditing({ item: { id: uid(), kind: 'passport', holder: 'me' }, isNew: true })}>
          <Icon name="plus" /> {t('doc.add')}
        </button>
      </div>

      {rows.length > 0 && (
        <section className="card">
          <div className="chips">
            <Status kind="critical">{t('doc.summary.expired', { n: fmtNum(count('expired'), lang) })}</Status>
            <Status kind="warn">{t('doc.summary.soon', { n: fmtNum(count('soon'), lang) })}</Status>
            <Status kind="good">{t('doc.summary.ok', { n: fmtNum(count('ok'), lang) })}</Status>
          </div>
        </section>
      )}

      {rows.length === 0 && <Empty icon="card">{t('doc.empty')}</Empty>}

      {byGroup.map(({ g, list }) => (
        <section className="card" key={g}>
          <h2>{t(`doc.group.${g}`)}</h2>
          <ul className="list">
            {list.map(({ item, expires, status, days }) => (
              <li key={item.id}>
                <button className="item" onClick={() => setEditing({ item, isNew: false })}>
                  <span className="avatar"><Icon name="card" /></span>
                  <span className="grow">
                    <b>{t(`doc.kind.${item.kind}`)}</b>
                    {(item.label || item.country) && (
                      <div className="small muted">
                        {[item.label, item.country ? countryName(item.country, lang) : ''].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="small muted">{expires ? t('doc.expiresOn', { date: fmtDate(expires, lang) }) : t('doc.noExpiry')}</div>
                    <Status kind={STATUS_KIND[status]}>{t(`doc.status.${status}`)}</Status>
                  </span>
                  {days !== undefined && (
                    <span className="num small" style={{ fontWeight: 700, textAlign: 'end' }}>
                      {days >= 0 ? t('doc.daysLeft', { days: fmtNum(days, lang) }) : t('doc.daysAgo', { days: fmtNum(-days, lang) })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Checklists docs={docs} />

      <section className="card">
        <h2>{t('doc.rules.title')}</h2>
        <ul className="small" style={{ paddingInlineStart: 18, margin: 0 }}>
          <li>{t('doc.rules.language')}</li>
          <li>{t('doc.rules.eca')}</li>
          <li>{t('doc.rules.medical')}</li>
          <li>{t('doc.rules.biometrics')}</li>
        </ul>
        <p className="tiny">{t('doc.hint.police')}</p>
      </section>

      {editing && <DocEditor key={editing.item.id} item={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

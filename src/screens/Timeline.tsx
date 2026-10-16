import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field, Sheet } from '../components/ui';
import { diffDays } from '../domain/dates';
import { MILESTONES, FINAL_MILESTONE, predict, similarRecords, toCommunityRecord } from '../domain/timeline';
import { uid, type Application, type ApplicationKind } from '../domain/types';
import { fmtDate, fmtNum } from '../i18n';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';

const KINDS: ApplicationKind[] = ['ee_cec', 'ee_fsw', 'ee_fst', 'pnp_ee', 'pnp_base', 'spousal', 'citizenship', 'pr_card', 'other'];
const REPO = 'https://github.com/harveyxiacn/PRTracker';

/** Search phrases people use on forums for each stream. */
const SEARCH_TERMS: Record<ApplicationKind, string> = {
  ee_cec: 'CEC AOR timeline', ee_fsw: 'FSW AOR timeline', ee_fst: 'FST express entry timeline',
  pnp_ee: 'PNP express entry AOR timeline', pnp_base: 'PNP base paper based timeline', spousal: 'spousal sponsorship timeline',
  citizenship: 'citizenship application AOR test oath timeline', pr_card: 'PR card renewal timeline', other: 'IRCC application timeline',
};

export function TimelineScreen() {
  const { data, update, t, lang, insights, open, param, go } = useApp();
  const [adding, setAdding] = useState(false);
  const app = param ? data.applications.find((a) => a.id === param) : undefined;
  if (app) return <AppDetail app={app} />;

  const apps = data.applications;
  return (
    <>
      <button className="btn primary block" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Icon name="plus" /> {t('tl.add')}</button>
      {apps.length === 0 && <Empty icon="timeline">{t('tl.empty')}</Empty>}
      {apps.map((a) => {
        const p = predict(a, insights.today, open.ircc?.times ?? {}, open.community?.records ?? []);
        const doneCount = a.milestones.filter((m) => m.date).length;
        return (
          <section key={a.id} className="card">
            <button className="item" style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }} onClick={() => go('timeline', a.id)}>
              <div className="row spread">
                <b>{a.label || t(`app.kind.${a.kind}`)}</b>
                <Icon name="chevron" size={18} />
              </div>
              <div className="small muted">
                {a.submitted ? t('tl.submittedOn', { date: fmtDate(a.submitted, lang) }) : t('tl.notSubmitted')} · {t('tl.steps', { done: doneCount, total: MILESTONES[a.kind].length })}
              </div>
              {p && (
                <>
                  <div className="progress accent" style={{ margin: '10px 0 6px' }}><div style={{ width: `${p.percent}%` }} /></div>
                  <div className="small">{t('tl.eta', { date: fmtDate(p.p50, lang), days: fmtNum(p.elapsed, lang) })}</div>
                </>
              )}
            </button>
          </section>
        );
      })}
      {adding && (
        <NewAppSheet
          onClose={() => setAdding(false)}
          onCreate={(a) => {
            update((d) => ({ ...d, applications: [...d.applications, a] }));
            setAdding(false);
            go('timeline', a.id);
          }}
        />
      )}
    </>
  );
}

function NewAppSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (a: Application) => void }) {
  const { t } = useApp();
  const [kind, setKind] = useState<ApplicationKind>('ee_cec');
  const [label, setLabel] = useState('');
  const [submitted, setSubmitted] = useState('');
  return (
    <Sheet title={t('tl.add')} onClose={onClose}>
      <Field label={t('tl.kind')}>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ApplicationKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`app.kind.${k}`)}</option>)}
        </select>
      </Field>
      <Field label={t('tl.label')}>
        <input className="input" value={label} placeholder={t(`app.kind.${kind}`)} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label={t('tl.submitted')} hint={t('tl.submittedHint')}>
        <input className="input" type="date" value={submitted} onChange={(e) => setSubmitted(e.target.value)} />
      </Field>
      <button
        className="btn primary block"
        onClick={() => onCreate({ id: uid(), kind, label: label.trim() || undefined, submitted: submitted || null, milestones: submitted ? [{ key: 'submitted', date: submitted }] : [] })}
      >
        {t('common.create')}
      </button>
    </Sheet>
  );
}

function AppDetail({ app }: { app: Application }) {
  const { update, t, lang, insights, open, go, toast } = useApp();
  const p = predict(app, insights.today, open.ircc?.times ?? {}, open.community?.records ?? []);
  const records = open.community?.records ?? [];
  const similar = similarRecords(app, records);
  const final = FINAL_MILESTONE[app.kind];
  const set = (patch: Partial<Application>) => update((d) => ({ ...d, applications: d.applications.map((a) => (a.id === app.id ? { ...a, ...patch } : a)) }));
  const setMilestone = (key: string, date: string) => {
    const ms = app.milestones.filter((m) => m.key !== key);
    if (date) ms.push({ key, date });
    const patch: Partial<Application> = { milestones: ms };
    if (key === 'submitted') patch.submitted = date || null;
    set(patch);
  };
  const dateOf = (key: string) => app.milestones.find((m) => m.key === key)?.date ?? '';
  const predicted = new Map(p?.next.map((n) => [n.key, n]) ?? []);

  // Histogram of community completion times
  const finals = similar.map((r) => r.days[final]).filter((x): x is number => typeof x === 'number');
  const bins = 10;
  const maxD = Math.max(1, ...finals, p ? p.elapsed : 0);
  const hist = Array.from({ length: bins }, () => 0);
  finals.forEach((d) => hist[Math.min(bins - 1, Math.floor((d / maxD) * bins))]++);
  const myBin = p ? Math.min(bins - 1, Math.floor((p.elapsed / maxD) * bins)) : -1;
  const hmax = Math.max(1, ...hist);

  const share = () => {
    const rec = toCommunityRecord(app);
    if (!rec) return;
    const body = JSON.stringify(rec, null, 2);
    const url = `${REPO}/issues/new?labels=timeline&template=timeline.yml&title=${encodeURIComponent(`Timeline: ${rec.kind} ${rec.submittedMonth}`)}&record=${encodeURIComponent(body)}`;
    void openExternal(url);
  };
  const remove = () => {
    if (!confirm(t('tl.confirmDelete'))) return;
    update((d) => ({ ...d, applications: d.applications.filter((a) => a.id !== app.id) }));
    go('timeline');
  };
  const q = `${SEARCH_TERMS[app.kind]} ${app.submitted ? new Date(app.submitted + 'T00:00:00Z').toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''}`.trim();

  return (
    <>
      <button className="btn ghost sm" style={{ marginTop: 4, paddingLeft: 0 }} onClick={() => go('timeline')}><Icon name="back" size={18} /> {t('nav.timeline')}</button>
      <section className="card">
        <Field label={t('tl.label')}>
          <input className="input" value={app.label ?? ''} placeholder={t(`app.kind.${app.kind}`)} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <div className="grid2">
          <Field label={t('tl.office')}>
            <input className="input" value={app.office ?? ''} placeholder={t('tl.officePh')} onChange={(e) => set({ office: e.target.value })} />
          </Field>
          <Field label={t('tl.expected')} hint={t('tl.expectedHint')}>
            <input className="input" type="number" min={1} inputMode="numeric" value={app.expectedDays ?? ''} onChange={(e) => set({ expectedDays: e.target.value ? Number(e.target.value) : null })} />
          </Field>
        </div>
      </section>

      {p && (
        <section className="card" aria-labelledby="pred-h">
          <h2 id="pred-h"><Icon name="sparkle" /> {t('tl.prediction')}</h2>
          <div className="row spread">
            <div>
              <div className="label">{t(`ms.${final}`)}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtDate(p.p50, lang)}</div>
              {p.p25 && p.p75 && <div className="small muted">{t('tl.range', { a: fmtDate(p.p25, lang), b: fmtDate(p.p75, lang) })}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="hero-num" style={{ fontSize: 28 }}>{p.percent}%</div>
              <div className="tiny">{t('tl.elapsed', { days: fmtNum(p.elapsed, lang), total: fmtNum(p.expectedDays, lang) })}</div>
            </div>
          </div>
          <div className="progress accent" style={{ margin: '10px 0' }}><div style={{ width: `${p.percent}%` }} /></div>
          <div className="tiny">{t(`pred.source.${p.source}`)}{p.sampleSize ? ` · n=${p.sampleSize}` : ''}{p.source === 'ircc' && open.ircc?.updated ? ` · ${open.ircc.updated}` : ''}</div>
        </section>
      )}

      <section className="card">
        <h2><Icon name="timeline" /> {t('tl.milestones')}</h2>
        <div style={{ position: 'relative' }}>
          <div className="ms-line" />
          {MILESTONES[app.kind].map((key) => {
            const date = dateOf(key);
            const pr = predicted.get(key);
            return (
              <div key={key} className={`ms${date ? ' done' : pr ? ' pred' : ''}`}>
                <span className="dot" />
                <div>
                  <div style={{ fontWeight: date ? 600 : 400 }}>{t(`ms.${key}`)}</div>
                  {date && app.submitted && key !== 'submitted' && <div className="tiny">{t('tl.dayN', { n: diffDays(date, app.submitted) })}</div>}
                  {!date && pr && <div className="tiny">{t('tl.predicted', { date: fmtDate(pr.date, lang), n: pr.sample })}</div>}
                </div>
                <input type="date" aria-label={t(`ms.${key}`)} value={date} onChange={(e) => setMilestone(key, e.target.value)} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2><Icon name="users" /> {t('tl.others')}</h2>
        {finals.length >= 3 ? (
          <>
            <p className="small muted">{t('tl.othersHint', { n: finals.length })}</p>
            <div className="hist" role="img" aria-label={t('tl.histLabel')}>
              {hist.map((h, i) => (
                <div key={i} className={i === myBin ? 'me' : ''} style={{ height: `${(h / hmax) * 100}%` }} title={`${Math.round((i * maxD) / bins)}–${Math.round(((i + 1) * maxD) / bins)} ${t('common.days')}: ${h}`} />
              ))}
            </div>
            <div className="row spread tiny"><span>0</span><span>{fmtNum(maxD, lang)} {t('common.days')}</span></div>
            <div className="legend" style={{ marginTop: 6 }}>
              <span><i style={{ background: 'var(--d-tr)' }} />{t('tl.histOthers')}</span>
              <span><i style={{ background: 'var(--accent)' }} />{t('tl.histYou')}</span>
            </div>
          </>
        ) : (
          <p className="small muted">{t('tl.noCommunity')}</p>
        )}
        <h3>{t('tl.searchOnline')}</h3>
        <div className="row wrap">
          <button className="btn sm" onClick={() => openExternal(`https://www.reddit.com/r/ImmigrationCanada/search/?q=${encodeURIComponent(q)}`)}><Icon name="search" size={16} /> Reddit</button>
          <button className="btn sm" onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(q)}`)}><Icon name="search" size={16} /> Google</button>
          <button className="btn sm" onClick={() => openExternal('https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html')}><Icon name="external" size={16} /> IRCC</button>
        </div>
        <p className="tiny">{t('tl.searchPrivacy')}</p>
        <h3>{t('tl.contribute')}</h3>
        <p className="small muted">{t('tl.contributeHint')}</p>
        <pre className="tiny" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, overflowX: 'auto' }}>{JSON.stringify(toCommunityRecord(app), null, 1)}</pre>
        <button className="btn sm" disabled={!app.submitted} onClick={share}><Icon name="external" size={16} /> {t('tl.shareBtn')}</button>
      </section>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn sm" onClick={() => { set({ archived: !app.archived }); toast(t(app.archived ? 'tl.unarchived' : 'tl.archived')); }}>{t(app.archived ? 'tl.unarchive' : 'tl.archive')}</button>
        <button className="btn sm danger" onClick={remove}><Icon name="trash" size={16} /> {t('common.delete')}</button>
      </div>
    </>
  );
}

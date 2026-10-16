import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Field, Sheet, Status } from '../components/ui';
import { diffDays } from '../domain/dates';
import { sortedCountries, countryName } from '../domain/countries';
import { canadaVisaSearchUrl } from '../domain/pasteParser';
import { CATEGORY_ORDER, PNP_NAMES, PROGRAMS, PROVINCES, program } from '../domain/programs';
import { MILESTONES, FINAL_MILESTONE, predict, similarRecords, toCommunityRecord } from '../domain/timeline';
import { PasteTimelineSheet } from './PasteTimeline';
import { FinishCurveCard } from './Curves';
import { uid, type Application, type ApplicationKind } from '../domain/types';
import { fmtDate, fmtNum } from '../i18n';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';

const REPO = 'https://github.com/harveyxiacn/PRTracker';

/** Search phrases people use on forums for each program. */
const SEARCH_TERMS: Record<string, string> = {
  ee_cec: 'CEC AOR timeline', ee_fsw: 'FSW AOR timeline', ee_fst: 'FST express entry timeline',
  pnp_ee: 'PNP express entry AOR timeline', pnp_base: 'PNP base paper based timeline', qc_skilled: 'Quebec CSQ federal PR timeline', qc_peq: 'PEQ CSQ timeline',
  aip: 'AIP Atlantic immigration timeline', rcip: 'RCIP rural community immigration timeline', fcip: 'FCIP francophone community timeline',
  caregiver: 'home care worker pilot PR timeline', startup: 'start-up visa PR timeline',
  spousal: 'spousal sponsorship timeline', spousal_in: 'inland spousal sponsorship timeline', spousal_out: 'outland spousal sponsorship timeline',
  child: 'dependent child sponsorship timeline', pgp: 'PGP parents grandparents sponsorship timeline', protected: 'protected person PR timeline', hc: 'H&C application timeline',
  study_permit: 'study permit timeline', work_permit: 'work permit timeline', visitor_visa: 'visitor visa TRV timeline', super_visa: 'super visa timeline',
  study_ext: 'study permit extension timeline', work_ext: 'work permit extension timeline', pgwp: 'PGWP timeline', owp_spouse: 'spousal open work permit timeline',
  visitor_record: 'visitor record timeline', citizenship: 'citizenship application AOR test oath timeline', pr_card: 'PR card renewal timeline', prtd: 'PRTD timeline', other: 'IRCC application timeline',
};

/** Program picker grouped by category. */
export function ProgramSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useApp();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {CATEGORY_ORDER.map((cat) => (
        <optgroup key={cat} label={t(`prog.cat.${cat}`)}>
          {PROGRAMS.filter((p) => p.category === cat && p.id !== 'spousal').map((p) => (
            <option key={p.id} value={p.id}>{t(`app.kind.${p.id}`)}{p.status ? ` — ${t(`prog.status.${p.status}`)}` : ''}</option>
          ))}
        </optgroup>
      ))}
      {value === 'spousal' && <option value="spousal">{t('app.kind.spousal')}</option>}
    </select>
  );
}

/** Province (PNP) / country (temporary residence) / stream fields for a program. */
function ProgramDetails({ app, set }: { app: Pick<Application, 'kind' | 'province' | 'country' | 'stream'>; set: (p: Partial<Application>) => void }) {
  const { t, lang } = useApp();
  const p = program(app.kind);
  return (
    <>
      {p.province && (
        <Field label={t('tl.province')}>
          <select className="input" value={app.province ?? ''} onChange={(e) => set({ province: e.target.value || undefined })}>
            <option value="">—</option>
            {PROVINCES.map((code) => <option key={code} value={code}>{t(`prov.${code}`)} ({PNP_NAMES[code]})</option>)}
          </select>
        </Field>
      )}
      {(p.countrySeries || p.category === 'family') && (
        <Field label={t('tl.country')} hint={p.countrySeries ? t('tl.countryHint') : undefined}>
          <select className="input" value={app.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })}>
            <option value="">—</option>
            {sortedCountries(lang).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={t('tl.stream')} hint={t('tl.streamHint')}>
        <input className="input" value={app.stream ?? ''} placeholder={p.province && app.province ? `${PNP_NAMES[app.province]} …` : ''} onChange={(e) => set({ stream: e.target.value || undefined })} />
      </Field>
    </>
  );
}

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
        const p = predict(a, insights.today, open.ircc ?? {}, open.community?.records ?? []);
        const doneCount = a.milestones.filter((m) => m.date).length;
        return (
          <section key={a.id} className="card">
            <button className="item" style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }} onClick={() => go('timeline', a.id)}>
              <div className="row spread">
                <b>{a.label || t(`app.kind.${a.kind}`)}</b>
                <Icon name="chevron" size={18} />
              </div>
              <div className="small muted">
                {a.submitted ? t('tl.submittedOn', { date: fmtDate(a.submitted, lang) }) : t('tl.notSubmitted')} · {t('tl.steps', { done: doneCount, total: (MILESTONES[a.kind] ?? MILESTONES.other).length })}
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
  const [extra, setExtra] = useState<Partial<Application>>({});
  return (
    <Sheet title={t('tl.add')} onClose={onClose}>
      <Field label={t('tl.kind')}>
        <ProgramSelect value={kind} onChange={setKind} />
      </Field>
      <p className="tiny">{t(`prog.desc.${kind}`)}</p>
      <ProgramDetails app={{ kind, ...extra }} set={(p) => setExtra({ ...extra, ...p })} />
      <Field label={t('tl.label')}>
        <input className="input" value={label} placeholder={t(`app.kind.${kind}`)} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label={t('tl.submitted')} hint={t('tl.submittedHint')}>
        <input className="input" type="date" value={submitted} onChange={(e) => setSubmitted(e.target.value)} />
      </Field>
      <button
        className="btn primary block"
        onClick={() => onCreate({ id: uid(), kind, ...extra, label: label.trim() || undefined, submitted: submitted || null, milestones: submitted ? [{ key: 'submitted', date: submitted }] : [] })}
      >
        {t('common.create')}
      </button>
    </Sheet>
  );
}

function AppDetail({ app }: { app: Application }) {
  const { update, t, lang, insights, open, go, toast } = useApp();
  const [pasting, setPasting] = useState(false);
  const prog = program(app.kind);
  const p = predict(app, insights.today, open.ircc ?? {}, open.community?.records ?? []);
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
    update((d) => {
      const checklist = { ...(d.documents?.checklist ?? {}) };
      delete checklist[app.id];
      return { ...d, applications: d.applications.filter((a) => a.id !== app.id), documents: d.documents ? { ...d.documents, checklist } : d.documents };
    });
    go('timeline');
  };
  const q = `${app.province ? PNP_NAMES[app.province] + ' ' : ''}${SEARCH_TERMS[app.kind] ?? SEARCH_TERMS.other} ${app.submitted ? new Date(app.submitted + 'T00:00:00Z').toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''}`.trim();

  return (
    <>
      <button className="btn ghost sm" style={{ marginTop: 4, paddingInlineStart: 0 }} onClick={() => go('timeline')}><Icon name="back" size={18} /> {t('nav.timeline')}</button>
      <section className="card">
        <Field label={t('tl.kind')}>
          <ProgramSelect value={app.kind} onChange={(kind) => set({ kind })} />
        </Field>
        {prog.status && <Status kind="warn">{t(`prog.status.${prog.status}`)}</Status>}
        <p className="tiny">
          {t(`prog.desc.${app.kind}`)} <button className="btn ghost sm" onClick={() => openExternal(prog.url)}><Icon name="external" size={14} /> IRCC</button>
        </p>
        <Field label={t('tl.label')}>
          <input className="input" value={app.label ?? ''} placeholder={t(`app.kind.${app.kind}`)} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <ProgramDetails app={app} set={set} />
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
            <div style={{ textAlign: 'end' }}>
              <div className="hero-num" style={{ fontSize: 28 }}>{p.percent}%</div>
              <div className="tiny">{t('tl.elapsed', { days: fmtNum(p.elapsed, lang), total: fmtNum(p.expectedDays, lang) })}</div>
            </div>
          </div>
          <div className="progress accent" style={{ margin: '10px 0' }}><div style={{ width: `${p.percent}%` }} /></div>
          <div className="tiny">
            {t(`pred.source.${p.source}`)}
            {p.sampleSize ? ` · n=${p.sampleSize}` : ''}
            {p.source === 'ircc' && app.country && prog.countrySeries ? ` · ${countryName(app.country, lang)}` : ''}
            {p.source === 'ircc' && open.ircc?.updated ? ` · ${open.ircc.updated}` : ''}
          </div>
        </section>
      )}

      <section className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}><Icon name="timeline" /> {t('tl.milestones')}</h2>
          <button className="btn ghost sm" onClick={() => setPasting(true)}><Icon name="upload" size={16} /> {t('paste.fromText')}</button>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="ms-line" />
          {(MILESTONES[app.kind] ?? MILESTONES.other).map((key) => {
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

      <FinishCurveCard app={app} />

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
          <button className="btn sm" onClick={() => openExternal(canadaVisaSearchUrl(q))}><Icon name="search" size={16} /> CanadaVisa</button>
          <button className="btn sm" onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(q)}`)}><Icon name="search" size={16} /> Google</button>
          <button className="btn sm" onClick={() => openExternal('https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html')}><Icon name="external" size={16} /> IRCC</button>
        </div>
        <p className="tiny">{t('tl.searchPrivacy')}</p>
        <h3>{t('tl.contribute')}</h3>
        <p className="small muted">{t('tl.contributeHint')}</p>
        <pre className="tiny" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, overflowX: 'auto' }}>{JSON.stringify(toCommunityRecord(app), null, 1)}</pre>
        <button className="btn sm" disabled={!app.submitted} onClick={share}><Icon name="external" size={16} /> {t('tl.shareBtn')}</button>
      </section>

      {pasting && (
        <PasteTimelineSheet
          kindHint={app.kind}
          onClose={() => setPasting(false)}
          onApply={(ms) => {
            const keep = app.milestones.filter((m) => !ms.some((x) => x.key === m.key));
            const merged = [...keep, ...ms.map((m) => ({ key: m.key, date: m.date }))];
            const sub = merged.find((m) => m.key === 'submitted')?.date ?? app.submitted;
            set({ milestones: merged, submitted: sub ?? null });
            setPasting(false);
            toast(t('paste.applied', { n: ms.length }));
          }}
        />
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn sm" onClick={() => { set({ archived: !app.archived }); toast(t(app.archived ? 'tl.unarchived' : 'tl.archived')); }}>{t(app.archived ? 'tl.unarchive' : 'tl.archive')}</button>
        <button className="btn sm danger" onClick={remove}><Icon name="trash" size={16} /> {t('common.delete')}</button>
      </div>
    </>
  );
}

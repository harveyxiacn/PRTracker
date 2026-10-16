import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Status } from '../components/ui';
import { PROGRAMS, program } from '../domain/programs';
import { PasteTimelineSheet } from './PasteTimeline';
import { ProcessingTrends } from './Trends';
import { FINAL_MILESTONE, percentile } from '../domain/timeline';
import type { ApplicationKind } from '../domain/types';
import { fmtNum } from '../i18n';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';

/** Always listed; other programs appear once they have community data. */
const CORE: ApplicationKind[] = ['ee_cec', 'ee_fsw', 'pnp_ee', 'pnp_base', 'spousal_out', 'spousal_in', 'citizenship', 'pr_card'];

export function CommunityScreen() {
  const { t, lang, open, refreshOpen, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const records = open.community?.records ?? [];
  const withData = new Set(records.map((r) => r.kind));
  const KINDS = PROGRAMS.map((p) => p.id).filter((id) => CORE.includes(id) || withData.has(id));

  const rows = KINDS.map((k) => {
    const ds = records.filter((r) => r.kind === k).map((r) => r.days[FINAL_MILESTONE[k]]).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b);
    return { kind: k, n: ds.length, p25: ds.length ? percentile(ds, 0.25) : null, median: ds.length ? percentile(ds, 0.5) : null, p75: ds.length ? percentile(ds, 0.75) : null, ircc: open.ircc?.times?.[program(k).irccTimeKey ?? k] ?? null };
  });
  const maxDays = Math.max(1, ...rows.map((r) => Math.max(r.p75 ?? 0, r.ircc ?? 0)));

  const refresh = async () => {
    setBusy(true);
    await refreshOpen();
    setBusy(false);
    toast(t('com.refreshed'));
  };

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}><Icon name="users" /> {t('com.title')}</h2>
          <button className="btn sm" onClick={refresh} disabled={busy}><Icon name="refresh" size={16} /> {t('com.refresh')}</button>
        </div>
        <p className="small muted">{t('com.intro')}</p>
        <div className="row wrap small">
          {open.origin === 'remote' && <Status kind="good">{t('com.online')}</Status>}
          {open.origin === 'bundled' && <Status kind="warn">{t('com.offline')}</Status>}
          {open.origin === 'none' && <Status kind="warn">{t('com.none')}</Status>}
          <span className="tiny">{t('com.records', { n: records.length })}{open.ircc?.updated ? ` · IRCC ${open.ircc.updated}` : ''}</span>
        </div>
      </section>

      <section className="card">
        <h2>{t('com.compare')}</h2>
        <div className="bars" role="table" aria-label={t('com.compare')}>
          {rows.map((r) => (
            <div key={r.kind} className="bar-row" role="row">
              <span role="cell">{t(`app.kind.${r.kind}`)}</span>
              <div className="bar-track" role="cell" title={r.median !== null ? `p25 ${r.p25} · median ${r.median} · p75 ${r.p75}` : ''}>
                {r.median !== null ? (
                  <>
                    <div style={{ position: 'absolute', left: `${(r.p25! / maxDays) * 100}%`, width: `${Math.max(1, ((r.p75! - r.p25!) / maxDays) * 100)}%`, top: 3, height: 8, background: 'color-mix(in srgb, var(--d-tr) 35%, transparent)', borderRadius: 4 }} />
                    <div style={{ position: 'absolute', left: `calc(${(r.median / maxDays) * 100}% - 1px)`, width: 3, top: 0, height: 14, background: 'var(--d-tr)', borderRadius: 2 }} />
                  </>
                ) : null}
                {r.ircc !== null && <div style={{ position: 'absolute', left: `calc(${(r.ircc / maxDays) * 100}% - 5px)`, top: 2, width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--d-out)', background: 'var(--surface)' }} />}
              </div>
              <span role="cell" className="num small" style={{ textAlign: 'end' }}>{r.median !== null ? `${fmtNum(r.median, lang)}d` : r.ircc !== null ? `${fmtNum(r.ircc, lang)}d*` : '—'}</span>
            </div>
          ))}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: 'var(--d-tr)' }} />{t('com.legendMedian')}</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--d-tr) 35%, transparent)' }} />{t('com.legendIqr')}</span>
          <span><i style={{ background: 'var(--surface)', border: '2px solid var(--d-out)', borderRadius: '50%' }} />{t('com.legendIrcc')}</span>
        </div>
        <table className="data" style={{ marginTop: 12 }}>
          <thead><tr><th>{t('tl.kind')}</th><th className="n">n</th><th className="n">p25</th><th className="n">{t('com.median')}</th><th className="n">p75</th><th className="n">IRCC</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind}><td>{t(`app.kind.${r.kind}`)}</td><td className="n">{r.n}</td><td className="n">{r.p25 ?? '—'}</td><td className="n">{r.median ?? '—'}</td><td className="n">{r.p75 ?? '—'}</td><td className="n">{r.ircc ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="tiny">{t('com.unit')}</p>
      </section>

      <ProcessingTrends />

      {open.ircc && Object.keys(open.ircc.entries).length > 0 && (
        <section className="card">
          <h2>{t('com.irccAll')}</h2>
          <table className="data">
            <tbody>
              {Object.entries(open.ircc.entries).filter(([k]) => !k.endsWith('lastupdated')).map(([k, v]) => (
                <tr key={k}><td className="small">{k.split('.').slice(1).join(' › ')}</td><td className="n">{v}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>{t('com.how')}</h2>
        <ol className="small" style={{ paddingInlineStart: 18 }}>
          <li>{t('com.how1')}</li>
          <li>{t('com.how2')}</li>
          <li>{t('com.how3')}</li>
        </ol>
        <div className="row wrap">
          <button className="btn sm" onClick={() => setPasting(true)}><Icon name="upload" size={16} /> {t('paste.title')}</button>
          <button className="btn sm" onClick={() => openExternal('https://github.com/harveyxiacn/PRTracker/tree/main/community')}><Icon name="external" size={16} /> {t('com.dataset')}</button>
        </div>
      </section>
      {pasting && <PasteTimelineSheet onClose={() => setPasting(false)} />}
    </>
  );
}

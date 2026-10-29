import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Toggle } from '../components/ui';
import { fmtDate } from '../i18n';
import { external } from '../platform';
import { useApp } from '../store/AppContext';
import { AppUpdater, fetchLatestRelease, isNewer, loadUpdatePrefs, saveUpdatePrefs, updateErrorKey, type ReleaseInfo } from '../native/updates';

const VERSION = __APP_VERSION__;

type Phase =
  | { k: 'idle' }
  | { k: 'checking' }
  | { k: 'latest' }
  | { k: 'available'; rel: ReleaseInfo }
  | { k: 'downloading'; rel: ReleaseInfo; pct: number | null }
  | { k: 'installing'; rel: ReleaseInfo; path: string; needsPermission: boolean }
  | { k: 'error'; key: string; rel?: ReleaseInfo };

/** Settings card: check GitHub for a newer release, download it, verify it and install it. */
export function UpdateCard() {
  const { t, lang } = useApp();
  const [prefs, setPrefs] = useState(loadUpdatePrefs);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);
  const set = (p: Phase) => live.current && setPhase(p);

  const check = async () => {
    set({ k: 'checking' });
    try {
      const rel = await fetchLatestRelease();
      const next = { ...prefs, lastCheck: Date.now() };
      saveUpdatePrefs(next);
      setPrefs(next);
      set(rel && rel.apk && isNewer(rel.version, VERSION) ? { k: 'available', rel } : { k: 'latest' });
    } catch {
      set({ k: 'error', key: 'upd.errNetwork' });
    }
  };

  const download = async (rel: ReleaseInfo) => {
    if (!rel.apk) return;
    set({ k: 'downloading', rel, pct: 0 });
    const sub = await AppUpdater.addListener('progress', ({ received, total }) => {
      set({ k: 'downloading', rel, pct: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null });
    });
    try {
      const { path } = await AppUpdater.download({ url: rel.apk.url, fileName: rel.apk.name, sha256: rel.apk.sha256 });
      set({ k: 'installing', rel, path, needsPermission: false });
      await install(rel, path);
    } catch (e) {
      set({ k: 'error', key: updateErrorKey((e as { code?: string })?.code), rel });
    } finally {
      void sub.remove();
    }
  };

  const install = async (rel: ReleaseInfo, path: string) => {
    // The installer (or the "install unknown apps" setting) is a system screen: don't lock behind it.
    const { status } = await external(() => AppUpdater.install({ path }));
    set({ k: 'installing', rel, path, needsPermission: status === 'needs-permission' });
  };

  const busy = phase.k === 'checking' || phase.k === 'downloading';
  return (
    <section className="card anchor" id="set-update" aria-labelledby="upd-h">
      <h2 id="upd-h"><Icon name="download" /> {t('upd.title')}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t('upd.current', { v: VERSION })}</p>

      <div aria-live="polite">
        {phase.k === 'latest' && <p className="small"><Icon name="check" size={16} /> {t('upd.latest')}</p>}
        {phase.k === 'error' && <div className="tip warn"><Icon name="alert" /><div>{t(phase.key)}</div></div>}
        {(phase.k === 'available' || phase.k === 'downloading' || phase.k === 'installing') && (
          <div className="update-box">
            <b>{t('upd.available', { v: phase.rel.version })}</b>
            <div className="tiny">
              {phase.rel.published && fmtDate(phase.rel.published, lang)}
              {phase.rel.apk?.size ? ` · ${t('upd.size', { mb: (phase.rel.apk.size / 1048576).toFixed(1) })}` : ''}
            </div>
            {phase.rel.notes && (
              <details className="disclose">
                <summary>{t('upd.whatsNew')}</summary>
                <p className="tiny update-notes">{phase.rel.notes}</p>
              </details>
            )}
            {phase.k === 'downloading' && (
              <>
                <div className="progress" style={{ margin: '10px 0 4px' }} role="progressbar" aria-label={t('upd.downloadingLabel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.pct ?? undefined}>
                  <div style={{ width: `${phase.pct ?? 100}%` }} />
                </div>
                <div className="tiny">{phase.pct === null ? t('upd.downloadingLabel') : t('upd.downloading', { pct: phase.pct })}</div>
              </>
            )}
            {phase.k === 'installing' && <p className="small">{phase.needsPermission ? t('upd.needPermission') : t('upd.ready')}</p>}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ marginTop: 8 }}>
        {phase.k === 'available' && (
          <button className="btn primary" onClick={() => void download(phase.rel)}><Icon name="download" size={18} /> {t('upd.install')}</button>
        )}
        {phase.k === 'installing' && (
          <button className="btn primary" onClick={() => void install(phase.rel, phase.path)}>{t('upd.installAgain')}</button>
        )}
        {phase.k === 'error' && phase.rel?.apk && (
          <button className="btn primary" onClick={() => void download(phase.rel!)}>{t('upd.retry')}</button>
        )}
        {phase.k !== 'available' && phase.k !== 'installing' && (
          <button className="btn sm" disabled={busy} onClick={() => void check()}>
            <Icon name="refresh" size={16} /> {phase.k === 'checking' ? t('upd.checking') : t('upd.check')}
          </button>
        )}
      </div>

      <Toggle
        checked={prefs.auto}
        onChange={(auto) => {
          const next = { ...prefs, auto };
          saveUpdatePrefs(next);
          setPrefs(next);
        }}
        label={t('upd.auto')}
      />
      <p className="tiny">{t('upd.privacy')}</p>
    </section>
  );
}

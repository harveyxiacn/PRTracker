import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented, Toggle, prefersReducedMotion } from '../components/ui';
import { DEFAULT_DATA_URL, emptyData, type Settings } from '../domain/types';
import { requestPermission } from '../notify/notifications';
import { isNative, openExternal, saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';
import { LanguageSelect, ProfileFields } from '../components/ProfileFields';
import { exportJson, isSafeDataUrl, wipeData } from '../store/storage';
import { SecuritySection } from './Security';
import { PeopleSection } from './People';
import { ShareSection } from './Share';
import { privacyScreenSupported, setPrivacyScreen } from '../native/privacy';
import { otaSupported } from '../native/updates';
import { UpdateCard } from './Updates';

const VERSION = __APP_VERSION__;

/** Sections in display order: the index at the top jumps to them. */
const SECTIONS = [
  { id: 'set-profile', key: 'set.profile' },
  { id: 'set-prefs', key: 'set.prefs' },
  { id: 'set-reminders', key: 'set.notifications' },
  { id: 'set-household', key: 'ppl.title' },
  { id: 'set-security', key: 'sec.title' },
  { id: 'set-data', key: 'set.data' },
  { id: 'set-about', key: 'set.about' },
] as const;

/** Horizontal index of the Settings sections; moves focus to the section heading it scrolls to. */
function SectionIndex() {
  const { t } = useApp();
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    const h = el.querySelector<HTMLElement>('h2');
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  };
  return (
    <nav className="section-index" aria-label={t('ux.sections')}>
      {SECTIONS.map((x) => (
        <button key={x.id} type="button" className="chip" onClick={() => jump(x.id)}>{t(x.key)}</button>
      ))}
    </nav>
  );
}

export function SettingsScreen() {
  const { data, update, replaceAll, t, insights, demo, resyncNotifications, param } = useApp();
  // Opened from the "update available" toast: bring the update card into view.
  useEffect(() => {
    if (param !== 'update') return;
    const id = requestAnimationFrame(() => document.getElementById('set-update')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(id);
  }, [param]);
  const s = data.settings;
  const p = data.profile;
  const setS = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setN = (patch: Partial<Settings['notifications']>) => setS({ notifications: { ...s.notifications, ...patch } });
  const [permMsg, setPermMsg] = useState('');
  const [urlDraft, setUrlDraft] = useState(s.dataUrl);
  const commitUrl = () => {
    const v = urlDraft.trim();
    // Only https mirrors (startup would otherwise reset an unsafe value to the default anyway).
    if (!isSafeDataUrl(v)) return setUrlDraft(s.dataUrl);
    if (v !== s.dataUrl) setS({ dataUrl: v });
  };
  const thisYear = Number(insights.today.slice(0, 4));
  const taxYears = Array.from({ length: 6 }, (_, i) => thisYear - 1 - i);

  const enableNotifications = async () => {
    const ok = await requestPermission();
    if (ok) {
      const n = await resyncNotifications();
      setPermMsg(t('set.notifScheduled', { n }));
    } else setPermMsg(t('set.notifDenied'));
  };

  return (
    <>
      <SectionIndex />
      <section className="card anchor" id="set-profile">
        <h2><Icon name="flag" /> {t('set.profile')}</h2>
        <ProfileFields />
        <h3>{t('set.tax')}</h3>
        <p className="tiny">{t('set.taxHint')}</p>
        <div className="chips">
          {taxYears.map((y) => {
            const on = p.taxYearsFiled.includes(y);
            return (
              <button key={y} className="chip" aria-pressed={on} onClick={() => update((d) => ({ ...d, profile: { ...d.profile, taxYearsFiled: on ? d.profile.taxYearsFiled.filter((x) => x !== y) : [...d.profile.taxYearsFiled, y] } }))}>
                {on && <Icon name="check" size={14} />} {y}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card anchor" id="set-prefs">
        <h2><Icon name="settings" /> {t('set.prefs')}</h2>
        <Field label={t('set.language')}>
          <LanguageSelect value={s.language} onChange={(language) => setS({ language })} />
        </Field>
        <Field label={t('set.theme')}>
          <Segmented label={t('set.theme')} value={s.theme} onChange={(theme) => setS({ theme })} options={[{ value: 'system', label: t('set.themeSystem') }, { value: 'light', label: t('set.themeLight') }, { value: 'dark', label: t('set.themeDark') }]} />
        </Field>
        <Toggle checked={s.boundaryDaysPresent} onChange={(v) => setS({ boundaryDaysPresent: v })} label={t('set.boundary')} />
        <p className="tiny">{t('set.boundaryHint')}</p>
        <Field label={t('set.buffer')} hint={t('set.bufferHint')}>
          <input className="input" type="number" min={0} max={365} value={s.citizenshipBuffer} onChange={(e) => setS({ citizenshipBuffer: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </section>

      <section className="card anchor" id="set-reminders">
        <h2><Icon name="bell" /> {t('set.notifications')}</h2>
        <Toggle checked={s.notifications.enabled} onChange={(v) => setN({ enabled: v })} label={t('set.notifEnabled')} />
        {s.notifications.enabled && (
          <div className="toggle-group">
            <Toggle checked={s.notifications.citizenship} onChange={(v) => setN({ citizenship: v })} label={t('set.notifCit')} />
            <Toggle checked={s.notifications.prCard} onChange={(v) => setN({ prCard: v })} label={t('set.notifCard')} />
            <Toggle checked={s.notifications.residency} onChange={(v) => setN({ residency: v })} label={t('set.notifRes')} />
            <Toggle checked={s.notifications.tripReturn} onChange={(v) => setN({ tripReturn: v })} label={t('set.notifTrip')} />
            <Toggle checked={s.notifications.documents !== false} onChange={(v) => setN({ documents: v })} label={t('set.notifDocs')} />
          </div>
        )}
        <button className="btn sm" onClick={enableNotifications} disabled={demo}><Icon name="bell" size={16} /> {t('set.notifAllow')}</button>
        {permMsg && <p className="small" role="status">{permMsg}</p>}
        <p className="tiny">{isNative() ? t('set.notifNative') : t('set.notifWeb')}</p>
      </section>

      <div className="anchor" id="set-household"><PeopleSection /></div>

      <div className="anchor" id="set-security">
        {!demo && <SecuritySection />}
        {privacyScreenSupported() && (
          <section className="card">
            <h2><Icon name="shield" /> {t('nat.privacyScreen')}</h2>
            <Toggle
              disabled={demo}
              checked={!!data.privacyScreen}
              onChange={(v) => { update((d) => ({ ...d, privacyScreen: v })); void setPrivacyScreen(v || !!data.lock); }}
              label={t('nat.privacyScreen')}
            />
            <p className="tiny">{t('nat.privacyScreenHint')}</p>
            {data.lock && <p className="tiny">{t('sec.privacyWithPin')}</p>}
            <p className="tiny">{t('nat.widgetHint')}</p>
          </section>
        )}
      </div>

      <section className="card anchor" id="set-data">
        <h2><Icon name="download" /> {t('set.data')}</h2>
        <p className="small muted">{t('set.dataHint')}</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => saveTextFile(`pr-tracker-backup-${insights.today}.json`, exportJson(data))}><Icon name="download" size={16} /> {t('set.export')}</button>
          {/* Restoring lives in "Security & calendar" → Import backup, the one flow that reads plain and encrypted files. */}
        </div>
        <details className="disclose">
          <summary>{t('ux.advanced')}</summary>
          <Field label={t('set.dataUrl')} hint={t('set.dataUrlHint')}>
            <input className="input" type="url" inputMode="url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onBlur={commitUrl} onKeyDown={(e) => e.key === 'Enter' && commitUrl()} />
          </Field>
          {s.dataUrl !== DEFAULT_DATA_URL && <button className="btn ghost sm" onClick={() => { setUrlDraft(DEFAULT_DATA_URL); setS({ dataUrl: DEFAULT_DATA_URL }); }}>{t('set.resetUrl')}</button>}
        </details>
      </section>

      {!demo && <ShareSection />}

      {/* Irreversible: kept apart from everyday actions, behind a confirm (there is no undo). */}
      <section className="card danger-zone" aria-labelledby="danger-h">
        <h2 id="danger-h"><Icon name="alert" /> {t('ux.danger')}</h2>
        <p className="small muted">{t('ux.dangerHint')}</p>
        <button
          disabled={demo}
          className="btn sm danger"
          onClick={async () => {
            if (!confirm(t('set.wipeConfirm'))) return;
            await wipeData();
            replaceAll(emptyData());
          }}
        >
          <Icon name="trash" size={16} /> {t('set.wipe')}
        </button>
      </section>

      {otaSupported() && <UpdateCard />}

      <section className="card anchor" id="set-about">
        <h2><Icon name="info" /> {t('set.about')}</h2>
        <p className="small">{t('set.aboutText')}</p>
        <p className="tiny">{t('common.disclaimer')}</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => openExternal('https://github.com/harveyxiacn/PRTracker')}><Icon name="external" size={16} /> GitHub</button>
          <button className="btn sm" onClick={() => openExternal('https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/become-canadian-citizen/eligibility.html')}><Icon name="external" size={16} /> {t('set.ircCit')}</button>
          <button className="btn sm" onClick={() => openExternal('https://eservices.cic.gc.ca/rescalc/resCalcStartNew.do')}><Icon name="external" size={16} /> {t('set.ircCalc')}</button>
        </div>
        <p className="tiny">v{VERSION}</p>
      </section>
    </>
  );
}

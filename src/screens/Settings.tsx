import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented } from '../components/ui';
import { DEFAULT_DATA_URL, emptyData, type Settings } from '../domain/types';
import { requestPermission, syncNotifications } from '../notify/notifications';
import { isNative, openExternal, pickTextFile, saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';
import { LanguageSelect, ProfileFields } from '../components/ProfileFields';
import { exportJson, importJson, wipeData } from '../store/storage';
import { SecuritySection } from './Security';

const VERSION = __APP_VERSION__;



export function SettingsScreen() {
  const { data, update, replaceAll, t, insights, toast } = useApp();
  const s = data.settings;
  const p = data.profile;
  const setS = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setN = (patch: Partial<Settings['notifications']>) => setS({ notifications: { ...s.notifications, ...patch } });
  const [permMsg, setPermMsg] = useState('');
  const [urlDraft, setUrlDraft] = useState(s.dataUrl);
  const commitUrl = () => {
    const v = urlDraft.trim();
    if (v !== s.dataUrl) setS({ dataUrl: v });
  };
  const thisYear = Number(insights.today.slice(0, 4));
  const taxYears = Array.from({ length: 6 }, (_, i) => thisYear - 1 - i);

  const enableNotifications = async () => {
    const ok = await requestPermission();
    if (ok) {
      const n = await syncNotifications(insights.reminders, s, t);
      setPermMsg(t('set.notifScheduled', { n }));
    } else setPermMsg(t('set.notifDenied'));
  };

  return (
    <>
      <section className="card">
        <h2><Icon name="flag" /> {t('set.profile')}</h2>
        <ProfileFields />
        <h3>{t('set.tax')}</h3>
        <p className="tiny">{t('set.taxHint')}</p>
        <div className="chips">
          {taxYears.map((y) => {
            const on = p.taxYearsFiled.includes(y);
            return (
              <button key={y} className="chip" aria-pressed={on} onClick={() => update((d) => ({ ...d, profile: { ...d.profile, taxYearsFiled: on ? d.profile.taxYearsFiled.filter((x) => x !== y) : [...d.profile.taxYearsFiled, y] } }))}>
                {y}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2><Icon name="settings" /> {t('set.prefs')}</h2>
        <Field label={t('set.language')}>
          <LanguageSelect value={s.language} onChange={(language) => setS({ language })} />
        </Field>
        <Field label={t('set.theme')}>
          <Segmented label={t('set.theme')} value={s.theme} onChange={(theme) => setS({ theme })} options={[{ value: 'system', label: t('set.themeSystem') }, { value: 'light', label: t('set.themeLight') }, { value: 'dark', label: t('set.themeDark') }]} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={s.boundaryDaysPresent} onChange={(e) => setS({ boundaryDaysPresent: e.target.checked })} />
          {t('set.boundary')}
        </label>
        <p className="tiny">{t('set.boundaryHint')}</p>
        <Field label={t('set.buffer')} hint={t('set.bufferHint')}>
          <input className="input" type="number" min={0} max={365} value={s.citizenshipBuffer} onChange={(e) => setS({ citizenshipBuffer: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </section>

      <section className="card">
        <h2><Icon name="bell" /> {t('set.notifications')}</h2>
        <label className="check"><input type="checkbox" checked={s.notifications.enabled} onChange={(e) => setN({ enabled: e.target.checked })} /> {t('set.notifEnabled')}</label>
        {s.notifications.enabled && (
          <div style={{ paddingInlineStart: 12 }}>
            <label className="check"><input type="checkbox" checked={s.notifications.citizenship} onChange={(e) => setN({ citizenship: e.target.checked })} /> {t('set.notifCit')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.prCard} onChange={(e) => setN({ prCard: e.target.checked })} /> {t('set.notifCard')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.residency} onChange={(e) => setN({ residency: e.target.checked })} /> {t('set.notifRes')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.tripReturn} onChange={(e) => setN({ tripReturn: e.target.checked })} /> {t('set.notifTrip')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.documents !== false} onChange={(e) => setN({ documents: e.target.checked })} /> {t('set.notifDocs')}</label>
          </div>
        )}
        <button className="btn sm" onClick={enableNotifications}><Icon name="bell" size={16} /> {t('set.notifAllow')}</button>
        {permMsg && <p className="small">{permMsg}</p>}
        <p className="tiny">{isNative() ? t('set.notifNative') : t('set.notifWeb')}</p>
      </section>

      <section className="card">
        <h2><Icon name="shield" /> {t('set.data')}</h2>
        <p className="small muted">{t('set.dataHint')}</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => saveTextFile(`pr-tracker-backup-${insights.today}.json`, exportJson(data))}><Icon name="download" size={16} /> {t('set.export')}</button>
          <button
            className="btn sm"
            onClick={async () => {
              const text = await pickTextFile('.json,application/json');
              if (!text) return;
              try {
                const d = importJson(text);
                if (!confirm(t('set.importConfirm', { trips: d.trips.length }))) return;
                replaceAll({ ...d, onboarded: true, lock: data.lock ?? null });
                toast(t('set.imported'));
              } catch {
                toast(t('set.importFailed'));
              }
            }}
          >
            <Icon name="upload" size={16} /> {t('set.import')}
          </button>
          <button
            className="btn sm danger"
            onClick={async () => {
              if (!confirm(t('set.wipeConfirm'))) return;
              await wipeData();
              replaceAll(emptyData());
            }}
          >
            <Icon name="trash" size={16} /> {t('set.wipe')}
          </button>
        </div>
        <Field label={t('set.dataUrl')} hint={t('set.dataUrlHint')}>
          <input className="input" type="url" inputMode="url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onBlur={commitUrl} onKeyDown={(e) => e.key === 'Enter' && commitUrl()} />
        </Field>
        {s.dataUrl !== DEFAULT_DATA_URL && <button className="btn ghost sm" onClick={() => { setUrlDraft(DEFAULT_DATA_URL); setS({ dataUrl: DEFAULT_DATA_URL }); }}>{t('set.resetUrl')}</button>}
      </section>

      <SecuritySection />

      <section className="card">
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

import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented } from '../components/ui';
import { uid, DEFAULT_DATA_URL, emptyData, type PrePRStatusKind, type Profile, type Settings } from '../domain/types';
import { fmtDate } from '../i18n';
import { requestPermission, syncNotifications } from '../notify/notifications';
import { isNative, openExternal, pickTextFile, saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';
import { exportJson, importJson, wipeData } from '../store/storage';

const VERSION = __APP_VERSION__;

export function ProfileFields() {
  const { data, update, t, lang } = useApp();
  const p = data.profile;
  const setP = (patch: Partial<Profile>) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  return (
    <>
      <Field label={t('set.prDate')} hint={t('set.prDateHint')}>
        <input className="input" type="date" value={p.prDate ?? ''} onChange={(e) => setP({ prDate: e.target.value || undefined })} />
      </Field>
      <Field label={t('set.cardExpiry')} hint={t('set.cardExpiryHint')}>
        <input className="input" type="date" value={p.prCardExpiry ?? ''} onChange={(e) => setP({ prCardExpiry: e.target.value || undefined })} />
      </Field>
      <h3>{t('set.prePr')}</h3>
      <p className="tiny">{t('set.prePrHint')}</p>
      {p.statusPeriods.map((s) => (
        <div key={s.id} className="row wrap" style={{ alignItems: 'flex-end', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <Field label={t('set.statusKind')}>
            <select className="input" value={s.kind} onChange={(e) => setP({ statusPeriods: p.statusPeriods.map((x) => (x.id === s.id ? { ...x, kind: e.target.value as PrePRStatusKind } : x)) })}>
              {(['worker', 'student', 'visitor', 'protected', 'other'] as const).map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
            </select>
          </Field>
          <Field label={t('set.from')}>
            <input className="input" type="date" value={s.start} onChange={(e) => setP({ statusPeriods: p.statusPeriods.map((x) => (x.id === s.id ? { ...x, start: e.target.value } : x)) })} />
          </Field>
          <Field label={t('set.to')}>
            <input className="input" type="date" value={s.end ?? ''} placeholder={p.prDate ? fmtDate(p.prDate, lang) : ''} onChange={(e) => setP({ statusPeriods: p.statusPeriods.map((x) => (x.id === s.id ? { ...x, end: e.target.value || null } : x)) })} />
          </Field>
          <button className="icon-btn" aria-label={t('common.delete')} onClick={() => setP({ statusPeriods: p.statusPeriods.filter((x) => x.id !== s.id) })}><Icon name="trash" /></button>
        </div>
      ))}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setP({ statusPeriods: [...p.statusPeriods, { id: uid(), kind: 'worker', start: p.firstEntry ?? '' }] })}>
        <Icon name="plus" size={16} /> {t('set.addStatus')}
      </button>
      <p className="tiny">{t('set.toHint')}</p>
    </>
  );
}

export function SettingsScreen() {
  const { data, update, replaceAll, t, insights, toast, refreshOpen } = useApp();
  const s = data.settings;
  const p = data.profile;
  const setS = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setN = (patch: Partial<Settings['notifications']>) => setS({ notifications: { ...s.notifications, ...patch } });
  const [permMsg, setPermMsg] = useState('');
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
          <Segmented label={t('set.language')} value={s.language} onChange={(language) => setS({ language })} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }]} />
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
          <div style={{ paddingLeft: 12 }}>
            <label className="check"><input type="checkbox" checked={s.notifications.citizenship} onChange={(e) => setN({ citizenship: e.target.checked })} /> {t('set.notifCit')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.prCard} onChange={(e) => setN({ prCard: e.target.checked })} /> {t('set.notifCard')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.residency} onChange={(e) => setN({ residency: e.target.checked })} /> {t('set.notifRes')}</label>
            <label className="check"><input type="checkbox" checked={s.notifications.tripReturn} onChange={(e) => setN({ tripReturn: e.target.checked })} /> {t('set.notifTrip')}</label>
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
                replaceAll({ ...d, onboarded: true });
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
          <input className="input" value={s.dataUrl} onChange={(e) => setS({ dataUrl: e.target.value.trim() })} onBlur={() => void refreshOpen()} />
        </Field>
        {s.dataUrl !== DEFAULT_DATA_URL && <button className="btn ghost sm" onClick={() => setS({ dataUrl: DEFAULT_DATA_URL })}>{t('set.resetUrl')}</button>}
      </section>

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

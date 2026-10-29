import { useState } from 'react';
import { Icon } from '../components/Icon';
import { pickTextFile } from '../platform';
import { useApp } from '../store/AppContext';
import { csvToTrips } from '../store/csv';
import { useBackupRestore } from './BackupRestore';
import { LanguageSelect, ProfileFields } from '../components/ProfileFields';

export function Onboarding() {
  const { data, update, t, toast } = useApp();
  const [step, setStep] = useState(0);
  // Plain or encrypted backups; nothing to overwrite yet, so no "replace?" question.
  const restore = useBackupRestore({ confirmReplace: false });
  const finish = () => update((d) => ({ ...d, onboarded: true }));
  const steps = 3;

  return (
    <div className="onb">
      <div className="row spread">
        <img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <div style={{ maxWidth: 220 }}>
          <LanguageSelect value={data.settings.language} onChange={(language) => update((d) => ({ ...d, settings: { ...d.settings, language } }))} />
        </div>
      </div>
      <div className="steps" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <h1 style={{ fontSize: 28, margin: '8px 0' }}>{t('onb.title')}</h1>
          <p className="muted">{t('onb.subtitle')}</p>
          <ul className="list">
            {(['onb.f1', 'onb.f2', 'onb.f3', 'onb.f4'] as const).map((k, i) => (
              <li key={k}><span className="avatar" style={{ background: ['var(--d-pr)', 'var(--d-out)', 'var(--d-tr)', 'var(--accent)'][i] }}><Icon name={['flag', 'calendar', 'timeline', 'sparkle'][i]} /></span><span>{t(k)}</span></li>
            ))}
          </ul>
          <div className="tip info"><Icon name="shield" /><div>{t('onb.privacy')}</div></div>
          <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => setStep(1)}>{t('onb.start')}</button>
          <button className="btn ghost block" onClick={restore.start}>
            {t('onb.restore')}
          </button>
          {restore.sheet}
          <button className="btn ghost block" onClick={() => (window.location.href = `${window.location.pathname}?demo=1&lang=${encodeURIComponent(data.settings.language)}`)}>
            {t('onb.tryDemo')}
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h2>{t('onb.statusTitle')}</h2>
          <p className="small muted">{t('onb.statusHint')}</p>
          <ProfileFields />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(0)}>{t('common.back')}</button>
            <button className="btn primary grow" onClick={() => setStep(2)}>{t('common.next')}</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2>{t('onb.tripsTitle')}</h2>
          <p className="small muted">{t('onb.tripsHint')}</p>
          <button
            className="btn block"
            onClick={async () => {
              const text = await pickTextFile('.csv,text/csv,text/plain');
              if (!text) return;
              const { trips, errors } = csvToTrips(text);
              update((d) => ({ ...d, trips: [...d.trips, ...trips] }));
              toast(t('trips.imported', { n: trips.length, bad: errors.length }));
            }}
          >
            <Icon name="upload" /> {t('trips.importCsv')}
          </button>
          <p className="tiny">{t('trips.csvHelp')}</p>
          <p className="small">{t('onb.tripsLater')}</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(1)}>{t('common.back')}</button>
            <button className="btn primary grow" onClick={finish}>{t('onb.finish')}</button>
          </div>
        </>
      )}
    </div>
  );
}

// Shared by Onboarding and Settings (kept out of the lazily loaded Settings screen).
import { Icon } from './Icon';
import { Field } from './ui';
import { uid, type PrePRStatusKind, type Profile } from '../domain/types';
import { fmtDate, LANGUAGES } from '../i18n';
import { useApp } from '../store/AppContext';

export function LanguageSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { t, lang } = useApp();
  // Keeps the English word too, so someone who picked a language they can't read can find the way back.
  const label = lang === 'en' ? t('set.language') : `${t('set.language')} (Language)`;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
          {l.name}{l.code !== 'en' ? ` — ${l.english}` : ''}
        </option>
      ))}
    </select>
  );
}

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
      <p className="tiny">{t('set.prePrNoClaim')}</p>
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
          {/* Only authorised temporary-resident time counts; protected-person time from the positive decision. */}
          {s.kind === 'protected' && <p className="tiny" style={{ flexBasis: '100%', margin: 0 }}>{t('set.statusHint.protected')}</p>}
          {s.kind === 'other' && <p className="tiny" style={{ flexBasis: '100%', margin: 0 }}>{t('set.statusHint.other')}</p>}
        </div>
      ))}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setP({ statusPeriods: [...p.statusPeriods, { id: uid(), kind: 'worker', start: p.firstEntry ?? '' }] })}>
        <Icon name="plus" size={16} /> {t('set.addStatus')}
      </button>
      <p className="tiny">{t('set.toHint')}</p>
    </>
  );
}

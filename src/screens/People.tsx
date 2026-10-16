// Household: several people on one device. The active person's data lives in profile/trips,
// so every other screen simply shows whoever is active (see src/domain/people.ts).
import { useMemo, useState, type ReactElement } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import {
  addPerson,
  applyTogetherDate,
  DEFAULT_PERSON_NAME,
  householdSummary,
  listPeople,
  MAX_NAME_LENGTH,
  removePerson,
  renamePerson,
  switchPerson,
  type PersonSummary,
} from '../domain/people';
import { fmtDate, type Lang } from '../i18n';
import { useApp } from '../store/AppContext';

type T = ReturnType<typeof useApp>['t'];

/** The untouched default name is shown translated ("Me" in the UI language). */
function shownName(name: string, t: T): string {
  return name === DEFAULT_PERSON_NAME ? t('ppl.me') : name;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? Array.from(w)[0] ?? '' : '');
  const s = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : Array.from(words[0] ?? '?').slice(0, 2).join('');
  return s.toLocaleUpperCase() || '?';
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size < 32 ? 12 : 14, fontWeight: 700 }}>
      {initials(name)}
    </span>
  );
}

/** Status badges for one person, most urgent first. */
function PersonStatus({ s, today, t, lang, full }: { s: PersonSummary; today: string; t: T; lang: Lang; full?: boolean }) {
  const items: ReactElement[] = [];
  if (s.abroad) items.push(<Status key="abroad" kind="warn">{t('ppl.abroad')}</Status>);
  if (s.residencyOk === false) items.push(<Status key="res" kind="critical">{t('ppl.resRisk')}</Status>);
  if (s.citizenshipDate && s.isPr && s.citizenshipDate <= today) items.push(<Status key="cit" kind="good">{t('ppl.citEligible')}</Status>);
  else if (s.citizenshipDate) items.push(<Status key="cit" kind="info">{t('ppl.citFrom', { date: fmtDate(s.citizenshipDate, lang) })}</Status>);
  else if (!s.isPr) items.push(<Status key="notpr" kind="info">{t('ppl.notPr')}</Status>);
  if (full) {
    if (s.residencyOk === true) items.push(<Status key="resok" kind="good">{t('ppl.resOk')}</Status>);
    if (s.prCardExpiry)
      items.push(
        s.prCardExpiry < today ? (
          <Status key="card" kind="critical">{t('ppl.cardExpired', { date: fmtDate(s.prCardExpiry, lang) })}</Status>
        ) : (
          <Status key="card" kind="info">{t('ppl.cardExpires', { date: fmtDate(s.prCardExpiry, lang) })}</Status>
        ),
      );
  }
  return <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{items}</div>;
}

function useSwitch() {
  const { update, toast, t } = useApp();
  return (id: string, name: string) => {
    update((d) => switchPerson(d, id));
    toast(t('ppl.switched', { name: shownName(name, t) }));
  };
}

/** Top-bar control. Renders nothing for a single person, so single users see no change. */
export function PersonSwitcher() {
  const { data, insights, t, lang, go } = useApp();
  const [open, setOpen] = useState(false);
  const switchTo = useSwitch();
  const people = listPeople(data);
  if (people.length < 2) return null;
  const active = shownName(people[0].name, t);
  const summary = open ? householdSummary(data, insights.today) : [];

  return (
    <>
      <button
        className="btn ghost sm"
        style={{ minHeight: 44, paddingInline: 6, maxInlineSize: 140, color: 'var(--text)' }}
        aria-label={t('ppl.switcherLabel', { name: active })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Avatar name={active} size={28} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active}</span>
      </button>
      {open && (
        <Sheet title={t('ppl.switchTitle')} onClose={() => setOpen(false)}>
          <ul className="list">
            {summary.map((s) => {
              const name = shownName(s.name, t);
              return (
                <li key={s.id}>
                  <button
                    className="item"
                    style={{ minHeight: 44 }}
                    aria-current={s.active ? 'true' : undefined}
                    onClick={() => {
                      if (!s.active) switchTo(s.id, s.name);
                      setOpen(false);
                    }}
                  >
                    <Avatar name={name} />
                    <span className="grow">
                      <b>{name}</b>
                      <PersonStatus s={s} today={insights.today} t={t} lang={lang} />
                    </span>
                    {s.active && <span className="badge good"><Icon name="check" />{t('ppl.viewing')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            onClick={() => {
              setOpen(false);
              go('settings');
            }}
          >
            <Icon name="users" /> {t('ppl.manage')}
          </button>
        </Sheet>
      )}
    </>
  );
}

/** Home card for households of two or more. */
export function HouseholdCard() {
  const { data, insights, t, lang } = useApp();
  const switchTo = useSwitch();
  const several = !!data.household && data.household.others.length > 0;
  const summary = useMemo(() => (several ? householdSummary(data, insights.today) : []), [several, data, insights.today]);
  if (!several) return null;
  const together = applyTogetherDate(summary);

  return (
    <section className="card">
      <h2><Icon name="users" /> {t('ppl.title')}</h2>
      <p className="tiny">{t('ppl.tapToSwitch')}</p>
      <ul className="list">
        {summary.map((s) => {
          const name = shownName(s.name, t);
          return (
            <li key={s.id}>
              <button className="item" style={{ minHeight: 44 }} aria-current={s.active ? 'true' : undefined} onClick={() => !s.active && switchTo(s.id, s.name)}>
                <Avatar name={name} />
                <span className="grow">
                  <span className="row" style={{ gap: 8 }}>
                    <b>{name}</b>
                    {s.active && <span className="badge">{t('ppl.viewing')}</span>}
                  </span>
                  <PersonStatus s={s} today={insights.today} t={t} lang={lang} full />
                </span>
                {!s.active && <Icon name="chevron" />}
              </button>
            </li>
          );
        })}
      </ul>
      {together && (
        <div className="tip info">
          <Icon name="flag" />
          <div>
            <b>{together <= insights.today ? t('ppl.applyTogetherNow') : t('ppl.applyTogether', { date: fmtDate(together, lang) })}</b>
            <div className="small muted">{t('ppl.applyTogetherHint')}</div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Settings card: list, rename, add, remove; which person is active. */
export function PeopleSection() {
  const { data, update, t, toast } = useApp();
  const switchTo = useSwitch();
  const people = listPeople(data);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = () => {
    const n = newName.trim();
    if (!n) return;
    update((d) => addPerson(d, n));
    setNewName('');
    toast(t('ppl.added', { name: n }));
  };
  const saveRename = () => {
    if (!editing || !editing.name.trim()) return;
    const { id, name } = editing;
    update((d) => renamePerson(d, id, name));
    setEditing(null);
  };
  const remove = (id: string, name: string) => {
    if (!confirm(t('ppl.confirmRemove', { name }))) return;
    update((d) => removePerson(d, id));
    toast(t('ppl.removed', { name }));
  };

  return (
    <section className="card">
      <h2><Icon name="users" /> {t('ppl.title')}</h2>
      <p className="small muted">{t('ppl.intro')}</p>
      <p className="tiny">{t('ppl.shared')}</p>
      {people.length < 2 && <p className="small">{t('ppl.onlyYou')}</p>}
      <ul className="list">
        {people.map((p) => {
          const name = shownName(p.name, t);
          return (
            <li key={p.id} style={{ flexWrap: 'wrap' }}>
              <Avatar name={name} />
              {editing && editing.id === p.id ? (
                <span className="grow row" style={{ gap: 8 }}>
                  <input
                    className="input grow"
                    value={editing.name}
                    maxLength={MAX_NAME_LENGTH}
                    aria-label={t('ppl.renameLabel', { name })}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                  />
                  <button className="btn sm primary" style={{ minHeight: 44 }} disabled={!editing.name.trim()} onClick={saveRename}>{t('common.save')}</button>
                  <button className="btn sm ghost" style={{ minHeight: 44 }} onClick={() => setEditing(null)}>{t('ppl.cancel')}</button>
                </span>
              ) : (
                <>
                  <span className="grow">
                    <b>{name}</b>{' '}
                    {p.active && <span className="badge good"><Icon name="check" />{t('ppl.viewing')}</span>}
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    {!p.active && (
                      <button className="btn sm" style={{ minHeight: 44 }} onClick={() => switchTo(p.id, p.name)}>{t('ppl.switchTo')}</button>
                    )}
                    <button className="btn sm ghost" style={{ minHeight: 44 }} aria-label={t('ppl.renameLabel', { name })} onClick={() => setEditing({ id: p.id, name: p.name === DEFAULT_PERSON_NAME ? '' : p.name })}>
                      {t('ppl.rename')}
                    </button>
                    {people.length > 1 && (
                      <button className="icon-btn" aria-label={t('ppl.removeLabel', { name })} title={t('ppl.remove')} onClick={() => remove(p.id, name)}>
                        <Icon name="trash" />
                      </button>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <h3>{t('ppl.addMember')}</h3>
      <Field label={t('ppl.name')} hint={t('ppl.privacy')}>
        <input
          className="input"
          value={newName}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t('ppl.namePh')}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </Field>
      <button className="btn" disabled={!newName.trim()} onClick={add}><Icon name="plus" /> {t('ppl.add')}</button>
    </section>
  );
}

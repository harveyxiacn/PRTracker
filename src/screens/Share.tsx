import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import { isISODate } from '../domain/dates';
import { DEFAULT_PERSON_NAME, allPeople } from '../domain/people';
import { fmtDate, fmtNum } from '../i18n';
import { pickTextFile, saveTextFile } from '../platform';
import { isEncryptedBackup } from '../security/crypto';
import { MIN_SHARE_PASSPHRASE, exportPersonEncrypted, findSameName, importPerson, readPersonFile, shareFileName, type SharedPerson } from '../security/share';
import { useApp } from '../store/AppContext';
import { passphraseStrength } from './Security';

function useDisplayName() {
  const { t } = useApp();
  return (name: string) => (name === DEFAULT_PERSON_NAME ? t('ppl.me') : name);
}

function SendSheet({ personId, onClose }: { personId: string; onClose: () => void }) {
  const { data, t, lang, insights, toast } = useApp();
  const show = useDisplayName();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const person = allPeople(data).find((p) => p.id === personId);
  const short = pass.length < MIN_SHARE_PASSPHRASE;
  const mismatch = !short && again.length > 0 && again !== pass;
  const ok = !!person && !short && again === pass && !busy;
  const strength = passphraseStrength(pass);
  if (!person) return null;
  const name = show(person.name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      const file = await exportPersonEncrypted(data, person.id, pass);
      await saveTextFile(shareFileName(person.name, insights.today), file, 'application/json');
      toast(t('share.saved'));
      onClose();
    } catch (err) {
      console.error('share export', err);
      toast(t('share.saveFailed'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('share.sendTitle', { name })} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="small muted">{t('share.sendInfo', { name, trips: fmtNum(person.trips.length, lang) })}</p>
        <div className="tip warn" role="note">
          <Icon name="alert" />
          <span>{t('share.channelWarn')}</span>
        </div>
        <Field label={t('share.passphrase')} hint={t('share.passphraseHint')}>
          <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <div aria-live="polite" style={{ minHeight: 24 }}>
          {pass.length > 0 && (short ? (
            <Status kind="critical">{t('share.tooShort')}</Status>
          ) : (
            <Status kind={strength === 2 ? 'good' : strength === 1 ? 'info' : 'warn'}>{t(strength === 2 ? 'share.strengthStrong' : strength === 1 ? 'share.strengthFair' : 'share.strengthWeak')}</Status>
          ))}
        </div>
        <Field label={t('share.passphraseConfirm')}>
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <div aria-live="polite" style={{ minHeight: 24 }}>{mismatch && <Status kind="warn">{t('share.mismatch')}</Status>}</div>
        <button className="btn primary block" type="submit" disabled={!ok} style={{ marginTop: 12 }}>
          <Icon name="send" size={16} /> {busy ? t('share.encrypting') : t('share.sendBtn')}
        </button>
      </form>
    </Sheet>
  );
}

function ReceiveSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const { data, update, t, lang, toast } = useApp();
  const show = useDisplayName();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [person, setPerson] = useState<SharedPerson | null>(null);
  const [newName, setNewName] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setErr('');
    try {
      setPerson(await readPersonFile(text, pass));
    } catch (x) {
      setErr(x instanceof Error && x.message === 'bad-passphrase' ? t('share.wrongPass') : t('share.badFile'));
    }
    setBusy(false);
  };

  if (!person) {
    return (
      <Sheet title={t('share.receiveTitle')} onClose={onClose}>
        <form onSubmit={submit}>
          <p className="small muted">{t('share.receiveHint')}</p>
          <Field label={t('share.passphrase')}>
            <input className="input" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
          </Field>
          <div aria-live="polite" style={{ minHeight: 24 }}>{err && <Status kind="critical">{err}</Status>}</div>
          <button className="btn primary block" type="submit" disabled={!pass || busy} style={{ marginTop: 12 }}>
            <Icon name="shield" size={16} /> {busy ? t('share.decrypting') : t('share.decrypt')}
          </button>
        </form>
      </Sheet>
    );
  }

  // An unnamed sender ("Me") needs a name here, or it would show up as "Me (2)".
  const unnamed = person.name === DEFAULT_PERSON_NAME;
  const name = unnamed ? newName.trim() : show(person.name);
  const match = findSameName(data, person.name);
  const exported = person.exportedAt.slice(0, 10);

  const apply = (replace: boolean) => {
    if (replace && match?.active && !confirm(t('share.replaceActiveConfirm', { name: show(match.name) }))) return;
    update((d) => importPerson(d, person, { replace, name: unnamed ? newName : undefined }));
    toast(replace && match ? t('share.replaced', { name: show(match.name) }) : t('share.added', { name }));
    onClose();
  };

  return (
    <Sheet title={t('share.receiveTitle')} onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>{t('share.preview')}</h3>
      <table className="data">
        <tbody>
          <tr><th scope="row">{t('share.previewName')}</th><td>{show(person.name)}</td></tr>
          <tr><th scope="row">{t('share.previewPr')}</th><td>{person.profile.prDate ? fmtDate(person.profile.prDate, lang) : t('share.previewNotPr')}</td></tr>
          <tr><th scope="row">{t('share.previewTrips')}</th><td className="n">{fmtNum(person.trips.length, lang)}</td></tr>
          {isISODate(exported) && <tr><th scope="row">{t('share.previewExported')}</th><td>{fmtDate(exported, lang)}</td></tr>}
        </tbody>
      </table>
      {unnamed && (
        <Field label={t('ppl.name')}>
          <input className="input" value={newName} placeholder={t('ppl.namePh')} maxLength={40} onChange={(e) => setNewName(e.target.value)} />
        </Field>
      )}
      {match && (
        <div className="tip warn" role="note" style={{ marginTop: 12 }}>
          <Icon name="info" />
          <span>{t('share.replaceHint', { name: show(match.name) })}</span>
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className="btn" type="button" onClick={onClose}>{t('share.cancel')}</button>
        {match && (
          <button className="btn danger" type="button" onClick={() => apply(true)}>{t('share.replace', { name: show(match.name) })}</button>
        )}
        <button className="btn primary" type="button" disabled={unnamed && !newName.trim()} onClick={() => apply(false)} style={{ flex: 1 }}>
          <Icon name="plus" size={16} /> {t('share.add')}
        </button>
      </div>
    </Sheet>
  );
}

/** Settings card: send/receive one person as an end-to-end encrypted file (no server). */
export function ShareSection() {
  const { data, t, toast } = useApp();
  const show = useDisplayName();
  const people = allPeople(data);
  const [selected, setSelected] = useState(people[0]?.id ?? '');
  const [sending, setSending] = useState<string | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  // The selection can go stale after a switch/remove in the Household card.
  const current = people.some((p) => p.id === selected) ? selected : people[0]?.id ?? '';

  const receive = async () => {
    const text = await pickTextFile('.prperson,.json,application/json,application/octet-stream');
    if (!text) return;
    if (!isEncryptedBackup(text)) return toast(t('share.notEncrypted'));
    setReceived(text);
  };

  return (
    <section className="card">
      <h2><Icon name="send" /> {t('share.title')}</h2>
      <p className="small muted">{t('share.intro')}</p>

      <details>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>{t('share.how')}</summary>
        <ul className="small" style={{ paddingInlineStart: 20, marginBlock: 4 }}>
          <li>{t('share.how1')}</li>
          <li>{t('share.how2')}</li>
          <li>{t('share.how3')}</li>
          <li>{t('share.how4')}</li>
        </ul>
      </details>

      <h3>{t('share.send')}</h3>
      <p className="tiny">{t('share.sendHint')}</p>
      {people.length > 1 && (
        <Field label={t('share.person')}>
          <select className="input" value={current} onChange={(e) => setSelected(e.target.value)}>
            {people.map((p) => <option key={p.id} value={p.id}>{show(p.name)}</option>)}
          </select>
        </Field>
      )}
      <div className="row wrap">
        <button className="btn sm" disabled={!current} onClick={() => setSending(current)}><Icon name="send" size={16} /> {t('share.sendBtn')}</button>
      </div>

      <h3>{t('share.receive')}</h3>
      <p className="tiny">{t('share.receiveHint')}</p>
      <div className="row wrap">
        <button className="btn sm" onClick={receive}><Icon name="upload" size={16} /> {t('share.pick')}</button>
      </div>

      <div className="tip" role="note" style={{ marginTop: 12 }}>
        <Icon name="info" />
        <span>{t('share.newPhone')}</span>
      </div>

      {sending && <SendSheet personId={sending} onClose={() => setSending(null)} />}
      {received && <ReceiveSheet text={received} onClose={() => setReceived(null)} />}
    </section>
  );
}

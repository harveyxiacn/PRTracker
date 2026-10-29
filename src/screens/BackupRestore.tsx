// Restoring a backup (plain or passphrase-encrypted): shared by Settings and onboarding, so every
// entry point understands both formats.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import { pickTextFile } from '../platform';
import { decryptText, isEncryptedBackup } from '../security/crypto';
import { useApp } from '../store/AppContext';
import { importJson } from '../store/storage';

function DecryptSheet({ text, onClose, onPlain }: { text: string; onClose: () => void; onPlain: (json: string) => void }) {
  const { t } = useApp();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setErr('');
    try {
      const json = await decryptText(text, pass);
      onPlain(json);
    } catch (x) {
      setErr(x instanceof Error && x.message === 'bad-passphrase' ? t('sec.wrongPass') : t('sec.badFile'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('sec.importTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="small muted">{t('sec.importHint')}</p>
        <Field label={t('sec.passphrase')}>
          <input className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <div aria-live="polite" style={{ minHeight: 24 }}>{err && <Status kind="critical">{err}</Status>}</div>
        <button className="btn primary block" type="submit" disabled={!pass || busy} style={{ marginTop: 12 }}>
          <Icon name="upload" size={16} /> {busy ? t('sec.decrypting') : t('sec.decrypt')}
        </button>
      </form>
    </Sheet>
  );
}

/**
 * The one restore flow (Settings and onboarding): pick a backup file, ask for the passphrase if
 * it is encrypted, then replace the data. This device's PIN and device settings are kept.
 * Render `sheet` somewhere in the calling component.
 */
export function useBackupRestore({ confirmReplace = true }: { confirmReplace?: boolean } = {}): { start: () => Promise<void>; sheet: ReactNode } {
  const { data, replaceAll, t, toast } = useApp();
  const [encText, setEncText] = useState<string | null>(null);

  const apply = (json: string) => {
    try {
      const d = importJson(json, data);
      if (confirmReplace && !confirm(t('sec.importConfirm', { trips: d.trips.length }))) return;
      // Keep this device's lock: restoring a backup must not silently change or drop the PIN.
      replaceAll({ ...d, onboarded: true, lock: data.lock ?? null });
      toast(t('sec.imported'));
    } catch {
      toast(t('sec.badFile'));
    }
  };

  const start = async () => {
    const text = await pickTextFile('.json,application/json');
    if (!text) return;
    if (isEncryptedBackup(text)) setEncText(text);
    else apply(text);
  };

  const sheet = encText ? (
    <DecryptSheet
      text={encText}
      onClose={() => setEncText(null)}
      onPlain={(json) => {
        setEncText(null);
        apply(json);
      }}
    />
  ) : null;
  return { start, sheet };
}

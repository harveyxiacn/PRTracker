import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import { emptyData } from '../domain/types';
import { pickTextFile, saveTextFile } from '../platform';
import { decryptText, encryptText, isEncryptedBackup } from '../security/crypto';
import { buildIcs, remindersToEvents, tripsToEvents } from '../security/ics';
import { hashPin, isValidPin, verifyPin } from '../security/pin';
import { useApp } from '../store/AppContext';
import { exportJson, importJson, wipeData } from '../store/storage';

const MIN_PASS = 8;

/** Rough passphrase strength hint: 0 weak, 1 fair, 2 strong (length counts most). */
export function passphraseStrength(p: string): 0 | 1 | 2 {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/, /\s/].filter((r) => r.test(p)).length + (/[^\x00-\x7f]/.test(p) ? 1 : 0);
  if (p.length >= 16 || (p.length >= 12 && classes >= 3)) return 2;
  if (p.length >= 12 || classes >= 3) return 1;
  return 0;
}

/** Map Arabic-Indic / Persian digits typed on a localized keyboard to ASCII. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

const pinInputProps = { type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 8, className: 'input', dir: 'ltr' } as const;

function ExportSheet({ onClose }: { onClose: () => void }) {
  const { data, t, insights, toast } = useApp();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const short = pass.length < MIN_PASS;
  const mismatch = !short && again.length > 0 && again !== pass;
  const ok = !short && again === pass && !busy;
  const strength = passphraseStrength(pass);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      const enc = await encryptText(exportJson(data), pass);
      await saveTextFile(`pr-tracker-backup-${insights.today}.enc.json`, enc);
      toast(t('sec.exported'));
      onClose();
    } catch (err) {
      console.error('encrypted export', err);
      toast(t('sec.exportFailed'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('sec.exportTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="tip critical" role="note">
          <Icon name="alert" />
          <span>{t('sec.noRecovery')}</span>
        </div>
        <Field label={t('sec.passphrase')} hint={t('sec.passphraseHint')}>
          <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <div aria-live="polite" style={{ minHeight: 24 }}>
          {pass.length > 0 && (short ? (
            <Status kind="critical">{t('sec.tooShort')}</Status>
          ) : (
            <Status kind={strength === 2 ? 'good' : strength === 1 ? 'info' : 'warn'}>{t(strength === 2 ? 'sec.strengthStrong' : strength === 1 ? 'sec.strengthFair' : 'sec.strengthWeak')}</Status>
          ))}
        </div>
        <Field label={t('sec.passphraseConfirm')}>
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <div aria-live="polite" style={{ minHeight: 24 }}>{mismatch && <Status kind="warn">{t('sec.mismatch')}</Status>}</div>
        <button className="btn primary block" type="submit" disabled={!ok} style={{ marginTop: 12 }}>
          <Icon name="download" size={16} /> {busy ? t('sec.encrypting') : t('sec.exportEnc')}
        </button>
      </form>
    </Sheet>
  );
}

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

function PinSheet({ mode, onClose }: { mode: 'set' | 'change' | 'remove'; onClose: () => void }) {
  const { data, update, t, toast } = useApp();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const needCurrent = mode !== 'set' && !!data.lock;
  const needNew = mode !== 'remove';
  const title = t(mode === 'set' ? 'sec.setPin' : mode === 'change' ? 'sec.changePin' : 'sec.removePin');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (needNew && !isValidPin(next)) return setErr(t('sec.pinInvalid'));
    if (needNew && next !== again) return setErr(t('sec.pinMismatch'));
    setBusy(true);
    try {
      if (needCurrent && !(await verifyPin(cur, data.lock!))) {
        setErr(t('sec.pinWrong'));
        setBusy(false);
        return;
      }
      if (needNew) {
        const lock = await hashPin(next);
        update((d) => ({ ...d, lock }));
        toast(t('sec.pinSaved'));
      } else {
        update((d) => ({ ...d, lock: null }));
        toast(t('sec.pinRemoved'));
      }
      onClose();
    } catch (x) {
      console.error('pin', x);
      setErr(t('sec.pinInvalid'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {needCurrent && (
          <Field label={t('sec.currentPin')}>
            <input {...pinInputProps} value={cur} onChange={(e) => setCur(normalizeDigits(e.target.value))} />
          </Field>
        )}
        {needNew && (
          <>
            <Field label={t('sec.newPin')}>
              <input {...pinInputProps} value={next} onChange={(e) => setNext(normalizeDigits(e.target.value))} />
            </Field>
            <Field label={t('sec.confirmPin')}>
              <input {...pinInputProps} value={again} onChange={(e) => setAgain(normalizeDigits(e.target.value))} />
            </Field>
            <div className="tip warn" role="note">
              <Icon name="alert" />
              <span>{t('sec.pinForgetWarn')}</span>
            </div>
          </>
        )}
        <div aria-live="polite" style={{ minHeight: 24 }}>{err && <Status kind="critical">{err}</Status>}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" onClick={onClose}>{t('sec.cancel')}</button>
          <button className={`btn ${mode === 'remove' ? 'danger' : 'primary'}`} type="submit" disabled={busy} style={{ flex: 1 }}>
            {busy ? t('sec.working') : mode === 'remove' ? t('sec.removePin') : t('sec.save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Settings card: encrypted backup, app lock and calendar export. */
export function SecuritySection() {
  const { data, replaceAll, t, insights, toast } = useApp();
  const [exporting, setExporting] = useState(false);
  const [encText, setEncText] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<'set' | 'change' | 'remove' | null>(null);

  const applyImport = (json: string) => {
    try {
      const d = importJson(json);
      if (!confirm(t('sec.importConfirm', { trips: d.trips.length }))) return;
      // Keep this device's lock: restoring a backup must not silently change or drop the PIN.
      replaceAll({ ...d, onboarded: true, lock: data.lock ?? null });
      toast(t('sec.imported'));
    } catch {
      toast(t('sec.badFile'));
    }
  };

  const startImport = async () => {
    const text = await pickTextFile('.json,application/json');
    if (!text) return;
    if (isEncryptedBackup(text)) setEncText(text);
    else applyImport(text);
  };

  const exportIcs = async (kind: 'reminders' | 'trips') => {
    const events = kind === 'reminders' ? remindersToEvents(insights.reminders, t) : tripsToEvents(data.trips, insights.today, t);
    if (!events.length) return toast(t(kind === 'reminders' ? 'sec.noReminders' : 'sec.noTrips'));
    await saveTextFile(`pr-tracker-${kind}.ics`, buildIcs(events), 'text/calendar');
    toast(t('sec.icsSaved', { n: events.length }));
  };

  return (
    <section className="card">
      <h2><Icon name="shield" /> {t('sec.title')}</h2>
      <p className="small muted">{t('sec.intro')}</p>

      <h3>{t('sec.backup')}</h3>
      <p className="tiny">{t('sec.backupHint')}</p>
      <div className="row wrap">
        <button className="btn sm" onClick={() => setExporting(true)}><Icon name="download" size={16} /> {t('sec.exportEnc')}</button>
        <button className="btn sm" onClick={startImport}><Icon name="upload" size={16} /> {t('sec.importAny')}</button>
      </div>

      <h3>{t('sec.lock')}</h3>
      <p className="tiny">{t('sec.lockHint')}</p>
      <p>{data.lock ? <Status kind="good">{t('sec.lockOn')}</Status> : <Status kind="info">{t('sec.lockOff')}</Status>}</p>
      <div className="row wrap">
        {data.lock ? (
          <>
            <button className="btn sm" onClick={() => setPinMode('change')}>{t('sec.changePin')}</button>
            <button className="btn sm danger" onClick={() => setPinMode('remove')}>{t('sec.removePin')}</button>
          </>
        ) : (
          <button className="btn sm" onClick={() => setPinMode('set')}><Icon name="shield" size={16} /> {t('sec.setPin')}</button>
        )}
      </div>

      <h3>{t('sec.calendar')}</h3>
      <div className="row wrap">
        <button className="btn sm" onClick={() => exportIcs('reminders')}><Icon name="calendar" size={16} /> {t('sec.exportReminders')}</button>
        <button className="btn sm" onClick={() => exportIcs('trips')}><Icon name="plane" size={16} /> {t('sec.exportTrips')}</button>
      </div>
      <p className="tiny">{t('sec.calendarHint')}</p>

      {exporting && <ExportSheet onClose={() => setExporting(false)} />}
      {encText && (
        <DecryptSheet
          text={encText}
          onClose={() => setEncText(null)}
          onPlain={(json) => {
            setEncText(null);
            applyImport(json);
          }}
        />
      )}
      {pinMode && <PinSheet mode={pinMode} onClose={() => setPinMode(null)} />}
    </section>
  );
}

// ---- Lock screen ----

const ATTEMPTS_KEY = 'prtracker.lock.attempts';
const FREE_TRIES = 5;
const BASE_WAIT_MS = 30_000;
const MAX_WAIT_MS = 60 * 60_000;

interface Attempts { fails: number; until: number }

function loadAttempts(): Attempts {
  try {
    const o = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? 'null');
    if (o && Number.isFinite(o.fails) && Number.isFinite(o.until)) return { fails: o.fails, until: o.until };
  } catch {
    /* ignore */
  }
  return { fails: 0, until: 0 };
}
function saveAttempts(a: Attempts) {
  try {
    if (a.fails) localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
    else localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    /* ignore */
  }
}

/** Wait after the n-th consecutive failure: none for the first 5, then 30 s doubling, capped at 1 h. */
export function backoffMs(fails: number): number {
  if (fails < FREE_TRIES) return 0;
  return Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** (fails - FREE_TRIES));
}

/** Full-screen PIN pad shown on start/resume while data.lock is set. Render inside AppProvider. */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { data, replaceAll, t } = useApp();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [attempts, setAttempts] = useState<Attempts>(loadAttempts);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const waiting = attempts.until > now;
  const waitSec = Math.ceil((attempts.until - now) / 1000);

  useEffect(() => {
    if (!data.lock) onUnlock();
  }, [data.lock, onUnlock]);

  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  useEffect(() => {
    rootRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const submit = useCallback(async () => {
    if (!data.lock || busy || !isValidPin(pin) || attempts.until > Date.now()) return;
    setBusy(true);
    const ok = await verifyPin(pin, data.lock);
    setBusy(false);
    setPin('');
    if (ok) {
      saveAttempts({ fails: 0, until: 0 });
      onUnlock();
      return;
    }
    const fails = attempts.fails + 1;
    const next = { fails, until: Date.now() + backoffMs(fails) };
    saveAttempts(next);
    setAttempts(next);
    setNow(Date.now());
    setMsg(t('sec.wrongPin'));
  }, [data.lock, busy, pin, attempts, onUnlock, t]);

  const press = (d: string) => {
    if (busy || waiting) return;
    setMsg('');
    setPin((p) => (p.length < 8 ? p + d : p));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  const onKey = (e: KeyboardEvent) => {
    if (forgot) return;
    // Only real digit keys (incl. Arabic-Indic/Persian); not "F5" etc.
    const d = /^[0-9\u0660-\u0669\u06f0-\u06f9]$/.test(e.key) ? normalizeDigits(e.key) : '';
    if (d.length === 1) {
      e.preventDefault();
      press(d);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      back();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const wipe = async () => {
    if (!confirm(t('sec.wipeConfirm1')) || !confirm(t('sec.wipeConfirm2'))) return;
    await wipeData();
    saveAttempts({ fails: 0, until: 0 });
    // The effect above calls onUnlock() once data.lock is gone.
    replaceAll(emptyData());
  };

  const key = { width: 72, height: 72, borderRadius: '50%', fontSize: 26, fontWeight: 600, padding: 0, justifyContent: 'center' } as const;
  const disabled = busy || waiting;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      onKeyDown={onKey}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', color: 'var(--text)', overflowY: 'auto', outline: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBlock: 'calc(32px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-bottom))', paddingInline: 16 }}
    >
      <div style={{ color: 'var(--accent)' }}><Icon name="shield" size={44} /></div>
      <h1 id="lock-title" style={{ fontSize: 22, marginBlock: '12px 4px', textAlign: 'center' }}>{t('sec.lockTitle')}</h1>
      <p className="muted" style={{ marginBlock: 0 }}>{t('sec.enterPin')}</p>

      <div dir="ltr" aria-hidden="true" style={{ display: 'flex', gap: 12, marginBlock: 20, minHeight: 16 }}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--text-2)', background: i < pin.length ? 'var(--text)' : 'transparent' }} />
        ))}
      </div>
      <span className="tiny" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{t('sec.pinDigits', { n: pin.length })}</span>

      <div aria-live="assertive" style={{ minHeight: 28, textAlign: 'center' }}>
        {waiting ? <Status kind="warn">{t('sec.wait', { seconds: waitSec })}</Status> : msg ? <Status kind="critical">{msg}</Status> : null}
      </div>

      {/* Keypads keep phone order in every language, so the grid is always LTR. */}
      <div dir="ltr" role="group" aria-label={t('sec.enterPin')} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 16, marginTop: 12 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="btn" style={key} disabled={disabled} aria-label={t('sec.digit', { n: d })} onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className="btn ghost" style={key} disabled={disabled || !pin} aria-label={t('sec.delete')} onClick={back}>
          <Icon name="back" size={24} />
        </button>
        <button type="button" className="btn" style={key} disabled={disabled} aria-label={t('sec.digit', { n: '0' })} onClick={() => press('0')}>0</button>
        <button type="button" className="btn primary" style={key} disabled={disabled || !isValidPin(pin)} aria-label={t('sec.unlock')} onClick={() => void submit()}>
          <Icon name="check" size={26} />
        </button>
      </div>

      <button type="button" className="btn ghost" style={{ marginTop: 24 }} aria-expanded={forgot} onClick={() => setForgot((f) => !f)}>{t('sec.forgot')}</button>
      {forgot && (
        <div style={{ maxWidth: 420 }}>
          <div className="tip warn" role="note">
            <Icon name="info" />
            <span>{t('sec.forgotText')}</span>
          </div>
          <button type="button" className="btn danger block" onClick={wipe}><Icon name="trash" size={16} /> {t('sec.wipe')}</button>
        </div>
      )}
    </div>
  );
}

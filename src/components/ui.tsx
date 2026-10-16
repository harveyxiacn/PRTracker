import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/** Visible, keyboard-focusable descendants in DOM order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
}

/** Open sheets, innermost last: only the top one handles Escape / Tab and owns the scroll lock. */
const openSheets: HTMLElement[] = [];

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose without re-running the mount effect (which moves focus).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Return focus to whatever opened the sheet when it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openSheets.push(el);
    const onKey = (e: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      // Focus trap: the page behind the sheet is not reachable with Tab / Shift+Tab.
      const items = focusables(el);
      if (!items.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // Keyboard/mouse: start in the first field. Touch: focus the dialog itself (announced by its
    // title) so the on-screen keyboard doesn't pop up. Never the close button first.
    const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    ((fine && el.querySelector<HTMLElement>('input,select,textarea')) || el).focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openSheets.lastIndexOf(el);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.body.style.overflow = '';
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="grabber" aria-hidden="true" />
        <div className="row spread">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('a11y.close')}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="tiny">{hint}</small>}
    </label>
  );
}

export function Ring({ value, max, color = 'var(--d-pr)', children, label }: { value: number; max: number; color?: string; children?: ReactNode; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

export function Status({ kind, children }: { kind: 'good' | 'warn' | 'critical' | 'info'; children: ReactNode }) {
  const icon = kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return (
    <span className={`badge ${kind === 'info' ? '' : kind}`}>
      <Icon name={icon} />
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

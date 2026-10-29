import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Length of the sheet exit (keep in sync with --dur-out in styles.css). */
const SHEET_OUT_MS = 180;
/** Drag-to-dismiss: release past this share of the sheet height, or flick faster than this (px/ms). */
const DISMISS_SHARE = 0.25;
const DISMISS_VELOCITY = 0.6;

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose without re-running the mount effect (which moves focus).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Dismissals from inside the sheet (close button, backdrop, Escape, drag) play the exit first.
  // A parent can still unmount the sheet directly (e.g. after Save): it then simply disappears.
  const [closing, setClosing] = useState<false | 'slide' | 'flung'>(false);
  const closingRef = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const requestClose = useCallback((how: 'slide' | 'flung' = 'slide') => {
    if (closingRef.current) return; // a second tap during the exit is ignored
    closingRef.current = true;
    if (prefersReducedMotion()) {
      closeRef.current();
      closingRef.current = false;
      return;
    }
    setClosing(how);
    exitTimer.current = window.setTimeout(() => {
      closeRef.current();
      // Still mounted (the parent kept it open): show it again rather than leave an invisible dialog.
      closingRef.current = false;
      setClosing(false);
      if (ref.current) ref.current.style.transform = '';
    }, SHEET_OUT_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(exitTimer.current), []);
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
        requestClose();
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
  // Drag the handle (grabber + title row) down to dismiss; the close button stays the
  // equivalent for keyboard, mouse and switch users. Only the handle drags, so scrolling the
  // form and selecting text never moves the sheet.
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (closingRef.current || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    ref.current.style.transform = d.dy ? `translateY(${d.dy}px)` : '';
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !el) return;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.t0);
    el.style.transition = '';
    if (e.type === 'pointerup' && d.dy > 8 && (d.dy > el.offsetHeight * DISMISS_SHARE || velocity > DISMISS_VELOCITY)) {
      el.style.transform = 'translateY(100%)';
      requestClose('flung');
    } else {
      el.style.transform = ''; // springs back through the CSS transition
    }
  };

  // Portalled to <body>: an ancestor with backdrop-filter/transform (the top bar) would otherwise
  // become the containing block of the fixed backdrop and clip the sheet.
  return createPortal(
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={`sheet${footer ? ' has-footer' : ''}${closing === 'flung' ? ' flung' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="sheet-handle" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="grabber" aria-hidden="true" />
          <div className="row spread">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={() => requestClose()} aria-label={t('a11y.close')}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        {children}
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
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
  // Sweeps in from zero once after mounting (a CSS transition on the arc); later value changes
  // glide from the previous value. The label always carries the real number.
  const [shown, setShown] = useState(prefersReducedMotion);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle className="ring-arc" cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * (shown ? pct : 0)} ${c}`} />
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

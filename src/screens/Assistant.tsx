import { useEffect, useRef, useState } from 'react';
import { answer, suggestions, type AssistantAction, type Memory } from '../assistant/engine';
import { Icon } from '../components/Icon';
import { uid } from '../domain/types';
import { fmtDate } from '../i18n';
import { openExternal } from '../platform';
import { useApp, type Route } from '../store/AppContext';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  actions?: AssistantAction[];
  source?: string;
}

export function AssistantScreen() {
  const { data, update, t, lang, open, go, insights, toast } = useApp();
  const [input, setInput] = useState('');
  const [memory, setMemory] = useState<Memory>({});
  const [msgs, setMsgs] = useState<Msg[]>(() => (data.chat ?? []).map((m) => ({ ...m })));
  const endRef = useRef<HTMLDivElement>(null);

  // Dates in replies are ISO; show them in the user's locale.
  const tt = (key: string, vars?: Record<string, string | number>) =>
    t(key, vars && Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v, lang) : v])));

  useEffect(() => {
    if (msgs.length === 0) {
      const r = answer('', data, tt, open);
      setMsgs([{ role: 'assistant', text: r.text, at: new Date().toISOString(), actions: r.actions }]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const persist = (list: Msg[]) => update((d) => ({ ...d, chat: list.slice(-100).map(({ role, text, at }) => ({ role, text, at })) }));

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const r = answer(text, data, tt, open, undefined, memory, lang);
    setMemory(r.memory ?? {});
    const now = new Date().toISOString();
    const next = [...msgs, { role: 'user' as const, text, at: now }, { role: 'assistant' as const, text: r.text, at: now, actions: r.actions, source: r.source }];
    setMsgs(next);
    persist(next);
    setInput('');
  };

  const act = (a: AssistantAction) => {
    if (a.kind === 'ask') return ask(a.text);
    if (a.kind === 'navigate') return go(a.to as Route);
    if (a.kind === 'addTrip') {
      update((d) => {
        const ongoing = d.trips.find((x) => !x.return && x.departure === a.departure);
        if (ongoing) return { ...d, trips: d.trips.map((x) => (x.id === ongoing.id ? { ...x, return: a.return ?? null } : x)) };
        // Ignore a second tap on the same chip.
        if (d.trips.some((x) => x.departure === a.departure && (x.return ?? null) === (a.return ?? null))) return d;
        return { ...d, trips: [...d.trips, { id: uid(), departure: a.departure, return: a.return ?? null }] };
      });
      toast(t('trips.saved'));
    }
  };

  const chips = suggestions({ t, insights });

  return (
    <>
      <div className="row" style={{ margin: '8px 0 4px' }}>
        <span className="avatar"><Icon name="maple" /></span>
        <div className="grow">
          <b>{t('as.name')}</b>
          <div className="tiny">{t('as.tagline')}</div>
        </div>
        <button className="btn ghost sm" onClick={() => { setMsgs([]); persist([]); setTimeout(() => setMsgs([{ role: 'assistant', text: answer('', data, tt, open).text, at: new Date().toISOString() }]), 0); }}>
          {t('as.clear')}
        </button>
      </div>
      <div className="chat" aria-live="polite" style={{ paddingBottom: 120 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className={`msg ${m.role}`}>
              {m.text}
              {m.source && (
                <div style={{ marginTop: 6 }}>
                  <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => openExternal(m.source!)}>
                    <Icon name="external" size={14} /> {t('as.source')}
                  </button>
                </div>
              )}
            </div>
            {m.actions && m.actions.length > 0 && i === msgs.length - 1 && (
              <div className="chips">
                {m.actions.map((a, j) => (
                  <button key={j} className="chip" onClick={() => act(a)}>
                    {a.kind === 'addTrip' && <Icon name="plus" size={14} />} {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {msgs.length > 0 && !msgs[msgs.length - 1].actions?.length && (
          <div className="chips">
            {chips.map((a, j) => <button key={j} className="chip" onClick={() => act(a)}>{a.label}</button>)}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('as.placeholder')} aria-label={t('as.placeholder')} enterKeyHint="send" />
          <button className="btn primary" type="submit" aria-label={t('as.send')} disabled={!input.trim()}><Icon name="send" /></button>
        </form>
      </div>
    </>
  );
}

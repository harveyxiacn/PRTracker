import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Status } from '../components/ui';
import { diffDays, isISODate } from '../domain/dates';
import { parseTimelineText, type ParsedMilestone } from '../domain/pasteParser';
import { knownOffice, milestonesFor } from '../domain/programs';
import type { CommunityRecord } from '../domain/timeline';
import { openExternal } from '../platform';
import { useApp } from '../store/AppContext';
import { ProgramSelect } from './Timeline';

const REPO = 'https://github.com/harveyxiacn/PRTracker';

/**
 * Paste timeline text from any forum post. Parsed locally; the user reviews every
 * milestone, then either applies it to their own application or shares an anonymised record.
 */
export function PasteTimelineSheet({
  kindHint,
  onClose,
  onApply,
}: {
  kindHint?: string;
  onClose: () => void;
  onApply?: (ms: ParsedMilestone[]) => void;
}) {
  const { t, insights } = useApp();
  const [text, setText] = useState('');
  const [kind, setKind] = useState(kindHint ?? 'ee_cec');
  const [province, setProvince] = useState<string | undefined>();
  const [rows, setRows] = useState<ParsedMilestone[] | null>(null);
  const [parsedOffice, setParsedOffice] = useState<string | undefined>();

  const parse = () => {
    const r = parseTimelineText(text, insights.today, kindHint);
    if (!kindHint && r.kind) setKind(r.kind);
    setProvince(r.province);
    setParsedOffice(r.office);
    setRows(r.milestones);
  };

  const keys = milestonesFor(kind);
  const valid = (rows ?? []).filter((r) => isISODate(r.date));
  const submitted = valid.find((r) => r.key === 'submitted')?.date ?? valid.find((r) => r.key === 'aor')?.date;

  const uncertainLeft = valid.some((r) => r.uncertain);
  const share = () => {
    if (!submitted || uncertainLeft) return;
    const days: Record<string, number> = {};
    for (const r of valid) {
      const d = diffDays(r.date, submitted);
      if (r.key !== 'submitted' && d >= 0) days[r.key] = d;
    }
    const rec: CommunityRecord & { source: string } = { kind, submittedMonth: submitted.slice(0, 7), days, source: 'paste' };
    if (province) rec.province = province;
    const office = parsedOffice && knownOffice(parsedOffice);
    if (office) rec.office = office;
    const url = `${REPO}/issues/new?labels=timeline&template=timeline.yml&title=${encodeURIComponent(`Timeline: ${kind} ${rec.submittedMonth}`)}&record=${encodeURIComponent(JSON.stringify(rec, null, 2))}`;
    // The record travels in the URL, so GitHub receives it when the page opens, not only on submit.
    if (!confirm(t('sec.shareGithubConfirm'))) return;
    void openExternal(url);
  };

  return (
    <Sheet title={t('paste.title')} onClose={onClose}>
      <p className="small muted">{t('paste.help')}</p>
      <Field label={t('paste.text')}>
        <textarea className="input" dir="auto" rows={5} value={text} placeholder="CEC | ITA: Jan 8 2026 | AOR: Jan 20 | BIL: Feb 2 | Medical passed: Mar 1 | PPR: Jun 3, 2026 | eCOPR: Jun 20, 2026" onChange={(e) => setText(e.target.value)} />
      </Field>
      <button className="btn block" disabled={!text.trim()} onClick={parse}><Icon name="sparkle" /> {t('paste.parse')}</button>

      {rows && (
        <>
          {!kindHint && (
            <Field label={t('tl.kind')}>
              <ProgramSelect value={kind} onChange={setKind} />
            </Field>
          )}
          {rows.length === 0 ? (
            <p className="small">{t('paste.none')}</p>
          ) : (
            <table className="data" style={{ marginTop: 8 }}>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <select className="input" value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}>
                        {!keys.includes(r.key) && <option value={r.key}>{t(`ms.${r.key}`)}</option>}
                        {keys.map((k) => <option key={k} value={k}>{t(`ms.${k}`)}</option>)}
                      </select>
                      <div className="tiny" title={r.source}>“{r.source}”</div>
                    </td>
                    <td>
                      <input className="input" type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value, uncertain: false } : x)))} />
                      {r.uncertain && <Status kind="warn">{t('paste.check')}</Status>}
                    </td>
                    <td>
                      <button className="icon-btn" aria-label={t('common.delete')} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="tiny">{t('paste.privacy')}</p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {onApply && <button className="btn primary" disabled={!valid.length} onClick={() => onApply(valid)}>{t('paste.apply')}</button>}
            <button className="btn" disabled={!submitted || uncertainLeft} onClick={share}><Icon name="external" size={16} /> {t('paste.share')}</button>
          </div>
          {uncertainLeft && <p className="tiny">{t('paste.unsure')}</p>}
        </>
      )}
    </Sheet>
  );
}

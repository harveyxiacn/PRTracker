import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Status } from '../components/ui';
import { addMonths, addYears, isISODate, type ISODate } from '../domain/dates';
import { CARD_RENEWAL_MONTHS, absencesToCsv, cardRenewalCheck, presenceReport, type AbsenceRow, type PresenceReport } from '../domain/forms';
import { emptyHistory, historySummary } from '../domain/history';
import { DEFAULT_PERSON_NAME, listPeople } from '../domain/people';
import { fmtDate, fmtNum, type Lang } from '../i18n';
import { isNative, openExternal, saveTextFile } from '../platform';
import { useApp } from '../store/AppContext';

/** IRCC's official physical presence / residency calculator. */
const IRCC_CALC_URL = 'https://eservices.cic.gc.ca/rescalc/resCalcStartNew.do';
const PRESENCE_HOWTO_URL = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/adult-minor/how/physical-presence.html';
const PR_CARD_URL = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants/pr-card/apply-renew-replace.html';

type T = ReturnType<typeof useApp>['t'];

// Print styles are scoped to this screen: they only exist while it is mounted.
const PRINT_CSS = `
.forms-print { background: #fff; color: #000; padding: 16px; border-radius: 12px; margin: 8px 0; font-size: 13px; line-height: 1.4; }
.forms-print h2 { font-size: 18px; margin: 0 0 4px; color: #000; }
.forms-print h3 { font-size: 14px; margin: 16px 0 6px; color: #000; }
.forms-print p { margin: 2px 0; }
.forms-print table { width: 100%; border-collapse: collapse; font-size: 12px; }
.forms-print th, .forms-print td { border: 1px solid #000; padding: 4px 6px; text-align: start; vertical-align: top; color: #000; }
.forms-print th.n, .forms-print td.n { text-align: end; font-variant-numeric: tabular-nums; }
.forms-print a { color: #000; word-break: break-all; }
@media print {
  .topbar, .tabbar, .skip-link, .toast, .no-print { display: none !important; }
  html, body, .app, .main { background: #fff !important; color: #000 !important; }
  .main { padding: 0 !important; max-width: none !important; }
  .forms-print { padding: 0; margin: 0; border-radius: 0; }
  .forms-print tr { break-inside: avoid; }
}
`;

const scroll = { overflowX: 'auto' } as const;

function AbsenceTable({ rows, iso, t, lang }: { rows: AbsenceRow[]; iso: boolean; t: T; lang: Lang }) {
  const d = (x: ISODate) => (iso ? x : fmtDate(x, lang));
  return (
    <div style={scroll}>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">{t('form.col.from')}</th>
            <th scope="col">{t('form.col.to')}</th>
            <th scope="col" className="n">{t('form.col.days')}</th>
            <th scope="col">{t('form.col.destination')}</th>
            <th scope="col">{t('form.col.reason')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.from}|${i}`}>
              <td style={{ whiteSpace: 'nowrap' }}><bdi dir="ltr">{d(r.from)}</bdi></td>
              <td style={{ whiteSpace: 'nowrap' }}><bdi dir="ltr">{d(r.to)}</bdi></td>
              <td className="n"><bdi dir="ltr">{iso ? String(r.days) : fmtNum(r.days, lang)}</bdi></td>
              <td><bdi>{r.destination}</bdi></td>
              <td><bdi>{r.reason}</bdi></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintReport({ report, name, generated, boundary, onClose }: { report: PresenceReport; name?: string; generated: ISODate; boundary: boolean; onClose: () => void }) {
  const { t, lang } = useApp();
  const n = (x: number) => String(x);
  const ref = useRef<HTMLDivElement>(null);
  // The Android/iOS WebViews have no print dialog: share the report as a standalone HTML file,
  // which prints from any browser or file viewer.
  const saveHtml = () => {
    const body = ref.current?.cloneNode(true) as HTMLElement | undefined;
    if (!body) return;
    body.querySelectorAll('.no-print').forEach((x) => x.remove());
    const html = `<!doctype html><html lang="${lang}" dir="${document.documentElement.dir || 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('form.print.title')}</title><style>body{margin:16px;font-family:system-ui,sans-serif}${PRINT_CSS}</style></head><body>${body.outerHTML}</body></html>`;
    void saveTextFile(`pr-tracker-presence-report-${report.applicationDate}.html`, html, 'text/html');
  };
  return (
    <div className="forms-print" ref={ref}>
      <div className="row wrap no-print" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={onClose}><Icon name="back" size={16} /> {t('form.print.back')}</button>
        {isNative() ? (
          <button className="btn sm" onClick={saveHtml}><Icon name="download" size={16} /> {t('common.save')}</button>
        ) : (
          <button className="btn sm" onClick={() => window.print()}><Icon name="download" size={16} /> {t('form.print.again')}</button>
        )}
      </div>
      <h2>{t('form.print.title')}</h2>
      <p>{t('form.print.generated', { date: generated })}</p>
      {name && <p>{t('form.print.name', { name })}</p>}
      <p>{t('form.print.appDate', { date: report.applicationDate })}</p>
      <p>{t('form.print.window', { from: report.windowStart, to: report.windowEnd })}</p>

      <h3>{t('form.print.periods')}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('form.col.status')}</th>
            <th scope="col">{t('form.col.from')}</th>
            <th scope="col">{t('form.col.to')}</th>
            <th scope="col" className="n">{t('form.col.present')}</th>
            <th scope="col" className="n">{t('form.col.credit')}</th>
          </tr>
        </thead>
        <tbody>
          {report.prePrPeriods.map((p, i) => (
            <tr key={`${p.from}|${i}`}>
              <td>{t(`form.kind.${p.kind}`)}</td>
              <td><bdi dir="ltr">{p.from}</bdi></td>
              <td><bdi dir="ltr">{p.to}</bdi></td>
              <td className="n">{n(p.daysPresent)}</td>
              <td className="n">{n(p.daysPresent / 2)}</td>
            </tr>
          ))}
          {report.prPeriodStart && (
            <tr>
              <td>{t('form.kind.pr')}</td>
              <td><bdi dir="ltr">{report.prPeriodStart}</bdi></td>
              <td><bdi dir="ltr">{report.windowEnd}</bdi></td>
              <td className="n">{n(report.prDaysPresent)}</td>
              <td className="n">{n(report.prDaysPresent)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>{t('form.print.absences')}</h3>
      {report.absences.length === 0 ? <p>{t('form.cit.noAbsences')}</p> : <AbsenceTable rows={report.absences} iso t={t} lang={lang} />}

      <h3>{t('form.print.totals')}</h3>
      <table>
        <tbody>
          <tr><th scope="row">{t('form.cit.prDays')}</th><td className="n">{n(report.prDaysPresent)}</td></tr>
          <tr><th scope="row">{t('form.cit.prePrDays')}</th><td className="n">{n(report.prePrDaysPresent)}</td></tr>
          <tr><th scope="row">{t('form.cit.prePrCredit')}</th><td className="n">{n(report.prePrCredit)}</td></tr>
          <tr><th scope="row">{t('form.cit.absenceDays')}</th><td className="n">{n(report.totalAbsenceDays)}</td></tr>
          <tr><th scope="row">{t('form.print.total')}</th><td className="n"><b>{n(report.credited)}</b></td></tr>
          <tr><th scope="row">{t('form.print.required')}</th><td className="n">{n(report.required)}</td></tr>
          <tr><th scope="row">{t('form.print.result')}</th><td className="n">{report.eligible ? t('form.print.yes') : t('form.print.no')}</td></tr>
        </tbody>
      </table>

      <p style={{ marginTop: 12 }}>{t('form.print.dates', { rule: t(boundary ? 'form.print.ruleBoundary' : 'form.print.ruleStrict') })}</p>
      <p style={{ marginTop: 8 }}>
        <b>{t('form.print.disclaimer')}</b> <a href={IRCC_CALC_URL} target="_blank" rel="noopener noreferrer">{IRCC_CALC_URL}</a>
      </p>
    </div>
  );
}

export function FormsScreen() {
  const { data, t, lang, insights, go } = useApp();
  const today = insights.today;
  const boundary = data.settings.boundaryDaysPresent;

  const eligibleDate = insights.citizenship?.eligibleDate;
  const defaultAppDate = eligibleDate && eligibleDate > today ? eligibleDate : today;
  const [appInput, setAppInput] = useState<string>(defaultAppDate);
  const [signInput, setSignInput] = useState<string>(today);
  const [print, setPrint] = useState(false);
  const appDate = isISODate(appInput) ? appInput : defaultAppDate;
  const signDate = isISODate(signInput) ? signInput : today;

  const report = presenceReport(data, appDate, today);
  const card = cardRenewalCheck(data, signDate, today);
  const prDate = data.profile.prDate;
  const isPr = !!prDate;
  const prOnAppDate = !!prDate && prDate <= appDate;
  const person = listPeople(data).find((p) => p.active)?.name;
  const name = person && person !== DEFAULT_PERSON_NAME ? person : undefined;

  const history = historySummary(data.history ?? emptyHistory(), 'citizenship', today, !!data.historyMonthly);
  const gapCount = history.addressGaps.length + history.activityGaps.length;

  // Print once the report is on screen; return to the normal view afterwards.
  useEffect(() => {
    if (!print || isNative()) return;
    const done = () => setPrint(false);
    window.addEventListener('afterprint', done);
    const id = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('afterprint', done);
    };
  }, [print]);

  const exportCsv = () => saveTextFile(`pr-tracker-absences-${appDate}.csv`, '\uFEFF' + absencesToCsv(report.absences), 'text/csv');

  if (print) {
    return (
      <>
        <style>{PRINT_CSS}</style>
        <PrintReport report={report} name={name} generated={today} boundary={boundary} onClose={() => setPrint(false)} />
      </>
    );
  }

  const fd = (d: ISODate) => fmtDate(d, lang);
  const num = (x: number) => fmtNum(x, lang);
  const anniversary = prDate ? addYears(prDate, 5) : undefined;
  const expired = !!card.cardExpiry && card.cardExpiry < signDate;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <p className="small muted">{t('form.intro')}</p>

      {/* 1. Citizenship */}
      <section className="card">
        <h2><Icon name="flag" /> {t('form.cit.title')}</h2>
        <Field label={t('form.cit.date')} hint={t('form.cit.dateHint')}>
          <input className="input" type="date" value={appInput} onChange={(e) => setAppInput(e.target.value)} />
        </Field>
        <p className="small muted">{t('form.cit.window', { from: fd(report.windowStart), to: fd(report.windowEnd) })}</p>

        <div className="label">{t('form.cit.credited')}</div>
        <div className="hero-num" style={{ fontSize: 32 }}>
          <bdi dir="ltr">{t('form.cit.ofRequired', { n: num(report.credited), required: num(report.required) })}</bdi>
        </div>
        <div className="progress" role="presentation" style={{ margin: '8px 0' }}>
          <div style={{ width: `${Math.min(100, (report.credited / report.required) * 100)}%` }} />
        </div>
        <div style={{ margin: '8px 0' }}>
          {report.eligible ? (
            <Status kind="good">{t('form.cit.eligible')}</Status>
          ) : report.credited >= report.required ? (
            <Status kind="warn">{t('form.cit.notPr')}</Status>
          ) : (
            <Status kind="warn">{t('form.cit.short', { n: num(report.required - report.credited) })}</Status>
          )}
        </div>
        {!prOnAppDate && report.credited < report.required && <p className="tiny">{t('form.cit.notPr')}</p>}

        <table className="data">
          <tbody>
            <tr><th scope="row">{t('form.cit.prDays')}</th><td className="n">{num(report.prDaysPresent)}</td></tr>
            {report.prePrDaysPresent > 0 && (
              <>
                <tr><th scope="row">{t('form.cit.prePrDays')}</th><td className="n">{num(report.prePrDaysPresent)}</td></tr>
                <tr><th scope="row">{t('form.cit.prePrCredit')}</th><td className="n">{num(report.prePrCredit)}</td></tr>
              </>
            )}
            <tr><th scope="row">{t('form.cit.absenceDays')}</th><td className="n">{num(report.totalAbsenceDays)}</td></tr>
          </tbody>
        </table>

        <h3>{t('form.cit.absences')}</h3>
        <p className="tiny">{t('form.cit.absencesHelp')}</p>
        {report.absences.length === 0 ? (
          <p className="small muted">{t('form.cit.noAbsences')}</p>
        ) : (
          <AbsenceTable rows={report.absences} iso={false} t={t} lang={lang} />
        )}

        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={exportCsv}><Icon name="download" size={16} /> {t('form.cit.exportCsv')}</button>
          <button className="btn sm" onClick={() => setPrint(true)}><Icon name="external" size={16} /> {t('form.cit.print')}</button>
        </div>
        <div className="tip info"><Icon name="info" /><div>{t('form.cit.calcTip')}</div></div>
        <div className="row wrap">
          <button className="btn ghost sm" onClick={() => openExternal(IRCC_CALC_URL)}><Icon name="external" size={16} /> {t('form.card.calc')}</button>
          <button className="btn ghost sm" onClick={() => openExternal(PRESENCE_HOWTO_URL)}><Icon name="external" size={16} /> {t('form.cit.howTo')}</button>
        </div>
      </section>

      {/* 2. PR card renewal */}
      <section className="card">
        <h2><Icon name="card" /> {t('form.card.title')}</h2>
        <Field label={t('form.card.date')}>
          <input className="input" type="date" value={signInput} onChange={(e) => setSignInput(e.target.value)} />
        </Field>
        {!isPr ? (
          <div className="tip info"><Icon name="info" /><div>{t('form.card.notPr')}</div></div>
        ) : (
          <>
            <p className="small">{t('form.card.present', { n: num(card.presentDays), required: num(card.required), from: fd(card.windowStart) })}</p>
            <div style={{ margin: '8px 0' }}>
              {card.compliant ? <Status kind="good">{t('form.card.ok')}</Status> : <Status kind="critical">{t('form.card.fail', { n: num(card.shortfall) })}</Status>}
            </div>
            {anniversary && signDate < anniversary && <p className="tiny">{t('form.card.under5', { date: fd(anniversary) })}</p>}
            {!card.compliant && <div className="tip critical"><Icon name="alert" /><div>{t('form.card.failHelp')}</div></div>}
          </>
        )}
        <div style={{ margin: '8px 0' }}>
          {!card.cardExpiry ? (
            <p className="small muted">{t('form.card.noExpiry')}</p>
          ) : expired ? (
            <Status kind="warn">{t('form.card.expired', { date: fd(card.cardExpiry) })}</Status>
          ) : card.canApplyNow ? (
            <Status kind="good">{t('form.card.applyNow', { date: fd(card.cardExpiry) })}</Status>
          ) : (
            <Status kind="info">{t('form.card.applyFrom', { date: fd(addMonths(card.cardExpiry, -CARD_RENEWAL_MONTHS)) })}</Status>
          )}
        </div>
        <div className="row wrap">
          <button className="btn ghost sm" onClick={() => openExternal(PR_CARD_URL)}><Icon name="external" size={16} /> {t('form.card.ircc')}</button>
          <button className="btn ghost sm" onClick={() => openExternal(IRCC_CALC_URL)}><Icon name="external" size={16} /> {t('form.card.calc')}</button>
        </div>
        <div className="tip info">
          <Icon name="info" />
          <div>
            {t('form.card.docs')}{' '}
            <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => go('documents')}>{t('form.card.openDocs')}</button>
          </div>
        </div>
      </section>

      {/* 3. Personal history */}
      <section className="card">
        <h2><Icon name="home2" /> {t('form.hist.title')}</h2>
        <p className="small muted">{t('form.hist.body')}</p>
        <div style={{ margin: '8px 0' }}>
          {gapCount === 0 ? <Status kind="good">{t('form.hist.none')}</Status> : <Status kind="warn">{t('form.hist.gaps', { n: num(gapCount) })}</Status>}
        </div>
        <button className="btn block" onClick={() => go('history')}>{t('form.hist.open')} <Icon name="chevron" size={16} /></button>
      </section>
    </>
  );
}

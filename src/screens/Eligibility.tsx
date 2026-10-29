import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented, Status } from '../components/ui';
import { calculateCrs, checkPrograms, minClb, toClb, type Education, type LanguageScores } from '../domain/crs';
import { CrsPlannerCard } from './CrsPlanner';
import { CRS_FORM_DEFAULT as DEFAULT, formToCrsInput, type CrsForm as Form } from '../domain/crsForm';
import { OCCUPATION_CATEGORIES, standings, type DrawCategory } from '../domain/draws';
import { CATEGORY_ORDER, PROGRAMS } from '../domain/programs';
import { uid } from '../domain/types';
import { fmtDate } from '../i18n';
import { openExternal } from '../platform';
import { fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';

/** Number input that keeps the raw text while typing ("6.", "") and commits a number. */
function NumInput({ value, onChange, min, max, step }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="input" type="text" inputMode="decimal" value={text} data-min={min} data-max={max} data-step={step}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(v)) return;
        setText(v);
        if (v !== '' && v !== '.' && !v.endsWith('.')) onChange(Math.min(max ?? Infinity, Number(v)));
      }}
      onBlur={() => {
        const n = text === '' || text === '.' ? 0 : Number(text);
        setText(String(n));
        onChange(Math.min(max ?? Infinity, n));
      }}
    />
  );
}

const EDUS: Education[] = ['none', 'secondary', 'one_year', 'two_year', 'bachelor', 'two_or_more', 'master', 'phd'];
const ABILITIES = ['listening', 'reading', 'writing', 'speaking'] as const;

export function EligibilityScreen() {
  const { data, update, t, lang, open, insights, go, toast } = useApp();
  const f: Form = { ...DEFAULT, ...(data.eligibilityForm as Partial<Form> | undefined) };
  // Merge into the latest stored form, not the one captured at render, so quick edits don't drop each other.
  const set = (patch: Partial<Form>) =>
    update((d) => ({ ...d, eligibilityForm: { ...DEFAULT, ...(d.eligibilityForm as Partial<Form> | undefined), ...patch } }));

  const clb1 = toClb(f.testKind, f.lang1);
  const crsInput = useMemo(() => formToCrsInput(f), [JSON.stringify(f)]); // eslint-disable-line react-hooks/exhaustive-deps
  const crs = useMemo(() => calculateCrs(crsInput), [crsInput]);
  const programs = checkPrograms({
    firstLanguage: clb1, teer: f.teer, canadianSkilledMonthsLast3y: f.cdnSkilledMonths, skilledMonthsLast10y: f.skilledMonths10y,
    tradesMonthsLast5y: f.tradesMonths, education: f.education, hasEcaOrCanadianCredential: f.eca, age: f.age, hasJobOffer: f.jobOffer,
    certificateOfQualification: f.coq, adaptability: f.adapt, secondLanguage: f.hasLang2 ? f.lang2 : undefined, fundsExempt: f.fundsExempt,
  });

  const num = (label: string, value: number, onChange: (n: number) => void, opts: { min?: number; max?: number; step?: number; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint}>
      <NumInput value={Number.isFinite(value) ? value : 0} min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1} onChange={onChange} />
    </Field>
  );
  const check = (label: string, value: boolean, onChange: (b: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
  );
  const eduSelect = (label: string, value: Education, onChange: (e: Education) => void) => (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Education)}>
        {EDUS.map((e) => <option key={e} value={e}>{t(`edu.${e}`)}</option>)}
      </select>
    </Field>
  );
  const langGrid = (scores: LanguageScores, onChange: (s: LanguageScores) => void, step: number) => (
    <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {ABILITIES.map((a) => (
        <Field key={a} label={t(`lang.${a}`)}>
          <NumInput step={step} min={0} max={f.testKind === 'ielts' ? 9 : 12} value={scores[a]} onChange={(n) => onChange({ ...scores, [a]: n })} />
        </Field>
      ))}
    </div>
  );

  const total = crs.totals.total;
  // Draw categories you can be invited in: program eligibility, PNP, French, plus ticked occupations.
  // A saved choice of a past category (e.g. agriculture) no longer counts and can't be un-ticked.
  const eligibleCats = new Set<DrawCategory>(f.drawCats.filter((c) => OCCUPATION_CATEGORIES.includes(c)));
  for (const p of programs) if (p.eligible) eligibleCats.add(p.program);
  if (f.pnp) eligibleCats.add('pnp');
  const french = f.firstIsFrench ? clb1 : f.hasLang2 ? f.lang2 : undefined;
  if (french && minClb(french) >= 7) eligibleCats.add('french');
  const stand = standings(open.draws ?? [], eligibleCats, total, insights.today);
  const track = (kind: string) => {
    const id = uid();
    update((d) => ({ ...d, applications: [...d.applications, { id, kind, submitted: null, milestones: [] }] }));
    toast(t('elig.tracking'));
    go('timeline', id);
  };

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <Segmented label={t('nav.eligibility')} value={f.tab} onChange={(tab) => set({ tab })} options={[{ value: 'crs', label: t('elig.crsTab') }, { value: 'programs', label: t('elig.programsTab') }, { value: 'all', label: t('elig.allTab') }]} />
      </div>

      {f.tab === 'all' && (
        <>
          <p className="small muted" style={{ marginTop: 12 }}>{t('elig.allIntro')}</p>
          {CATEGORY_ORDER.map((cat) => (
            <section key={cat} className="card">
              <h2>{t(`prog.cat.${cat}`)}</h2>
              <ul className="list">
                {PROGRAMS.filter((p) => p.category === cat && p.id !== 'spousal' && p.id !== 'other').map((p) => (
                  <li key={p.id} style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <b>{t(`app.kind.${p.id}`)}</b> {p.status && <Status kind="warn">{t(`prog.status.${p.status}`)}</Status>}
                      <div className="small muted">{t(`prog.desc.${p.id}`)}</div>
                      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                        <button className="btn sm" onClick={() => track(p.id)}><Icon name="plus" size={14} /> {t('elig.track')}</button>
                        <button className="btn ghost sm" onClick={() => openExternal(p.url)}><Icon name="external" size={14} /> IRCC</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="tiny">{t('elig.allNote')}</p>
        </>
      )}
      {f.tab !== 'all' && (<>

      <section className="card" aria-live="polite">
        <div className="row spread">
          <div>
            <div className="label">{t('elig.crsScore')}</div>
            <div className="hero-num">{fmtNum(total, lang)}</div>
          </div>
          <div className="small" style={{ textAlign: 'end' }}>
            {programs.filter((p) => p.eligible).length > 0
              ? programs.filter((p) => p.eligible).map((p) => <div key={p.program}><Status kind="good">{t(`elig.program.${p.program}`)}</Status></div>)
              : <Status kind="warn">{t('elig.noProgram')}</Status>}
          </div>
        </div>
        <table className="data" style={{ marginTop: 10 }}>
          <tbody>
            <tr><td>{t('elig.core')}</td><td className="n">{crs.totals.core}</td></tr>
            {f.hasSpouse && <tr><td>{t('elig.spouseFactors')}</td><td className="n">{crs.totals.spouse}</td></tr>}
            <tr><td>{t('elig.transfer')}</td><td className="n">{crs.totals.transferability}</td></tr>
            <tr><td>{t('elig.additional')}</td><td className="n">{crs.totals.additional}</td></tr>
          </tbody>
        </table>
        {stand.length > 0 && (
          <>
            <h3>{t('elig.yourDraws')}</h3>
            <table className="data">
              <thead><tr><th>{t('elig.drawType')}</th><th>{t('elig.drawDate')}</th><th className="n">CRS</th><th className="n" /></tr></thead>
              <tbody>
                {stand.map((x) => (
                  <tr key={x.category}>
                    <td>{t(`draw.${x.category}`)}<div className="tiny">{t('elig.draws12m', { n: x.count12m, min: x.min12m })}</div></td>
                    <td>{fmtDate(x.latest.date, lang)}</td>
                    <td className="n">{x.latest.crs}</td>
                    <td className="n">{x.margin >= 0 ? <Status kind="good">+{x.margin}</Status> : <span className="tiny">{x.margin}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <h3>{t('elig.occupations')}</h3>
        <div className="chips">
          {OCCUPATION_CATEGORIES.map((c) => {
            const on = f.drawCats.includes(c);
            return (
              <button key={c} className="chip" aria-pressed={on} onClick={() => set({ drawCats: on ? f.drawCats.filter((x) => x !== c) : [...f.drawCats, c] })}>
                {t(`draw.${c}`)}
              </button>
            );
          })}
        </div>
        <p className="tiny">{t('elig.disclaimer')}</p>
      </section>

      {f.tab === 'crs' && <CrsPlannerCard input={crsInput} draws={open.draws} />}

      <section className="card">
        <h2>{t('elig.aboutYou')}</h2>
        <div className="grid2">
          {num(t('elig.age'), f.age, (age) => set({ age }), { min: 16, max: 80 })}
          {eduSelect(t('elig.education'), f.education, (education) => set({ education }))}
        </div>
        {check(t('elig.hasSpouse'), f.hasSpouse, (hasSpouse) => set({ hasSpouse }))}
        <h3>{t('elig.firstLang')}</h3>
        <Segmented label={t('elig.testKind')} value={f.testKind} onChange={(testKind) => set({ testKind })} options={[{ value: 'ielts', label: 'IELTS' }, { value: 'celpip', label: 'CELPIP' }, { value: 'clb', label: 'CLB/NCLC' }]} />
        {langGrid(f.lang1, (lang1) => set({ lang1 }), f.testKind === 'ielts' ? 0.5 : 1)}
        <div className="tiny">{t('elig.clbIs', { l: clb1.listening, r: clb1.reading, w: clb1.writing, s: clb1.speaking })}</div>
        {check(t('elig.firstIsFrench'), f.firstIsFrench, (firstIsFrench) => set({ firstIsFrench }))}
        {check(t('elig.hasLang2'), f.hasLang2, (hasLang2) => set({ hasLang2 }))}
        {f.hasLang2 && langGrid(f.lang2, (lang2) => set({ lang2 }), 1)}
        <h3>{t('elig.work')}</h3>
        <div className="grid2">
          {num(t('elig.cdnWork'), f.canadianWorkYears, (canadianWorkYears) => set({ canadianWorkYears }), { max: 10 })}
          {num(t('elig.foreignWork'), f.foreignWorkYears, (foreignWorkYears) => set({ foreignWorkYears }), { max: 30 })}
        </div>
        {check(t('elig.coq'), f.coq, (coq) => set({ coq }))}
        <h3>{t('elig.extra')}</h3>
        {check(t('elig.pnp'), f.pnp, (pnp) => set({ pnp }))}
        {check(t('elig.sibling'), f.sibling, (sibling) => set({ sibling }))}
        <Field label={t('elig.cdnEdu')}>
          <select className="input" value={f.canadianEducation} onChange={(e) => set({ canadianEducation: Number(e.target.value) as 0 | 1 | 3 })}>
            <option value={0}>{t('elig.cdnEdu0')}</option>
            <option value={1}>{t('elig.cdnEdu1')}</option>
            <option value={3}>{t('elig.cdnEdu3')}</option>
          </select>
        </Field>
      </section>

      {f.hasSpouse && (
        <section className="card">
          <h2>{t('elig.spouse')}</h2>
          {eduSelect(t('elig.education'), f.spouseEducation, (spouseEducation) => set({ spouseEducation }))}
          <h3>{t('elig.spouseLang')}</h3>
          {langGrid(f.spouseLang, (spouseLang) => set({ spouseLang }), 1)}
          {num(t('elig.cdnWork'), f.spouseCanadianWork, (spouseCanadianWork) => set({ spouseCanadianWork }), { max: 10 })}
        </section>
      )}

      {f.tab === 'programs' && (
        <section className="card">
          <h2><Icon name="target" /> {t('elig.programsTab')}</h2>
          <div className="grid2">
            <Field label={t('elig.teer')}>
              <select className="input" value={f.teer} onChange={(e) => set({ teer: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>TEER {n}</option>)}
              </select>
            </Field>
            {num(t('elig.cdnSkilledMonths'), f.cdnSkilledMonths, (cdnSkilledMonths) => set({ cdnSkilledMonths }), { max: 36 })}
            {num(t('elig.skilledMonths10y'), f.skilledMonths10y, (skilledMonths10y) => set({ skilledMonths10y }), { max: 120 })}
            {num(t('elig.tradesMonths'), f.tradesMonths, (tradesMonths) => set({ tradesMonths }), { max: 60 })}
          </div>
          {check(t('elig.eca'), f.eca, (eca) => set({ eca }))}
          {check(t('elig.jobOffer'), f.jobOffer, (jobOffer) => set({ jobOffer }))}
          {check(t('elig.fundsExempt'), f.fundsExempt, (fundsExempt) => set({ fundsExempt }))}
          <h3>{t('elig.adaptability')}</h3>
          {(Object.keys(f.adapt) as (keyof Form['adapt'])[]).map((k) => (
            <div key={k}>{check(t(`elig.adapt.${k}`), f.adapt[k], (v) => set({ adapt: { ...f.adapt, [k]: v } }))}</div>
          ))}
          {programs.map((p) => (
            <div key={p.program} className="card" style={{ boxShadow: 'none' }}>
              <div className="row spread">
                <b>{t(`elig.program.${p.program}`)}</b>
                {p.eligible ? <Status kind="good">{t('elig.meets')}</Status> : <Status kind="warn">{t('elig.notYet')}</Status>}
              </div>
              {p.points !== undefined && <div className="small muted">{t('elig.fswPoints', { n: p.points })}</div>}
              <ul className="small" style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                {p.reasons.map((r) => <li key={r}>{t(r)}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}
      </>)}
    </>
  );
}

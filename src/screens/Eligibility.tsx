import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented, Status } from '../components/ui';
import { calculateCrs, checkPrograms, toClb, type Education, type LanguageScores, type TestKind } from '../domain/crs';
import { fmtNum } from '../i18n';
import { useApp } from '../store/AppContext';

interface Form {
  tab: 'crs' | 'programs';
  age: number;
  hasSpouse: boolean;
  education: Education;
  testKind: TestKind;
  lang1: LanguageScores;
  hasLang2: boolean;
  lang2: LanguageScores; // CLB/NCLC
  firstIsFrench: boolean;
  canadianWorkYears: number;
  foreignWorkYears: number;
  coq: boolean;
  spouseEducation: Education;
  spouseLang: LanguageScores;
  spouseCanadianWork: number;
  pnp: boolean;
  sibling: boolean;
  canadianEducation: 0 | 1 | 3;
  // programs
  teer: number;
  cdnSkilledMonths: number;
  skilledMonths10y: number;
  tradesMonths: number;
  eca: boolean;
  jobOffer: boolean;
  fundsExempt: boolean;
  adapt: Record<'spouseLanguageClb4' | 'pastStudyInCanada' | 'spousePastStudyInCanada' | 'pastWorkInCanada' | 'spousePastWorkInCanada' | 'relativeInCanada', boolean>;
}

const L = (n: number): LanguageScores => ({ listening: n, reading: n, writing: n, speaking: n });

const DEFAULT: Form = {
  tab: 'crs', age: 29, hasSpouse: false, education: 'bachelor', testKind: 'ielts', lang1: { listening: 7, reading: 6.5, writing: 6.5, speaking: 6.5 },
  hasLang2: false, lang2: L(0), firstIsFrench: false, canadianWorkYears: 1, foreignWorkYears: 0, coq: false,
  spouseEducation: 'bachelor', spouseLang: L(0), spouseCanadianWork: 0, pnp: false, sibling: false, canadianEducation: 0,
  teer: 1, cdnSkilledMonths: 12, skilledMonths10y: 12, tradesMonths: 0, eca: true, jobOffer: false, fundsExempt: false,
  adapt: { spouseLanguageClb4: false, pastStudyInCanada: false, spousePastStudyInCanada: false, pastWorkInCanada: false, spousePastWorkInCanada: false, relativeInCanada: false },
};

const EDUS: Education[] = ['none', 'secondary', 'one_year', 'two_year', 'bachelor', 'two_or_more', 'master', 'phd'];
const ABILITIES = ['listening', 'reading', 'writing', 'speaking'] as const;

export function EligibilityScreen() {
  const { data, update, t, lang, open } = useApp();
  const f: Form = { ...DEFAULT, ...(data.eligibilityForm as Partial<Form> | undefined) };
  const set = (patch: Partial<Form>) => update((d) => ({ ...d, eligibilityForm: { ...f, ...patch } }));

  const clb1 = toClb(f.testKind, f.lang1);
  const crs = useMemo(
    () =>
      calculateCrs({
        age: f.age, hasSpouse: f.hasSpouse, education: f.education, firstLanguage: clb1,
        secondLanguage: f.hasLang2 ? f.lang2 : undefined, firstLanguageIsFrench: f.firstIsFrench,
        canadianWorkYears: f.canadianWorkYears, foreignWorkYears: f.foreignWorkYears, certificateOfQualification: f.coq,
        spouse: f.hasSpouse ? { education: f.spouseEducation, language: f.spouseLang, canadianWorkYears: f.spouseCanadianWork } : undefined,
        provincialNomination: f.pnp, siblingInCanada: f.sibling, canadianEducation: f.canadianEducation,
      }),
    [JSON.stringify(f)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const programs = checkPrograms({
    firstLanguage: clb1, teer: f.teer, canadianSkilledMonthsLast3y: f.cdnSkilledMonths, skilledMonthsLast10y: f.skilledMonths10y,
    tradesMonthsLast5y: f.tradesMonths, education: f.education, hasEcaOrCanadianCredential: f.eca, age: f.age, hasJobOffer: f.jobOffer,
    certificateOfQualification: f.coq, adaptability: f.adapt, secondLanguage: f.hasLang2 ? f.lang2 : undefined, fundsExempt: f.fundsExempt,
  });

  const num = (label: string, value: number, onChange: (n: number) => void, opts: { min?: number; max?: number; step?: number; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint}>
      <input className="input" type="number" inputMode="decimal" min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />
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
          <input className="input" type="number" inputMode="decimal" step={step} min={0} max={f.testKind === 'ielts' ? 9 : 12} value={scores[a]} onChange={(e) => onChange({ ...scores, [a]: Number(e.target.value) })} />
        </Field>
      ))}
    </div>
  );

  const draws = open.draws?.slice(0, 8) ?? [];
  const total = crs.totals.total;

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <Segmented label={t('nav.eligibility')} value={f.tab} onChange={(tab) => set({ tab })} options={[{ value: 'crs', label: t('elig.crsTab') }, { value: 'programs', label: t('elig.programsTab') }]} />
      </div>

      <section className="card" aria-live="polite">
        <div className="row spread">
          <div>
            <div className="label">{t('elig.crsScore')}</div>
            <div className="hero-num">{fmtNum(total, lang)}</div>
          </div>
          <div className="small" style={{ textAlign: 'right' }}>
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
        {draws.length > 0 && (
          <>
            <h3>{t('elig.recentDraws')}</h3>
            <table className="data">
              <thead><tr><th>{t('elig.drawDate')}</th><th>{t('elig.drawType')}</th><th className="n">CRS</th><th className="n" /></tr></thead>
              <tbody>
                {draws.map((d) => (
                  <tr key={d.number + d.date}>
                    <td>{d.date}</td><td>{d.name}</td><td className="n">{d.crs}</td>
                    <td className="n">{total >= d.crs ? <Status kind="good">{t('elig.above')}</Status> : <span className="tiny">−{d.crs - total}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="tiny">{t('elig.disclaimer')}</p>
      </section>

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
              <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {p.reasons.map((r) => <li key={r}>{t(r)}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

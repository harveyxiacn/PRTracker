// Catalogue of Canadian immigration programs the app can track: category, milestone
// template, final milestone, fallback processing time and which IRCC open-data series
// (if any) gives a live processing time. Labels/descriptions live in i18n under
// `app.kind.<id>` and `prog.desc.<id>`.

export type ProgramCategory =
  | 'express_entry'
  | 'pnp'
  | 'quebec'
  | 'pilots'
  | 'family'
  | 'humanitarian'
  | 'temporary'
  | 'status';

export type TemplateId = 'ee' | 'pnp_ee' | 'pnp_base' | 'quebec' | 'endorsed' | 'job_offer' | 'startup' | 'family' | 'family_inland' | 'pgp' | 'protected' | 'hc' | 'temporary' | 'citizenship' | 'pr_card' | 'prtd' | 'other';

export const TEMPLATES: Record<TemplateId, string[]> = {
  ee: ['profile', 'ita', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  pnp_ee: ['profile', 'eoi', 'pnp_invite', 'pnp_submitted', 'nomination', 'ita', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  pnp_base: ['eoi', 'pnp_invite', 'pnp_submitted', 'nomination', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  quebec: ['eoi', 'qc_invite', 'csq_submitted', 'csq_issued', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  endorsed: ['job_offer', 'endorsement', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  job_offer: ['job_offer', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  startup: ['letter_support', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  family: ['submitted', 'aor', 'sponsor_approved', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  family_inland: ['submitted', 'aor', 'sponsor_approved', 'owp', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  pgp: ['interest_form', 'pgp_invite', 'submitted', 'aor', 'sponsor_approved', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'passport_sent', 'passport_returned', 'portal1', 'portal2', 'copr', 'landed'],
  protected: ['submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'copr', 'landed'],
  hc: ['submitted', 'aor', 'stage1', 'biometrics_request', 'biometrics', 'medical', 'background', 'copr', 'landed'],
  temporary: ['submitted', 'biometrics_request', 'biometrics', 'medical', 'decision', 'passport_request', 'permit_issued'],
  citizenship: ['submitted', 'aor', 'test_invite', 'test', 'interview', 'oath_invite', 'oath'],
  pr_card: ['submitted', 'aor', 'card_mailed', 'card_received'],
  prtd: ['submitted', 'aor', 'decision', 'card_received'],
  other: ['submitted', 'aor', 'decision'],
};

export const TEMPLATE_FINAL: Record<TemplateId, string> = {
  ee: 'copr', pnp_ee: 'copr', pnp_base: 'copr', quebec: 'copr', endorsed: 'copr', job_offer: 'copr', startup: 'copr',
  family: 'copr', family_inland: 'copr', pgp: 'copr', protected: 'copr', hc: 'copr',
  temporary: 'decision', citizenship: 'oath', pr_card: 'card_received', prtd: 'decision', other: 'decision',
};

/** IRCC open-data series published per country of residence (data-ptime-en.json). */
export type IrccCountrySeries = 'visitor-outside-canada' | 'supervisa' | 'study' | 'work' | 'child_dependent' | 'child_adopted';

export interface Program {
  id: string;
  category: ProgramCategory;
  template: TemplateId;
  /** Offline estimate in days (IRCC service standard where one exists). */
  fallbackDays: number;
  /** Uses a province/territory selector (PNP). */
  province?: boolean;
  /** IRCC per-country series; the app asks for the applicant's country. */
  countrySeries?: IrccCountrySeries;
  /** Key in the normalised IRCC `times` map (non-country series). */
  irccTimeKey?: string;
  /** Intake status when not simply open (verified on official sites; see docs/RULES.md). */
  status?: 'paused' | 'closed' | 'changing';
  url: string;
}

const IRCC = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/';

export const PROGRAMS: Program[] = [
  // Express Entry
  { id: 'ee_cec', category: 'express_entry', template: 'ee', fallbackDays: 183, url: IRCC + 'immigrate-canada/express-entry.html' },
  { id: 'ee_fsw', category: 'express_entry', template: 'ee', fallbackDays: 183, url: IRCC + 'immigrate-canada/express-entry.html' },
  { id: 'ee_fst', category: 'express_entry', template: 'ee', fallbackDays: 183, url: IRCC + 'immigrate-canada/express-entry.html' },
  // Provincial Nominee Program
  { id: 'pnp_ee', category: 'pnp', template: 'pnp_ee', fallbackDays: 183, province: true, url: IRCC + 'immigrate-canada/provincial-nominees.html' },
  { id: 'pnp_base', category: 'pnp', template: 'pnp_base', fallbackDays: 365, province: true, url: IRCC + 'immigrate-canada/provincial-nominees.html' },
  // Quebec
  { id: 'qc_skilled', category: 'quebec', template: 'quebec', fallbackDays: 365, url: IRCC + 'immigrate-canada/quebec-skilled-workers.html' },
  { id: 'qc_peq', category: 'quebec', template: 'quebec', fallbackDays: 365, status: 'changing', url: IRCC + 'immigrate-canada/quebec-skilled-workers.html' },
  // Pilots and other economic programs
  { id: 'aip', category: 'pilots', template: 'endorsed', fallbackDays: 183, status: 'changing', url: IRCC + 'immigrate-canada/atlantic-immigration.html' },
  { id: 'rcip', category: 'pilots', template: 'endorsed', fallbackDays: 365, url: IRCC + 'immigrate-canada/rural-franco-pilots.html' },
  { id: 'fcip', category: 'pilots', template: 'endorsed', fallbackDays: 365, url: IRCC + 'immigrate-canada/rural-franco-pilots.html' },
  { id: 'caregiver', category: 'pilots', template: 'job_offer', fallbackDays: 365, status: 'closed', url: IRCC + 'immigrate-canada/caregivers.html' },
  { id: 'startup', category: 'pilots', template: 'startup', fallbackDays: 1000, status: 'closed', url: IRCC + 'immigrate-canada/start-visa.html' },
  // Family
  { id: 'spousal_out', category: 'family', template: 'family', fallbackDays: 365, url: IRCC + 'immigrate-canada/family-sponsorship/spouse-partner-children.html' },
  { id: 'spousal_in', category: 'family', template: 'family_inland', fallbackDays: 365, url: IRCC + 'immigrate-canada/family-sponsorship/spouse-partner-children.html' },
  { id: 'spousal', category: 'family', template: 'family', fallbackDays: 365, url: IRCC + 'immigrate-canada/family-sponsorship/spouse-partner-children.html' },
  { id: 'child', category: 'family', template: 'family', fallbackDays: 365, countrySeries: 'child_dependent', url: IRCC + 'immigrate-canada/family-sponsorship/spouse-partner-children.html' },
  { id: 'pgp', category: 'family', template: 'pgp', fallbackDays: 730, status: 'paused', url: IRCC + 'immigrate-canada/family-sponsorship/sponsor-parents-grandparents.html' },
  // Humanitarian
  { id: 'protected', category: 'humanitarian', template: 'protected', fallbackDays: 730, url: IRCC + 'immigrate-canada/protected-persons/eligibility.html' },
  { id: 'hc', category: 'humanitarian', template: 'hc', fallbackDays: 730, url: IRCC + 'immigrate-canada/humanitarian-compassionate-grounds.html' },
  // Temporary residence (common steps toward PR)
  { id: 'study_permit', category: 'temporary', template: 'temporary', fallbackDays: 70, countrySeries: 'study', url: IRCC + 'study-canada/study-permit.html' },
  { id: 'work_permit', category: 'temporary', template: 'temporary', fallbackDays: 120, countrySeries: 'work', url: IRCC + 'work-canada/permit.html' },
  { id: 'visitor_visa', category: 'temporary', template: 'temporary', fallbackDays: 30, countrySeries: 'visitor-outside-canada', url: IRCC + 'visit-canada.html' },
  { id: 'super_visa', category: 'temporary', template: 'temporary', fallbackDays: 120, countrySeries: 'supervisa', url: IRCC + 'visit-canada/parent-grandparent-super-visa.html' },
  { id: 'study_ext', category: 'temporary', template: 'temporary', fallbackDays: 60, irccTimeKey: 'study_ext', url: IRCC + 'study-canada/extend-study-permit.html' },
  { id: 'work_ext', category: 'temporary', template: 'temporary', fallbackDays: 120, irccTimeKey: 'work_ext', url: IRCC + 'work-canada/extend/eligibility.html' },
  { id: 'pgwp', category: 'temporary', template: 'temporary', fallbackDays: 120, irccTimeKey: 'work_ext', url: IRCC + 'study-canada/work/after-graduation.html' },
  { id: 'owp_spouse', category: 'temporary', template: 'temporary', fallbackDays: 120, irccTimeKey: 'work_ext', url: IRCC + 'work-canada/special-instructions/spouses-dependent-children/eligibility.html' },
  { id: 'visitor_record', category: 'temporary', template: 'temporary', fallbackDays: 180, irccTimeKey: 'visitor_ext', url: IRCC + 'visit-canada/extend-stay.html' },
  // Status documents
  { id: 'citizenship', category: 'status', template: 'citizenship', fallbackDays: 365, url: IRCC + 'canadian-citizenship/become-canadian-citizen.html' },
  { id: 'pr_card', category: 'status', template: 'pr_card', fallbackDays: 60, irccTimeKey: 'pr_card', url: IRCC + 'new-immigrants/pr-card.html' },
  { id: 'prtd', category: 'status', template: 'prtd', fallbackDays: 60, url: IRCC + 'permanent-residents/travel-document.html' },
  { id: 'other', category: 'status', template: 'other', fallbackDays: 180, url: IRCC + 'application/check-processing-times.html' },
];

export const CATEGORY_ORDER: ProgramCategory[] = ['express_entry', 'pnp', 'quebec', 'pilots', 'family', 'humanitarian', 'temporary', 'status'];

const BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]));

export function program(id: string): Program {
  return BY_ID.get(id) ?? BY_ID.get('other')!;
}

export function milestonesFor(id: string): string[] {
  return TEMPLATES[program(id).template];
}

export function finalMilestone(id: string): string {
  return TEMPLATE_FINAL[program(id).template];
}

/**
 * IRCC processing offices commonly named in timelines. Only these are ever shared in
 * community records (free text could identify someone).
 */
export const OFFICES = [
  'Ottawa', 'Sydney', 'Edmonton', 'Mississauga', 'Montreal', 'Vancouver', 'Winnipeg', 'Etobicoke', 'Calgary', 'Toronto', 'Halifax',
  'Case Processing Centre', 'Domestic Network', 'International Network', 'Centralized Intake Office',
  'New Delhi', 'Chandigarh', 'Manila', 'Beijing', 'Hong Kong', 'Islamabad', 'Nairobi', 'Dakar', 'Abu Dhabi', 'Ankara', 'Paris', 'London',
  'Mexico City', 'Bogota', 'Sao Paulo', 'Lima', 'Port of Spain', 'Accra', 'Lagos', 'Rabat', 'Cairo', 'Singapore', 'Ho Chi Minh City', 'Tokyo', 'Seoul',
] as const;

/** Map free text ("ottawa ", "MTL") to a known office name, or undefined. */
export function knownOffice(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  const alias: Record<string, string> = { mtl: 'Montreal', 'montréal': 'Montreal', cpc: 'Case Processing Centre', 'cpc ottawa': 'Ottawa', 'cpc sydney': 'Sydney', 'cpc edmonton': 'Edmonton', 'cpc mississauga': 'Mississauga', delhi: 'New Delhi', 'são paulo': 'Sao Paulo', 'bogotá': 'Bogota' };
  return alias[t] ?? OFFICES.find((o) => o.toLowerCase() === t);
}

/** Provinces and territories with a nominee program (Quebec selects its own immigrants). */
export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'SK', 'NT', 'YT'] as const;

/** Commonly used provincial program names, for the stream field's suggestions. */
export const PNP_NAMES: Record<string, string> = {
  AB: 'AAIP', BC: 'BC PNP', MB: 'MPNP', NB: 'NBPNP', NL: 'NL PNP', NS: 'NSNP', ON: 'OINP', PE: 'PEI PNP', SK: 'SINP', NT: 'NTNP', YT: 'YNP',
};

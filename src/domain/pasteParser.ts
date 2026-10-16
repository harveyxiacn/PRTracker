// Parses timeline text people post on forums (Reddit, CanadaVisa, Facebook, WeChat…),
// e.g. "CEC | ITA: Jan 8 2026 | AOR: Jan 20 | BIL: Feb 2 | PPR: Jun 3, 2026 | eCOPR 06/20/2026",
// into a program guess and dated milestones. Fully local and rule-based; every result is
// shown to the user for review before it is used or shared.
import { isISODate, type ISODate } from './dates';
import { COUNTRY_CODES, countryName } from './countries';
import { PROGRAMS, PROVINCES, PNP_NAMES, milestonesFor } from './programs';

export interface ParsedMilestone {
  key: string;
  date: ISODate;
  /** True when the date was ambiguous (e.g. 03/04/2026) or the year was inferred. */
  uncertain?: boolean;
  source: string; // the text fragment it came from
}

export interface ParsedTimeline {
  kind?: string;
  province?: string;
  /** Processing / visa office, from "PVO: Ottawa", "VO: Sydney"… */
  office?: string;
  /** Country applied from (ISO code), from "Applied from Kenya". */
  country?: string;
  /** The program was inferred from weak signals (e.g. only "Express Entry"). */
  kindUncertain?: boolean;
  milestones: ParsedMilestone[];
  submitted?: ISODate;
}

// Milestone keywords, most specific first. Matched case-insensitively on word boundaries.
const MILESTONE_PATTERNS: [string, RegExp][] = [
  ['copr', /\b(e-?copr|copr|confirmation of (permanent )?residence)\b|确认函/i],
  ['portal2', /\b(p2|portal ?2|second portal)\b/i],
  ['portal1', /\b(p1|portal ?1|first portal|pr portal)\b/i],
  ['passport_returned', /\bpassport (received|returned|back|delivered)\b|护照(回来|寄回)/i],
  ['passport_sent', /\bpassport (sent|submitted|mailed)\b|寄护照/i],
  ['ppr', /\b(ppr|passport request|final decision|fd|decision made)\b|护照信/i],
  ['landed', /\b(landed|landing|soft landing|activated pr)\b|登陆/i],
  ['biometrics_request', /\b(bil|biometrics? (instruction|request)( letter)?)\b|指纹信/i],
  ['biometrics', /\b(bio(metrics?)? (done|completed|given)|biometrics?|bios?|fingerprints?)\b|打指纹|录指纹|打指紋/i],
  ['medical', /\b(mep|medical( exam)?( passed)?|meds?( passed)?|ime|medicals?)\b|体检|體檢/i],
  ['eligibility', /\b(eligibility( review)?( passed| completed| approved| done)?|er (passed|done))\b|资格审核/i],
  ['background', /\b(bgc|background( check)?|security( check)?|criminality)\b|背调|背景调查/i],
  ['sponsor_approved', /\b(sponsorship approved|sponsor approv(ed|al)|sa)\b|担保人批准/i],
  ['owp', /\b(owp|open work permit)\b/i],
  ['csq_issued', /\bcsq (issued|approved|received)\b/i],
  ['csq_submitted', /\bcsq (app(lication)? )?(submitted|sent)\b/i],
  ['qc_invite', /\b(arrima|quebec) (invite|invitation)\b/i],
  ['nomination', /\b(nominat(ed|ion)|pnp approv(ed|al))\b|省提名(批准|获得)?/i],
  ['pnp_submitted', /\b(pnp|oinp|aaip|bc ?pnp|sinp|mpnp|nsnp|nbpnp|pei ?pnp|nl ?pnp|provincial) (app(lication)? )?(submitted|sent)\b/i],
  ['pnp_invite', /\b(noi|pnp ita|provincial (invite|invitation)|nomination invite)\b/i],
  ['eoi', /\b(eoi|expression of interest|registration)\b/i],
  ['ita', /\b(ita|invitation to apply)\b|邀请/i],
  ['profile', /\b(profile( created| submitted)?|ee profile)\b/i],
  ['aor', /\b(aor ?2|aor ?1|aor|acknowledg(e)?ment of receipt)\b|回执/i],
  ['submitted', /\b(submitted|e-?apr|app(lication)? (sent|submitted|delivered)|applied|sent|delivered|filed)\b|递交|提交/i],
  ['test_invite', /\btest (invite|invitation)\b/i],
  ['test', /\btest( passed| done| written)?\b|考试/i],
  ['interview', /\binterview\b|面试/i],
  ['oath_invite', /\boath (invite|invitation)\b/i],
  ['oath', /\b(oath|ceremony)\b|宣誓/i],
  ['card_mailed', /\b(card (mailed|sent|shipped|produced))\b/i],
  ['card_received', /\b(card received|received (my )?card)\b/i],
  ['decision', /\b(approved|approval|decision)\b|获批/i],
  ['interest_form', /\binterest to sponsor\b/i],
  ['pgp_invite', /\bpgp (invite|invitation|ita)\b/i],
  ['job_offer', /\bjob offer\b/i],
  ['endorsement', /\b(endorse(d|ment)|community recommendation)\b/i],
];

const KIND_PATTERNS: [string, RegExp][] = [
  ['citizenship', /\b(citizenship|oath|test invite)\b|入籍/i],
  ['pr_card', /\bpr card (renewal|application)\b|续卡/i],
  ['prtd', /\bprtd\b/i],
  ['pgwp', /\bpgwp\b/i],
  ['study_permit', /\bstudy permit\b|学签/i],
  ['work_permit', /\bwork permit\b|工签/i],
  ['visitor_visa', /\b(visitor visa|trv)\b|旅游签/i],
  ['super_visa', /\bsuper visa\b/i],
  ['pgp', /\b(pgp|parents? (and|&) grandparents?)\b/i],
  ['spousal_in', /\b(spous\w*|sponsor\w*|partner)\b.{0,30}\binland\b|\binland\b.{0,30}\b(spous\w*|sponsor\w*|partner)\b/i],
  ['spousal_out', /\b(spous\w*|sponsor\w*|partner)\b.{0,30}\boutland\b|\boutland\b.{0,30}\b(spous\w*|sponsor\w*|partner)\b/i],
  ['spousal', /\b(spous(al|e)|common.?law|partner sponsorship)\b|配偶/i],
  ['qc_peq', /\bpeq\b/i],
  ['qc_skilled', /\b(arrima|csq|pstq|quebec)\b|魁北克/i],
  ['aip', /\b(aip|atlantic immigration)\b/i],
  ['rcip', /\b(rcip|rural community)\b/i],
  ['fcip', /\b(fcip|francophone community)\b/i],
  ['caregiver', /\b(caregiver|home care)\b/i],
  ['startup', /\b(start-?up visa|suv)\b/i],
  ['pnp_base', /\b(pnp|oinp|aaip|bc ?pnp|sinp|mpnp|nsnp|nbpnp|pei ?pnp|nl ?pnp|provincial nominee)\b[^\n]{0,30}\b(base|non-?ee|paper)\b|\b(base|non-?ee|paper)\b[^\n]{0,20}\b(pnp|stream)\b/i],
  ['pnp_ee', /\b(pnp|oinp|aaip|bc ?pnp|sinp|mpnp|nsnp|nbpnp|pei ?pnp|nl ?pnp)\b.*(?<!non-)\b(ee|express entry|enhanced)\b|(?<!non-)\b(ee|express entry|enhanced)\b.*\b(pnp|oinp|aaip|bc ?pnp|sinp|mpnp|nsnp|nbpnp)\b/i],
  ['pnp_base', /\b(pnp|oinp|aaip|bc ?pnp|sinp|mpnp|nsnp|nbpnp|pei ?pnp|nl ?pnp|provincial nominee)\b|省提名/i],
  ['ee_fst', /\bfst\b|federal skilled trades/i],
  ['ee_fsw', /\bfsw\b|federal skilled worker/i],
  ['ee_cec', /\bcec\b|canadian experience class/i],
];

/** Weak signal: Express Entry without a sub-program. Resolved to CEC with kindUncertain. */
const EE_GENERIC = /\b(express entry|ee)\b|快速通道/i;

const TEMPORARY = new Set(PROGRAMS.filter((p) => p.category === 'temporary').map((p) => p.id));
const PR_ONLY_MILESTONES = new Set(['ita', 'ppr', 'portal1', 'portal2', 'copr', 'landed', 'passport_sent', 'passport_returned', 'nomination', 'csq_issued']);

/** "Stream: CEC", "Program - OINP", "Application type: Express Entry" */
const LABELED_PROGRAM = /^\s*(?:stream|program(?:me)?|application type|category|type|pathway)\s*[:：\-–]\s*(.+)$/im;

const PROVINCE_WORDS: Record<string, RegExp> = {
  ON: /\b(ontario|oinp)\b|安省/i, BC: /\b(british columbia|bc ?pnp|bc)\b|卑诗/i, AB: /\b(alberta|aaip)\b|阿省/i,
  SK: /\b(saskatchewan|sinp)\b|萨省/i, MB: /\b(manitoba|mpnp)\b|曼省/i, NS: /\b(nova scotia|nsnp)\b/i, NB: /\b(new brunswick|nbpnp)\b/i,
  PE: /\b(prince edward island|pei)\b/i, NL: /\b(newfoundland|nl ?pnp)\b/i, NT: /\b(northwest territories|ntnp)\b/i, YT: /\b(yukon|ynp)\b/i,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const mk = (y: number, m: number, d: number): ISODate | null => {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(iso) ? iso : null;
};

interface RawDate {
  date: ISODate | null;
  /** Position and length of the date text in the fragment. */
  index: number;
  length: number;
  /** Year missing: resolve later from context. */
  month?: number;
  day?: number;
  uncertain?: boolean;
}

/** Find the first date in a fragment. */
/** Day/month order for numeric dates, decided once per post (see detectNumericOrder). */
export type NumericOrder = 'dmy' | 'mdy' | 'unknown';

/** If any numeric date in the post has a first part > 12 it is DD/MM; second part > 12 means MM/DD. */
export function detectNumericOrder(text: string): NumericOrder {
  let dmy = false;
  let mdy = false;
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/g)) {
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return dmy && !mdy ? 'dmy' : mdy && !dmy ? 'mdy' : 'unknown';
}

export function extractDate(fragment: string, order: NumericOrder = 'unknown'): RawDate | null {
  const s = fragment.toLowerCase();
  let m: RegExpExecArray | null;
  const at = (x: RegExpExecArray) => ({ index: x.index, length: x[0].length });
  if ((m = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(s))) return { date: mk(+m[1], +m[2], +m[3]), ...at(m) };
  if ((m = /(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s))) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12) return { date: mk(y, b, a), ...at(m) }; // DD/MM
    if (b > 12) return { date: mk(y, a, b), ...at(m) }; // MM/DD
    if (order === 'mdy') return { date: mk(y, a, b), ...at(m) };
    if (order === 'dmy') return { date: mk(y, b, a), ...at(m) };
    return { date: mk(y, b, a), uncertain: a !== b, ...at(m) }; // ambiguous; assume DD/MM
  }
  const names = Object.keys(MONTHS).sort((x, y) => y.length - x.length).join('|');
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${names})\\.?(?:[\\s,-]+(\\d{4}|\\d{2}))?\\b`).exec(s))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
    return y ? { date: mk(y, MONTHS[m[2]], +m[1]), ...at(m) } : { date: null, month: MONTHS[m[2]], day: +m[1], ...at(m) };
  }
  if ((m = new RegExp(`\\b(${names})\\.?[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,-]+(\\d{4}|'?\\d{2}))?\\b`).exec(s))) {
    const yRaw = m[3]?.replace("'", '');
    const y = yRaw ? (yRaw.length === 2 ? 2000 + +yRaw : +yRaw) : undefined;
    return y ? { date: mk(y, MONTHS[m[1]], +m[2]), ...at(m) } : { date: null, month: MONTHS[m[1]], day: +m[2], ...at(m) };
  }
  if ((m = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(s))) return { date: null, month: +m[1], day: +m[2], ...at(m) };
  return null;
}

/**
 * Guess the program: an explicit "Stream:" line wins; otherwise the program mentioned first
 * ("CEC inland … my study permit back in 2021" is CEC). `exclude` drops kinds that can't fit
 * the milestones found (e.g. temporary permits when there is an eCOPR).
 */
export function guessKind(text: string, exclude: Set<string> = new Set()): { kind?: string; province?: string; uncertain?: boolean } {
  let kind: string | undefined;
  let uncertain = false;
  const firstMatch = (src: string) => {
    let found: string | undefined;
    let best = Infinity;
    for (const [k, re] of KIND_PATTERNS) {
      if (exclude.has(k)) continue;
      const m = re.exec(src);
      if (m && m.index < best) {
        best = m.index;
        found = k;
      }
    }
    return found;
  };
  const labeled = LABELED_PROGRAM.exec(text)?.[1];
  if (labeled) {
    kind = firstMatch(labeled);
    // "Application type: Express Entry" settles it, even if PGWP etc. appear later.
    if (!kind && EE_GENERIC.test(labeled)) {
      kind = firstMatch(text.replace(/[^\n]*\b(pgwp|work permit|study permit|visitor)\b[^\n]*/gi, '')) ?? 'ee_cec';
      if (!/^ee_|^pnp_ee$/.test(kind)) kind = 'ee_cec';
      uncertain = kind === 'ee_cec' && !/\bcec\b|canadian experience/i.test(text);
    }
  }
  if (!kind) kind = firstMatch(text);
  if (!kind && EE_GENERIC.test(text)) {
    kind = 'ee_cec';
    uncertain = true;
  }
  let province: string | undefined;
  if (kind === 'pnp_ee' || kind === 'pnp_base') {
    for (const p of PROVINCES) if (PROVINCE_WORDS[p]?.test(text)) province = p;
  }
  return { kind, province, uncertain };
}

/** "Applied from Kenya", "Country: India", "applying from the Philippines" -> ISO code. */
export function guessCountry(text: string): string | undefined {
  const m = /\b(?:appl(?:ied|ying|y) from|country(?: of residence)?\s*[:：-]|living in|located in)\s+(?:the\s+)?([A-Za-z][A-Za-z .'-]{2,40})/i.exec(text);
  if (!m) return undefined;
  const words = m[1].trim().toLowerCase();
  let best: string | undefined;
  for (const code of COUNTRY_CODES) {
    const name = countryName(code, 'en').toLowerCase();
    if (words.startsWith(name) && (!best || name.length > countryName(best, 'en').length)) best = code;
  }
  return best;
}

export function parseTimelineText(text: string, today: ISODate, kindHint?: string): ParsedTimeline {
  if (kindHint) return parseWith(text, today, kindHint, guessKind(text).province, false);
  // Pass 1 without a program, to see which milestones are present.
  const loose = parseWith(text, today, undefined, undefined, false);
  const citizenshipSteps = loose.milestones.some((m) => ['test', 'test_invite', 'oath', 'oath_invite'].includes(m.key));
  const isPr = !citizenshipSteps && loose.milestones.some((m) => PR_ONLY_MILESTONES.has(m.key));
  const g = guessKind(text, isPr ? new Set([...TEMPORARY, 'citizenship', 'pr_card', 'prtd']) : new Set());
  return parseWith(text, today, g.kind, g.province, !!g.uncertain);
}

function parseWith(text: string, today: ISODate, kind: string | undefined, province: string | undefined, kindUncertain: boolean): ParsedTimeline {
  // Split into fragments: lines, pipes, semicolons, bullets, and " - " / "→" separators.
  const fragments = text
    .split(/\r?\n|\||;|•|·|→|->|>|\s-\s|,\s(?=[A-Za-z一-鿿]{2,}[^\d]*\d)/)
    .map((f) => f.trim())
    .filter(Boolean);
  const allowed = kind ? new Set(milestonesFor(kind)) : null;
  const order = detectNumericOrder(text);
  const out: ParsedMilestone[] = [];
  let lastDate: ISODate | undefined;
  let prevLabel = '';
  for (const frag of fragments) {
    const raw = extractDate(frag, order);
    if (!raw) {
      // "ITA - Jan 8 2026" is split at " - "; remember a short dateless label for the next fragment.
      prevLabel = frag.length <= 40 ? frag : '';
      continue;
    }
    // Timeline lines look like "LABEL: date" (or "date LABEL"). The label must sit right next
    // to the date, so story sentences ("I submitted my study permit on Oct 1, 2021…") are ignored.
    const before = frag.slice(0, raw.index).trim();
    const after = frag.slice(raw.index + raw.length).trim();
    let label = before.length > 0 && before.length <= 40 ? before : before.length === 0 && after.length <= 30 ? after : '';
    if (before.length === 0 && prevLabel && !MILESTONE_PATTERNS.some(([, re]) => re.test(after))) label = prevLabel;
    prevLabel = '';
    if (!label) continue;
    const key0 = MILESTONE_PATTERNS.find(([k, re]) => re.test(label) && (!allowed || allowed.has(k)))?.[0];
    if (!key0) continue;
    let key = key0;
    if (key === 'ppr' && allowed?.has('passport_request')) key = 'passport_request';
    let date = raw.date;
    let uncertain = raw.uncertain;
    if (!date && raw.month && raw.day) {
      // No year: assume chronological order after the previous milestone, not after today.
      const baseYear = Number((lastDate ?? today).slice(0, 4));
      date = mk(baseYear, raw.month, raw.day);
      if (date && lastDate && date < lastDate) date = mk(baseYear + 1, raw.month, raw.day);
      if (date && date > today) date = mk(Number(date.slice(0, 4)) - 1, raw.month, raw.day);
      uncertain = true;
    }
    if (!date) continue;
    if (out.some((m) => m.key === key)) continue; // keep the first mention (AOR1 before AOR2)
    out.push({ key, date, uncertain, source: frag.slice(0, 80) });
    lastDate = date;
  }
  const submitted = out.find((m) => m.key === 'submitted')?.date ?? out.find((m) => m.key === 'aor')?.date;
  const office = /\b(?:p?vo(?:\s*\/\s*svo)?|visa office|processing office)\s*[:：-]\s*([A-Za-z][A-Za-z .]{1,30}?)(?=\s*(?:\||;|,|→|\r?\n|$|svo))/im.exec(text)?.[1]?.trim();
  return { kind, province, office, country: guessCountry(text), kindUncertain, milestones: out, submitted };
}

/** CanadaVisa forum search through a public search engine (the forum blocks automated access). */
export function canadaVisaSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:canadavisa.com ${query}`)}`;
}

export { PNP_NAMES };

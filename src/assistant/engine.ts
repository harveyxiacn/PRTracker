// "Maple" — the on-device smart assistant. Rule-based intent matching over the user's
// own data; answers are computed locally, nothing is sent anywhere.
import { addDays, addMonths, diffDays, type ISODate } from '../domain/dates';
import { computeInsights, type Insights } from '../domain/insights';
import { CITIZENSHIP_REQUIRED, RESIDENCY_REQUIRED, withExtraTrip } from '../domain/presence';
import { FINAL_MILESTONE, predict } from '../domain/timeline';
import type { AppData } from '../domain/types';
import type { OpenData } from '../data/remote';
import { countryName, COUNTRY_CODES } from '../domain/countries';
import { glossaryLookup, kbSearch } from './kb';
import { lexHas, lexKb, lexWords, type IntentId } from './lexicon';
import { findDates, findDuration, findYear, normalizeDigits } from './parse';
import { checklistFor, nextExpiries, emptyDocuments } from '../domain/documents';
import { guessKind } from '../domain/pasteParser';
import { emptyHistory, historySummary } from '../domain/history';
import { describeImprovement, improvements } from '../domain/crsPlanner';
import { DEFAULT_PERSON_NAME, applyTogetherDate, householdSummary } from '../domain/people';
import { formToCrsInput, readCrsForm } from '../domain/crsForm';
import { calculateCrs } from '../domain/crs';
import { daysOutsideLastMonths, explainCitizenship, filterTrips, planTrip, returnFor, travelBudget, tripStats } from './query';
import { tripLength } from '../domain/presence';
import { finishCurve, finishedShare } from '../domain/curves';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type AssistantAction =
  | { kind: 'navigate'; to: string; label: string }
  | { kind: 'addTrip'; departure: ISODate; return?: ISODate; label: string }
  | { kind: 'ask'; text: string; label: string };

export interface AssistantReply {
  intent: string;
  text: string;
  actions?: AssistantAction[];
  /** Conversation memory to pass into the next `answer()` call (follow-up questions). */
  memory?: Memory;
  /** Source link shown under knowledge-base answers. */
  source?: string;
}

/** What Maple remembers from the previous turn, so "and 3 months?" works. */
export interface Memory {
  intent?: string;
  dep?: ISODate;
  ret?: ISODate;
  dur?: number;
  target?: ISODate;
}

interface Ctx {
  data: AppData;
  insights: Insights;
  open?: OpenData;
  t: Translate;
  today: ISODate;
  mem: Memory;
  lang: string;
}

type Handler = (q: string, ctx: Ctx) => AssistantReply | null;

const has = (q: string, ...words: (string | RegExp)[]) =>
  words.some((w) => (typeof w === 'string' ? q.includes(w) : w.test(q)));

const TRAVEL = [/\b(travel|trip|leave|go abroad|go back|visit|vacation|holiday|away|outside canada|fly)\b/, '出国', '旅行', '回国', '离开', '出境', '度假', '旅游', '出去'];

/**
 * Answers that state eligibility dates, counts or rules end with the planning-only disclaimer
 * (RCIC review v1 M4). Chit-chat, FAQ and glossary answers don't.
 */
function withDisclaimer(lines: string[], ctx: Pick<Ctx, 't'>): string {
  return [...lines, ctx.t('common.disclaimer')].join('\n');
}

function needPr(ctx: Ctx): AssistantReply | null {
  if (ctx.data.profile.prDate) return null;
  return {
    intent: 'need_pr',
    text: ctx.t('as.needPr'),
    actions: [{ kind: 'navigate', to: 'settings', label: ctx.t('as.act.setPrDate') }],
  };
}

/** Questions and hypotheticals ("when do I need to be back?", "what if I returned…") are not log commands. */
const QUESTIONISH = /\b(when|need|must|what if|will|should|would|if|how)\b|\?|？|什么时候|什麼時候|何时|必须|必須|如果|需要|要不要/;
/** Future-tense departure ("I'm leaving on Dec 1 for 3 weeks"). */
const FUTURE_LEAVE = /\b(i'?m leaving|i am leaving|flying out|will leave|leaving on|going to leave)\b|要走|将要|打算|准备出国|準備出國/;

const presenceInput = (ctx: Ctx) => ({
  profile: ctx.data.profile,
  trips: ctx.data.trips,
  today: ctx.today,
  boundaryDaysPresent: ctx.data.settings.boundaryDaysPresent,
});

/** A place mentioned in the question: one of the user's destinations, or a country name. */
function findPlace(q: string, ctx: Ctx): string | undefined {
  const dests = [...new Set(ctx.data.trips.map((t) => t.destination?.trim()).filter((d): d is string => !!d))];
  const hit = dests.filter((d) => q.includes(d.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  if (hit) return hit;
  for (const code of COUNTRY_CODES) {
    for (const loc of [ctx.lang, 'en']) {
      const name = countryName(code, loc).toLowerCase();
      if (name.length >= 4 && q.includes(name)) {
        // Match trips logged with either the English or the local name.
        return dests.find((d) => [countryName(code, 'en'), countryName(code, ctx.lang)].some((n) => d.toLowerCase().includes(n.toLowerCase()))) ?? countryName(code, 'en');
      }
    }
  }
  return undefined;
}

// Data-query trigger words (other languages come from lexicons via lexWords()).
const QUERY_WORDS = {
  longest: [/\b(longest|biggest) (trip|absence|time away)\b|\bmy longest\b/, '最长的一次', '最長的一次', '最长一次', '最長一次'],
  shortest: [/\bshortest\b/, '最短'],
  last: [/\b(last|latest|most recent|previous) trip\b|\bwhen did i (last )?(travel|leave|go)\b/, '上次', '最近一次'],
  next: [/\b(next|upcoming|planned) trips?\b/, '下次出国', '下一次', '计划的行程'],
  most: [/\b(most visited|where do i go most|most often)\b/, '最常去', '去得最多'],
  count: [/\bhow many (trips|times)\b|\bnumber of trips\b/, '几次', '多少次'],
  total: [/\b(last|past) \d+ months\b|\b(in the )?(last|past) year\b/, '过去', '過去', '最近一年'],
};
const queryHit = (q: string, k: keyof typeof QUERY_WORDS) =>
  has(q, ...QUERY_WORDS[k]) || lexWords(k as 'longest').some((w) => q.includes(w));

const handlers: { id: IntentId; match: (q: string) => boolean; run: Handler }[] = [
  {
    id: 'glossary',
    match: (q) => !!glossaryLookup(q),
    run: (q, ctx) => {
      const term = glossaryLookup(q)!;
      return { intent: 'glossary', text: `${term.toUpperCase()}: ${ctx.t(`gl.${term}`)}` };
    },
  },
  {
    id: 'log_return',
    match: (q) => !QUESTIONISH.test(q) && has(q, /\b(i'?m back|i am back|came back|got back|returned|arrived back|back in canada|back home)\b/, '我回来了', '回到加拿大', '入境了', '已经回来', '回来了'),
    run: (q, ctx) => {
      const trip = ctx.insights.ongoingTrip;
      const dates = findDates(q, ctx.today, 'past');
      // "I left on Oct 1 and came back Oct 10": a complete past trip.
      if (dates.length >= 2) {
        const [dep, ret] = [dates[0].date, dates[1].date].sort();
        return {
          intent: 'log_departure',
          text: ctx.t('as.confirmTrip', { dep, ret }),
          actions: [{ kind: 'addTrip', departure: dep, return: ret, label: ctx.t('as.act.logTrip') }],
        };
      }
      const date = dates[0]?.date ?? ctx.today;
      if (!trip) return { intent: 'log_return', text: ctx.t('as.noOngoing') };
      return {
        intent: 'log_return',
        text: ctx.t('as.confirmReturn', { date, dep: trip.departure, days: Math.max(0, diffDays(date, trip.departure) - 1) }),
        actions: [{ kind: 'addTrip', departure: trip.departure, return: date, label: ctx.t('as.act.saveReturn') }],
      };
    },
  },
  {
    id: 'log_departure',
    match: (q) => !/\b(what if|if i)\b|如果/.test(q) && has(q, /\b(i left|i'?m leaving|i am leaving|left canada|departed|flying out)\b/, '我走了', '离开了', '出境了', '今天出国', '我出发'),
    run: (q, ctx) => {
      const future = FUTURE_LEAVE.test(q);
      const dates = findDates(q, ctx.today, future ? 'future' : 'past');
      const dep = dates[0]?.date ?? ctx.today;
      const dur = findDuration(q);
      const ret = dates[1]?.date ?? (dur ? returnFor(dep, dur, ctx.data.settings.boundaryDaysPresent) : undefined);
      return {
        intent: 'log_departure',
        text: ret ? ctx.t('as.confirmTrip', { dep, ret }) : ctx.t('as.confirmDeparture', { dep }),
        actions: [{ kind: 'addTrip', departure: dep, return: ret, label: ctx.t('as.act.logTrip') }],
      };
    },
  },
  {
    // "What documents do I need for citizenship / CEC / my application?"
    id: 'doc_checklist',
    match: (q) =>
      has(q, /\b(what|which) (documents?|papers?) (do i|will i|i) need\b|\bdocuments? (needed|required|checklist)\b|\bchecklist\b/, '需要什么材料', '需要哪些材料', '要准备什么', '材料清单', '文件清单', '需要什麼文件', '需要哪些文件'),
    run: (q, ctx) => {
      // Program from the question ("for citizenship", "for CEC"), else the user's latest application.
      const fromQ = /citizen|入籍|公民/.test(q) || lexHas(q, 'citizenship') ? 'citizenship' : guessKind(q).kind;
      const app = [...ctx.data.applications].reverse().find((a) => !a.archived);
      const kind = fromQ ?? app?.kind;
      if (!kind) return { intent: 'doc_checklist', text: ctx.t('as.docChecklistPick'), actions: [{ kind: 'navigate', to: 'documents', label: ctx.t('as.act.documents') }] };
      const keys = checklistFor(kind);
      const lines = [ctx.t('as.docChecklistHead', { program: ctx.t(`app.kind.${kind}`) }), ...keys.slice(0, 10).map((k) => `• ${ctx.t(`doc.chk.${k}`)}`)];
      if (keys.length > 10) lines.push(ctx.t('as.docChecklistMore', { n: keys.length - 10 }));
      return { intent: 'doc_checklist', text: lines.join('\n'), actions: [{ kind: 'navigate', to: 'documents', label: ctx.t('as.act.documents') }] };
    },
  },
  {
    // "Export my absences for the citizenship form", "print presence report", "PR card renewal check".
    id: 'forms',
    match: (q) =>
      has(q, /\b(list|export|print)\b[^.?!]{0,30}\b(absences|trips for (the )?citizenship)\b|\babsences? (list|for (the )?citizenship)\b|\b(physical )?presence report\b|\bcit ?0407\b|\b(pr )?card renewal (check|form|application)\b/, '缺席清单', '出境记录表', '出境記錄表', '居住天数报告', '居住天數報告', '续卡申请', '續卡申請'),
    // Lexicon words like "absences" also occur in days-outside questions; those keep their own answer.
    run: (q, ctx) => (!/\b(absences|presence report|renewal)\b/.test(q) && (lexHas(q, 'days_outside') || lexHas(q, 'residency')) ? null : { intent: 'forms', text: ctx.t('form.intro'), actions: [{ kind: 'navigate', to: 'forms', label: ctx.t('nav.forms') }] }),
  },
  {
    // "Check my trips against CBSA", "official travel history".
    id: 'cbsa',
    match: (q) => has(q, /\bcbsa\b|\b(official )?travel history report\b|\bentry (exit )?records?\b/, '入境记录', '入境記錄', '出入境记录', '出入境記錄'),
    // "Longest trip in my travel history" is a trip query, not the CBSA import.
    run: (q, ctx) => (queryHit(q, 'longest') || queryHit(q, 'last') || queryHit(q, 'count') ? null : { intent: 'cbsa', text: ctx.t('cbsa.cardBody'), actions: [{ kind: 'navigate', to: 'trips', label: ctx.t('cbsa.open') }] }),
  },
  {
    // "What % of people like me have finished by now?"
    id: 'curve',
    match: (q) => has(q, /\b(what|how many) (percent|%|share|people)\b[^.?!]{0,40}\b(finish|finished|done|got (their )?(ppr|copr|decision))\b|\bfinished by now\b|% (of )?(people|applicants)\b/, '百分之多少', '多少人已经', '多少人已經', '多少比例'),
    run: (q, ctx) => {
      // Generic "what percent" lexicon phrases also appear in CRS/residency/citizenship questions.
      if (['crs', 'residency', 'citizenship', 'days_outside'].some((i) => lexHas(q, i as IntentId))) return null;
      const apps = ctx.data.applications.filter((a) => !a.archived && a.submitted);
      const app = apps[apps.length - 1];
      if (!app?.submitted) return { intent: 'curve', text: ctx.t('as.noApps'), actions: [{ kind: 'navigate', to: 'timeline', label: ctx.t('as.act.timeline') }] };
      const curve = finishCurve(app, ctx.open?.community?.records ?? []);
      const act = [{ kind: 'navigate' as const, to: 'timeline', label: ctx.t('as.act.timeline') }];
      if (!curve) return { intent: 'curve', text: ctx.t('c2.maple.noCurve'), actions: act };
      const done = app.milestones.find((m) => m.key === (FINAL_MILESTONE[app.kind] ?? 'decision') && m.date)?.date;
      const day = Math.max(0, diffDays(done ?? ctx.today, app.submitted));
      return {
        intent: 'curve',
        text: ctx.t('c2.maple.share', { pct: Math.round(finishedShare(curve, day)), day, scope: ctx.t(`c2.scope.${curve.scope}`), n: curve.n, p50: curve.p50 ?? '—' }),
        actions: act,
      };
    },
  },
  {
    id: 'documents',
    // Narrow on purpose: this runs before the FAQ, so generic words ("expired", "documents") must not
    // capture questions like "can I apply for citizenship with an expired card?".
    match: (q) =>
      has(q, /\b(my|our) (passport|work permit|study permit|visa|documents?|ielts|celpip|tef|eca|medical)\b|\b(passport|permit|ielts|celpip|tef|eca|language test|medical|documents?)\b[^.?!]{0,30}\bexpir\w*|\bexpiring (documents?|soon)\b|\bdocument checklist\b/, '护照到期', '护照过期', '护照什么时候', '工签到期', '工签过期', '学签到期', '证件到期', '证件过期', '材料清单', '文件清单', '雅思过期', '雅思成绩', '護照到期', '護照過期', '證件到期') &&
      !has(q, /\bpr card\b|citizen/, '枫叶卡', '楓葉卡', '入籍'),
    run: (q, ctx) => {
      // Also applies when a lexicon keyword matched: PR card and citizenship questions belong elsewhere.
      if (has(q, /\bpr card\b|citizen/, '枫叶卡', '楓葉卡', '入籍')) return null;
      // "My work permit is expiring — can I keep working?" is the bridging-permit FAQ.
      if (kbSearch(q, lexKb())?.id === 'bowp' || /\b(keep working|bowp|bridging)\b/.test(q)) return null;
      const docs = ctx.data.documents ?? emptyDocuments();
      const next = nextExpiries(docs, ctx.today, 3);
      if (!docs.items.length) return { intent: 'documents', text: ctx.t('as.docNone'), actions: [{ kind: 'navigate', to: 'documents', label: ctx.t('as.act.documents') }] };
      const lines = next.length
        ? [ctx.t('as.docHead'), ...next.map((n) => ctx.t('as.docLine', { kind: ctx.t(`doc.kind.${n.item.kind}`), label: n.item.label ? ` (${n.item.label})` : '', date: n.expires, days: n.days }))]
        : [ctx.t('as.docAllOk')];
      return { intent: 'documents', text: lines.join('\n'), actions: [{ kind: 'navigate', to: 'documents', label: ctx.t('as.act.documents') }] };
    },
  },
  {
    id: 'history',
    match: (q) =>
      !/\b(cec|fsw|fst|eligib|qualify|trip|trips)\b|申请cec|够不够/.test(q) &&
      has(q, /\b(gaps? in my|address history|personal history|imm ?5669|schedule a)\b|\bwork history for\b/, '空白期', '空档', '空檔', '地址历史', '地址歷史', '个人历史', '個人歷史', '个人经历', '個人經歷'),
    run: (q, ctx) => {
      const h = ctx.data.history ?? emptyHistory();
      const purpose = /citizen|入籍|公民/.test(q) ? 'citizenship' : 'pr';
      const s = historySummary(h, purpose, ctx.today, !!ctx.data.historyMonthly);
      const gaps = s.addressGaps.length + s.activityGaps.length;
      const text = !h.addresses.length && !h.activities.length
        ? ctx.t('as.histNone')
        : [
            ctx.t('as.histHead', { from: s.window.from, to: s.window.to, purpose: ctx.t(`as.histPurpose.${purpose}`) }),
            ctx.t('as.histCoverage', { a: Math.round(s.addressCoverage * 100), b: Math.round(s.activityCoverage * 100) }),
            gaps ? ctx.t('as.histGaps', { n: gaps, first: (s.addressGaps[0] ?? s.activityGaps[0]).from }) : ctx.t('as.histNoGaps'),
          ].join('\n');
      return { intent: 'history', text, actions: [{ kind: 'navigate', to: 'history', label: ctx.t('as.act.history') }] };
    },
  },
  {
    // "When can we apply together?", "my spouse's days" (answers with existing household strings).
    id: 'household',
    // Narrow: spousal-sponsorship and "abroad with my spouse" questions must reach their own answers.
    match: (q) => has(q, /\b(apply (for citizenship )?together|citizenship together|we both become citizens|my (spouse|wife|husband|partner)'?s (days|date|citizenship))\b/, '一起申请', '一起入籍', '一起申請', '同时申请', '同時申請', '配偶的天数', '配偶的天數', '家庭成员', '家庭成員'),
    run: (q, ctx) => {
      // Sponsorship, PR, visa and income questions belong to their own answers (also when a
      // lexicon keyword matched); a single person gets the normal citizenship answer.
      if (/sponsor|spousal|visa|income|\bpr\b|permanent resid|担保|签证|簽證|移民|收入/.test(q) || kbSearch(q, lexKb())) return null;
      const people = householdSummary(ctx.data, ctx.today);
      if (people.length < 2) return null;
      const nameOf = (n: string) => (n === DEFAULT_PERSON_NAME ? ctx.t('ppl.me') : n);
      const lines = people.map((p) => {
        const cit = !p.isPr ? ctx.t('ppl.notPr') : p.citizenshipDate && p.citizenshipDate <= ctx.today ? ctx.t('ppl.citEligible') : p.citizenshipDate ? ctx.t('ppl.citFrom', { date: p.citizenshipDate }) : '—';
        const res = p.residencyOk === null ? '' : ` · ${ctx.t(p.residencyOk ? 'ppl.resOk' : 'ppl.resRisk')}`;
        return `• ${nameOf(p.name)}: ${cit}${res}${p.abroad ? ` · ${ctx.t('ppl.abroad')}` : ''}`;
      });
      const together = applyTogetherDate(people);
      if (together) lines.push(together <= ctx.today ? ctx.t('ppl.applyTogetherNow') : ctx.t('ppl.applyTogether', { date: together }));
      return { intent: 'household', text: withDisclaimer(lines, ctx) };
    },
  },
  {
    id: 'crs_plan',
    match: (q) => has(q, /\b(raise|improve|increase|boost|higher)\b.*\b(crs|score|points|chances)\b|\b(crs|score)\b.*\b(raise|improve|increase|boost)\b|\b(get|earn) (more )?(crs )?points\b|\bmore (crs )?points\b/, '提高分数', '提高分數', '怎么提分', '怎麼提分', '提分'),
    run: (_q, ctx) => {
      if (!ctx.data.eligibilityForm) return { intent: 'crs_plan', text: ctx.t('as.crsPlanNone'), actions: [{ kind: 'navigate', to: 'eligibility', label: ctx.t('as.act.eligibility') }] };
      const input = formToCrsInput(readCrsForm(ctx.data.eligibilityForm));
      const now = calculateCrs(input).totals.total;
      const top = improvements(input).slice(0, 4);
      const lines = [ctx.t('as.crsPlanHead', { score: now }), ...top.map((i) => `• ${describeImprovement(i, ctx.t)}`)];
      return { intent: 'crs_plan', text: lines.join('\n'), actions: [{ kind: 'navigate', to: 'eligibility', label: ctx.t('as.act.eligibility') }] };
    },
  },
  {
    id: 'faq',
    match: (q) => !!kbSearch(q, lexKb()),
    run: (q, ctx) => {
      const e = kbSearch(q, lexKb())!;
      return { intent: 'faq', text: ctx.t(`kb.${e.id}`), source: e.source };
    },
  },
  {
    id: 'plan_target',
    match: (q) =>
      findDates(q, '2000-01-01').length > 0 &&
      has(q, /\b(by|before)\b[^.?!]*\b(apply|citizenship)|\b(apply|citizenship)\b[^.?!]*\b(by|before)\b|how (many|much) (more )?(days|time) can i (still )?(travel|be away|spend)/, '之前入籍', '前入籍', '之前申请', '还能出国', '还可以出国'),
    run: (q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const target = findDates(q, ctx.today)[0]?.date ?? ctx.mem.target;
      // A past date ("I landed on 2024-05-01…") is not a goal; let other intents answer.
      if (!target || target <= ctx.today) return null;
      const b = travelBudget(ctx.insights.model, target);
      const buffer = ctx.data.settings.citizenshipBuffer;
      const lines =
        b.creditedAtTarget < CITIZENSHIP_REQUIRED
          ? [ctx.t('as.planTooSoon', { target, credited: b.creditedAtTarget, earliest: b.earliest ?? '—' })]
          : [ctx.t('as.planBudget', { target, days: b.budget, credited: b.creditedAtTarget }), ctx.t('as.planBudgetSafe', { days: Math.max(0, b.budget - buffer), buffer })];
      return { intent: 'plan_target', text: withDisclaimer(lines, ctx), memory: { intent: 'plan_target', target } };
    },
  },
  {
    id: 'plan_best',
    match: (q) => has(q, /\b(best|good|right|ideal) time\b|\bwhen (should|can) i (travel|take|go|leave)\b|\bwithout (delaying|affecting|hurting)\b/, '什么时候出国', '何时出国', '最好的时间', '什么时候去', '不影响入籍'),
    run: (q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const dur = findDuration(q) ?? ctx.mem.dur;
      if (!dur) return { intent: 'plan_best', text: ctx.t('as.planBestHelp'), memory: { intent: 'plan_best' } };
      const p = planTrip(presenceInput(ctx), dur, ctx.data.profile.prCardExpiry);
      const lines = [ctx.t('as.planBestHead', { days: dur })];
      if (p.eligibleNow && p.eligibleIfNow) {
        const shift = diffDays(p.eligibleIfNow, p.eligibleNow);
        lines.push(shift > 0 ? ctx.t('as.planBestNow', { shift, date: p.eligibleIfNow }) : ctx.t('as.planBestNoShift'));
        if (shift > 0) lines.push(ctx.t('as.planBestAfter', { date: p.eligibleNow }));
      }
      lines.push(p.residencyOkNow ? ctx.t('as.whatifResOk') : ctx.t('as.planBestResBad'));
      if (p.cardExpiresDuring) lines.push(ctx.t('as.whatifCard', { date: ctx.data.profile.prCardExpiry! }));
      return { intent: 'plan_best', text: withDisclaimer(lines, ctx), memory: { intent: 'plan_best', dur } };
    },
  },
  {
    id: 'explain',
    match: (q) =>
      has(q, /\b(explain|breakdown|how (is|was|did you) (it|this|that|my date|my count) (calculated|counted|computed)|how did you (get|calculate))\b/, '怎么算', '怎麼算', '如何计算', '如何計算', '解释', '解釋') ||
      (has(q, /\bwhy\b/, '为什么', '為什麼') && has(q, /\b(date|eligib|count|number|days|credited|that)\b/, '日期', '天数', '天數', '这个', '這個')),
    run: (q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      // Only a future date is an application date ("why did my date move after my trip in 2025?" is not).
      const fut = findDates(q, ctx.today).find((d) => d.date > ctx.today)?.date;
      const asOf = fut ?? ctx.insights.citizenship?.eligibleDate ?? ctx.today;
      const e = explainCitizenship(ctx.insights.model, ctx.data.trips, asOf);
      return {
        intent: 'explain',
        text: withDisclaimer(
          [
            ctx.t('as.explainHead', { date: e.asOf, from: e.windowStart, to: e.windowEnd }),
            ctx.t('as.explainPr', { days: e.prDays }),
            ctx.t('as.explainPrePr', { days: e.prePrDays, credit: e.prePrCredit }),
            ctx.t('as.explainTrips', { n: e.tripsInWindow, days: e.daysAwayInWindow }),
            ctx.t('as.explainTotal', { credited: e.credited, required: CITIZENSHIP_REQUIRED }),
            ctx.t('common.citExclusions'),
          ],
          ctx,
        ),
      };
    },
  },
  {
    id: 'residency',
    match: (q) => !/citizen|入籍|公民/.test(q) && has(q, /residen(cy|t) obligation|\b730\b|lose (my )?pr|keep (my )?pr|how (long|many days) (can|could) i (stay|be|go|travel)|max(imum)? (absence|days away|time (away|outside))|longest i can (stay|be)/, '居住义务', '移民监', '730', '保持身份', '能出去多久', '能出国多久', '最多出国', '最多能出', '最长能', '待多久', '在国外待', '在國外待', '能离开多久', '能離開多久'),
    run: (_q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const r = ctx.insights.residency!;
      const lines = [ctx.t(r.compliant ? 'as.resOk' : 'as.resBad', { present: r.present, required: RESIDENCY_REQUIRED, short: r.shortfall })];
      if (r.anniversary) lines.push(ctx.t('as.resNew', { date: r.anniversary }));
      if (r.compliant && r.mustReturnBy)
        lines.push(ctx.t(ctx.insights.ongoingTrip ? 'as.resReturnBy' : 'as.resMaxAway', { days: r.maxAbsence, date: r.mustReturnBy }));
      if (!r.compliant && r.regainDate) lines.push(ctx.t('as.resRegain', { date: r.regainDate }));
      return { intent: 'residency', text: withDisclaimer(lines, ctx) };
    },
  },
  {
    id: 'trips_query',
    match: (q) => (Object.keys(QUERY_WORDS) as (keyof typeof QUERY_WORDS)[]).some((k) => k !== 'total' && queryHit(q, k)) || (queryHit(q, 'total') && has(q, /\b(outside|abroad|away)\b/, '国外', '國外', '境外', '出国', '出國')),
    run: (q, ctx) => {
      const place = findPlace(q, ctx);
      const today = ctx.today;
      const bp = ctx.data.settings.boundaryDaysPresent;
      const trips = filterTrips(ctx.data.trips, { place }, today);
      const st = tripStats(trips, today, bp);
      const where = place ? ctx.t('as.qIn', { place }) : '';
      if (queryHit(q, 'longest') && st.longest)
        return { intent: 'trips_query', text: ctx.t('as.qLongest', { where, days: st.longest.days, dep: st.longest.trip.departure, ret: st.longest.trip.return ?? today, place: st.longest.trip.destination ?? ctx.t('trips.abroad') }) };
      if (queryHit(q, 'shortest') && st.shortest)
        return { intent: 'trips_query', text: ctx.t('as.qShortest', { where, days: st.shortest.days, dep: st.shortest.trip.departure, place: st.shortest.trip.destination ?? ctx.t('trips.abroad') }) };
      if (queryHit(q, 'next'))
        return { intent: 'trips_query', text: st.next ? ctx.t('as.qNext', { dep: st.next.departure, ret: st.next.return ?? '—', place: st.next.destination ?? ctx.t('trips.abroad') }) : ctx.t('as.qNoNext') };
      if (queryHit(q, 'last') && st.last)
        return { intent: 'trips_query', text: ctx.t('as.qLast', { where, dep: st.last.departure, ret: st.last.return ?? ctx.t('trips.ongoing'), place: st.last.destination ?? ctx.t('trips.abroad'), ago: diffDays(today, st.last.return ?? today) }) };
      if (queryHit(q, 'most') && st.topPlace)
        return { intent: 'trips_query', text: ctx.t('as.qMost', { place: st.topPlace.place, n: st.topPlace.count, days: st.topPlace.days }) };
      const months = /(\d+)\s*(months?|个月|個月|月)/.exec(normalizeDigits(q));
      if (queryHit(q, 'total') && (months || /\blast year\b|过去一年|過去一年|最近一年/.test(q))) {
        const n = months ? Number(months[1]) : 12;
        return { intent: 'trips_query', text: ctx.t('as.qLastMonths', { n, days: daysOutsideLastMonths(ctx.insights.model, today, n), from: addMonths(today, -n) }) };
      }
      if (st.count === 0) return { intent: 'trips_query', text: ctx.t('as.qNone', { where }) };
      return { intent: 'trips_query', text: ctx.t('as.qCount', { where, n: st.count, days: st.totalDays }) };
    },
  },
  {
    id: 'days_outside',
    match: (q) => !has(q, /what if|can i|should i/, '如果', '可以', '能不能') && (has(q, /\b(outside|abroad|away|out of canada)\b/, '国外', '境外', '在外', '出国') && has(q, /how many|days|多少|几天|天数/)),
    run: (q, ctx) => {
      const y = findYear(q) ?? Number(ctx.today.slice(0, 4));
      const s = ctx.insights.model.yearStats(y, ctx.data.trips);
      return { intent: 'days_outside', text: ctx.t('as.yearStats', { year: y, out: s.outside, in: s.inCanada, trips: s.trips }) };
    },
  },
  {
    id: 'whatif',
    match: (q) => has(q, ...TRAVEL) && (findDuration(q) !== null || findDates(q, '2000-01-01').length > 0) || has(q, /\bwhat if\b/, '如果'),
    run: (q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const dates = findDates(q, ctx.today);
      // Follow-ups reuse what is missing from the previous what-if ("and 3 months?", "what about May 1?").
      const prev = ctx.mem.intent === 'whatif' ? ctx.mem : {};
      const dur = findDuration(q) ?? (dates.length === 1 ? prev.dur : undefined);
      let dep: ISODate;
      let ret: ISODate;
      if (dates.length >= 2) {
        dep = dates[0].date;
        ret = dates[1].date;
      } else if (dates.length === 1 && dur) {
        dep = dates[0].date;
        ret = returnFor(dep, dur, ctx.data.settings.boundaryDaysPresent);
      } else if (dur) {
        dep = prev.dep ?? addDays(ctx.today, 1);
        ret = returnFor(dep, dur, ctx.data.settings.boundaryDaysPresent);
      } else {
        return { intent: 'whatif', text: ctx.t('as.whatifHelp'), memory: { intent: 'whatif' } };
      }
      if (ret < dep) [dep, ret] = [ret, dep];
      const input = {
        profile: ctx.data.profile,
        trips: ctx.data.trips,
        today: ctx.today,
        boundaryDaysPresent: ctx.data.settings.boundaryDaysPresent,
      };
      const after = withExtraTrip(input, dep, ret);
      const before = ctx.insights.model;
      const away = tripLength({ id: 'x', departure: dep, return: ret }, ctx.today, ctx.data.settings.boundaryDaysPresent);
      const lines = [ctx.t('as.whatifHead', { dep, ret, days: away })];
      const b = before.citizenshipEligibleDate();
      const a = after.citizenshipEligibleDate();
      if (b && a) {
        const shift = diffDays(a, b);
        lines.push(shift > 0 ? ctx.t('as.whatifCit', { before: b, after: a, shift }) : ctx.t('as.whatifCitSame', { date: a }));
      }
      // Residency: check compliance on every day from departure to a year after return.
      let breach: ISODate | null = null;
      for (let d = dep; d <= addDays(ret, 365); d = addDays(d, 1)) {
        const r = after.residencyAt(d);
        if (r && !r.compliant) {
          breach = d;
          break;
        }
      }
      lines.push(breach ? ctx.t('as.whatifResBad', { date: breach }) : ctx.t('as.whatifResOk'));
      const card = ctx.insights.prCard;
      if (card && card.expiry >= dep && card.expiry <= ret) lines.push(ctx.t('as.whatifCard', { date: card.expiry }));
      return {
        intent: 'whatif',
        text: withDisclaimer(lines, ctx),
        actions: [{ kind: 'addTrip', departure: dep, return: ret, label: ctx.t('as.act.savePlanned') }],
        memory: { intent: 'whatif', dep, ret, dur: away },
      };
    },
  },
  {
    id: 'pr_card',
    match: (q) => has(q, /pr card|maple card|\bcard\b.*(renew|expir)/, '枫叶卡', 'pr卡', '续卡', '换卡'),
    run: (_q, ctx) => {
      const c = ctx.insights.prCard;
      if (!c) return { intent: 'pr_card', text: ctx.t('as.cardUnknown'), actions: [{ kind: 'navigate', to: 'settings', label: ctx.t('as.act.setCard') }] };
      const key = c.state === 'expired' ? 'as.cardExpired' : c.state === 'renew_now' ? 'as.cardRenewNow' : 'as.cardOk';
      return {
        intent: 'pr_card',
        text: withDisclaimer([ctx.t(key, { date: c.expiry, days: Math.abs(c.daysUntilExpiry), opens: c.renewalOpens, until: c.daysUntilRenewal }), ctx.t('as.cardDocs')], ctx),
      };
    },
  },
  {
    id: 'citizenship',
    match: (q) => has(q, /citizen|naturali[sz]|oath|1095|apply.*(when|date)/, '公民', '入籍', '入籍申请', '宣誓', '1095'),
    run: (_q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const c = ctx.insights.citizenship!;
      const lines: string[] = [];
      if (c.eligible) lines.push(ctx.t('as.citNow', { credited: c.credited, required: CITIZENSHIP_REQUIRED }));
      else if (c.eligibleDate)
        lines.push(ctx.t('as.citDate', { credited: c.credited, remaining: c.remaining, date: c.eligibleDate, days: c.daysUntilEligible ?? 0 }));
      else lines.push(ctx.t('as.citFar', { credited: c.credited }));
      if (c.prePrDays > 0) lines.push(ctx.t('as.citPrePr', { days: c.prePrDays, credit: Math.floor(c.prePrCredit) }));
      if (c.safeDate && !c.eligible) lines.push(ctx.t('as.citSafe', { date: c.safeDate, buffer: ctx.data.settings.citizenshipBuffer }));
      // Days are the only thing counted: say what isn't counted and what else is required.
      lines.push(ctx.t('common.citExclusions'));
      return { intent: 'citizenship', text: withDisclaimer(lines, ctx), actions: [{ kind: 'navigate', to: 'calendar', label: ctx.t('as.act.calendar') }] };
    },
  },
  {
    id: 'application',
    match: (q) => has(q, /\b(copr|ecopr|ppr|aor|my application|processing|biometric|medical|background check)\b/, '申请进度', '进度', '审理', '多久', '排期', '体检', '背调', '打指纹', '护照信'),
    run: (_q, ctx) => {
      const apps = ctx.data.applications.filter((a) => !a.archived && a.submitted);
      if (!apps.length) return { intent: 'application', text: ctx.t('as.noApps'), actions: [{ kind: 'navigate', to: 'timeline', label: ctx.t('as.act.timeline') }] };
      const lines = apps.map((a) => {
        const p = predict(a, ctx.today, ctx.open?.ircc ?? {}, ctx.open?.community?.records ?? []);
        if (!p) return '';
        const name = a.label || ctx.t(`app.kind.${a.kind}`);
        const range = p.p25 && p.p75 ? ctx.t('as.appRange', { p25: p.p25, p75: p.p75 }) : '';
        return ctx.t('as.appLine', { name, elapsed: p.elapsed, percent: p.percent, date: p.p50, source: ctx.t(`pred.source.${p.source}`) }) + range;
      });
      return { intent: 'application', text: lines.filter(Boolean).join('\n'), actions: [{ kind: 'navigate', to: 'timeline', label: ctx.t('as.act.timeline') }] };
    },
  },
  {
    id: 'crs',
    match: (q) => has(q, /\bcrs\b|express entry|\bee\b|eligib|\bcec\b|\bfsw\b|\bfst\b|\bpnp\b|apply for pr|qualify/, '分数', '快速通道', '资格', '申请pr', '省提名'),
    run: (_q, ctx) => {
      const draws = ctx.open?.draws?.slice(0, 3) ?? [];
      const lines = [ctx.t('as.crs')];
      if (draws.length) lines.push(ctx.t('as.draws', { list: draws.map((d) => `${d.date} · ${d.name} · ${d.crs}`).join('; ') }));
      return { intent: 'crs', text: lines.join('\n'), actions: [{ kind: 'navigate', to: 'eligibility', label: ctx.t('as.act.eligibility') }] };
    },
  },
  {
    id: 'rules',
    match: (q) => has(q, /\brules?\b|half.?day|\bcount(ed|ing|s)?\b|departure day|\btax(es)?\b|language test|how (is|are).*(calculated|counted)/, '规则', '怎么算', '半天', '报税', '语言', '计算'),
    run: (_q, ctx) => ({ intent: 'rules', text: withDisclaimer([ctx.t('as.rules')], ctx) }),
  },
  {
    id: 'privacy',
    match: (q) => has(q, /privacy|data|backup|export|delete|secure/, '隐私', '数据', '备份', '导出', '删除'),
    run: (_q, ctx) => ({ intent: 'privacy', text: ctx.t('as.privacy'), actions: [{ kind: 'navigate', to: 'settings', label: ctx.t('as.act.settings') }] }),
  },
  {
    id: 'summary',
    match: (q) => has(q, /\b(hi|hello|hey|summary|overview|status|how am i doing)\b/, '你好', '总结', '概况', '情况', '状态'),
    run: (_q, ctx) => summary(ctx),
  },
];

function summary(ctx: Ctx): AssistantReply {
  const i = ctx.insights;
  const lines = [ctx.t('as.hello')];
  if (!ctx.data.profile.prDate) lines.push(ctx.t('as.needPr'));
  if (i.citizenship) {
    lines.push(
      i.citizenship.eligible
        ? ctx.t('as.sumCitNow')
        : ctx.t('as.sumCit', { credited: i.citizenship.credited, date: i.citizenship.eligibleDate ?? '—' }),
    );
  }
  if (i.residency) lines.push(ctx.t(i.residency.compliant ? 'as.sumResOk' : 'as.sumResBad', { present: i.residency.present }));
  if (i.prCard) lines.push(ctx.t('as.sumCard', { date: i.prCard.expiry, days: i.prCard.daysUntilExpiry }));
  if (i.ongoingTrip) lines.push(ctx.t('as.sumAbroad', { date: i.ongoingTrip.departure }));
  return { intent: 'summary', text: lines.join('\n'), actions: suggestions(ctx) };
}

export function suggestions(ctx: Pick<Ctx, 't' | 'insights'>): AssistantAction[] {
  const t = ctx.t;
  const list: AssistantAction[] = [
    { kind: 'ask', text: t('as.q.citizenship'), label: t('as.q.citizenship') },
    { kind: 'ask', text: t('as.q.whatif'), label: t('as.q.whatif') },
    { kind: 'ask', text: t('as.q.residency'), label: t('as.q.residency') },
    { kind: 'ask', text: t('as.q.card'), label: t('as.q.card') },
  ];
  if (ctx.insights.ongoingTrip) list.unshift({ kind: 'ask', text: t('as.q.back'), label: t('as.q.back') });
  return list;
}

export function answer(
  question: string,
  data: AppData,
  t: Translate,
  open?: OpenData,
  today?: ISODate,
  memory: Memory = {},
  lang: string = data.settings.language,
): AssistantReply {
  const insights = computeInsights(data, today);
  const ctx: Ctx = { data, insights, open, t, today: insights.today, mem: memory, lang };
  const q = normalizeDigits(question.trim().toLowerCase().replace(/[’‘]/g, "'"));
  if (!q) return summary(ctx);
  for (const h of handlers) {
    if (h.match(q) || lexHas(q, h.id)) {
      const r = h.run(q, ctx);
      if (r) return r;
    }
  }
  // Follow-up with only new numbers/dates ("and 3 months?", "what about June 1?").
  const followUp = memory.intent && (findDuration(q) !== null || findDates(q, insights.today).length > 0);
  if (followUp) {
    const h = handlers.find((x) => x.id === memory.intent);
    const r = h?.run(q, ctx);
    if (r) return r;
  }
  return { intent: 'fallback', text: t('as.fallback'), actions: suggestions(ctx) };
}

export { proactiveTips } from './tips';

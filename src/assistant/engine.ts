// "Maple" — the on-device smart assistant. Rule-based intent matching over the user's
// own data; answers are computed locally, nothing is sent anywhere.
import { addDays, diffDays, type ISODate } from '../domain/dates';
import { computeInsights, type Insights } from '../domain/insights';
import { CITIZENSHIP_REQUIRED, RESIDENCY_REQUIRED, withExtraTrip } from '../domain/presence';
import { predict } from '../domain/timeline';
import type { AppData } from '../domain/types';
import type { OpenData } from '../data/remote';
import { findDates, findDuration, findYear } from './parse';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type AssistantAction =
  | { kind: 'navigate'; to: string; label: string }
  | { kind: 'addTrip'; departure: ISODate; return?: ISODate; label: string }
  | { kind: 'ask'; text: string; label: string };

export interface AssistantReply {
  intent: string;
  text: string;
  actions?: AssistantAction[];
}

interface Ctx {
  data: AppData;
  insights: Insights;
  open?: OpenData;
  t: Translate;
  today: ISODate;
}

type Handler = (q: string, ctx: Ctx) => AssistantReply | null;

const has = (q: string, ...words: (string | RegExp)[]) =>
  words.some((w) => (typeof w === 'string' ? q.includes(w) : w.test(q)));

const TRAVEL = [/\b(travel|trip|leave|go abroad|go back|visit|vacation|holiday|away|outside canada|fly)\b/, '出国', '旅行', '回国', '离开', '出境', '度假', '旅游', '出去'];

function needPr(ctx: Ctx): AssistantReply | null {
  if (ctx.data.profile.prDate) return null;
  return {
    intent: 'need_pr',
    text: ctx.t('as.needPr'),
    actions: [{ kind: 'navigate', to: 'settings', label: ctx.t('as.act.setPrDate') }],
  };
}

const handlers: { id: string; match: (q: string) => boolean; run: Handler }[] = [
  {
    id: 'log_return',
    match: (q) => has(q, /\b(i'?m back|i am back|came back|got back|returned|arrived back|back in canada|back home)\b/, '我回来了', '回到加拿大', '入境了', '已经回来', '回来了'),
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
    match: (q) => has(q, /\b(i left|i'?m leaving|i am leaving|left canada|departed|flying out)\b/, '我走了', '离开了', '出境了', '今天出国', '我出发'),
    run: (q, ctx) => {
      const dates = findDates(q, ctx.today, 'past');
      const dep = dates[0]?.date ?? ctx.today;
      const ret = dates[1]?.date;
      return {
        intent: 'log_departure',
        text: ret ? ctx.t('as.confirmTrip', { dep, ret }) : ctx.t('as.confirmDeparture', { dep }),
        actions: [{ kind: 'addTrip', departure: dep, return: ret, label: ctx.t('as.act.logTrip') }],
      };
    },
  },
  {
    id: 'residency',
    match: (q) => has(q, /residen(cy|t) obligation|\b730\b|lose (my )?pr|keep (my )?pr|how (long|many days) (can|could) i (stay|be|go|travel)|max(imum)? (absence|days away)/, '居住义务', '移民监', '730', '保持身份', '能出去多久', '能出国多久', '最多出国', '最多能出', '最长能'),
    run: (_q, ctx) => {
      const np = needPr(ctx);
      if (np) return np;
      const r = ctx.insights.residency!;
      const lines = [ctx.t(r.compliant ? 'as.resOk' : 'as.resBad', { present: r.present, required: RESIDENCY_REQUIRED, short: r.shortfall })];
      if (r.anniversary) lines.push(ctx.t('as.resNew', { date: r.anniversary }));
      if (r.compliant && r.mustReturnBy)
        lines.push(ctx.t(ctx.insights.ongoingTrip ? 'as.resReturnBy' : 'as.resMaxAway', { days: r.maxAbsence, date: r.mustReturnBy }));
      if (!r.compliant && r.regainDate) lines.push(ctx.t('as.resRegain', { date: r.regainDate }));
      return { intent: 'residency', text: lines.join('\n') };
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
      const dur = findDuration(q);
      let dep: ISODate;
      let ret: ISODate;
      if (dates.length >= 2) {
        dep = dates[0].date;
        ret = dates[1].date;
      } else if (dates.length === 1 && dur) {
        dep = dates[0].date;
        ret = addDays(dep, dur + 1);
      } else if (dur) {
        dep = addDays(ctx.today, 1);
        ret = addDays(dep, dur + 1);
      } else {
        return { intent: 'whatif', text: ctx.t('as.whatifHelp') };
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
      const away = Math.max(0, diffDays(ret, dep) - 1);
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
        text: lines.join('\n'),
        actions: [{ kind: 'addTrip', departure: dep, return: ret, label: ctx.t('as.act.savePlanned') }],
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
        text: [ctx.t(key, { date: c.expiry, days: Math.abs(c.daysUntilExpiry), opens: c.renewalOpens, until: c.daysUntilRenewal }), ctx.t('as.cardDocs')].join('\n'),
      };
    },
  },
  {
    id: 'citizenship',
    match: (q) => has(q, /citizen|naturali[sz]|oath|passport|1095|apply.*(when|date)/, '公民', '入籍', '入籍申请', '宣誓', '护照', '1095'),
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
      lines.push(ctx.t('as.citOther'));
      return { intent: 'citizenship', text: lines.join('\n'), actions: [{ kind: 'navigate', to: 'calendar', label: ctx.t('as.act.calendar') }] };
    },
  },
  {
    id: 'application',
    match: (q) => has(q, /\b(copr|ecopr|ppr|aor|my application|processing|biometric|medical|background check)\b/, '申请进度', '进度', '审理', '多久', '排期', '体检', '背调', '打指纹', '护照信'),
    run: (_q, ctx) => {
      const apps = ctx.data.applications.filter((a) => !a.archived && a.submitted);
      if (!apps.length) return { intent: 'application', text: ctx.t('as.noApps'), actions: [{ kind: 'navigate', to: 'timeline', label: ctx.t('as.act.timeline') }] };
      const lines = apps.map((a) => {
        const p = predict(a, ctx.today, ctx.open?.ircc?.times ?? {}, ctx.open?.community?.records ?? []);
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
    run: (_q, ctx) => ({ intent: 'rules', text: ctx.t('as.rules') }),
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

export function answer(question: string, data: AppData, t: Translate, open?: OpenData, today?: ISODate): AssistantReply {
  const insights = computeInsights(data, today);
  const ctx: Ctx = { data, insights, open, t, today: insights.today };
  const q = question.trim().toLowerCase().replace(/[’‘]/g, "'");
  if (!q) return summary(ctx);
  for (const h of handlers) {
    if (h.match(q)) {
      const r = h.run(q, ctx);
      if (r) return r;
    }
  }
  return { intent: 'fallback', text: t('as.fallback'), actions: suggestions(ctx) };
}

/** Proactive tips shown on the Home screen. */
export function proactiveTips(data: AppData, insights: Insights): { key: string; vars?: Record<string, string | number>; severity: 'info' | 'warn' | 'critical' }[] {
  const tips: ReturnType<typeof proactiveTips> = [];
  if (!data.profile.prDate) tips.push({ key: 'tip.setPr', severity: 'info' });
  if (insights.tripIssues.length) tips.push({ key: 'tip.tripIssues', vars: { n: insights.tripIssues.length }, severity: 'warn' });
  if (insights.residency && !insights.residency.compliant) tips.push({ key: 'tip.resBad', vars: { short: insights.residency.shortfall }, severity: 'critical' });
  else if (insights.ongoingTrip && insights.residency?.mustReturnBy && insights.residency.maxAbsence < 90)
    tips.push({ key: 'tip.returnSoon', vars: { date: insights.residency.mustReturnBy }, severity: 'warn' });
  if (insights.prCard?.state === 'renew_now') tips.push({ key: 'tip.renewCard', vars: { date: insights.prCard.expiry }, severity: 'warn' });
  if (insights.prCard?.state === 'expired') tips.push({ key: 'tip.cardExpired', severity: 'warn' });
  if (insights.citizenship?.eligible) tips.push({ key: 'tip.citEligible', severity: 'info' });
  const c = insights.citizenship;
  if (c && !c.eligible && c.daysUntilEligible !== null && c.daysUntilEligible <= 60)
    tips.push({ key: 'tip.citSoon', vars: { days: c.daysUntilEligible }, severity: 'info' });
  if (data.profile.prDate && !data.profile.prCardExpiry) tips.push({ key: 'tip.setCard', severity: 'info' });
  const years = new Set(data.profile.taxYearsFiled);
  const lastYear = Number(insights.today.slice(0, 4)) - 1;
  if (data.profile.prDate && data.profile.prDate.slice(0, 4) <= String(lastYear) && !years.has(lastYear))
    tips.push({ key: 'tip.tax', vars: { year: lastYear }, severity: 'info' });
  return tips;
}

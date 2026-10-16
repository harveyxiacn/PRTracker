// Proactive tips for the Home screen. Kept apart from the Maple engine so Home doesn't pull
// the whole assistant (parser, knowledge base, lexicons) into the main bundle.
import type { Insights } from '../domain/insights';
import type { AppData } from '../domain/types';

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

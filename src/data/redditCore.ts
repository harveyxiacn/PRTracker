// Pure helpers for the optional Reddit ingestion (scripts/fetch-reddit.ts): turn a public
// timeline post into an anonymised community record. Only facts are kept (program, month of
// submission, day counts, province/country codes, a known office name); never the post id,
// author, title or text. Posts are de-duplicated with a salted hash of the id.
import { diffDays, isISODate, type ISODate } from '../domain/dates';
import { COUNTRY_CODES } from '../domain/countries';
import { parseTimelineText } from '../domain/pasteParser';
import { PROGRAMS, PROVINCES, knownOffice } from '../domain/programs';
import type { CommunityRecord } from '../domain/timeline';

/** The fields of a Reddit listing child (`data`) this module reads. */
export interface RedditPost {
  id: string;
  title?: string;
  selftext?: string;
  /** Seconds since the epoch. */
  created_utc?: number;
  removed_by_category?: string | null;
}

export interface RedditRecord extends CommunityRecord {
  source: 'reddit';
}

export type RejectReason = 'removed' | 'no_kind' | 'kind_uncertain' | 'few_milestones' | 'no_submitted' | 'uncertain_dates' | 'future_dates' | 'out_of_range';

export const MIN_MILESTONES = 3;
const KINDS = new Set(PROGRAMS.map((p) => p.id));

/**
 * Convert a post into a community record, or say why it was rejected.
 * Accepted only when the program is known with confidence, there are at least 3 milestones,
 * a submission/AOR date is present, and no date was ambiguous or had its year inferred.
 */
export function postToRecord(post: RedditPost, today: ISODate): { record?: RedditRecord; reason?: RejectReason } {
  const body = post.selftext ?? '';
  if (post.removed_by_category || /^\s*\[(removed|deleted)\]\s*$/i.test(body)) return { reason: 'removed' };
  const parsed = parseTimelineText(`${post.title ?? ''}\n${body}`, today);
  if (!parsed.kind || parsed.kind === 'other' || !KINDS.has(parsed.kind)) return { reason: 'no_kind' };
  // "Express Entry" without CEC/FSW/FST resolves to CEC as a guess; FSW timelines filed as CEC
  // would skew the per-program statistics, so those posts are skipped.
  if (parsed.kindUncertain) return { reason: 'kind_uncertain' };
  if (parsed.milestones.length < MIN_MILESTONES) return { reason: 'few_milestones' };
  const submitted = parsed.submitted;
  if (!submitted || !isISODate(submitted)) return { reason: 'no_submitted' };
  if (parsed.milestones.some((m) => m.uncertain)) return { reason: 'uncertain_dates' };
  if (parsed.milestones.some((m) => m.date > today)) return { reason: 'future_dates' };
  const days: Record<string, number> = {};
  for (const m of parsed.milestones) {
    if (m.key === 'submitted') continue;
    const d = diffDays(m.date, submitted);
    if (d < 0) continue; // before submission (profile, ITA…): not shared, as in toCommunityRecord
    if (d > 3650) return { reason: 'out_of_range' };
    days[m.key] = d;
  }
  // The submission itself plus at least two later milestones.
  if (Object.keys(days).length < MIN_MILESTONES - 1) return { reason: 'few_milestones' };
  const record: RedditRecord = { kind: parsed.kind, submittedMonth: submitted.slice(0, 7), days, source: 'reddit' };
  const office = knownOffice(parsed.office);
  if (office) record.office = office;
  if (parsed.province && (PROVINCES as readonly string[]).includes(parsed.province)) record.province = parsed.province;
  if (parsed.country && COUNTRY_CODES.includes(parsed.country)) record.country = parsed.country;
  // Key order matches build-community.mjs output: kind, submittedMonth, days, office, province, country, source.
  const { source, ...rest } = record;
  return { record: { ...rest, source } };
}

/** "t3_1AbCd", " 1abcd " -> "1abcd": the same post always hashes the same way. */
export function normalizePostId(id: string): string {
  return id.trim().toLowerCase().replace(/^t3_/, '');
}

/** Text that is hashed for the seen list. */
export function seenHashInput(id: string, salt: string): string {
  return `pr-tracker-reddit:${salt}:${normalizePostId(id)}`;
}

/** Salted SHA-256 (hex) of a post id. Only these hashes are stored, never ids. */
export async function hashPostId(id: string, salt: string): Promise<string> {
  if (!salt) throw new Error('A hash salt is required');
  const bytes = new TextEncoder().encode(seenHashInput(id, salt));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parse community/reddit-seen.txt (one hex hash per line). */
export function parseSeen(text: string): Set<string> {
  return new Set(text.split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{64}$/.test(l)));
}

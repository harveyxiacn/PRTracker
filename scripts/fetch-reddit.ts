// Optional: collects anonymised timelines from public r/ImmigrationCanada posts.
// Inactive until the repository owner adds the secrets described in docs/REDDIT.md.
// Run: npx tsx scripts/fetch-reddit.ts   (then node scripts/build-community.mjs)
//
// Stores only anonymised facts (community/reddit.jsonl) and salted SHA-256 hashes of the post
// ids already used (community/reddit-seen.txt). No ids, usernames, titles or text are written.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { hashPostId, parseSeen, postToRecord, type RedditPost, type RejectReason } from '../src/data/redditCore';
// @ts-ignore -- plain ESM script without type declarations; same validator as the intake.
import { validate } from './build-community.mjs';

const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_HASH_SALT } = process.env;
// Reddit's recommended format: <platform>:<app id>:<version> (by /u/<username>)
const USER_AGENT = `github-actions:io.github.harveyxiacn.prtracker:1.0 (by /u/${REDDIT_USERNAME})`;
const QUERY = '(eCOPR OR COPR OR AOR OR "PPR") timeline';
const MAX_PAGES = 3;
const PAGE_DELAY_MS = 2000; // well under Reddit's 60 requests/minute for OAuth clients
const SEEN_FILE = 'community/reddit-seen.txt';
const OUT_FILE = 'community/reddit.jsonl';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function token(): Promise<string> {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Reddit token: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('Reddit token: no access_token in response');
  return j.access_token;
}

/** Wait when Reddit says the rate-limit window is nearly used up. */
async function respectRateLimit(res: Response) {
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(remaining) && remaining < 5 && Number.isFinite(reset)) {
    console.log(`rate limit: ${remaining} left, waiting ${reset}s`);
    await sleep((reset + 1) * 1000);
  }
}

async function search(accessToken: string): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    const params = new URLSearchParams({ q: QUERY, restrict_sr: '1', sort: 'new', t: 'week', limit: '100', raw_json: '1' });
    if (after) params.set('after', after);
    const res = await fetch(`https://oauth.reddit.com/r/ImmigrationCanada/search?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      console.warn('rate limited (429); stopping early');
      break;
    }
    if (!res.ok) throw new Error(`Reddit search: HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { after?: string | null; children?: { kind?: string; data?: RedditPost }[] } };
    for (const c of j.data?.children ?? []) if (c.kind === 't3' && c.data && typeof c.data.id === 'string') posts.push(c.data);
    after = j.data?.after ?? undefined;
    await respectRateLimit(res);
    if (!after) break;
  }
  return posts;
}

async function main() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_HASH_SALT) {
    console.log('fetch-reddit: REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_HASH_SALT not set; skipping (see docs/REDDIT.md)');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let seen = new Set<string>();
  try {
    seen = parseSeen(await readFile(SEEN_FILE, 'utf8'));
  } catch {
    /* first run */
  }
  const posts = await search(await token());
  const reasons: Partial<Record<RejectReason | 'seen' | 'invalid', number>> = {};
  const count = (r: RejectReason | 'seen' | 'invalid') => (reasons[r] = (reasons[r] ?? 0) + 1);
  const records: string[] = [];
  const hashes: string[] = [];
  for (const post of posts) {
    const h = await hashPostId(post.id, REDDIT_HASH_SALT);
    if (seen.has(h)) {
      count('seen');
      continue;
    }
    const { record, reason } = postToRecord(post, today);
    if (!record) {
      count(reason ?? 'invalid');
      continue;
    }
    const err = validate(record) as string | null;
    if (err) {
      count('invalid');
      continue;
    }
    seen.add(h);
    hashes.push(h);
    records.push(JSON.stringify(record));
  }
  if (records.length) {
    await mkdir('community', { recursive: true });
    await appendFile(OUT_FILE, records.map((r) => r + '\n').join(''));
    await appendFile(SEEN_FILE, hashes.map((h) => h + '\n').join(''));
  }
  console.log(`fetch-reddit: ${posts.length} posts, ${records.length} new records`, reasons);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

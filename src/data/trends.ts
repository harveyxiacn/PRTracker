// CONTRACT (v0.4): IRCC processing-time history (public/data/ircc-history.json, appended daily
// by the data workflow via scripts/ircc-history.mjs) and its loader. Owner: data-pipeline agent.
import { validateTrends } from './trendsCore';

export interface TrendPoint {
  date: string; // YYYY-MM-DD (snapshot date)
  days: number;
}
export interface TrendsData {
  updated: string;
  /** series key -> points, e.g. "pr_card", "work_ext", "study:IN", "visitor-outside-canada:PH". */
  series: Record<string, TrendPoint[]>;
}

const FILE = 'ircc-history.json';

async function fetchTrends(url: string, timeoutMs = 8000): Promise<TrendsData | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return undefined;
    return validateTrends(await res.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

const join = (base: string, file: string) => (base.endsWith('/') ? base + file : `${base}/${file}`);

/** Load the history from the configured open-data URL, falling back to the bundled copy. */
export async function loadTrends(baseUrl: string): Promise<TrendsData | undefined> {
  const remote = baseUrl ? await fetchTrends(join(baseUrl, FILE)) : undefined;
  return remote ?? (await fetchTrends(`${import.meta.env.BASE_URL}data/${FILE}`));
}

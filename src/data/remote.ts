// Open data the app reads (never writes): IRCC processing times, Express Entry draws and
// anonymised community timelines, mirrored to GitHub Pages by a scheduled workflow.
// Requests carry no personal data. A copy is bundled with the app for offline use.
import type { CommunityRecord } from '../domain/timeline';
import type { IrccCountrySeries } from '../domain/programs';

export interface IrccData {
  updated: string; // IRCC "lastupdated" text
  fetchedAt: string;
  /** Normalised processing time in days per program id / IRCC time key. */
  times: Record<string, number>;
  /** Per-country series (study, work, visitor…) -> ISO country -> days. */
  byCountry: Partial<Record<IrccCountrySeries, Record<string, number>>>;
  /** Every IRCC entry as published (path -> text), for the "all processing times" list. */
  entries: Record<string, string>;
}

export interface Draw {
  number: number;
  date: string;
  name: string;
  size: number;
  crs: number;
}

export interface CommunityData {
  updated: string;
  records: CommunityRecord[];
}

export interface OpenData {
  ircc?: IrccData;
  draws?: Draw[];
  community?: CommunityData;
  /** Where it came from: 'remote' | 'bundled' */
  origin: 'remote' | 'bundled' | 'none';
}

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function join(base: string, file: string) {
  return base.endsWith('/') ? base + file : `${base}/${file}`;
}

export async function loadOpenData(remoteBase: string, bundledBase = `${import.meta.env.BASE_URL}data/`): Promise<OpenData> {
  const files = ['ircc.json', 'draws.json', 'community.json'] as const;
  const fetchAll = (base: string) => Promise.all(files.map((f) => getJson<unknown>(join(base, f))));
  let origin: OpenData['origin'] = 'remote';
  let [ircc, draws, community] = remoteBase ? await fetchAll(remoteBase) : [undefined, undefined, undefined];
  if (!ircc && !draws && !community) {
    origin = 'bundled';
    [ircc, draws, community] = await fetchAll(bundledBase);
  }
  if (!ircc && !draws && !community) origin = 'none';
  const drawList = draws && typeof draws === 'object' && Array.isArray((draws as { draws?: unknown }).draws)
    ? ((draws as { draws: Draw[] }).draws)
    : undefined;
  return {
    ircc: validIrcc(ircc),
    draws: drawList?.filter((d) => d && typeof d.crs === 'number' && typeof d.date === 'string'),
    community: validCommunity(community),
    origin,
  };
}

// The data URL is user-configurable, so never trust the shape of what comes back.
function validIrcc(v: unknown): IrccData | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<IrccData>;
  const times: IrccData['times'] = {};
  for (const [k, n] of Object.entries(o.times ?? {})) if (typeof n === 'number' && n > 0) times[k] = n;
  const byCountry: IrccData['byCountry'] = {};
  for (const [series, map] of Object.entries(o.byCountry ?? {})) {
    if (!map || typeof map !== 'object') continue;
    const clean: Record<string, number> = {};
    for (const [cc, n] of Object.entries(map)) if (/^[A-Z]{2}$/.test(cc) && typeof n === 'number' && n > 0) clean[cc] = n;
    byCountry[series as IrccCountrySeries] = clean;
  }
  const entries: Record<string, string> = {};
  for (const [k, s] of Object.entries(o.entries ?? {})) if (typeof s === 'string') entries[k] = s;
  return { updated: String(o.updated ?? ''), fetchedAt: String(o.fetchedAt ?? ''), times, byCountry, entries };
}

function validCommunity(v: unknown): CommunityData | undefined {
  if (!v || typeof v !== 'object' || !Array.isArray((v as CommunityData).records)) return undefined;
  const records = (v as CommunityData).records.filter(
    (r) => r && typeof r.kind === 'string' && /^\d{4}-\d{2}$/.test(String(r.submittedMonth)) && !!r.days && typeof r.days === 'object',
  );
  return { updated: String((v as CommunityData).updated ?? ''), records };
}

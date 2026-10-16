// Open data the app reads (never writes): IRCC processing times, Express Entry draws and
// anonymised community timelines, mirrored to GitHub Pages by a scheduled workflow.
// Requests carry no personal data. A copy is bundled with the app for offline use.
import type { ApplicationKind } from '../domain/types';
import type { CommunityRecord } from '../domain/timeline';

export interface IrccData {
  updated: string; // IRCC "lastupdated" text
  fetchedAt: string;
  /** Normalised processing time in days per application kind. */
  times: Partial<Record<ApplicationKind, number>>;
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
    ircc: ircc as IrccData | undefined,
    draws: drawList,
    community: community as CommunityData | undefined,
    origin,
  };
}

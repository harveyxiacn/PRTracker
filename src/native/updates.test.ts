import { describe, expect, it } from 'vitest';
import { isNewer, parseRelease, parseVersion, updateErrorKey } from './updates';

const asset = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  size: 9_000_000,
  browser_download_url: `https://github.com/harveyxiacn/PRTracker/releases/download/v0.10.0/${name}`,
  ...extra,
});

describe('in-app updates', () => {
  it('parses and compares versions', () => {
    expect(parseVersion('v0.10.0')).toEqual([0, 10, 0]);
    expect(parseVersion('0.9.1')).toEqual([0, 9, 1]);
    expect(parseVersion('v1.0.0-beta')).toBeNull();
    expect(isNewer('v0.10.0', '0.9.0')).toBe(true); // numeric, not string, comparison
    expect(isNewer('0.9.0', '0.9.0')).toBe(false);
    expect(isNewer('0.8.9', '0.9.0')).toBe(false);
    expect(isNewer('garbage', '0.9.0')).toBe(false);
  });

  it('offers only the release-signed APK from this repository, with its SHA-256', () => {
    const r = parseRelease({
      tag_name: 'v0.10.0',
      body: 'notes',
      html_url: 'https://github.com/harveyxiacn/PRTracker/releases/tag/v0.10.0',
      published_at: '2026-10-30T01:02:03Z',
      assets: [asset('pr-tracker-v0.10.0-test-build-debug.apk'), asset('pr-tracker-v0.10.0-web.zip'), asset('pr-tracker-v0.10.0.apk', { digest: 'sha256:' + 'AB'.repeat(32) })],
    });
    expect(r?.version).toBe('0.10.0');
    expect(r?.published).toBe('2026-10-30');
    expect(r?.apk?.name).toBe('pr-tracker-v0.10.0.apk');
    expect(r?.apk?.sha256).toBe('ab'.repeat(32));
  });

  it('has no APK for a test-build-only release or a foreign download address', () => {
    expect(parseRelease({ tag_name: 'v0.10.0', assets: [asset('pr-tracker-v0.10.0-test-build-debug.apk')] })?.apk).toBeNull();
    const foreign = { ...asset('pr-tracker-v0.10.0.apk'), browser_download_url: 'https://evil.example/pr-tracker-v0.10.0.apk' };
    expect(parseRelease({ tag_name: 'v0.10.0', assets: [foreign] })?.apk).toBeNull();
  });

  it('ignores drafts, pre-releases and malformed data', () => {
    expect(parseRelease({ tag_name: 'v0.10.0', draft: true })).toBeNull();
    expect(parseRelease({ tag_name: 'v0.10.0', prerelease: true })).toBeNull();
    expect(parseRelease({ tag_name: 'latest' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('maps native errors to messages', () => {
    expect(updateErrorKey('signature')).toBe('upd.errSignature');
    expect(updateErrorKey('test-build')).toBe('upd.errTestBuild');
    expect(updateErrorKey(undefined)).toBe('upd.errNetwork');
  });
});

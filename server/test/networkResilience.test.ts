import { describe, expect, it } from 'vitest';

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function buildCandidateList(activeUrl: string, detectedIp?: string): string[] {
  const defaults = [
    activeUrl,
    detectedIp ? `http://${detectedIp}:4000` : null,
    'http://10.186.129.215:4000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'http://10.0.2.2:4000',
  ].filter((item): item is string => Boolean(item));

  return Array.from(new Set(defaults.map(normalizeBaseUrl)));
}

describe('Network & Connection Resilience', () => {
  it('normalizes base URLs correctly with trailing slashes and whitespace', () => {
    expect(normalizeBaseUrl('http://192.168.1.42:4000/')).toBe('http://192.168.1.42:4000');
    expect(normalizeBaseUrl('  http://localhost:4000/// ')).toBe('http://localhost:4000');
    expect(normalizeBaseUrl('http://10.186.129.215:4000')).toBe('http://10.186.129.215:4000');
  });

  it('builds candidate list prioritizing active URL and detected Wi-Fi host', () => {
    const candidates = buildCandidateList('http://192.168.1.42:4000', '10.186.129.215');
    expect(candidates[0]).toBe('http://192.168.1.42:4000');
    expect(candidates).toContain('http://10.186.129.215:4000');
    expect(candidates).toContain('http://localhost:4000');
    expect(candidates).toContain('http://127.0.0.1:4000');
    expect(candidates).toContain('http://10.0.2.2:4000');
  });

  it('deduplicates redundant candidates in candidate list', () => {
    const candidates = buildCandidateList('http://localhost:4000', 'localhost');
    const unique = new Set(candidates);
    expect(candidates.length).toBe(unique.size);
  });

  it('aborts stalled requests with AbortController within specified timeout threshold', async () => {
    const controller = new AbortController();
    const timeoutMs = 50;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();
    let aborted = false;

    try {
      await new Promise<void>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('AbortError'));
        });
      });
    } catch (err) {
      aborted = err instanceof Error && err.message === 'AbortError';
    } finally {
      clearTimeout(timer);
    }

    const elapsed = Date.now() - startTime;
    expect(aborted).toBe(true);
    expect(elapsed).toBeLessThan(300);
  });
});

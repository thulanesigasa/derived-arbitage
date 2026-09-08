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

  it('filters out stale 192.168.1.42 from host detection and falls back to active LAN', () => {
    function resolveHost(hostCandidate: string | undefined, defaultHost: string): string {
      if (hostCandidate && hostCandidate !== '192.168.1.42' && hostCandidate !== '127.0.0.1' && hostCandidate !== 'localhost') {
        return `http://${hostCandidate}:4000`;
      }
      return `http://${defaultHost}:4000`;
    }

    expect(resolveHost('192.168.1.42', '10.186.129.215')).toBe('http://10.186.129.215:4000');
    expect(resolveHost('10.0.0.50', '10.186.129.215')).toBe('http://10.0.0.50:4000');
    expect(resolveHost(undefined, '10.186.129.215')).toBe('http://10.186.129.215:4000');
  });

  it('validates SYMBOL_MAP contains all 10 synthetic instruments with correct codes and families', async () => {
    const { SYMBOL_MAP } = await import('../src/deriv/symbolMap.js');
    expect(SYMBOL_MAP.length).toBe(10);
    const codes = SYMBOL_MAP.map((s) => s.code);
    expect(codes).toEqual([
      'R_10',
      'R_50',
      'R_75',
      'R_100',
      '1HZ100V',
      'stpRNG',
      'BOOM500',
      'BOOM1000',
      'CRASH500',
      'CRASH300',
    ]);
    SYMBOL_MAP.forEach((s) => {
      expect(s.code.length).toBeGreaterThan(0);
      expect(s.display.length).toBeGreaterThan(0);
      expect(['volatility', 'boom', 'crash', 'step']).toContain(s.group);
    });
  });
});

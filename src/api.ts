import Constants from 'expo-constants';
import type {
  ControllerState,
  ControlAction,
  SymbolName,
  AuthTokenResponse,
  LiveActivationReport,
  MonteCarloSimulationResult,
} from './types';

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function deriveApiUrl(): string {
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string> };
  };
  const configured = g.process?.env?.EXPO_PUBLIC_API_URL;
  if (configured) return normalizeBaseUrl(configured);

  // If running in a web browser, use the exact hostname serving the app
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const webHost = window.location.hostname;
    if (webHost && webHost !== '') {
      return `http://${webHost}:4000`;
    }
  }

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.replace(/^https?:\/\//, '').split(':')[0];
  return host ? `http://${host}:4000` : 'http://127.0.0.1:4000';
}

export let API_BASE_URL = deriveApiUrl();

const urlChangeListeners = new Set<(url: string) => void>();

export function setApiBaseUrl(url: string): void {
  const normalized = normalizeBaseUrl(url);
  if (normalized !== API_BASE_URL) {
    API_BASE_URL = normalized;
    urlChangeListeners.forEach((listener) => listener(normalized));
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function onApiBaseUrlChange(listener: (url: string) => void): () => void {
  urlChangeListeners.add(listener);
  return () => urlChangeListeners.delete(listener);
}

import { ALL_SYMBOLS } from './types';

export const OFFLINE_FALLBACK_STATE: ControllerState = {
  serverInstanceId: 'offline-demo-mode',
  revision: 1,
  status: 'stopped',
  accountType: 'Standard',
  mode: 'DEMO',
  connected: false,
  lastHeartbeat: new Date().toISOString(),
  balance: 20,
  equity: 20,
  sessionPnl: 0,
  dailyPnl: 0,
  weeklyPnl: 0,
  drawdown: 0,
  marginUsagePercent: 0,
  selectedSymbols: [...ALL_SYMBOLS],
  positions: [],
  riskPolicy: {
    initialBalance: 20,
    absoluteEquityFloor: 15,
    maximumTotalLoss: 5,
    defaultRiskPerTrade: 0.1,
    hardMaxRiskPerTrade: 0.2,
    dailyLossLock: 0.4,
    weeklyLossLock: 1,
    maxOpenPositions: 1,
    maxMarginUsagePercent: 20,
  },
  dailyLocked: false,
  weeklyLocked: false,
  equityFloorLocked: false,
  activity: [
    {
      id: 'offline-init-01',
      at: new Date().toISOString(),
      kind: 'info',
      message: 'Running in offline demo mode. Pull to refresh or check connection in Profile.',
    },
  ],
};

export const KNOWN_HOST_CANDIDATES = [
  'http://10.186.129.215:4000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://10.0.2.2:4000',
];

/**
 * Concurrent network probe that tests candidate URLs against /api/state in parallel.
 * Resolves within milliseconds to the first responding host.
 */
export async function probeCandidateUrls(customCandidates?: string[]): Promise<string | null> {
  const candidates = Array.from(
    new Set([
      'http://10.186.129.215:4000',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      API_BASE_URL,
      ...(customCandidates ?? []),
      ...KNOWN_HOST_CANDIDATES,
    ].map(normalizeBaseUrl))
  );

  const probe = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const resp = await fetch(`${url}/api/state`, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timer);
      if (resp.ok) return url;
      throw new Error(`Candidate ${url} returned ${resp.status}`);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    const active = await Promise.any(candidates.map(probe));
    setApiBaseUrl(active);
    return active;
  } catch {
    return null;
  }
}

let activeAuthToken: string | null = null;
let activeApiKey: string = 'falcon-vps-key-2026';
let activeDeviceId: string = 'device-demo-android-01';

export function setAuthCredentials(credentials: { token?: string | null; apiKey?: string; deviceId?: string }): void {
  if (credentials.token !== undefined) activeAuthToken = credentials.token;
  if (credentials.apiKey !== undefined) activeApiKey = credentials.apiKey;
  if (credentials.deviceId !== undefined) activeDeviceId = credentials.deviceId;
}

export function getAuthCredentials(): { token: string | null; apiKey: string; deviceId: string } {
  return { token: activeAuthToken, apiKey: activeApiKey, deviceId: activeDeviceId };
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 3500): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': activeDeviceId,
    'x-api-key': activeApiKey,
  };

  if (activeAuthToken) {
    headers['Authorization'] = `Bearer ${activeAuthToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...init?.headers },
    });
    clearTimeout(timer);
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
    return body;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Connection timed out after ${timeoutMs}ms reaching ${API_BASE_URL}`);
    }
    throw err;
  }
}

export function authenticateBridge(apiKey: string, deviceId: string): Promise<AuthTokenResponse> {
  return request<AuthTokenResponse>('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ apiKey, deviceId }),
  });
}

export function getState(): Promise<ControllerState> {
  return request<ControllerState>('/api/state');
}

export function sendControl(
  action: ControlAction,
  expectedRevision: number,
  requestId: string,
): Promise<ControllerState> {
  return request<ControllerState>('/api/control', {
    method: 'POST',
    body: JSON.stringify({ action, expectedRevision, requestId }),
  });
}

export function updateSymbols(
  symbols: SymbolName[],
  expectedRevision: number,
  requestId: string,
): Promise<ControllerState> {
  return request<ControllerState>('/api/settings/symbols', {
    method: 'PUT',
    body: JSON.stringify({ symbols, expectedRevision, requestId }),
  });
}

export function getStrategySignals(): Promise<import('./types').StrategyApiState> {
  return request<import('./types').StrategyApiState>('/api/strategy/signals');
}

export function getMarketStructure(
  code: string,
): Promise<import('./types').InstrumentStructureResponse> {
  return request<import('./types').InstrumentStructureResponse>(`/api/strategy/structure/${code}`);
}

export function getLiveActivationReport(): Promise<LiveActivationReport> {
  return request<LiveActivationReport>('/api/gates/status');
}

export function simulateMonteCarlo(iterations = 1000, confidence = 0.95): Promise<MonteCarloSimulationResult> {
  return request<MonteCarloSimulationResult>('/api/gates/simulate', {
    method: 'POST',
    body: JSON.stringify({ iterations, confidence }),
  });
}

export function activateLiveMode(expectedRevision: number, requestId: string): Promise<{ ok: boolean; state: ControllerState; report: LiveActivationReport }> {
  return request<{ ok: boolean; state: ControllerState; report: LiveActivationReport }>('/api/gates/activate-live', {
    method: 'POST',
    body: JSON.stringify({ expectedRevision, requestId }),
  });
}

export function stateSocketUrl(): string {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws');
  return activeAuthToken ? `${wsBase}/ws?token=${activeAuthToken}` : `${wsBase}/ws?apiKey=${activeApiKey}`;
}

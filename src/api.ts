import Constants from 'expo-constants';
import type {
  ControllerState,
  ControlAction,
  SymbolName,
  AuthTokenResponse,
  LiveActivationReport,
  MonteCarloSimulationResult,
} from './types';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function deriveApiUrl(): string {
  const g = globalThis as unknown as { process?: { env?: Record<string, string> } };
  const configured = g.process?.env?.EXPO_PUBLIC_API_URL;
  if (configured) return normalizeBaseUrl(configured);

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.replace(/^https?:\/\//, '').split(':')[0];
  return host ? `http://${host}:4000` : 'http://127.0.0.1:4000';
}

export const API_BASE_URL = deriveApiUrl();

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': activeDeviceId,
    'x-api-key': activeApiKey,
  };

  if (activeAuthToken) {
    headers['Authorization'] = `Bearer ${activeAuthToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
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

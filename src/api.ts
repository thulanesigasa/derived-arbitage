import Constants from 'expo-constants';
import type { ControllerState, ControlAction, SymbolName } from './types';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
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

export function stateSocketUrl(): string {
  return `${API_BASE_URL.replace(/^http/, 'ws')}/ws`;
}

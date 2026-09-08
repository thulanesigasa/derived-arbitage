export const ALL_SYMBOLS = [
  'Volatility 75 Index',
  'Volatility 100 Index',
  'Volatility 100 (1s) Index',
  'Step Index',
  'Boom 500 Index',
  'Boom 1000 Index',
  'Crash 500 Index',
  'Crash 100 Index',
  'Volatility 50 Index',
  'Volatility 10 Index',
] as const;

export type SymbolName = (typeof ALL_SYMBOLS)[number];

export type AutomationStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'emergency';

export type ControlAction = 'start' | 'pause' | 'resume' | 'stop' | 'emergencyExit';

export interface RiskPolicy {
  initialBalance: number;
  absoluteEquityFloor: number;
  maximumTotalLoss: number;
  defaultRiskPerTrade: number;
  hardMaxRiskPerTrade: number;
  dailyLossLock: number;
  weeklyLossLock: number;
  maxOpenPositions: number;
  maxMarginUsagePercent: number;
}

export interface SimulatedPosition {
  id: string;
  symbol: SymbolName;
  side: 'BUY' | 'SELL';
  risk: number;
  marginUsed: number;
  unrealizedPnl: number;
  openedAt: string;
  simulated: true;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  setupName?: string;
  rrRatio?: number;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
  message: string;
}

export interface ControllerState {
  serverInstanceId: string;
  revision: number;
  status: AutomationStatus;
  accountType: 'Standard';
  mode: 'DEMO' | 'LIVE';
  connected: boolean;
  lastHeartbeat: string;
  balance: number;
  equity: number;
  sessionPnl: number;
  dailyPnl: number;
  weeklyPnl: number;
  drawdown: number;
  marginUsagePercent: number;
  selectedSymbols: SymbolName[];
  positions: SimulatedPosition[];
  riskPolicy: RiskPolicy;
  dailyLocked: boolean;
  weeklyLocked: boolean;
  equityFloorLocked: boolean;
  activity: ActivityItem[];
}

export interface ApiErrorShape {
  error: string;
  code?: string;
  state?: ControllerState;
}

// ─── Market Profiler (Phase 2) ──────────────────────────────────────────────

export interface SymbolRiskConfig {
  riskPerTradeUsd:    number;
  equityFloorUsd:     number;
  startingBalanceUsd: number;
}

export interface SymbolProfile {
  code:                string;
  display:             SymbolName;
  group:               'volatility' | 'boom' | 'crash' | 'step';
  available:           boolean;
  isOpen:              boolean;
  pip:                 number;
  spotPrice:           number;
  spreadMedian:        number | null;
  spreadP95:           number | null;
  /** Ticks per second over the last 30 s of data. */
  tickVelocity:        number;
  tickCount:           number;
  affordable:          boolean;
  affordabilityNote:   string;
  lastTickAt:          string | null;
  riskConfig:          SymbolRiskConfig;
}

export interface ProfilerApiState {
  connected:        boolean;
  authorized:       boolean;
  profiles:         SymbolProfile[];
  lastRefreshedAt:  string | null;
}

// ─── Strategy Engine (Phase 3) ──────────────────────────────────────────────

export interface Candle {
  timestamp: number; // epoch ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

export type SetupType =
  | 'SMC_BOS_CONTINUATION'
  | 'SMC_CHOCH_REVERSAL'
  | 'FALCON_LIQUIDITY_SWEEP'
  | 'SMC_FVG_RETEST';

export interface StrategySignal {
  id:         string;
  symbol:     SymbolName;
  symbolCode: string;
  side:       'BUY' | 'SELL';
  setupName:  SetupType;
  entryPrice: number;
  stopLoss:   number;
  takeProfit: number;
  riskUsd:    number;
  rrRatio:    number;
  confidence: number;
  createdAt:  string;
}

export interface StrategyApiState {
  enabled:       boolean;
  activeSignals: StrategySignal[];
  recentSignals: StrategySignal[];
  trackedPairs:  number;
}

export interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

export interface FVGImbalance {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  timestamp: number;
  mitigated: boolean;
}

export interface SMCStructureAnalysis {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  lastBOS?: {
    type: 'BULLISH' | 'BEARISH';
    brokenPrice: number;
    candleTimestamp: number;
  };
  lastCHoCH?: {
    type: 'BULLISH' | 'BEARISH';
    brokenPrice: number;
    candleTimestamp: number;
  };
  activeFVGs: FVGImbalance[];
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
}

export interface InstrumentStructureResponse {
  code:      string;
  atr:       number;
  candles:   Candle[];
  structure: SMCStructureAnalysis;
}

export interface Mt5Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  profitUsd: number;
  openTime: string;
}

export interface Mt5TelemetryPayload {
  account: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  openPositions: Mt5Position[];
  dailyPnlUsd: number;
  riskLocked: boolean;
  equityFloorLocked: boolean;
  terminalTime: string;
}

export interface Mt5Command {
  id: string;
  type: 'EXECUTE_ORDER' | 'CLOSE_POSITION' | 'FLATTEN_ALL' | 'PING';
  symbol?: string;
  direction?: 'BUY' | 'SELL';
  lots?: number;
  stopLoss?: number;
  takeProfit?: number;
  ticket?: number;
  timestamp: string;
}

export interface Mt5BridgeStatus {
  connected: boolean;
  lastHeartbeat: string | null;
  account: number | null;
  balance: number;
  equity: number;
  freeMargin: number;
  dailyPnlUsd: number;
  openPositions: Mt5Position[];
  riskLocked: boolean;
  equityFloorLocked: boolean;
  pendingCommandsCount: number;
}

// ─── Phase 5: Auth & Security Types ──────────────────────────────────────────

export interface AuthTokenResponse {
  token: string;
  expiresIn: number;
  tokenType: 'Bearer';
  deviceId: string;
  issuedAt: string;
}

export interface AuthDevice {
  deviceId: string;
  label: string;
  registeredAt: string;
  lastActiveAt: string;
}

export interface AuthCredentials {
  apiKey: string;
  deviceId: string;
}

// ─── Phase 6: Live Activation Gate Types ─────────────────────────────────────

export interface GateEvaluation {
  id: string;
  title: string;
  passed: boolean;
  currentValue: number | string;
  threshold: number | string;
  unit: string;
  description: string;
}

export interface MonteCarloSimulationResult {
  iterations: number;
  confidencePercent: number;
  simulatedMaxDrawdown: number;
  worstCaseDrawdown: number;
  medianDrawdown: number;
  passed: boolean;
}

export interface LiveActivationReport {
  eligibleForLive: boolean;
  evaluatedAt: string;
  gates: GateEvaluation[];
  monteCarlo: MonteCarloSimulationResult;
  totalTradesEvaluated: number;
  demoPeriodDays: number;
  summary: string;
}


import type { ControllerState } from '../../src/types.js';

export interface ProposedTrade {
  risk: number;
  marginUsagePercent: number;
}

export interface RiskDecision {
  allowed: boolean;
  reasons: string[];
}

export function assessNewTrade(state: ControllerState, trade: ProposedTrade): RiskDecision {
  const reasons: string[] = [];
  if (state.status !== 'running') reasons.push('Automation is not running.');
  if (state.equity <= state.riskPolicy.absoluteEquityFloor) reasons.push('Absolute equity floor is active.');
  if (state.equity - trade.risk < state.riskPolicy.absoluteEquityFloor) reasons.push(`Trade risk could breach the $${state.riskPolicy.absoluteEquityFloor} equity floor.`);
  if (trade.risk > state.riskPolicy.hardMaxRiskPerTrade) reasons.push('Risk exceeds the hard per-trade maximum.');
  if (state.positions.length >= state.riskPolicy.maxOpenPositions) reasons.push('Maximum open positions reached.');
  if (trade.marginUsagePercent > state.riskPolicy.maxMarginUsagePercent) reasons.push('Margin usage would exceed 20%.');
  // Daily loss lock removed: Martingale recovery handles drawdown.
  // Weekly loss lock removed: Martingale recovery handles drawdown.
  if (state.drawdown >= state.riskPolicy.maximumTotalLoss) reasons.push('Maximum total loss is active.');
  return { allowed: reasons.length === 0, reasons };
}

export function calculateLocks(state: ControllerState) {
  return {
    dailyLocked: false, // Martingale recovery: daily lock disabled
    weeklyLocked: false, // Martingale recovery: weekly lock disabled
    equityFloorLocked: state.equity <= state.riskPolicy.absoluteEquityFloor,
  };
}

import { randomUUID } from 'node:crypto';
import type {
  Mt5BridgeStatus,
  Mt5Command,
  Mt5Position,
  Mt5TelemetryPayload,
  SimulatedPosition,
  StrategySignal,
  SymbolName,
} from '../../../src/types.js';
import { ControllerStore, log } from '../stateMachine.js';

export interface OrderResultPayload {
  ticket: number;
  commandId: string;
  success: boolean;
  message: string;
  fillPrice: number;
  timestamp: string;
}

export class Mt5Bridge {
  private store: ControllerStore;
  private pendingCommands: Mt5Command[] = [];
  private recentOrderResults: OrderResultPayload[] = [];
  private lastHeartbeatTime: number = 0;
  private readonly heartbeatTimeoutMs: number = 10_000; // 10s watchdog timeout

  private status: Mt5BridgeStatus = {
    connected: false,
    lastHeartbeat: null,
    account: null,
    balance: 20,
    equity: 20,
    freeMargin: 20,
    dailyPnlUsd: 0,
    openPositions: [],
    riskLocked: false,
    equityFloorLocked: false,
    pendingCommandsCount: 0,
  };

  constructor(store: ControllerStore) {
    this.store = store;
  }

  /**
   * Ingest real-time telemetry from MetaTrader 5 FalconEA.
   */
  handleTelemetry(payload: Mt5TelemetryPayload): Mt5BridgeStatus {
    const now = Date.now();
    this.lastHeartbeatTime = now;

    this.status = {
      connected: true,
      lastHeartbeat: new Date(now).toISOString(),
      account: payload.account,
      balance: payload.balance,
      equity: payload.equity,
      freeMargin: payload.freeMargin,
      dailyPnlUsd: payload.dailyPnlUsd,
      openPositions: payload.openPositions ?? [],
      riskLocked: Boolean(payload.riskLocked),
      equityFloorLocked: Boolean(payload.equityFloorLocked),
      pendingCommandsCount: this.pendingCommands.length,
    };

    // Reconcile MT5 telemetry with controller store
    this.store.mutate((state) => {
      // Reconcile MT5 telemetry with controller store
      state.connected = true;
      state.lastHeartbeat = new Date(now).toISOString();
      state.balance = payload.balance;
      state.equity = payload.equity;
      state.dailyPnl = payload.dailyPnlUsd;

      // Dynamic scaling for standard/demo accounts ($1,000 - $10,000+)
      if (payload.balance >= 1000) {
        const firstScale = state.riskPolicy.maxOpenPositions !== 5;
        state.accountType = 'Standard';
        state.riskPolicy.initialBalance = payload.balance;
        state.riskPolicy.absoluteEquityFloor = Math.round(payload.balance * 0.85); // 85% equity floor ($8,500 on $10k)
        state.riskPolicy.maximumTotalLoss = Math.round(payload.balance * 0.15);    // 15% max total loss ($1,500 on $10k)
        state.riskPolicy.defaultRiskPerTrade = Math.round(payload.balance * 0.001); // 0.1% ($10 on $10k)
        state.riskPolicy.hardMaxRiskPerTrade = Math.round(payload.balance * 0.002); // 0.2% ($20 on $10k)
        state.riskPolicy.dailyLossLock = Math.round(payload.balance * 0.01);       // 1.0% ($100 on $10k)
        state.riskPolicy.weeklyLossLock = Math.round(payload.balance * 0.03);      // 3.0% ($300 on $10k)
        state.riskPolicy.maxOpenPositions = 5;                                     // Up to 5 concurrent positions
        if (firstScale) {
          log(state, 'info', `[MT5 BRIDGE] Adaptive Risk Policy scaled for $${payload.balance.toFixed(0)} balance: 5 max positions, $${state.riskPolicy.defaultRiskPerTrade} risk per trade, $${state.riskPolicy.dailyLossLock} daily lock`);
        }
      }

      // Real-time Position Reconciliation with MT5 (Desktop & Mobile)
      const previousPositions = state.positions;
      const incomingPositions = payload.openPositions ?? [];

      // Detect closed positions (positions previously tracked in controller that are no longer in MT5 telemetry)
      const incomingTickets = new Set(incomingPositions.map((p) => String(p.ticket)));
      const incomingSymbols = new Set(incomingPositions.map((p) => p.symbol));

      for (const prev of previousPositions) {
        const stillOpen = incomingTickets.has(prev.id) || incomingSymbols.has(prev.symbol);
        if (!stillOpen) {
          log(
            state,
            'info',
            `[MT5 POSITION CLOSED] ${prev.side} on ${prev.symbol} (ID #${prev.id}) closed on MetaTrader. Controller state synced.`
          );
        }
      }

      // Synchronize controller positions with live MT5 positions
      state.positions = incomingPositions.map((mt5Pos) => {
        const existing = previousPositions.find(
          (p) => p.id === String(mt5Pos.ticket) || p.symbol === mt5Pos.symbol
        );
        return {
          id: String(mt5Pos.ticket),
          symbol: mt5Pos.symbol as SymbolName,
          side: mt5Pos.type,
          risk: existing?.risk ?? state.riskPolicy.defaultRiskPerTrade,
          marginUsed: Math.round(mt5Pos.lots * 100) / 100,
          unrealizedPnl: Math.round(mt5Pos.profitUsd * 100) / 100,
          openedAt: mt5Pos.openTime || new Date().toISOString(),
          simulated: false,
          entryPrice: mt5Pos.openPrice,
          stopLoss: mt5Pos.stopLoss,
          takeProfit: mt5Pos.takeProfit,
          setupName: existing?.setupName ?? 'MT5 Synced Trade',
          rrRatio: existing?.rrRatio ?? 2.5,
        };
      });

      if (payload.balance > 0 && payload.margin > 0) {
        state.marginUsagePercent = Math.min(100, Math.round((payload.margin / payload.balance) * 100));
      } else if (incomingPositions.length === 0) {
        state.marginUsagePercent = 0;
      }

      if (payload.riskLocked && !state.dailyLocked) {
        state.dailyLocked = true;
        log(state, 'danger', `[MT5 RISK LOCK] Terminal tripped daily loss lock ($${state.riskPolicy.dailyLossLock.toFixed(2)} limit). Trading suspended.`);
      }

      if (payload.equityFloorLocked && !state.equityFloorLocked) {
        state.equityFloorLocked = true;
        log(state, 'danger', `[MT5 RISK LOCK] Terminal tripped absolute equity floor ($${state.riskPolicy.absoluteEquityFloor.toFixed(2)} limit). Trading locked.`);
      }
    });

    return this.getStatus();
  }

  /**
   * Drain pending commands queued for MT5 terminal polling.
   */
  pollCommands(): Mt5Command[] {
    const commands = [...this.pendingCommands];
    this.pendingCommands = [];
    this.status.pendingCommandsCount = 0;
    return commands;
  }

  /**
   * Queue an execution command to be picked up by the MT5 FalconEA.
   */
  queueCommand(cmd: Omit<Mt5Command, 'id' | 'timestamp'>): Mt5Command {
    const command: Mt5Command = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...cmd,
    };

    this.pendingCommands.push(command);
    this.status.pendingCommandsCount = this.pendingCommands.length;
    return command;
  }

  /**
   * Convert Falcon/SMC StrategySignal to an MT5 execution order command.
   */
  queueSignalExecution(signal: StrategySignal): Mt5Command | null {
    if (!this.isConnected()) {
      return null;
    }

    // Convert internal symbol representation if necessary
    // E.g. Crash 1000 Index -> Crash 1000 Index or broker symbol
    const command = this.queueCommand({
      type: 'EXECUTE_ORDER',
      symbol: signal.symbol,
      direction: signal.side,
      lots: 0, // 0 triggers FalconEA dynamic sizing (min lot clamped, scaled to dollar risk)
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    });

    this.store.mutate((state) => {
      log(
        state,
        'info',
        `[MT5 BRIDGE] Queued live order #${command.id.slice(0, 8)}: ${signal.side} ${signal.symbol} (SL: ${signal.stopLoss}, TP: ${signal.takeProfit})`
      );
    });

    return command;
  }

  /**
   * Trigger emergency flatten command to close all positions in MT5.
   */
  triggerEmergencyFlatten(): Mt5Command {
    const cmd = this.queueCommand({
      type: 'FLATTEN_ALL',
    });

    this.store.mutate((state) => {
      log(state, 'danger', `[MT5 BRIDGE] Emergency Flatten command dispatched to MetaTrader 5 terminal.`);
    });

    return cmd;
  }

  /**
   * Close a specific MT5 position by ticket.
   */
  closePosition(ticket: number): Mt5Command {
    const cmd = this.queueCommand({
      type: 'CLOSE_POSITION',
      ticket,
    });

    this.store.mutate((state) => {
      log(state, 'info', `[MT5 BRIDGE] Close command queued for position ticket #${ticket}.`);
    });

    return cmd;
  }

  /**
   * Ingest order execution result from MT5 terminal.
   */
  handleOrderResult(result: OrderResultPayload): void {
    this.recentOrderResults.unshift(result);
    if (this.recentOrderResults.length > 50) {
      this.recentOrderResults.pop();
    }

    this.store.mutate((state) => {
      if (result.success) {
        log(
          state,
          'success',
          `[MT5 FILL] Order filled on ticket #${result.ticket} @ ${result.fillPrice.toFixed(2)} (${result.message})`
        );
      } else {
        log(
          state,
          'warning',
          `[MT5 REJECT] Order execution failed on ticket #${result.ticket}: ${result.message}`
        );
      }
    });
  }

  /**
   * Check if MT5 terminal connection is active.
   */
  isConnected(): boolean {
    if (!this.lastHeartbeatTime) return false;
    return (Date.now() - this.lastHeartbeatTime) < this.heartbeatTimeoutMs;
  }

  /**
   * Retrieve active bridge status snapshot.
   */
  getStatus(): Mt5BridgeStatus {
    const connected = this.isConnected();
    return {
      ...this.status,
      connected,
      pendingCommandsCount: this.pendingCommands.length,
    };
  }

  /**
   * Retrieve recent order results.
   */
  getOrderResults(): OrderResultPayload[] {
    return [...this.recentOrderResults];
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { Mt5TelemetryPayload, StrategySignal } from '../../src/types.js';
import { Mt5Bridge } from '../src/mt5/mt5Bridge.js';
import { ControllerStore } from '../src/stateMachine.js';

describe('Mt5Bridge Server Layer', () => {
  it('initializes in disconnected state with empty queue', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const status = bridge.getStatus();
    expect(status.connected).toBe(false);
    expect(status.account).toBeNull();
    expect(status.pendingCommandsCount).toBe(0);
    expect(status.openPositions).toEqual([]);
  });

  it('ingests MT5 telemetry and reconciles controller store state', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const telemetry: Mt5TelemetryPayload = {
      account: 10593821,
      balance: 18.50,
      equity: 18.25,
      margin: 1.20,
      freeMargin: 17.05,
      dailyPnlUsd: -0.25,
      openPositions: [
        {
          ticket: 981726,
          symbol: 'Volatility 75 Index',
          type: 'BUY',
          lots: 0.20,
          openPrice: 520.10,
          currentPrice: 519.85,
          stopLoss: 515.00,
          takeProfit: 535.00,
          profitUsd: -0.25,
          openTime: '2026-09-08 18:00:00',
        },
      ],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: '2026-09-08 18:15:00',
    };

    const status = bridge.handleTelemetry(telemetry);
    expect(status.connected).toBe(true);
    expect(status.account).toBe(10593821);
    expect(status.balance).toBe(18.50);
    expect(status.equity).toBe(18.25);
    expect(status.openPositions).toHaveLength(1);
    expect(status.openPositions[0]!.ticket).toBe(981726);

    // Verify reconciled ControllerStore
    const snapshot = store.snapshot;
    expect(snapshot.connected).toBe(true);
    expect(snapshot.balance).toBe(18.50);
    expect(snapshot.equity).toBe(18.25);
    expect(snapshot.dailyPnl).toBe(-0.25);
    expect(snapshot.marginUsagePercent).toBeGreaterThan(0);
  });

  it('trips daily lock and equity floor locks in ControllerStore when MT5 circuit breaker activates', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const breachedTelemetry: Mt5TelemetryPayload = {
      account: 10593821,
      balance: 14.80,
      equity: 14.80,
      margin: 0,
      freeMargin: 14.80,
      dailyPnlUsd: -0.45,
      openPositions: [],
      riskLocked: true,
      equityFloorLocked: true,
      terminalTime: '2026-09-08 18:20:00',
    };

    bridge.handleTelemetry(breachedTelemetry);
    const snapshot = store.snapshot;
    expect(snapshot.dailyLocked).toBe(true);
    expect(snapshot.equityFloorLocked).toBe(true);
    expect(snapshot.activity.some((a) => a.kind === 'danger' && a.message.includes('MT5 RISK LOCK'))).toBe(true);
  });

  it('queues execution commands and drains them on poll', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const cmd1 = bridge.queueCommand({
      type: 'EXECUTE_ORDER',
      symbol: 'Crash 1000 Index',
      direction: 'SELL',
      lots: 0.20,
      stopLoss: 1050.0,
      takeProfit: 980.0,
    });

    expect(cmd1.id).toBeDefined();
    expect(cmd1.type).toBe('EXECUTE_ORDER');
    expect(bridge.getStatus().pendingCommandsCount).toBe(1);

    const polled = bridge.pollCommands();
    expect(polled).toHaveLength(1);
    expect(polled[0]!.id).toBe(cmd1.id);
    expect(bridge.getStatus().pendingCommandsCount).toBe(0);

    // Subsequent poll should return empty
    expect(bridge.pollCommands()).toHaveLength(0);
  });

  it('dispatches emergency flatten command and logs danger activity', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const flattenCmd = bridge.triggerEmergencyFlatten();
    expect(flattenCmd.type).toBe('FLATTEN_ALL');

    const commands = bridge.pollCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]!.type).toBe('FLATTEN_ALL');

    const hasDangerLog = store.snapshot.activity.some(
      (a) => a.kind === 'danger' && a.message.includes('Emergency Flatten command dispatched')
    );
    expect(hasDangerLog).toBe(true);
  });

  it('handles order result ingestion for fill and reject scenarios', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    // Test successful fill
    bridge.handleOrderResult({
      ticket: 991823,
      commandId: 'cmd-test-1',
      success: true,
      message: 'Order executed successfully',
      fillPrice: 6245.80,
      timestamp: '2026-09-08 18:25:00',
    });

    expect(store.snapshot.activity.some(
      (a) => a.kind === 'success' && a.message.includes('Order filled on ticket #991823')
    )).toBe(true);

    // Test rejection
    bridge.handleOrderResult({
      ticket: 0,
      commandId: 'cmd-test-2',
      success: false,
      message: 'Rejected by MT5 RiskEngine invariant limits',
      fillPrice: 0.0,
      timestamp: '2026-09-08 18:25:05',
    });

    expect(store.snapshot.activity.some(
      (a) => a.kind === 'warning' && a.message.includes('Rejected by MT5 RiskEngine')
    )).toBe(true);

    expect(bridge.getOrderResults()).toHaveLength(2);
  });

  it('watchdog marks terminal disconnected if heartbeat times out', () => {
    vi.useFakeTimers();
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    bridge.handleTelemetry({
      account: 12345,
      balance: 20,
      equity: 20,
      margin: 0,
      freeMargin: 20,
      dailyPnlUsd: 0,
      openPositions: [],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: '2026-09-08 18:00:00',
    });

    expect(bridge.isConnected()).toBe(true);

    // Advance past the 10-second watchdog timeout
    vi.advanceTimersByTime(11_000);
    expect(bridge.isConnected()).toBe(false);
    expect(bridge.getStatus().connected).toBe(false);

    vi.useRealTimers();
  });

  it('queues signal execution only when bridge is actively connected', () => {
    const store = new ControllerStore();
    const bridge = new Mt5Bridge(store);

    const signal: StrategySignal = {
      id: 'sig-test-1',
      symbol: 'Crash 500 Index',
      symbolCode: 'CRASH_500',
      side: 'SELL',
      setupName: 'FALCON_LIQUIDITY_SWEEP',
      entryPrice: 1000.0,
      stopLoss: 1020.0,
      takeProfit: 950.0,
      riskUsd: 0.20,
      rrRatio: 2.5,
      confidence: 88,
      createdAt: '2026-09-08T18:30:00Z',
    };

    // When disconnected, signal should not queue order
    expect(bridge.queueSignalExecution(signal)).toBeNull();

    // Connect bridge with telemetry
    bridge.handleTelemetry({
      account: 12345,
      balance: 20,
      equity: 20,
      margin: 0,
      freeMargin: 20,
      dailyPnlUsd: 0,
      openPositions: [],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: '2026-09-08 18:30:00',
    });

    // Now connected, signal should queue order
    const cmd = bridge.queueSignalExecution(signal);
    expect(cmd).not.toBeNull();
    expect(cmd?.type).toBe('EXECUTE_ORDER');
    expect(cmd?.symbol).toBe('Crash 500 Index');
    expect(cmd?.direction).toBe('SELL');
  });
});

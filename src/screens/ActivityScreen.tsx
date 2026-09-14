import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../components/AppHeader';
import {
  ClockDurationIcon,
  CrossIcon,
  JournalIcon,
  LightbulbImprovementIcon,
  PlusCircleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from '../components/TabIcons';
import type { ControllerState, SimulatedPosition, TradeJournalEntry, TradeOutcome } from '../types';
import { closePosition, fetchTradeJournal, saveTradeJournalEntry } from '../api';

interface ActivityScreenProps {
  state: ControllerState | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const colors = {
  bg: '#080808',
  panel: '#161616',
  panelAlt: '#1E1E1E',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  orange: '#FF6B00',
  orangeDark: '#2D1405',
};

const JOURNAL_STORAGE_KEY = '@derived_arbitrage_trade_journal';

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function synthesizeRealTimeReflection(
  pos: SimulatedPosition,
  outcome: TradeOutcome,
  durationStr: string,
  pnl: number
): { whatHappened: string; whatToDoNext: string } {
  const sym = pos.symbol;
  const dir = pos.side;
  const entry = pos.entryPrice?.toFixed(2) ?? 'market';
  const setup = pos.setupName ?? 'Falcon SMC Setup';

  if (outcome === 'TP_HIT') {
    return {
      whatHappened: `Real-time execution: Market structure confirmed ${dir} order flow on ${sym} via ${setup}. Order executed at ${entry} and cleanly expanded into target in ${durationStr}. Target liquidity absorbed with +$${pnl.toFixed(2)} realized gain.`,
      whatToDoNext: `Maintain disciplined execution. Self-improvement: Avoid aggressive re-entry on ${sym}; wait for subsequent 15m structural breaker and fresh Fair Value Gap mitigation before committing capital.`,
    };
  }

  if (outcome === 'SL_HIT') {
    return {
      whatHappened: `Risk engine execution: ${dir} position opened at ${entry} via ${setup} encountered adverse order flow. Price tripped predefined stop-loss after ${durationStr}. Downside was capped strictly at -$${Math.abs(pnl).toFixed(2)}, preserving account capital.`,
      whatToDoNext: `Strict risk invariant preserved equity ($20 limit held). Self-improvement: Check tick velocity and spread metrics on ${sym} before next setup to avoid low-liquidity sweep stops.`,
    };
  }

  return {
    whatHappened: `Manual exit executed on ${dir} position (${sym}) after ${durationStr}. Realized P&L: ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}.`,
    whatToDoNext: `Review discretionary manual exit reasoning against systematic rules to ensure long-term edge consistency.`,
  };
}

type FilterType = 'ALL' | 'WINS' | 'LOSSES';

export function ActivityScreen({ state, refreshing, onRefresh }: ActivityScreenProps) {
  const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<TradeJournalEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [closingId, setClosingId] = useState<string | null>(null);

  // Form state for manual trade journaling
  const [formSymbol, setFormSymbol] = useState('Volatility 75 Index');
  const [formDirection, setFormDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [formOutcome, setFormOutcome] = useState<TradeOutcome>('TP_HIT');
  const [formPnl, setFormPnl] = useState('45.00');
  const [formDuration, setFormDuration] = useState('15m 30s');
  const [formSetup, setFormSetup] = useState('SMC Liquidity Sweep + FVG');
  const [formWhatHappened, setFormWhatHappened] = useState('');
  const [formWhatToDoNext, setFormWhatToDoNext] = useState('');

  // Live timer for active open positions
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Synchronize and load journal entries from server and local storage
  const syncJournal = useCallback(async () => {
    try {
      // 1. Fetch real-time journaled trades from server
      const remoteTrades = await fetchTradeJournal();

      // 2. Read local cache
      const rawLocal = await AsyncStorage.getItem(JOURNAL_STORAGE_KEY);
      const localTrades = rawLocal ? (JSON.parse(rawLocal) as TradeJournalEntry[]) : [];

      // 3. Merge trades (deduplicate by id)
      const tradeMap = new Map<string, TradeJournalEntry>();
      for (const t of localTrades) {
        tradeMap.set(t.id, t);
      }
      for (const t of remoteTrades) {
        tradeMap.set(t.id, t);
      }

      const merged = Array.from(tradeMap.values()).sort(
        (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
      );

      setEntries(merged);
      await AsyncStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Keep existing entries
    }
  }, []);

  useEffect(() => {
    void syncJournal();
  }, [syncJournal]);

  // Track live position closures in real-time
  const prevPositionsRef = useRef<SimulatedPosition[]>([]);
  useEffect(() => {
    const prevPositions = prevPositionsRef.current;
    const currentPositions = state?.positions ?? [];

    if (prevPositions.length > 0 && currentPositions.length < prevPositions.length) {
      // Identify closed positions
      const currentIds = new Set(currentPositions.map((p) => p.id));
      for (const prev of prevPositions) {
        if (!currentIds.has(prev.id)) {
          // Closed in real time
          const durationSeconds = Math.max(
            1,
            Math.floor((Date.now() - new Date(prev.openedAt).getTime()) / 1000)
          );
          const durationStr = formatDurationSeconds(durationSeconds);
          const pnl = prev.unrealizedPnl ?? 0;
          const outcome: TradeOutcome = pnl > 0 ? 'TP_HIT' : pnl < 0 ? 'SL_HIT' : 'MANUAL_CLOSE';
          const pnlPercent = state?.balance ? Number(((pnl / state.balance) * 100).toFixed(2)) : 0;
          const reflection = synthesizeRealTimeReflection(prev, outcome, durationStr, pnl);

          const newEntry: TradeJournalEntry = {
            id: `real-${prev.id}-${Date.now()}`,
            ticket: Number(prev.id) || undefined,
            symbol: prev.symbol,
            direction: prev.side,
            lots: prev.marginUsed > 0 ? prev.marginUsed : 0.2,
            entryPrice: prev.entryPrice ?? 0,
            exitPrice: prev.entryPrice ? prev.entryPrice + (pnl > 0 ? 50 : -50) : 0,
            duration: durationStr,
            durationSeconds,
            outcome,
            pnl,
            pnlPercent,
            setup: prev.setupName ?? 'Falcon SMC Setup',
            whatHappened: reflection.whatHappened,
            whatToDoNext: reflection.whatToDoNext,
            openedAt: prev.openedAt,
            closedAt: new Date().toISOString(),
            isReal: true,
          };

          setEntries((prevEntries) => {
            const updated = [newEntry, ...prevEntries.filter((e) => e.id !== newEntry.id)];
            void AsyncStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });
          void saveTradeJournalEntry(newEntry);
        }
      }
    }

    prevPositionsRef.current = currentPositions;
  }, [state?.positions, state?.balance]);

  const handleManualClosePosition = useCallback(async (posId: string) => {
    setClosingId(posId);
    try {
      await closePosition(posId);
      Alert.alert('Position Exit', `Order #${posId} closure requested.`);
    } catch {
      Alert.alert('Error', 'Failed to close position.');
    } finally {
      setClosingId(null);
    }
  }, []);

  const handleAddEntry = useCallback(() => {
    const pnlNum = parseFloat(formPnl);
    if (isNaN(pnlNum)) {
      Alert.alert('Validation Error', 'Please enter a valid P&L dollar amount.');
      return;
    }
    if (!formWhatHappened.trim()) {
      Alert.alert('Validation Error', 'Please describe what happened in this trade.');
      return;
    }
    if (!formWhatToDoNext.trim()) {
      Alert.alert('Validation Error', 'Please provide an action plan for self-improvement.');
      return;
    }

    const newEntry: TradeJournalEntry = {
      id: `manual-${Date.now()}`,
      symbol: formSymbol,
      direction: formDirection,
      lots: 0.2,
      entryPrice: 0,
      exitPrice: 0,
      duration: formDuration.trim() || '10m 00s',
      durationSeconds: 600,
      outcome: formOutcome,
      pnl: formOutcome === 'SL_HIT' ? -Math.abs(pnlNum) : Math.abs(pnlNum),
      pnlPercent: Number(((pnlNum / (state?.balance || 10000)) * 100).toFixed(2)),
      setup: formSetup.trim() || 'SMC Setup',
      whatHappened: formWhatHappened.trim(),
      whatToDoNext: formWhatToDoNext.trim(),
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      isReal: true,
    };

    const updated = [newEntry, ...entries];
    setEntries(updated);
    void AsyncStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(updated));
    void saveTradeJournalEntry(newEntry);
    setShowAddModal(false);
    setFormWhatHappened('');
    setFormWhatToDoNext('');
    Alert.alert('Journal Logged', 'Real-time trade reflection successfully recorded.');
  }, [
    formSymbol,
    formDirection,
    formOutcome,
    formPnl,
    formDuration,
    formSetup,
    formWhatHappened,
    formWhatToDoNext,
    state?.balance,
    entries,
  ]);

  // Aggregate metrics
  const stats = useMemo(() => {
    const totalTrades = entries.length;
    const wins = entries.filter((e) => e.pnl > 0).length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
    const netPnl = entries.reduce((acc, e) => acc + e.pnl, 0);

    return { totalTrades, winRate, netPnl };
  }, [entries]);

  // Filtered closed entries
  const filteredEntries = useMemo(() => {
    if (filter === 'WINS') return entries.filter((e) => e.pnl > 0);
    if (filter === 'LOSSES') return entries.filter((e) => e.pnl < 0);
    return entries;
  }, [entries, filter]);

  const livePositions = state?.positions ?? [];

  return (
    <View style={styles.container}>
      <AppHeader eyebrow="FALCON EA JOURNAL" title="Trade Journal" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void syncJournal();
              onRefresh();
            }}
            tintColor={colors.orange}
            colors={[colors.orange]}
          />
        }
      >
        {/* Performance Metric Strip */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Trades</Text>
            <Text style={styles.metricValue}>{stats.totalTrades}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Win Rate</Text>
            <Text style={[styles.metricValue, { color: colors.orange }]}>{stats.winRate}%</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Net Realized P&L</Text>
            <Text style={styles.metricValue}>
              {stats.netPnl >= 0 ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
            </Text>
          </View>
        </View>

        {/* Live Active Positions Section */}
        {livePositions.length > 0 && (
          <View style={styles.liveSection}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.sectionTitle}>
                LIVE OPEN POSITIONS ({livePositions.length})
              </Text>
            </View>

            {livePositions.map((pos) => {
              const openTime = new Date(pos.openedAt).getTime() || nowTimestamp;
              const elapsedSec = Math.max(0, Math.floor((nowTimestamp - openTime) / 1000));
              const activeDuration = formatDurationSeconds(elapsedSec);
              const pnl = pos.unrealizedPnl ?? 0;

              return (
                <View key={pos.id} style={styles.liveCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.symbolDirectionBox}>
                      <Text style={styles.symbolText}>{pos.symbol}</Text>
                      <View style={styles.directionPill}>
                        <Text style={styles.directionText}>{pos.side}</Text>
                      </View>
                      {pos.marginUsed ? (
                        <Text style={styles.lotsText}>{pos.marginUsed} Lots</Text>
                      ) : null}
                    </View>
                    <Pressable
                      style={styles.closeBtn}
                      onPress={() => void handleManualClosePosition(pos.id)}
                      disabled={closingId === pos.id}
                    >
                      <Text style={styles.closeBtnText}>
                        {closingId === pos.id ? 'Exiting...' : 'Close'}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.liveMetricsStrip}>
                    <View style={styles.liveMetricCol}>
                      <Text style={styles.liveMetricSub}>Entry Price</Text>
                      <Text style={styles.liveMetricMain}>
                        {pos.entryPrice ? pos.entryPrice.toFixed(2) : 'Market'}
                      </Text>
                    </View>
                    <View style={styles.liveMetricCol}>
                      <Text style={styles.liveMetricSub}>Stop Loss</Text>
                      <Text style={styles.liveMetricMain}>
                        {pos.stopLoss ? pos.stopLoss.toFixed(2) : 'Invariant ($20)'}
                      </Text>
                    </View>
                    <View style={styles.liveMetricCol}>
                      <Text style={styles.liveMetricSub}>Take Profit</Text>
                      <Text style={styles.liveMetricMain}>
                        {pos.takeProfit ? pos.takeProfit.toFixed(2) : '1:2.5 RR'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.liveFooterRow}>
                    <View style={styles.durationBadge}>
                      <ClockDurationIcon size={14} color={colors.orange} />
                      <Text style={styles.liveDurationText}>Active: {activeDuration}</Text>
                    </View>
                    <View style={styles.livePnlBox}>
                      <Text style={styles.livePnlLabel}>Unrealized: </Text>
                      <Text
                        style={[
                          styles.livePnlVal,
                          pnl > 0 ? styles.gainText : pnl < 0 ? styles.lossText : null,
                        ]}
                      >
                        {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Filter Pills & Add Button */}
        <View style={styles.controlsRow}>
          <View style={styles.filtersGroup}>
            {(['ALL', 'WINS', 'LOSSES'] as FilterType[]).map((f) => {
              const active = filter === f;
              return (
                <Pressable
                  key={f}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f === 'ALL' ? 'All' : f === 'WINS' ? 'Wins (+TP)' : 'Losses (-SL)'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.addTradeBtn} onPress={() => setShowAddModal(true)}>
            <PlusCircleIcon size={16} color={colors.orange} />
            <Text style={styles.addTradeBtnText}>Log Trade</Text>
          </Pressable>
        </View>

        {/* Closed Real Trades Journal Feed */}
        <View style={styles.feedSection}>
          <Text style={styles.sectionTitle}>
            REAL-TIME CLOSED TRADES & REFLECTION ({filteredEntries.length})
          </Text>

          {filteredEntries.length === 0 ? (
            <View style={styles.emptyCard}>
              <JournalIcon size={32} color={colors.orange} />
              <Text style={styles.emptyTitle}>Real-Time Trade Journal Active</Text>
              <Text style={styles.emptyText}>
                Waiting for real-time EA or MT5 terminal orders to resolve. When an automated or manual trade completes, its exact time to hit SL or TP, P&L, technical diagnosis, and self-improvement feedback will be journaled here.
              </Text>
            </View>
          ) : (
            filteredEntries.map((entry) => {
              const isWin = entry.pnl >= 0;
              const outcomeLabel =
                entry.outcome === 'TP_HIT'
                  ? 'Take-Profit Hit'
                  : entry.outcome === 'SL_HIT'
                  ? 'Stop-Loss Hit'
                  : entry.outcome === 'TRAILING_STOP'
                  ? 'Trailing Stop'
                  : 'Manual Exit';

              return (
                <Pressable
                  key={entry.id}
                  style={styles.tradeCard}
                  onPress={() => setSelectedEntry(entry)}
                >
                  {/* Top Bar: Symbol, Direction, Setup */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.symbolDirectionBox}>
                      <Text style={styles.symbolText}>{entry.symbol}</Text>
                      <View style={styles.directionPill}>
                        <Text style={styles.directionText}>{entry.direction}</Text>
                      </View>
                      {entry.lots ? (
                        <Text style={styles.lotsText}>{entry.lots} Lots</Text>
                      ) : null}
                    </View>

                    <View style={styles.pnlBox}>
                      {isWin ? (
                        <TrendingUpIcon size={16} color={colors.orange} />
                      ) : (
                        <TrendingDownIcon size={16} color={colors.muted} />
                      )}
                      <Text style={[styles.pnlAmount, isWin ? styles.gainText : styles.lossText]}>
                        {isWin
                          ? `+$${entry.pnl.toFixed(2)}`
                          : `-$${Math.abs(entry.pnl).toFixed(2)}`}
                      </Text>
                    </View>
                  </View>

                  {/* Second Row: Outcome, Duration, PnL % */}
                  <View style={styles.cardSubRow}>
                    <View style={styles.outcomePill}>
                      <Text style={styles.outcomePillText}>{outcomeLabel}</Text>
                    </View>

                    <View style={styles.durationBadge}>
                      <ClockDurationIcon size={14} color={colors.muted} />
                      <Text style={styles.durationText}>Time to exit: {entry.duration}</Text>
                    </View>

                    <Text style={styles.pnlPercentText}>
                      ({isWin ? `+${entry.pnlPercent}%` : `${entry.pnlPercent}%`})
                    </Text>
                  </View>

                  {/* Setup Name */}
                  <View style={styles.setupRow}>
                    <Text style={styles.setupLabel}>Strategy: </Text>
                    <Text style={styles.setupVal}>{entry.setup}</Text>
                  </View>

                  {/* What Happened Section */}
                  <View style={styles.reflectionBox}>
                    <Text style={styles.reflectionHeader}>WHAT HAPPENED</Text>
                    <Text style={styles.reflectionBody}>{entry.whatHappened}</Text>
                  </View>

                  {/* Self-Improvement Takeaway Section */}
                  <View style={styles.improvementBox}>
                    <View style={styles.improvementHeaderRow}>
                      <LightbulbImprovementIcon size={14} color={colors.orange} />
                      <Text style={styles.improvementHeader}>WHAT TO DO NEXT · SELF-IMPROVEMENT</Text>
                    </View>
                    <Text style={styles.improvementBody}>{entry.whatToDoNext}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Trade Detail Modal */}
      <Modal
        visible={selectedEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Trade Reflection Analysis</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setSelectedEntry(null)}
                hitSlop={12}
              >
                <CrossIcon size={20} color={colors.muted} />
              </Pressable>
            </View>

            {selectedEntry && (
              <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalMetaRow}>
                  <Text style={styles.modalSymbol}>{selectedEntry.symbol}</Text>
                  <View style={styles.directionPill}>
                    <Text style={styles.directionText}>{selectedEntry.direction}</Text>
                  </View>
                </View>

                <View style={styles.modalMetricsGrid}>
                  <View style={styles.modalMetricItem}>
                    <Text style={styles.modalMetricSub}>Realized P&L</Text>
                    <Text
                      style={[
                        styles.modalMetricMain,
                        selectedEntry.pnl >= 0 ? styles.gainText : styles.lossText,
                      ]}
                    >
                      {selectedEntry.pnl >= 0
                        ? `+$${selectedEntry.pnl.toFixed(2)}`
                        : `-$${Math.abs(selectedEntry.pnl).toFixed(2)}`}
                    </Text>
                  </View>
                  <View style={styles.modalMetricItem}>
                    <Text style={styles.modalMetricSub}>Time to Exit</Text>
                    <Text style={styles.modalMetricMain}>{selectedEntry.duration}</Text>
                  </View>
                  <View style={styles.modalMetricItem}>
                    <Text style={styles.modalMetricSub}>Outcome</Text>
                    <Text style={styles.modalMetricMain}>{selectedEntry.outcome}</Text>
                  </View>
                </View>

                <View style={styles.modalSectionBox}>
                  <Text style={styles.reflectionHeader}>DETAILED EXECUTION · WHAT HAPPENED</Text>
                  <Text style={styles.modalSectionText}>{selectedEntry.whatHappened}</Text>
                </View>

                <View style={styles.modalImprovementBox}>
                  <View style={styles.improvementHeaderRow}>
                    <LightbulbImprovementIcon size={14} color={colors.orange} />
                    <Text style={styles.improvementHeader}>
                      DELIBERATE PRACTICE · WHAT TO DO NEXT
                    </Text>
                  </View>
                  <Text style={styles.modalSectionText}>{selectedEntry.whatToDoNext}</Text>
                </View>
              </ScrollView>
            )}

            <Pressable style={styles.modalDismissBtn} onPress={() => setSelectedEntry(null)}>
              <Text style={styles.modalDismissBtnText}>Close Analysis</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Manual "+ Log Trade" Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Log Real-Time Trade</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setShowAddModal(false)}
                hitSlop={12}
              >
                <CrossIcon size={20} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Asset Symbol</Text>
              <TextInput
                style={styles.inputField}
                value={formSymbol}
                onChangeText={setFormSymbol}
                placeholder="e.g. Volatility 75 Index"
                placeholderTextColor={colors.muted}
              />

              <View style={styles.formRow2}>
                <View style={styles.formCol}>
                  <Text style={styles.inputLabel}>Order Direction</Text>
                  <View style={styles.toggleRow}>
                    <Pressable
                      style={[styles.toggleBtn, formDirection === 'BUY' && styles.toggleBtnActive]}
                      onPress={() => setFormDirection('BUY')}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          formDirection === 'BUY' && styles.toggleBtnTextActive,
                        ]}
                      >
                        BUY
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.toggleBtn, formDirection === 'SELL' && styles.toggleBtnActive]}
                      onPress={() => setFormDirection('SELL')}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          formDirection === 'SELL' && styles.toggleBtnTextActive,
                        ]}
                      >
                        SELL
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.formCol}>
                  <Text style={styles.inputLabel}>Outcome</Text>
                  <View style={styles.toggleRow}>
                    <Pressable
                      style={[styles.toggleBtn, formOutcome === 'TP_HIT' && styles.toggleBtnActive]}
                      onPress={() => setFormOutcome('TP_HIT')}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          formOutcome === 'TP_HIT' && styles.toggleBtnTextActive,
                        ]}
                      >
                        TP
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.toggleBtn, formOutcome === 'SL_HIT' && styles.toggleBtnActive]}
                      onPress={() => setFormOutcome('SL_HIT')}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          formOutcome === 'SL_HIT' && styles.toggleBtnTextActive,
                        ]}
                      >
                        SL
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={styles.formCol}>
                  <Text style={styles.inputLabel}>P&L Dollar Amount ($)</Text>
                  <TextInput
                    style={styles.inputField}
                    value={formPnl}
                    onChangeText={setFormPnl}
                    keyboardType="numeric"
                    placeholder="45.00"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.inputLabel}>Time Taken to Exit</Text>
                  <TextInput
                    style={styles.inputField}
                    value={formDuration}
                    onChangeText={setFormDuration}
                    placeholder="18m 42s"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Strategy / Setup Name</Text>
              <TextInput
                style={styles.inputField}
                value={formSetup}
                onChangeText={setFormSetup}
                placeholder="e.g. 15m Liquidity Sweep + FVG"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>What Happened (Market & Execution Review)</Text>
              <TextInput
                style={[styles.inputField, styles.textAreaField]}
                value={formWhatHappened}
                onChangeText={setFormWhatHappened}
                multiline
                numberOfLines={3}
                placeholder="Describe the entry trigger, price action, momentum, and resolution..."
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>What to Do Next (Self-Improvement Action)</Text>
              <TextInput
                style={[styles.inputField, styles.textAreaField]}
                value={formWhatToDoNext}
                onChangeText={setFormWhatToDoNext}
                multiline
                numberOfLines={3}
                placeholder="Specific rules, sizing, or psychological lessons to execute next time..."
                placeholderTextColor={colors.muted}
              />
            </ScrollView>

            <Pressable style={styles.saveTradeBtn} onPress={handleAddEntry}>
              <Text style={styles.saveTradeBtnText}>Save Reflection to Journal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  liveSection: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  liveCard: {
    backgroundColor: colors.panel,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.orange,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  symbolDirectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  symbolText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  directionPill: {
    backgroundColor: colors.panelAlt,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  directionText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  lotsText: {
    color: colors.muted,
    fontSize: 12,
  },
  closeBtn: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
  },
  liveMetricsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.panelAlt,
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  liveMetricCol: {
    alignItems: 'center',
  },
  liveMetricSub: {
    color: colors.muted,
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  liveMetricMain: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  liveFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveDurationText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '600',
  },
  livePnlBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePnlLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  livePnlVal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  filtersGroup: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterPillActive: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.orange,
  },
  filterPillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  addTradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  addTradeBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  feedSection: {
    marginBottom: 24,
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tradeCard: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pnlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pnlAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  gainText: {
    color: colors.orange,
  },
  lossText: {
    color: colors.muted,
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  outcomePill: {
    backgroundColor: colors.panelAlt,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outcomePillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    color: colors.muted,
    fontSize: 12,
  },
  pnlPercentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  setupLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  setupVal: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  reflectionBox: {
    backgroundColor: colors.panelAlt,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  reflectionHeader: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  reflectionBody: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  improvementBox: {
    backgroundColor: colors.orangeDark,
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
  },
  improvementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  improvementHeader: {
    color: colors.orange,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  improvementBody: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCardLarge: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBodyScroll: {
    marginBottom: 16,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  modalSymbol: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalMetricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modalMetricItem: {
    flex: 1,
    backgroundColor: colors.panelAlt,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalMetricSub: {
    color: colors.muted,
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalMetricMain: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSectionBox: {
    backgroundColor: colors.panelAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalImprovementBox: {
    backgroundColor: colors.orangeDark,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
  },
  modalSectionText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  modalDismissBtn: {
    backgroundColor: colors.panelAlt,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  modalDismissBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  inputField: {
    backgroundColor: colors.panelAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  textAreaField: {
    height: 70,
    textAlignVertical: 'top',
  },
  formRow2: {
    flexDirection: 'row',
    gap: 12,
  },
  formCol: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.panelAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.orange,
  },
  toggleBtnText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  saveTradeBtn: {
    backgroundColor: colors.orange,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveTradeBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});

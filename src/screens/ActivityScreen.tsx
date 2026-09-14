import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { ControllerState } from '../types';

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

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  exitPrice: number;
  duration: string;
  outcome: 'TP_HIT' | 'SL_HIT' | 'TRAILING_STOP' | 'MANUAL_CLOSE';
  pnl: number;
  pnlPercent: number;
  setup: string;
  whatHappened: string;
  whatToDoNext: string;
  loggedAt: string;
}

const SEED_JOURNAL_ENTRIES: TradeJournalEntry[] = [
  {
    id: 'journal-001',
    symbol: 'Volatility 75 Index',
    direction: 'SELL',
    lots: 0.005,
    entryPrice: 348920.4,
    exitPrice: 344150.1,
    duration: '18m 42s',
    outcome: 'TP_HIT',
    pnl: 47.7,
    pnlPercent: 0.48,
    setup: '15m Liquidity Sweep + FVG Retest',
    whatHappened:
      'Price spiked violently above the session high to sweep buy-side liquidity, formed an immediate 1m Change of Character (CHoCH), and retested the 15m bearish Fair Value Gap. FalconEA executed short entry at 348,920.40. Volatility momentum expanded downward cleanly to take out the resting sell-side liquidity at the target low.',
    whatToDoNext:
      'Execution was well timed. Self-improvement: Consider scaling out 50% at 1:2 Risk-to-Reward to eliminate break-even risk earlier during aggressive volatility expansions.',
    loggedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'journal-002',
    symbol: 'Boom 1000 Index',
    direction: 'BUY',
    lots: 0.2,
    entryPrice: 9850.25,
    exitPrice: 9810.25,
    duration: '6m 15s',
    outcome: 'SL_HIT',
    pnl: -20.0,
    pnlPercent: -0.2,
    setup: '5m Demand Order Block Retest',
    whatHappened:
      'Entered on a retest of an untested 5m bullish order block. However, downward tick volume was heavier than average, and an unanticipated consolidation drift occurred before the demand zone failed, hitting our calculated hard $20.00 risk invariant stop loss.',
    whatToDoNext:
      'Disciplined stop loss preserved equity ($20 limit held). Self-improvement: Wait for an active rejection wick and an initial 50-tick confirmation spike before committing capital to counter-trend demand zones on Boom instruments.',
    loggedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'journal-003',
    symbol: 'Crash 500 Index',
    direction: 'SELL',
    lots: 0.25,
    entryPrice: 4210.8,
    exitPrice: 4165.2,
    duration: '31m 08s',
    outcome: 'TP_HIT',
    pnl: 57.0,
    pnlPercent: 0.57,
    setup: '1h Bearish BOS + Breaker Block Cascade',
    whatHappened:
      'Identified lower-timeframe distribution following a 1-hour Break of Structure. Entered upon second test of breaker block at 4,210.80. A multi-crash cascade occurred 28 minutes later, propelling price directly through TP at 4,165.20.',
    whatToDoNext:
      'Strong patience waiting for the breaker block confirmation. Self-improvement: Keep a 20% runner with trailing stop when higher-timeframe bearish order flow is dominant on Crash indices.',
    loggedAt: new Date(Date.now() - 3600000 * 9).toISOString(),
  },
  {
    id: 'journal-004',
    symbol: 'Step Index',
    direction: 'BUY',
    lots: 0.1,
    entryPrice: 8540.0,
    exitPrice: 8568.5,
    duration: '12m 55s',
    outcome: 'TRAILING_STOP',
    pnl: 28.5,
    pnlPercent: 0.28,
    setup: 'Discount Zone Pin Bar + Range Expansion',
    whatHappened:
      'Price swept the range low in the discount zone and formed a bullish pin bar. EA executed long order with 15-pip stop. As price reached 1:2 RR, the trailing stop locked in 28.5 pips of profit before a mean-reverting pull-back triggered the exit.',
    whatToDoNext:
      'Trailing stop operated as intended to lock in gains. Self-improvement: Review trailing step spacing on Step Index to allow deeper structural breathers on M5 without being prematurely stopped.',
    loggedAt: new Date(Date.now() - 3600000 * 14).toISOString(),
  },
  {
    id: 'journal-005',
    symbol: 'Volatility 100 Index',
    direction: 'SELL',
    lots: 0.02,
    entryPrice: 1854.3,
    exitPrice: 1874.3,
    duration: '8m 19s',
    outcome: 'SL_HIT',
    pnl: -20.0,
    pnlPercent: -0.2,
    setup: 'Trendline Liquidity Grab Attempt',
    whatHappened:
      'Attempted to anticipate a trendline liquidity grab reversal during high ATR volatility expansion. The index continued grinding higher without showing an internal CHoCH, hitting the fixed $20 hard stop loss.',
    whatToDoNext:
      'Mistake was entering on anticipation rather than confirmation. Self-improvement: Always require a lower-timeframe market structure shift (MSS) before shorting strong momentum expansions.',
    loggedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
];

type FilterType = 'ALL' | 'WINS' | 'LOSSES';

export function ActivityScreen({ state, refreshing, onRefresh }: ActivityScreenProps) {
  const [entries, setEntries] = useState<TradeJournalEntry[]>(SEED_JOURNAL_ENTRIES);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<TradeJournalEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New entry form state
  const [formSymbol, setFormSymbol] = useState('Volatility 75 Index');
  const [formDirection, setFormDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [formOutcome, setFormOutcome] = useState<'TP_HIT' | 'SL_HIT' | 'TRAILING_STOP' | 'MANUAL_CLOSE'>('TP_HIT');
  const [formPnl, setFormPnl] = useState('45.00');
  const [formDuration, setFormDuration] = useState('15m 30s');
  const [formSetup, setFormSetup] = useState('SMC Liquidity Sweep + FVG');
  const [formWhatHappened, setFormWhatHappened] = useState('');
  const [formWhatToDoNext, setFormWhatToDoNext] = useState('');

  // Load journal from storage
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOURNAL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as TradeJournalEntry[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEntries(parsed);
          }
        }
      } catch {
        // Fallback to seed entries
      }
    })();
  }, []);

  const saveEntries = useCallback(async (newEntries: TradeJournalEntry[]) => {
    setEntries(newEntries);
    try {
      await AsyncStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(newEntries));
    } catch {
      // Keep in state
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
      id: `journal-${Date.now()}`,
      symbol: formSymbol,
      direction: formDirection,
      lots: 0.01,
      entryPrice: 0,
      exitPrice: 0,
      duration: formDuration.trim() || '10m 00s',
      outcome: formOutcome,
      pnl: formOutcome === 'SL_HIT' ? -Math.abs(pnlNum) : Math.abs(pnlNum),
      pnlPercent: Number(((pnlNum / 10000) * 100).toFixed(2)),
      setup: formSetup.trim() || 'SMC Setup',
      whatHappened: formWhatHappened.trim(),
      whatToDoNext: formWhatToDoNext.trim(),
      loggedAt: new Date().toISOString(),
    };

    const updated = [newEntry, ...entries];
    void saveEntries(updated);
    setShowAddModal(false);
    // Reset inputs
    setFormWhatHappened('');
    setFormWhatToDoNext('');
    Alert.alert('Journal Logged', 'Trade reflection successfully added to your journal.');
  }, [
    formSymbol,
    formDirection,
    formOutcome,
    formPnl,
    formDuration,
    formSetup,
    formWhatHappened,
    formWhatToDoNext,
    entries,
    saveEntries,
  ]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (filter === 'WINS') {
      return entries.filter((e) => e.pnl > 0);
    }
    if (filter === 'LOSSES') {
      return entries.filter((e) => e.pnl <= 0);
    }
    return entries;
  }, [entries, filter]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    const total = entries.length;
    const wins = entries.filter((e) => e.pnl > 0).length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const netPnl = entries.reduce((acc, curr) => acc + curr.pnl, 0).toFixed(2);
    return { total, wins, winRate, netPnl };
  }, [entries]);

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="TRADE JOURNAL & REFLECTION" title="Journal" />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl tintColor={colors.orange} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 1. Performance Overview Strip */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>TRADES</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.winRate}%</Text>
            <Text style={styles.statLabel}>WIN RATE</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: Number(stats.netPnl) >= 0 ? colors.orange : colors.text }]}>
              {Number(stats.netPnl) >= 0 ? `+$${stats.netPnl}` : `-$${Math.abs(Number(stats.netPnl))}`}
            </Text>
            <Text style={styles.statLabel}>NET P&L</Text>
          </View>
        </View>

        {/* 2. Action & Filter Bar */}
        <View style={styles.actionRow}>
          <View style={styles.filterGroup}>
            {(['ALL', 'WINS', 'LOSSES'] as FilterType[]).map((f) => {
              const active = filter === f;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  onPress={() => setFilter(f)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {f === 'ALL' ? `All (${entries.length})` : f === 'WINS' ? 'Wins (+TP)' : 'Losses (-SL)'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add New Trade Reflection"
            onPress={() => setShowAddModal(true)}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressedBtn]}
          >
            <PlusCircleIcon size={16} color="#080808" />
            <Text style={styles.addBtnText}>Log Trade</Text>
          </Pressable>
        </View>

        {/* 3. Trade Journal Cards */}
        {filteredEntries.length === 0 ? (
          <View style={styles.emptyCard}>
            <JournalIcon size={32} color={colors.muted} />
            <Text style={styles.emptyTitle}>No trades in this filter</Text>
            <Text style={styles.emptySubtitle}>Log your trade observations to begin self-improvement tracking.</Text>
          </View>
        ) : (
          filteredEntries.map((item) => {
            const isWin = item.pnl > 0;
            const outcomeLabel =
              item.outcome === 'TP_HIT'
                ? 'Take-Profit Hit'
                : item.outcome === 'SL_HIT'
                ? 'Stop-Loss Hit'
                : item.outcome === 'TRAILING_STOP'
                ? 'Trailing Stop'
                : 'Manual Close';

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Trade ${item.symbol}`}
                onPress={() => setSelectedEntry(item)}
                style={({ pressed }) => [styles.entryCard, pressed && styles.pressedCard]}
              >
                {/* Header row: Symbol, Direction, Outcome, PnL */}
                <View style={styles.cardHeader}>
                  <View style={styles.symbolCol}>
                    <View style={styles.symbolBadgeRow}>
                      <View style={[styles.dirBadge, item.direction === 'BUY' ? styles.dirBuy : styles.dirSell]}>
                        {item.direction === 'BUY' ? (
                          <TrendingUpIcon size={14} color={colors.orange} />
                        ) : (
                          <TrendingDownIcon size={14} color="#FFFFFF" />
                        )}
                        <Text style={[styles.dirText, item.direction === 'BUY' ? styles.dirTextBuy : styles.dirTextSell]}>
                          {item.direction}
                        </Text>
                      </View>
                      <Text style={styles.symbolText}>{item.symbol}</Text>
                    </View>
                    <Text style={styles.setupText}>{item.setup}</Text>
                  </View>

                  <View style={styles.pnlCol}>
                    <Text style={[styles.pnlAmount, isWin ? styles.pnlWin : styles.pnlLoss]}>
                      {isWin ? `+$${item.pnl.toFixed(2)}` : `-$${Math.abs(item.pnl).toFixed(2)}`}
                    </Text>
                    <View style={styles.outcomePill}>
                      <Text style={styles.outcomeText}>{outcomeLabel}</Text>
                    </View>
                  </View>
                </View>

                {/* Duration & Execution Meta */}
                <View style={styles.metaRow}>
                  <View style={styles.durationBadge}>
                    <ClockDurationIcon size={14} color={colors.orange} />
                    <Text style={styles.durationText}>Time to exit: {item.duration}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(item.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                {/* What Happened Section */}
                <View style={styles.reflectionBox}>
                  <Text style={styles.reflectionLabel}>WHAT HAPPENED</Text>
                  <Text style={styles.reflectionText} numberOfLines={3}>
                    {item.whatHappened}
                  </Text>
                </View>

                {/* Self-Improvement / Next Step Section */}
                <View style={styles.improvementBox}>
                  <View style={styles.improvementHeader}>
                    <LightbulbImprovementIcon size={15} color={colors.orange} />
                    <Text style={styles.improvementLabel}>WHAT TO DO NEXT · SELF-IMPROVEMENT</Text>
                  </View>
                  <Text style={styles.improvementText} numberOfLines={3}>
                    {item.whatToDoNext}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ─── MODAL 1: Detail View of Trade Reflection ─── */}
      <Modal visible={selectedEntry !== null} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {selectedEntry && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCol}>
                    <Text style={styles.modalSymbol}>{selectedEntry.symbol}</Text>
                    <Text style={styles.modalSub}>{selectedEntry.setup}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedEntry(null)}
                    style={styles.closeBtn}
                  >
                    <CrossIcon size={18} color={colors.muted} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                  {/* PnL & Duration Showcase */}
                  <View style={styles.modalStatGrid}>
                    <View style={styles.modalStatItem}>
                      <Text style={styles.modalStatLabel}>OUTCOME P&L</Text>
                      <Text
                        style={[
                          styles.modalStatValue,
                          selectedEntry.pnl > 0 ? styles.pnlWin : styles.pnlLoss,
                        ]}
                      >
                        {selectedEntry.pnl > 0
                          ? `+$${selectedEntry.pnl.toFixed(2)}`
                          : `-$${Math.abs(selectedEntry.pnl).toFixed(2)}`}
                      </Text>
                    </View>
                    <View style={styles.modalStatItem}>
                      <Text style={styles.modalStatLabel}>DURATION TO EXIT</Text>
                      <Text style={styles.modalStatValue}>{selectedEntry.duration}</Text>
                    </View>
                    <View style={styles.modalStatItem}>
                      <Text style={styles.modalStatLabel}>DIRECTION</Text>
                      <Text style={styles.modalStatValue}>{selectedEntry.direction}</Text>
                    </View>
                  </View>

                  {/* Section: What Happened */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailSectionTitle}>WHAT HAPPENED DURING TRADE</Text>
                    <Text style={styles.detailBodyText}>{selectedEntry.whatHappened}</Text>
                  </View>

                  {/* Section: What to Do Next */}
                  <View style={styles.detailImprovementCard}>
                    <View style={styles.improvementHeader}>
                      <LightbulbImprovementIcon size={18} color={colors.orange} />
                      <Text style={styles.detailImprovementTitle}>WHAT TO DO NEXT · LESSON LEARNED</Text>
                    </View>
                    <Text style={styles.detailImprovementText}>{selectedEntry.whatToDoNext}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedEntry(null)}
                    style={styles.dismissBtn}
                  >
                    <Text style={styles.dismissBtnText}>Close Trade Reflection</Text>
                  </Pressable>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 2: Add New Trade Reflection ─── */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Trade Reflection</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAddModal(false)}
                style={styles.closeBtn}
              >
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Instrument Symbol */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>SYNTHETIC INSTRUMENT</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSymbol}
                  onChangeText={setFormSymbol}
                  placeholder="e.g. Volatility 75 Index"
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Direction & Outcome Row */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>DIRECTION</Text>
                  <View style={styles.btnToggleGroup}>
                    <Pressable
                      onPress={() => setFormDirection('BUY')}
                      style={[styles.btnToggle, formDirection === 'BUY' && styles.btnToggleActive]}
                    >
                      <Text style={[styles.btnToggleText, formDirection === 'BUY' && styles.btnToggleTextActive]}>
                        BUY
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFormDirection('SELL')}
                      style={[styles.btnToggle, formDirection === 'SELL' && styles.btnToggleActive]}
                    >
                      <Text style={[styles.btnToggleText, formDirection === 'SELL' && styles.btnToggleTextActive]}>
                        SELL
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>OUTCOME</Text>
                  <View style={styles.btnToggleGroup}>
                    <Pressable
                      onPress={() => setFormOutcome('TP_HIT')}
                      style={[styles.btnToggle, formOutcome === 'TP_HIT' && styles.btnToggleActive]}
                    >
                      <Text style={[styles.btnToggleText, formOutcome === 'TP_HIT' && styles.btnToggleTextActive]}>
                        TP Hit
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFormOutcome('SL_HIT')}
                      style={[styles.btnToggle, formOutcome === 'SL_HIT' && styles.btnToggleActive]}
                    >
                      <Text style={[styles.btnToggleText, formOutcome === 'SL_HIT' && styles.btnToggleTextActive]}>
                        SL Hit
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* PnL & Duration Row */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>P&L AMOUNT ($)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formPnl}
                    onChangeText={setFormPnl}
                    placeholder="e.g. 45.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>TIME TO EXIT</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formDuration}
                    onChangeText={setFormDuration}
                    placeholder="e.g. 14m 20s"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>

              {/* Setup Type */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>SETUP DESCRIPTION</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSetup}
                  onChangeText={setFormSetup}
                  placeholder="e.g. 15m Liquidity Sweep + FVG"
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* What Happened */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>WHAT HAPPENED IN THE TRADE?</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={formWhatHappened}
                  onChangeText={setFormWhatHappened}
                  placeholder="Describe price action, reaction to key levels, liquidity grab, or consolidation..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* What to Do Next */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>WHAT TO DO NEXT · SELF-IMPROVEMENT</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={formWhatToDoNext}
                  onChangeText={setFormWhatToDoNext}
                  placeholder="What is the key takeaway? Rule adjustment, entry confirmation, risk discipline..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Trade to Journal"
                onPress={handleAddEntry}
                style={({ pressed }) => [styles.submitBtn, pressed && styles.pressedBtn]}
              >
                <Text style={styles.submitBtnText}>Save Reflection to Journal</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 136, gap: 16 },

  // ─── Performance Stats Header Strip ───
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#262626',
  },

  // ─── Action & Filter Bar ───
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  filterGroup: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterPillActive: {
    backgroundColor: '#262626',
  },
  filterText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.orange,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.orange,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    minHeight: 38,
  },
  addBtnText: {
    color: '#080808',
    fontSize: 12,
    fontWeight: '800',
  },

  // ─── Entry Cards ───
  entryCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  symbolCol: {
    gap: 4,
    flex: 1,
    paddingRight: 10,
  },
  symbolBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dirBuy: {
    backgroundColor: '#1E1408',
    borderColor: colors.orange,
  },
  dirSell: {
    backgroundColor: '#202020',
    borderColor: '#383838',
  },
  dirText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dirTextBuy: {
    color: colors.orange,
  },
  dirTextSell: {
    color: '#FFFFFF',
  },
  symbolText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  setupText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  pnlCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pnlAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  pnlWin: {
    color: colors.orange,
  },
  pnlLoss: {
    color: '#D0D0D0',
  },
  outcomePill: {
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  outcomeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#202020',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationText: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: {
    color: colors.muted,
    fontSize: 11,
  },

  // Reflection Box
  reflectionBox: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  reflectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  reflectionText: {
    color: '#CCCCCC',
    fontSize: 12,
    lineHeight: 18,
  },

  // Improvement Box
  improvementBox: {
    backgroundColor: '#1A1208',
    borderColor: '#3D220A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  improvementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  improvementLabel: {
    color: colors.orange,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  improvementText: {
    color: '#F0F0F0',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },

  emptyCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ─── Modal Styles ───
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  modalHeaderCol: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  modalSymbol: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    color: colors.muted,
    fontSize: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },

  // Modal Stat Grid
  modalStatGrid: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-around',
  },
  modalStatItem: {
    alignItems: 'center',
    gap: 4,
  },
  modalStatLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  modalStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },

  detailCard: {
    backgroundColor: '#181818',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  detailSectionTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  detailBodyText: {
    color: '#DDDDDD',
    fontSize: 13,
    lineHeight: 20,
  },

  detailImprovementCard: {
    backgroundColor: '#1C1206',
    borderColor: '#422408',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  detailImprovementTitle: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  detailImprovementText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },

  dismissBtn: {
    minHeight: 48,
    backgroundColor: '#222222',
    borderColor: '#383838',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  dismissBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  // Form elements
  formGroup: {
    gap: 6,
  },
  formLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  formInput: {
    backgroundColor: '#181818',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 4,
    minHeight: 48,
    alignItems: 'center',
  },
  btnToggle: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  btnToggleActive: {
    backgroundColor: colors.orange,
  },
  btnToggleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  btnToggleTextActive: {
    color: '#080808',
  },
  submitBtn: {
    minHeight: 52,
    backgroundColor: colors.orange,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
  },

  pressedBtn: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pressedCard: {
    opacity: 0.9,
    backgroundColor: '#1A1A1A',
  },
});

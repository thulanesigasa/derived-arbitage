import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ALL_SYMBOLS, type ControlAction, type ControllerState, type SymbolName } from '../types';

interface ControllerScreenProps {
  state: ControllerState | null;
  online: boolean;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onControl: (action: ControlAction) => void;
  onChangeSymbol: (symbol: SymbolName, enabled: boolean) => void;
}

const colors = {
  bg: '#07111F',
  panel: '#0D1A2B',
  panelAlt: '#102238',
  border: '#21344C',
  text: '#F1F5F9',
  muted: '#91A4BB',
  cyan: '#2DD4BF',
  cyanDark: '#123C3B',
  red: '#FB7185',
};

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function ControllerScreen({
  state,
  online,
  busy,
  refreshing,
  onRefresh,
  onControl,
  onChangeSymbol,
}: ControllerScreenProps) {
  if (!state) {
    return (
      <View style={styles.screenRoot}>
        <AppHeader eyebrow="RISK & EXECUTION" title="Controller" />
        <View style={styles.connectingContainer}>
          <ActivityIndicator size="large" color={colors.cyan} />
          <Text style={styles.connectingTitle}>Connecting to controller bridge…</Text>
          <Text style={styles.connectingHint}>Awaiting state synchronization</Text>
        </View>
      </View>
    );
  }

  const floorDistance = state.equity - state.riskPolicy.absoluteEquityFloor;

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="RISK & EXECUTION" title="Controller" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl tintColor={colors.cyan} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Risk Guardrails Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>RISK GUARDRAILS</Text>
          <View style={styles.floorRow}>
            <View style={styles.floorBlock}>
              <Text style={styles.floorLabel}>ABSOLUTE EQUITY FLOOR</Text>
              <Text style={styles.floorValue}>{money(state.riskPolicy.absoluteEquityFloor)}</Text>
              <Text style={styles.floorHint}>{money(floorDistance)} buffer remaining</Text>
            </View>
            <View style={[styles.statusRing, { borderColor: state.equityFloorLocked ? colors.red : colors.cyan }]}>
              <Text style={[styles.statusRingText, { color: state.equityFloorLocked ? colors.red : colors.cyan }]}>
                {state.equityFloorLocked ? 'LOCKED' : 'ARMED'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.guardGrid}>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(state.riskPolicy.defaultRiskPerTrade)}</Text>
              <Text style={styles.guardLabel}>risk / trade</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(state.riskPolicy.hardMaxRiskPerTrade)}</Text>
              <Text style={styles.guardLabel}>hard maximum</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(state.riskPolicy.dailyLossLock)}</Text>
              <Text style={styles.guardLabel}>daily lock</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(state.riskPolicy.weeklyLossLock)}</Text>
              <Text style={styles.guardLabel}>weekly lock</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(state.riskPolicy.maximumTotalLoss)}</Text>
              <Text style={styles.guardLabel}>total loss max</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{state.riskPolicy.maxMarginUsagePercent}%</Text>
              <Text style={styles.guardLabel}>margin ceiling</Text>
            </View>
          </View>
        </View>

        {/* Monitored Instruments Section (Compact 3 visible with scroll) */}
        <View style={styles.cardHeaderOnly}>
          <Text style={styles.sectionTitle}>
            MONITORED INSTRUMENTS ({state.selectedSymbols.length}/{ALL_SYMBOLS.length} ACTIVE)
          </Text>
          <View style={styles.scrollListCard}>
            <ScrollView
              style={styles.instrumentScrollView}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
            >
              {ALL_SYMBOLS.map((symbol, index) => {
                const selected = state.selectedSymbols.includes(symbol);
                return (
                  <View
                    key={symbol}
                    style={[styles.symbolRow, index < ALL_SYMBOLS.length - 1 && styles.symbolBorder]}
                  >
                    <View style={styles.symbolTextWrap}>
                      <Text style={styles.symbolName}>{symbol}</Text>
                      <Text style={styles.symbolMode}>Derived synthetic index</Text>
                    </View>
                    <ToggleSwitch
                      accessibilityLabel={`${selected ? 'Disable' : 'Enable'} ${symbol}`}
                      value={selected}
                      disabled={busy || !online}
                      onValueChange={(enabled) => onChangeSymbol(symbol, enabled)}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Positions Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SIMULATED POSITIONS ({state.positions.length})</Text>
          {state.positions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active positions</Text>
              <Text style={styles.emptyHint}>The robot is waiting for qualifying structural setups.</Text>
            </View>
          ) : (
            state.positions.map((pos) => (
              <View key={pos.id} style={styles.positionRow}>
                <View>
                  <Text style={styles.posSymbol}>{pos.symbol}</Text>
                  <Text style={styles.posSide}>{pos.side.toUpperCase()} · simulated</Text>
                </View>
                <Text style={[styles.posPnl, { color: pos.unrealizedPnl >= 0 ? colors.cyan : colors.red }]}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Emergency Stop Action */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SAFETY INTERVENTION</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Emergency Exit"
            disabled={busy || !online || state.status === 'stopped'}
            onPress={() =>
              Alert.alert(
                'Emergency Exit?',
                'Immediately flattens all simulated positions and halts robot automation.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Exit All', style: 'destructive', onPress: () => onControl('emergencyExit') },
                ]
              )
            }
            style={({ pressed }) => [
              styles.emergencyBtn,
              (busy || !online || state.status === 'stopped') && styles.disabledBtn,
              pressed && styles.pressedBtn,
            ]}
          >
            <Text style={styles.emergencyBtnText}>Emergency Exit</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 16 },

  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeaderOnly: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  floorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floorBlock: {
    flex: 1,
  },
  floorLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  floorValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  floorHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  statusRing: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#091828',
  },
  statusRingText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
  },

  guardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  guardItem: {
    width: '33.33%',
  },
  guardValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  guardLabel: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },

  scrollListCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  instrumentScrollView: {
    maxHeight: 198,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  symbolBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  symbolTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  symbolName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  symbolMode: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },

  emptyState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },

  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  posSymbol: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  posSide: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  posPnl: {
    fontSize: 14,
    fontWeight: '800',
  },

  emergencyBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9F3850',
    backgroundColor: '#2A1018',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyBtnText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '800',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  pressedBtn: {
    opacity: 0.75,
  },
  connectingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  connectingTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  connectingHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});

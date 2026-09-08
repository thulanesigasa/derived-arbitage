import React, { useState } from 'react';
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
import { LiveActivationModal } from '../components/LiveActivationModal';
import { ALL_SYMBOLS, type ControlAction, type ControllerState, type SymbolName } from '../types';
import { OFFLINE_FALLBACK_STATE } from '../api';

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
  bg: '#080808',
  panel: '#161616',
  panelAlt: '#1E1E1E',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  orange: '#FF6B00',
  orangeDark: '#2D1405',
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
  const [gateModalVisible, setGateModalVisible] = useState(false);
  const activeState = state ?? OFFLINE_FALLBACK_STATE;

  const confirmEmergency = () => {
    Alert.alert(
      'Emergency Exit?',
      'Immediately flattens all simulated positions and halts robot automation.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit All', style: 'destructive', onPress: () => onControl('emergencyExit') },
      ]
    );
  };

  const floorDistance = activeState.equity - activeState.riskPolicy.absoluteEquityFloor;

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="RISK & EXECUTION" title="Controller" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl tintColor={colors.orange} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Offline / Synchronization Banner */}
        {!online && (
          <View style={styles.syncBanner}>
            <View style={styles.syncBannerTextWrap}>
              <Text style={styles.syncBannerTitle}>BRIDGE SYNCHRONIZING</Text>
              <Text style={styles.syncBannerHint}>
                {refreshing
                  ? 'Connecting to controller bridge…'
                  : 'Awaiting state synchronization. Tap to sync.'}
              </Text>
            </View>
            <Pressable
              style={styles.syncButton}
              onPress={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#080808" />
              ) : (
                <Text style={styles.syncButtonText}>SYNC</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Risk Guardrails Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>RISK GUARDRAILS</Text>
          <View style={styles.floorRow}>
            <View style={styles.floorBlock}>
              <Text style={styles.floorLabel}>ABSOLUTE EQUITY FLOOR</Text>
              <Text style={styles.floorValue}>{money(activeState.riskPolicy.absoluteEquityFloor)}</Text>
              <Text style={styles.floorHint}>{money(floorDistance)} buffer remaining</Text>
            </View>
            <View style={[styles.statusRing, { borderColor: colors.orange }]}>
              <Text style={[styles.statusRingText, { color: colors.orange }]}>
                {activeState.equityFloorLocked ? 'LOCKED' : 'ARMED'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.guardGrid}>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(activeState.riskPolicy.defaultRiskPerTrade)}</Text>
              <Text style={styles.guardLabel}>risk / trade</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(activeState.riskPolicy.hardMaxRiskPerTrade)}</Text>
              <Text style={styles.guardLabel}>hard maximum</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(activeState.riskPolicy.dailyLossLock)}</Text>
              <Text style={styles.guardLabel}>daily lock</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(activeState.riskPolicy.weeklyLossLock)}</Text>
              <Text style={styles.guardLabel}>weekly lock</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{money(activeState.riskPolicy.maximumTotalLoss)}</Text>
              <Text style={styles.guardLabel}>total loss max</Text>
            </View>
            <View style={styles.guardItem}>
              <Text style={styles.guardValue}>{activeState.riskPolicy.maxMarginUsagePercent}%</Text>
              <Text style={styles.guardLabel}>margin ceiling</Text>
            </View>
          </View>
        </View>

        {/* Monitored Instruments Section (Compact 3 visible with scroll) */}
        <View style={styles.cardHeaderOnly}>
          <Text style={styles.sectionTitle}>
            MONITORED INSTRUMENTS ({activeState.selectedSymbols.length}/{ALL_SYMBOLS.length} ACTIVE)
          </Text>
          <View style={styles.scrollListCard}>
            <ScrollView
              style={styles.instrumentScrollView}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
            >
              {ALL_SYMBOLS.map((symbol, index) => {
                const selected = activeState.selectedSymbols.includes(symbol);
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
          <Text style={styles.sectionTitle}>SIMULATED POSITIONS ({activeState.positions.length})</Text>
          {activeState.positions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active positions</Text>
              <Text style={styles.emptyHint}>The robot is waiting for qualifying structural setups.</Text>
            </View>
          ) : (
            activeState.positions.map((pos) => (
              <View key={pos.id} style={styles.positionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.posSymbol}>{pos.symbol}</Text>
                  <Text style={styles.posSide}>
                    {pos.side.toUpperCase()}
                    {pos.entryPrice ? ` · @ ${pos.entryPrice.toFixed(2)}` : ' · simulated'}
                    {pos.takeProfit ? ` · TP ${pos.takeProfit.toFixed(2)}` : ''}
                  </Text>
                </View>
                <Text style={[styles.posPnl, { color: pos.unrealizedPnl >= 0 ? colors.orange : colors.muted }]}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Live Activation Gate Card (Phase 6) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>LIVE ACTIVATION GATE</Text>
          <Text style={styles.activationDesc}>
            Non-negotiable verification suite enforcing 5 quantitative risk gates (PF ≥ 1.20, Monte Carlo DD &lt; $3.00, outlier independence, anti-martingale sizing, and 8-week soak testing) before live capital deployment.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setGateModalVisible(true)}
            style={({ pressed }) => [styles.gateBtn, pressed && styles.pressedBtn]}
          >
            <Text style={styles.gateBtnText}>Inspect 5 Activation Gates</Text>
          </Pressable>
        </View>

        {/* Emergency Stop Action */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SAFETY INTERVENTION</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Emergency Exit"
            disabled={busy || !online || activeState.status === 'stopped'}
            onPress={confirmEmergency}
            style={({ pressed }) => [
              styles.emergencyBtn,
              (busy || !online || activeState.status === 'stopped') && styles.disabledBtn,
              pressed && styles.pressedBtn,
            ]}
          >
            <Text style={styles.emergencyBtnText}>Emergency Exit</Text>
          </Pressable>
        </View>

        {/* Live Activation Gate Modal */}
        <LiveActivationModal
          visible={gateModalVisible}
          onClose={() => setGateModalVisible(false)}
          controllerState={activeState}
          onActivated={() => onRefresh()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 16 },

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
    backgroundColor: '#101010',
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

  activationDesc: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  gateBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.orange,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  gateBtnText: {
    color: colors.orange,
    fontSize: 14,
    fontWeight: '800',
  },

  emergencyBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.orange,
    backgroundColor: '#26140E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyBtnText: {
    color: colors.orange,
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
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1510',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  syncBannerTextWrap: {
    flex: 1,
  },
  syncBannerTitle: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  syncBannerHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  syncButton: {
    backgroundColor: colors.orange,
    borderRadius: 8,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonText: {
    color: '#080808',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

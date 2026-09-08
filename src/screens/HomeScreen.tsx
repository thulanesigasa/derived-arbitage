import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { RobotIcon } from '../components/TabIcons';
import type { ControlAction, ControllerState } from '../types';

interface HomeScreenProps {
  state: ControllerState | null;
  online: boolean;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onControl: (action: ControlAction) => void;
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

function money(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

export function HomeScreen({
  state,
  online,
  busy,
  refreshing,
  onRefresh,
  onControl,
}: HomeScreenProps) {
  const primaryControl = useMemo(() => {
    if (!state) return null;
    if (state.status === 'stopped') return { label: 'Start Robot', action: 'start' as const };
    if (state.status === 'running') return { label: 'Pause Entries', action: 'pause' as const };
    if (state.status === 'paused') return { label: 'Resume Robot', action: 'resume' as const };
    return null;
  }, [state]);

  const isTransitioning = state
    ? ['starting', 'pausing', 'stopping', 'emergency'].includes(state.status)
    : false;

  const robotStateLabel = !online
    ? 'OFFLINE'
    : isTransitioning
    ? state?.status.toUpperCase()
    : state?.status === 'running'
    ? 'ACTIVE & MONITORING'
    : state?.status === 'paused'
    ? 'PAUSED'
    : 'STANDBY';

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="ROBOT COMMAND CENTER" title="Home" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl tintColor={colors.orange} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Robot Hero Card */}
        <View style={styles.robotCard}>
          <View style={styles.robotAvatarContainer}>
            <View style={styles.robotRing}>
              <RobotIcon size={46} color={online ? colors.orange : colors.muted} />
            </View>
            <Text style={styles.robotStateText}>{robotStateLabel}</Text>
          </View>

          {/* Large Hero Metric */}
          <View style={styles.equityBlock}>
            <Text style={styles.equityLabel}>CURRENT EQUITY</Text>
            <Text style={styles.equityValue}>
              {state ? money(state.equity) : '—'}
            </Text>
          </View>

          {/* Quick Metrics Grid */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>TODAY P&L</Text>
              <Text style={[styles.kpiValue, { color: (state?.sessionPnl ?? 0) >= 0 ? colors.orange : colors.muted }]}>
                {state ? money(state.sessionPnl, true) : '—'}
              </Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>DRAWDOWN</Text>
              <Text style={styles.kpiValue}>
                {state ? money(state.drawdown) : '—'}
              </Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>POSITIONS</Text>
              <Text style={styles.kpiValue}>
                {state ? `${state.positions.length} / ${state.riskPolicy.maxOpenPositions}` : '—'}
              </Text>
            </View>
          </View>

          {/* Heartbeat connection info */}
          <View style={styles.connectionRow}>
            <View style={[styles.connectionDot, { backgroundColor: online ? colors.orange : colors.muted }]} />
            <Text style={styles.connectionText}>
              {online ? 'Mock bridge connected · rev ' + (state?.revision ?? 0) : 'Server offline'}
            </Text>
          </View>
        </View>

        {/* Primary Command Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>ROBOT CONTROLS</Text>
          {isTransitioning && (
            <View style={styles.transitionRow}>
              <ActivityIndicator color={colors.orange} />
              <Text style={styles.transitionText}>Processing {state?.status}…</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            {primaryControl && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={primaryControl.label}
                disabled={busy || !online || isTransitioning}
                onPress={() => onControl(primaryControl.action)}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (busy || !online || isTransitioning) && styles.disabledBtn,
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={styles.primaryBtnText}>{primaryControl.label}</Text>
              </Pressable>
            )}

            {state && state.status !== 'stopped' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop Robot"
                disabled={busy || !online || isTransitioning}
                onPress={() => onControl('stop')}
                style={({ pressed }) => [
                  styles.stopBtn,
                  (busy || !online || isTransitioning) && styles.disabledBtn,
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={styles.stopBtnText}>Stop</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.actionHint}>
            Pause blocks new entries while keeping monitoring active. Stop halts all signals safely.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 16 },

  robotCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  robotAvatarContainer: {
    alignItems: 'center',
    gap: 8,
  },
  robotRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1C1C1C',
    borderWidth: 2,
    borderColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotStateText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  equityBlock: {
    alignItems: 'center',
  },
  equityLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  equityValue: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 2,
  },

  kpiGrid: {
    flexDirection: 'row',
    backgroundColor: '#101010',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    width: '100%',
    paddingVertical: 12,
  },
  kpiCell: {
    flex: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  kpiDivider: {
    width: 1,
    backgroundColor: colors.border,
  },

  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    color: colors.muted,
    fontSize: 11,
  },

  actionsCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  actionsTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transitionText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.orange,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
  },
  stopBtn: {
    minHeight: 52,
    minWidth: 100,
    backgroundColor: '#222222',
    borderColor: '#383838',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stopBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  pressedBtn: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  actionHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
});

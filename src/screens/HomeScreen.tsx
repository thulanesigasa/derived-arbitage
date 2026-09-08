import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { PauseIcon, PlayIcon, QuotesIcon, StopIcon } from '../components/TabIcons';
import type { ControlAction, ControllerState } from '../types';

interface HomeScreenProps {
  state: ControllerState | null;
  online: boolean;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onControl: (action: ControlAction) => void;
  onNavigateTab: (tab: 'home' | 'controller' | 'profiler' | 'activity' | 'profile') => void;
}

const colors = {
  bg: '#080808',
  panel: '#161616',
  panelAlt: '#1C1C1C',
  panelDark: '#101010',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  orange: '#FF6B00',
  orangeMuted: 'rgba(255, 107, 0, 0.15)',
};

function formatMoney(value: number, signed = false): string {
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
  onNavigateTab,
}: HomeScreenProps) {
  const [timestamp, setTimestamp] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour12: false })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimestamp(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isTransitioning = state
    ? ['starting', 'pausing', 'stopping', 'emergency'].includes(state.status)
    : false;

  const primaryAction = useMemo(() => {
    if (!state) return { label: 'START', action: 'start' as const };
    if (state.status === 'stopped') return { label: 'START', action: 'start' as const };
    if (state.status === 'running') return { label: 'PAUSE', action: 'pause' as const };
    if (state.status === 'paused') return { label: 'RESUME', action: 'resume' as const };
    return { label: 'START', action: 'start' as const };
  }, [state]);

  const consoleMessage = useMemo(() => {
    if (!online) {
      return `[${timestamp}] Controller bridge offline · Reconnecting to server...`;
    }
    if (isTransitioning) {
      return `[${timestamp}] Executing ${state?.status} sequence...`;
    }
    if (state?.status === 'running') {
      const pairCount = state.selectedSymbols.length;
      return `[${timestamp}] Falcon FX active · Monitoring ${pairCount} synthetic feeds`;
    }
    if (state?.status === 'paused') {
      return `[${timestamp}] New entries paused · Market price feeds active`;
    }
    return `[${timestamp}] System standby · Ready for automated execution`;
  }, [online, isTransitioning, state?.status, state?.selectedSymbols.length, timestamp]);

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="AI ROBOT COMMAND" title="Falcon FX EA" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl tintColor={colors.orange} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 1. Cybernetic Robot Hero Banner */}
        <View style={styles.heroCard}>
          <Image
            source={require('../../assets/robot_hero.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>DERIV SYNTHETIC EA</Text>
            <Text style={styles.heroSubtitle}>POWERED BY FALCON FX · SMC ENGINE</Text>
          </View>
        </View>

        {/* 2. 3-Button Quick Action Floating Dock */}
        <View style={styles.actionDock}>
          {/* Action 1: START / PAUSE */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryAction.label}
            disabled={busy || !online || isTransitioning}
            onPress={() => onControl(primaryAction.action)}
            style={({ pressed }) => [
              styles.dockButton,
              styles.dockButtonPrimary,
              (busy || !online || isTransitioning) && styles.disabledBtn,
              pressed && styles.pressedBtn,
            ]}
          >
            <View style={styles.dockIconCirclePrimary}>
              {state?.status === 'running' ? (
                <PauseIcon size={18} color="#080808" />
              ) : (
                <PlayIcon size={18} color="#080808" />
              )}
            </View>
            <Text style={styles.dockButtonTextPrimary}>{primaryAction.label}</Text>
          </Pressable>

          {/* Action 2: QUOTES (Deep link to Profiler tab) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quotes and Market Profiler"
            onPress={() => onNavigateTab('profiler')}
            style={({ pressed }) => [
              styles.dockButton,
              styles.dockButtonSecondary,
              pressed && styles.pressedBtn,
            ]}
          >
            <View style={styles.dockIconCircleSecondary}>
              <QuotesIcon size={18} color={colors.orange} />
            </View>
            <Text style={styles.dockButtonTextSecondary}>QUOTES</Text>
          </Pressable>

          {/* Action 3: STOP */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop Robot"
            disabled={busy || !online || isTransitioning || state?.status === 'stopped'}
            onPress={() => onControl('stop')}
            style={({ pressed }) => [
              styles.dockButton,
              styles.dockButtonSecondary,
              (busy || !online || isTransitioning || state?.status === 'stopped') &&
                styles.disabledBtn,
              pressed && styles.pressedBtn,
            ]}
          >
            <View style={styles.dockIconCircleSecondary}>
              <StopIcon size={16} color={colors.text} />
            </View>
            <Text style={styles.dockButtonTextSecondary}>STOP</Text>
          </Pressable>
        </View>

        {/* Transitioning Banner */}
        {isTransitioning && (
          <View style={styles.transitionCard}>
            <ActivityIndicator color={colors.orange} size="small" />
            <Text style={styles.transitionText}>Switching state to {state?.status}…</Text>
          </View>
        )}

        {/* 3. Active Robot Instance Profile Card */}
        <View style={styles.robotCard}>
          <View style={styles.robotHeaderRow}>
            <View style={styles.avatarBorder}>
              <Image
                source={require('../../assets/robot_hero.jpg')}
                style={styles.avatarThumb}
                resizeMode="cover"
              />
            </View>
            <View style={styles.robotDetails}>
              <Text style={styles.robotName}>Falcon FX Scalper #1</Text>
              <Text style={styles.robotSub}>Deriv Options Feed · 10 Synthetic Pairs</Text>
            </View>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: online ? colors.orange : colors.muted },
              ]}
            />
          </View>

          {/* Live Terminal Console Line */}
          <View style={styles.consoleBox}>
            <Text style={styles.consolePrefix}>&gt;&gt;</Text>
            <Text style={styles.consoleText} numberOfLines={2}>
              {consoleMessage}
            </Text>
          </View>
        </View>

        {/* 4. Performance KPI Grid */}
        <View style={styles.equityCard}>
          <View style={styles.equityHeader}>
            <Text style={styles.sectionLabel}>PORTFOLIO EQUITY</Text>
            <Text style={styles.equityNumber}>
              {state ? formatMoney(state.equity) : '—'}
            </Text>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>TODAY P&amp;L</Text>
              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      (state?.sessionPnl ?? 0) > 0
                        ? colors.orange
                        : (state?.sessionPnl ?? 0) < 0
                        ? colors.muted
                        : colors.text,
                  },
                ]}
              >
                {state ? formatMoney(state.sessionPnl, true) : '—'}
              </Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>MAX DRAWDOWN</Text>
              <Text style={styles.kpiValue}>
                {state ? formatMoney(state.drawdown) : '—'}
              </Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>POSITIONS</Text>
              <Text style={styles.kpiValue}>
                {state
                  ? `${state.positions.length} / ${state.riskPolicy.maxOpenPositions}`
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* 5. Strategy Parameters Card */}
        <View style={styles.strategyCard}>
          <Text style={styles.sectionLabel}>EXECUTION PARAMETERS</Text>
          <View style={styles.paramGrid}>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>Signal Engine</Text>
              <Text style={styles.paramVal}>SMC + Falcon Liquidity</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>Risk Allocation</Text>
              <Text style={styles.paramVal}>1.0% Equity / trade</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>Stop Loss Model</Text>
              <Text style={styles.paramVal}>Dynamic ATR (1.5x)</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>Take Profit Ratio</Text>
              <Text style={styles.paramVal}>1 : 2.5 R:R</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>Max Daily Loss</Text>
              <Text style={styles.paramVal}>
                {state ? formatMoney(state.riskPolicy.dailyLossLock) : '$150.00'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 128,
    gap: 16,
  },

  /* 1. Hero Card */
  heroCard: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 8, 8, 0.82)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroSubtitle: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },

  /* 2. Action Dock */
  actionDock: {
    flexDirection: 'row',
    gap: 12,
  },
  dockButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 4,
  },
  dockButtonPrimary: {
    backgroundColor: colors.orange,
  },
  dockButtonSecondary: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  },
  dockIconCirclePrimary: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockIconCircleSecondary: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockButtonTextPrimary: {
    color: '#080808',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dockButtonTextSecondary: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  pressedBtn: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  transitionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.panel,
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  transitionText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
  },

  /* 3. Robot Profile Card */
  robotCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  robotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBorder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.orange,
    overflow: 'hidden',
    backgroundColor: colors.panelDark,
  },
  avatarThumb: {
    width: '100%',
    height: '100%',
  },
  robotDetails: {
    flex: 1,
  },
  robotName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  robotSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  consoleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.panelDark,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  consolePrefix: {
    color: colors.orange,
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 12,
  },
  consoleText: {
    flex: 1,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },

  /* 4. Equity & KPI Card */
  equityCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  equityHeader: {
    gap: 4,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  equityNumber: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiRow: {
    flexDirection: 'row',
    backgroundColor: colors.panelDark,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  kpiCol: {
    flex: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiDivider: {
    width: 1,
    backgroundColor: colors.border,
  },

  /* 5. Strategy Card */
  strategyCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  paramGrid: {
    gap: 10,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#202020',
    paddingBottom: 8,
  },
  paramKey: {
    color: colors.muted,
    fontSize: 12,
  },
  paramVal: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});

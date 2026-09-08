import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, getState, sendControl, stateSocketUrl, updateSymbols } from './src/api';
import { ALL_SYMBOLS, type AutomationStatus, type ControlAction, type ControllerState, type SymbolName } from './src/types';
import { ProfilerScreen } from './src/screens/ProfilerScreen';
import { AppHeader } from './src/components/AppHeader';
import { ToggleSwitch } from './src/components/ToggleSwitch';


const colors = {
  bg: '#07111F',
  panel: '#0D1A2B',
  panelAlt: '#102238',
  border: '#21344C',
  text: '#F1F5F9',
  muted: '#91A4BB',
  cyan: '#2DD4BF',
  cyanDark: '#123C3B',
  amber: '#FBBF24',
  amberDark: '#3C3015',
  red: '#FB7185',
  redDark: '#451A25',
  blue: '#60A5FA',
};

function requestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function money(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function relativeHeartbeat(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 8 ? 'Live now' : `${seconds}s ago`;
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'normal' }) {
  const color = tone === 'good' ? colors.cyan : tone === 'bad' ? colors.red : colors.text;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function ControlButton({ label, onPress, disabled, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        variant === 'primary' ? styles.primaryButton : variant === 'danger' ? styles.dangerButton : styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.controlButtonText, variant === 'danger' && styles.dangerButtonText]}>{label}</Text>
    </Pressable>
  );
}

function AppContent() {
  const [state, setState] = useState<ControllerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await getState();
      if (!mounted.current) return;
      setState(next);
      setOnline(true);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setOnline(false);
      setError(caught instanceof Error ? caught.message : 'Could not reach the mock server.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const clockTimer = setInterval(() => setClock(Date.now()), 3_000);
    let socket: WebSocket | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(stateSocketUrl());
      socket.onopen = () => mounted.current && setOnline(true);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type: string; state: ControllerState };
          if (message.type === 'state' && mounted.current) {
            setState(message.state);
            setOnline(true);
            setError(null);
          }
        } catch { /* Ignore malformed mock messages. */ }
      };
      socket.onerror = () => mounted.current && setOnline(false);
      socket.onclose = () => {
        if (!mounted.current) return;
        setOnline(false);
        reconnectTimer.current = setTimeout(connect, 2_000);
      };
    };
    connect();

    return () => {
      disposed = true;
      mounted.current = false;
      clearInterval(clockTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [load]);

  const performControl = useCallback(async (action: ControlAction) => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sendControl(action, state.revision, requestId(action));
      setState(next);
      setAcknowledgement(`${action === 'emergencyExit' ? 'Emergency Exit' : action[0]?.toUpperCase() + action.slice(1)} acknowledged by server.`);
      setTimeout(() => mounted.current && setAcknowledgement(null), 3_500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Control request failed.');
      await load(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, load, state]);

  const changeSymbol = useCallback(async (symbol: SymbolName, enabled: boolean) => {
    if (!state || busy) return;
    const nextSymbols = enabled
      ? [...state.selectedSymbols, symbol]
      : state.selectedSymbols.filter((item) => item !== symbol);
    if (!nextSymbols.length) {
      Alert.alert('Keep one instrument', 'Select at least one simulated instrument for monitoring.');
      return;
    }
    setBusy(true);
    try {
      setState(await updateSymbols(nextSymbols, state.revision, requestId('symbols')));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update instruments.');
      await load(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, load, state]);

  const primaryControl = useMemo(() => {
    if (!state) return null;
    if (state.status === 'stopped') return { label: 'Start demo', action: 'start' as const };
    if (state.status === 'running') return { label: 'Pause entries', action: 'pause' as const };
    if (state.status === 'paused') return { label: 'Resume', action: 'resume' as const };
    return null;
  }, [state]);

  if (loading && !state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.cyan} />
        <Text style={styles.loadingTitle}>Connecting to demo controller…</Text>
        <Text style={styles.loadingHint}>{API_BASE_URL}</Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.centered}>
        <Text style={styles.offlineIcon}>⌁</Text>
        <Text style={styles.loadingTitle}>Mock server is offline</Text>
        <Text style={styles.offlineCopy}>{error ?? 'Start the local control server and check your LAN address.'}</Text>
        <ControlButton label="Try again" onPress={() => void load()} />
        <Text style={styles.apiText}>{API_BASE_URL}</Text>
      </View>
    );
  }

  const isTransitioning = ['starting', 'pausing', 'stopping', 'emergency'].includes(state.status);
  const pnlTone = state.sessionPnl > 0 ? 'good' : state.sessionPnl < 0 ? 'bad' : 'normal';
  const floorDistance = state.equity - state.riskPolicy.absoluteEquityFloor;

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="PERSONAL CONTROLLER" title="Mobile EA" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={colors.cyan} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <Card style={styles.heroCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.accountLabel}>STANDARD · SIMULATED</Text>
            <Text style={styles.equity}>{money(state.equity)}</Text>
            <Text style={styles.equityLabel}>Mock equity</Text>
          </View>
        </View>
        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: online ? colors.cyan : colors.red }]} />
          <Text style={styles.connectionText}>{online ? 'Mock server connected' : 'Connection interrupted'}</Text>
          <Text style={styles.heartbeat}>{relativeHeartbeat(state.lastHeartbeat)} · {clock ? '' : ''}rev {state.revision}</Text>
        </View>
      </Card>

      {!online ? <View style={styles.offlineBanner}><Text style={styles.offlineBannerText}>OFFLINE — controls are unavailable. Monitoring will reconnect automatically.</Text></View> : null}
      {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
      {acknowledgement ? <View style={styles.ackBanner}><Text style={styles.ackText}>✓ {acknowledgement}</Text></View> : null}

      <View style={styles.metricGrid}>
        <Metric label="Mock balance" value={money(state.balance)} />
        <Metric label="Session P&L" value={money(state.sessionPnl, true)} tone={pnlTone} />
        <Metric label="Drawdown" value={money(state.drawdown)} tone={state.drawdown > 0 ? 'bad' : 'normal'} />
        <Metric label="Open simulations" value={`${state.positions.length} / ${state.riskPolicy.maxOpenPositions}`} />
      </View>

      <SectionTitle title="Automation control" hint="Server acknowledged" />
      <Card>
        {isTransitioning ? <View style={styles.transitionRow}><ActivityIndicator color={colors.amber} /><Text style={styles.transitionText}>Mock server is {state.status}…</Text></View> : null}
        <View style={styles.controlGrid}>
          {primaryControl ? <ControlButton label={primaryControl.label} onPress={() => void performControl(primaryControl.action)} disabled={busy || !online} /> : null}
          {state.status !== 'stopped' ? <ControlButton label="Stop automation" variant="secondary" onPress={() => void performControl('stop')} disabled={busy || !online || isTransitioning} /> : null}
        </View>
        <Text style={styles.helperText}>Pause blocks new entries. Pause and Stop keep monitoring active and never abandon an open simulated position.</Text>
        <View style={styles.divider} />
        <ControlButton
          label="Emergency Exit"
          variant="danger"
          disabled={busy || !online || state.status === 'stopped'}
          onPress={() => Alert.alert(
            'Emergency Exit?',
            'This immediately clears every simulated position and stops demo automation. No live order will be sent.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Exit simulations', style: 'destructive', onPress: () => void performControl('emergencyExit') }],
          )}
        />
      </Card>

      <SectionTitle title="Risk guardrails" hint="Hard server limits" />
      <Card style={state.equityFloorLocked ? styles.dangerCard : undefined}>
        <View style={styles.floorRow}>
          <View style={styles.shield}><Text style={styles.shieldText}>◇</Text></View>
          <View style={styles.flex}>
            <Text style={styles.floorLabel}>ABSOLUTE EQUITY FLOOR</Text>
            <Text style={styles.floorValue}>{money(state.riskPolicy.absoluteEquityFloor)}</Text>
            <Text style={styles.floorHint}>{money(floorDistance)} buffer remaining</Text>
          </View>
          <Text style={[styles.lockState, state.equityFloorLocked && { color: colors.red }]}>{state.equityFloorLocked ? 'LOCKED' : 'ARMED'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.guardGrid}>
          <View style={styles.guard}><Text style={styles.guardValue}>{money(state.riskPolicy.defaultRiskPerTrade)}</Text><Text style={styles.guardLabel}>risk / trade</Text></View>
          <View style={styles.guard}><Text style={styles.guardValue}>{money(state.riskPolicy.hardMaxRiskPerTrade)}</Text><Text style={styles.guardLabel}>hard maximum</Text></View>
          <View style={styles.guard}><Text style={styles.guardValue}>{money(state.riskPolicy.dailyLossLock)}</Text><Text style={styles.guardLabel}>daily lock</Text></View>
          <View style={styles.guard}><Text style={styles.guardValue}>{money(state.riskPolicy.weeklyLossLock)}</Text><Text style={styles.guardLabel}>weekly lock</Text></View>
          <View style={styles.guard}><Text style={styles.guardValue}>{money(state.riskPolicy.maximumTotalLoss)}</Text><Text style={styles.guardLabel}>total loss max</Text></View>
          <View style={styles.guard}><Text style={styles.guardValue}>{state.riskPolicy.maxMarginUsagePercent}%</Text><Text style={styles.guardLabel}>margin ceiling</Text></View>
        </View>
      </Card>

      <SectionTitle title="Positions" hint="Simulated only" />
      <Card>
        {state.positions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>—</Text>
            <Text style={styles.emptyTitle}>No open simulations</Text>
            <Text style={styles.helperText}>This MVP has no strategy engine and never places broker orders.</Text>
          </View>
        ) : state.positions.map((position) => (
          <View key={position.id} style={styles.positionRow}>
            <View><Text style={styles.positionSymbol}>{position.symbol}</Text><Text style={styles.positionMeta}>{position.side} · SIMULATED</Text></View>
            <Text style={position.unrealizedPnl >= 0 ? styles.goodText : styles.badText}>{money(position.unrealizedPnl, true)}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle title="Monitored instruments" hint={`${state.selectedSymbols.length} of ${ALL_SYMBOLS.length} active · scroll list`} />
      <Card style={styles.scrollListCard}>
        <ScrollView
          style={styles.instrumentScrollView}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
        >
          {ALL_SYMBOLS.map((symbol, index) => {
            const selected = state.selectedSymbols.includes(symbol);
            return (
              <View key={symbol} style={[styles.symbolRow, index < ALL_SYMBOLS.length - 1 && styles.symbolBorder]}>
                <View style={styles.symbolTextWrap}>
                  <Text style={styles.symbolName}>{symbol}</Text>
                  <Text style={styles.symbolMode}>Mock data · no broker feed</Text>
                </View>
                <ToggleSwitch
                  accessibilityLabel={`${selected ? 'Disable' : 'Enable'} ${symbol}`}
                  value={selected}
                  disabled={busy || !online}
                  onValueChange={(enabled) => void changeSymbol(symbol, enabled)}
                />
              </View>
            );
          })}
        </ScrollView>
      </Card>

      <SectionTitle title="Activity" hint="Latest first" />
      <Card style={styles.listCard}>
        {state.activity.slice(0, 8).map((item, index) => (
          <View key={item.id} style={[styles.activityRow, index < Math.min(state.activity.length, 8) - 1 && styles.symbolBorder]}>
            <View style={[styles.activityMark, { backgroundColor: item.kind === 'danger' ? colors.red : item.kind === 'warning' ? colors.amber : item.kind === 'success' ? colors.cyan : colors.blue }]} />
            <View style={styles.flex}>
              <Text style={styles.activityMessage}>{item.message}</Text>
              <Text style={styles.activityTime}>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>DEMO CONTROL PLANE</Text>
        <Text style={styles.footerText}>No Deriv, MT5, VPS, credentials, price feed, strategy, or live trading connection.</Text>
        <Text selectable style={styles.apiText}>{API_BASE_URL}</Text>
      </View>
    </ScrollView>
    </View>
  );
}

type TabId = 'controller' | 'profiler';

const TAB_DEFS: Array<{ id: TabId; label: string }> = [
  { id: 'controller', label: 'Controller' },
  { id: 'profiler',   label: 'Profiler'   },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('controller');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <StatusBar style="light" />

        {/* Screen content */}
        <View style={styles.screenArea}>
          {activeTab === 'controller' ? <AppContent /> : <ProfilerScreen />}
        </View>

        {/* Bottom tab bar */}
        <View style={styles.tabBar}>
          {TAB_DEFS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => setActiveTab(id)}
                style={styles.tabItem}
              >
                {/* Active indicator pip */}
                <View style={[styles.tabPip, active && styles.tabPipActive]} />
                <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  safeArea:        { flex: 1, backgroundColor: colors.bg },
  screenRoot:      { flex: 1, backgroundColor: colors.bg },
  screenArea:      { flex: 1 },
  // ─── Tab bar (Rule 15: accounts for OS chrome) ─────────────────────────────
  tabBar:          {
    flexDirection: 'row',
    backgroundColor: '#0A1825',
    borderTopWidth: 1,
    borderTopColor: '#1C2D3E',
    height: Platform.OS === 'android' ? 104 : 90,
    paddingBottom: Platform.OS === 'android' ? 48 : 34,
    paddingTop: 8,
  },
  tabItem:         { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: Platform.OS === 'android' ? 48 : 44, gap: 4 },
  tabPip:          { width: 20, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  tabPipActive:    { backgroundColor: colors.cyan },
  tabLabel:        { fontSize: 11, fontWeight: '700' },
  tabLabelActive:  { color: colors.cyan },
  tabLabelIdle:    { color: colors.muted },
  // ─── Controller styles ─────────────────────────────────────────────────────
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 16 },
  centered: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 16 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  eyebrow: { color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 },
  heroCard: { backgroundColor: colors.panelAlt, padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  accountLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  equity: { color: colors.text, fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  equityLabel: { color: colors.muted, fontSize: 13 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  connectionDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  connectionText: { color: colors.muted, fontSize: 12, flex: 1 },
  heartbeat: { color: colors.muted, fontSize: 11 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 11, paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionHint: { color: colors.muted, fontSize: 11 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 15, padding: 14, minHeight: 86 },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  offlineBanner: { backgroundColor: colors.redDark, borderRadius: 10, padding: 12 },
  offlineBannerText: { color: '#FECDD3', fontSize: 12, fontWeight: '700' },
  errorBanner: { backgroundColor: colors.redDark, borderColor: '#7F2940', borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { color: '#FECDD3', fontSize: 13 },
  ackBanner: { backgroundColor: colors.cyanDark, borderColor: '#22766F', borderWidth: 1, borderRadius: 10, padding: 12 },
  ackText: { color: '#99F6E4', fontSize: 13, fontWeight: '700' },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  controlButton: { minHeight: 50, minWidth: 130, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexGrow: 1, borderWidth: 1 },
  primaryButton: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  secondaryButton: { backgroundColor: '#192A3E', borderColor: '#38506B' },
  dangerButton: { backgroundColor: 'transparent', borderColor: '#9F3850' },
  disabledButton: { opacity: 0.4 },
  pressedButton: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  controlButtonText: { color: '#041510', fontSize: 14, fontWeight: '800' },
  dangerButtonText: { color: colors.red },
  helperText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },
  transitionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  transitionText: { color: colors.amber, fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 15 },
  floorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shield: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.cyanDark, alignItems: 'center', justifyContent: 'center' },
  shieldText: { color: colors.cyan, fontSize: 28, fontWeight: '300' },
  flex: { flex: 1 },
  floorLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  floorValue: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 2 },
  floorHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  lockState: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  dangerCard: { borderColor: '#9F3850' },
  guardGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  guard: { width: '33.33%' },
  guardValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  guardLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
  listCard: { paddingVertical: 3 },
  scrollListCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  instrumentScrollView: { maxHeight: 198 },
  symbolRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  symbolBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  symbolTextWrap: { flex: 1, paddingRight: 12 },
  symbolName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  symbolMode: { color: colors.muted, fontSize: 10, marginTop: 3 },
  emptyState: { alignItems: 'center', paddingVertical: 8 },
  emptyIcon: { color: colors.muted, fontSize: 26 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  positionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  positionSymbol: { color: colors.text, fontWeight: '700' },
  positionMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  goodText: { color: colors.cyan, fontWeight: '800' },
  badText: { color: colors.red, fontWeight: '800' },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, minHeight: 62, paddingHorizontal: 13, paddingVertical: 11 },
  activityMark: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  activityMessage: { color: colors.text, fontSize: 12, lineHeight: 17 },
  activityTime: { color: colors.muted, fontSize: 10, marginTop: 5 },
  footer: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, gap: 7 },
  footerTitle: { color: colors.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  footerText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  apiText: { color: colors.blue, fontSize: 11, textAlign: 'center', marginTop: 4 },
  loadingTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  loadingHint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  offlineIcon: { color: colors.red, fontSize: 48 },
  offlineCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
});

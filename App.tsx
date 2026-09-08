import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  API_BASE_URL,
  getApiBaseUrl,
  setApiBaseUrl,
  onApiBaseUrlChange,
  probeCandidateUrls,
  KNOWN_HOST_CANDIDATES,
  getState,
  sendControl,
  stateSocketUrl,
  updateSymbols,
} from './src/api';
import { ALL_SYMBOLS, type ControlAction, type ControllerState, type SymbolName } from './src/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { ControllerScreen } from './src/screens/ControllerScreen';
import { ProfilerScreen } from './src/screens/ProfilerScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import {
  ActivityIcon,
  ControllerIcon,
  HomeIcon,
  ProfileIcon,
  ProfilerIcon,
} from './src/components/TabIcons';

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

const OFFLINE_FALLBACK_STATE: ControllerState = {
  serverInstanceId: 'offline-demo-mode',
  revision: 1,
  status: 'stopped',
  accountType: 'Standard',
  mode: 'DEMO',
  connected: false,
  lastHeartbeat: new Date().toISOString(),
  balance: 20,
  equity: 20,
  sessionPnl: 0,
  dailyPnl: 0,
  weeklyPnl: 0,
  drawdown: 0,
  marginUsagePercent: 0,
  selectedSymbols: [...ALL_SYMBOLS],
  positions: [],
  riskPolicy: {
    initialBalance: 20,
    absoluteEquityFloor: 15,
    maximumTotalLoss: 5,
    defaultRiskPerTrade: 0.1,
    hardMaxRiskPerTrade: 0.2,
    dailyLossLock: 0.4,
    weeklyLossLock: 1,
    maxOpenPositions: 1,
    maxMarginUsagePercent: 20,
  },
  dailyLocked: false,
  weeklyLocked: false,
  equityFloorLocked: false,
  activity: [
    {
      id: 'offline-init-01',
      at: new Date().toISOString(),
      kind: 'info',
      message: 'Running in offline demo mode. Configure your host IP in Profile to connect.',
    },
  ],
};

function requestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type TabId = 'home' | 'controller' | 'profiler' | 'activity' | 'profile';

const TAB_DEFS: Array<{
  id: TabId;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}> = [
  { id: 'home',       label: 'Home',     Icon: HomeIcon },
  { id: 'controller', label: 'Control',  Icon: ControllerIcon },
  { id: 'profiler',   label: 'Profiler', Icon: ProfilerIcon },
  { id: 'activity',   label: 'Activity', Icon: ActivityIcon },
  { id: 'profile',    label: 'Profile',  Icon: ProfileIcon },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [state, setState] = useState<ControllerState>(OFFLINE_FALLBACK_STATE);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Animated sliding pill indicator for bottom tab navigation
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [pillContainerWidth, setPillContainerWidth] = useState(0);

  useEffect(() => {
    const targetIndex = TAB_DEFS.findIndex((t) => t.id === activeTab);
    if (targetIndex >= 0) {
      Animated.spring(tabAnim, {
        toValue: targetIndex,
        useNativeDriver: true,
        friction: 8,
        tension: 65,
      }).start();
    }
  }, [activeTab, tabAnim]);

  const tabWidth = pillContainerWidth > 0 ? pillContainerWidth / TAB_DEFS.length : 0;
  const translateX = tabAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [0, tabWidth, tabWidth * 2, tabWidth * 3, tabWidth * 4],
  });

  const [currentApiUrl, setCurrentApiUrl] = useState(() => getApiBaseUrl());

  useEffect(() => {
    return onApiBaseUrlChange((newUrl) => {
      setCurrentApiUrl(newUrl);
    });
  }, []);

  const load = useCallback(async (silent = false, customUrl?: string) => {
    if (customUrl) {
      setApiBaseUrl(customUrl);
      setCurrentApiUrl(customUrl);
    }
    if (!silent) setLoading(true);

    try {
      const next = await getState();
      if (!mounted.current) return;
      setState(next);
      setOnline(true);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;

      // Automatically attempt candidate host auto-discovery
      try {
        const workingHost = await probeCandidateUrls();
        if (workingHost && mounted.current) {
          setCurrentApiUrl(workingHost);
          const recovered = await getState();
          setState(recovered);
          setOnline(true);
          setError(null);
          return;
        }
      } catch {
        // Continue with offline fallback state
      }

      setOnline(false);
      setError(caught instanceof Error ? caught.message : 'Could not reach the controller server.');
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
    let socket: WebSocket | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
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
          } catch {
            // Ignore malformed mock messages
          }
        };
        socket.onerror = () => mounted.current && setOnline(false);
        socket.onclose = () => {
          if (!mounted.current) return;
          setOnline(false);
          reconnectTimer.current = setTimeout(connect, 3000);
        };
      } catch {
        if (!mounted.current) return;
        setOnline(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };
    connect();

    return () => {
      disposed = true;
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [load, currentApiUrl]);

  const performControl = useCallback(
    async (action: ControlAction) => {
      if (!state || busy) return;
      setBusy(true);
      setError(null);
      try {
        const next = await sendControl(action, state.revision, requestId(action));
        setState(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Control request failed.');
        await load(true);
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, load, state]
  );

  const changeSymbol = useCallback(
    async (symbol: SymbolName, enabled: boolean) => {
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
    },
    [busy, load, state]
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <StatusBar style="light" />

        {/* Screen content */}
        <View style={styles.screenArea}>
          {activeTab === 'home' && (
            <HomeScreen
              state={state}
              online={online}
              busy={busy}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              onControl={(action) => void performControl(action)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'controller' && (
            <ControllerScreen
              state={state}
              online={online}
              busy={busy}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              onControl={(action) => void performControl(action)}
              onChangeSymbol={(symbol, enabled) => void changeSymbol(symbol, enabled)}
            />
          )}

          {activeTab === 'profiler' && <ProfilerScreen />}

          {activeTab === 'activity' && (
            <ActivityScreen
              state={state}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
            />
          )}

          {activeTab === 'profile' && <ProfileScreen />}
        </View>

        {/* Floating Pill Tab Navigation Bar with Animated Sliding Indicator (Rule 15 & Reference Design) */}
        <View style={styles.floatingNavWrapper}>
          <View
            style={styles.pillBar}
            onLayout={(e) => setPillContainerWidth(e.nativeEvent.layout.width)}
          >
            {/* Smooth animated sliding underline indicator below active tab */}
            {tabWidth > 0 && (
              <Animated.View
                style={[
                  styles.slidingIndicator,
                  {
                    width: tabWidth,
                    transform: [{ translateX }],
                  },
                ]}
              >
                <View style={styles.sliderLine} />
              </Animated.View>
            )}

            {/* Tab items */}
            {TAB_DEFS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              const color = active ? colors.orange : colors.muted;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
                  onPress={() => setActiveTab(id)}
                  style={styles.tabItem}
                >
                  <Icon size={20} color={color} />
                  <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  screenArea: { flex: 1 },

  // ─── Floating Pill Tab Bar (Rule 15: accounts for OS chrome + floating pill design) ──
  floatingNavWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 48 : 34,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pillBar: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: '#161616',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#282828',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  slidingIndicator: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    height: 3,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  sliderLine: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.orange,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingBottom: 4,
    gap: 3,
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabLabelIdle: {
    color: colors.muted,
  },

  centered: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 16,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});

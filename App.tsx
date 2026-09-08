import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, getState, sendControl, stateSocketUrl, updateSymbols } from './src/api';
import type { ControlAction, ControllerState, SymbolName } from './src/types';
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
  const [state, setState] = useState<ControllerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        } catch {
          // Ignore malformed mock messages
        }
      };
      socket.onerror = () => mounted.current && setOnline(false);
      socket.onclose = () => {
        if (!mounted.current) return;
        setOnline(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [load]);

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

  if (loading && !state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.cyan} />
        <Text style={styles.loadingTitle}>Connecting to mobile controller…</Text>
        <Text style={styles.loadingHint}>{API_BASE_URL}</Text>
      </View>
    );
  }

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

        {/* Bottom tab bar (Rule 15: accounts for OS chrome + SVGs) */}
        <View style={styles.tabBar}>
          {TAB_DEFS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            const color = active ? colors.cyan : colors.muted;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => setActiveTab(id)}
                style={styles.tabItem}
              >
                <View style={[styles.tabPip, active && styles.tabPipActive]} />
                <Icon size={20} color={color} />
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
  safeArea: { flex: 1, backgroundColor: colors.bg },
  screenArea: { flex: 1 },

  // ─── Tab bar (Rule 15: accounts for OS chrome) ─────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0A1825',
    borderTopWidth: 1,
    borderTopColor: '#1C2D3E',
    height: Platform.OS === 'android' ? 104 : 90,
    paddingBottom: Platform.OS === 'android' ? 48 : 34,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'android' ? 48 : 44,
    gap: 3,
  },
  tabPip: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabPipActive: {
    backgroundColor: colors.cyan,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.cyan,
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

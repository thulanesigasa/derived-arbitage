import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../components/AppHeader';
import {
  API_BASE_URL,
  authenticateBridge,
  getApiBaseUrl,
  setApiBaseUrl,
  setAuthCredentials,
} from '../api';

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

const STORAGE_KEY = '@mobile_ea_profile_config';

interface ProfileConfig {
  derivAppId: string;
  derivToken: string;
  mt5Server: string;
  mt5Account: string;
  bridgeUrl: string;
  vpsApiKey: string;
  deviceId: string;
  authToken: string | null;
}

const DEFAULT_CONFIG: ProfileConfig = {
  derivAppId: '1089',
  derivToken: '',
  mt5Server: 'DerivSVG-Server-03',
  mt5Account: 'Demo/Live Standard',
  bridgeUrl: API_BASE_URL,
  vpsApiKey: 'falcon-vps-key-2026',
  deviceId: 'device-demo-android-01',
  authToken: null,
};

export function ProfileScreen() {
  const [config, setConfig] = useState<ProfileConfig>(DEFAULT_CONFIG);
  const [authenticating, setAuthenticating] = useState(false);
  const [testingDeriv, setTestingDeriv] = useState(false);
  const [testingBridge, setTestingBridge] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  // Load saved config
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ProfileConfig;
          setConfig((prev) => ({ ...prev, ...parsed }));
          if (parsed.bridgeUrl) {
            setApiBaseUrl(parsed.bridgeUrl);
          }
          setAuthCredentials({
            token: parsed.authToken,
            apiKey: parsed.vpsApiKey,
            deviceId: parsed.deviceId,
          });
        }
      } catch {
        // Fallback to default
      }
    })();
  }, []);

  const saveConfig = useCallback(async () => {
    try {
      if (config.bridgeUrl) {
        setApiBaseUrl(config.bridgeUrl);
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 3000);
    } catch {
      Alert.alert('Error', 'Could not save configuration locally.');
    }
  }, [config]);

  const testDerivConnection = useCallback(async () => {
    setTestingDeriv(true);
    try {
      const targetUrl = config.bridgeUrl || getApiBaseUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${targetUrl}/api/profiler/status`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { connected: boolean; authorized: boolean };
      if (json.connected) {
        Alert.alert(
          'Deriv Connection Active',
          `WebSocket connection is online via app_id ${config.derivAppId}. Live tick feeds operational.`
        );
      } else {
        Alert.alert('Deriv Connection Offline', 'Could not establish WebSocket handshake with Deriv.');
      }
    } catch (err) {
      Alert.alert('Connection Failed', err instanceof Error ? err.message : 'Deriv check failed.');
    } finally {
      setTestingDeriv(false);
    }
  }, [config.derivAppId, config.bridgeUrl]);

  const testBridgeConnection = useCallback(async () => {
    setTestingBridge(true);
    const start = Date.now();
    const targetUrl = config.bridgeUrl || getApiBaseUrl();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${targetUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latency = Date.now() - start;
      if (resp.ok) {
        Alert.alert('Bridge Connected', `VPS Control Bridge responded in ${latency}ms at ${targetUrl}`);
      } else {
        Alert.alert('Bridge Error', `Server returned status ${resp.status}`);
      }
    } catch (err) {
      Alert.alert('Bridge Unreachable', err instanceof Error ? err.message : 'Could not reach server.');
    } finally {
      setTestingBridge(false);
    }
  }, [config.bridgeUrl]);

  const handleAuthenticate = useCallback(async () => {
    setAuthenticating(true);
    try {
      const res = await authenticateBridge(config.vpsApiKey, config.deviceId);
      setConfig((c) => ({ ...c, authToken: res.token }));
      setAuthCredentials({ token: res.token, apiKey: config.vpsApiKey, deviceId: config.deviceId });
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...config, authToken: res.token })
      );
      Alert.alert(
        'VPS Bridge Authenticated',
        `Bearer JWT token issued successfully for device ${res.deviceId}. Valid for 24 hours.`
      );
    } catch (err) {
      Alert.alert(
        'Authentication Failed',
        err instanceof Error ? err.message : 'Failed to authenticate with VPS bridge.'
      );
    } finally {
      setAuthenticating(false);
    }
  }, [config]);

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="ACCOUNT & CONNECTIVITY" title="Profile" />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {savedNote && (
          <View style={styles.savedBanner}>
            <Text style={styles.savedText}>✓ Configuration saved successfully</Text>
          </View>
        )}

        {/* Deriv Connection Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DERIV WEBSOCKET CREDENTIALS</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DERIV APP ID</Text>
            <TextInput
              style={styles.input}
              value={config.derivAppId}
              onChangeText={(text) => setConfig((c) => ({ ...c, derivAppId: text }))}
              placeholder="1089"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
            />
            <Text style={styles.fieldHint}>Default 1089 is public Deriv WebSocket gateway.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>READ-ONLY API TOKEN</Text>
            <TextInput
              style={styles.input}
              value={config.derivToken}
              onChangeText={(text) => setConfig((c) => ({ ...c, derivToken: text }))}
              placeholder="Paste read-only token from Deriv"
              placeholderTextColor={colors.muted}
              secureTextEntry
            />
            <Text style={styles.fieldHint}>
              Generate at app.deriv.com/account/api-token (Read scope only).
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={testingDeriv}
            onPress={() => void testDerivConnection()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressedBtn]}
          >
            <Text style={styles.secondaryBtnText}>
              {testingDeriv ? 'Verifying WebSocket…' : 'Test Deriv Connection'}
            </Text>
          </Pressable>
        </View>

        {/* MT5 VPS Bridge Configuration */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MT5 VPS BRIDGE</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>TARGET MT5 SERVER</Text>
            <TextInput
              style={styles.input}
              value={config.mt5Server}
              onChangeText={(text) => setConfig((c) => ({ ...c, mt5Server: text }))}
              placeholder="DerivSVG-Server-03"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ACCOUNT IDENTIFIER</Text>
            <TextInput
              style={styles.input}
              value={config.mt5Account}
              onChangeText={(text) => setConfig((c) => ({ ...c, mt5Account: text }))}
              placeholder="Account login reference"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VPS BRIDGE HOST</Text>
            <Text style={styles.readOnlyText}>{API_BASE_URL}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={testingBridge}
            onPress={() => void testBridgeConnection()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressedBtn]}
          >
            <Text style={styles.secondaryBtnText}>
              {testingBridge ? 'Pinging VPS…' : 'Test Bridge Ping'}
            </Text>
          </Pressable>
        </View>

        {/* VPS Bridge Security & Auth (Phase 5) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>VPS BRIDGE SECURITY & AUTH</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VPS BRIDGE API KEY</Text>
            <TextInput
              style={styles.input}
              value={config.vpsApiKey}
              onChangeText={(text) => setConfig((c) => ({ ...c, vpsApiKey: text }))}
              placeholder="falcon-vps-key-2026"
              placeholderTextColor={colors.muted}
              secureTextEntry
            />
            <Text style={styles.fieldHint}>Master API key protecting HTTPS/WSS control endpoints.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ENROLLED DEVICE IDENTIFIER</Text>
            <TextInput
              style={styles.input}
              value={config.deviceId}
              onChangeText={(text) => setConfig((c) => ({ ...c, deviceId: text }))}
              placeholder="device-demo-android-01"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.fieldHint}>Unique mobile device binding ID for cryptographic token issue.</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={authenticating}
            onPress={() => void handleAuthenticate()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressedBtn]}
          >
            <Text style={styles.secondaryBtnText}>
              {authenticating ? 'Authenticating…' : 'Authenticate & Issue JWT Token'}
            </Text>
          </Pressable>
        </View>

        {/* Save button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => void saveConfig()}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressedBtn]}
        >
          <Text style={styles.saveBtnText}>Save Configuration</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 16 },

  savedBanner: {
    backgroundColor: '#26180E',
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  savedText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#101010',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
  },
  readOnlyText: {
    color: colors.orange,
    fontSize: 13,
    paddingVertical: 6,
  },
  fieldHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },

  secondaryBtn: {
    minHeight: 48,
    backgroundColor: '#222222',
    borderColor: '#383838',
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  secondaryBtnText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
  },

  saveBtn: {
    minHeight: 52,
    backgroundColor: colors.orange,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
  },
  pressedBtn: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
});

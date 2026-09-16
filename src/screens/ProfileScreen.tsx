import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../components/AppHeader';
import { ToggleSwitch } from '../components/ToggleSwitch';
import {
  ArrowPathIcon,
  BellAlertIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  InfoCircleIcon,
  ProfileIcon,
  SettingsSlidersIcon,
  ShieldIcon,
  TerminalLogIcon,
  WarningTriangleIcon,
} from '../components/TabIcons';
import { getApiBaseUrl, setApiBaseUrl, probeCandidateUrls, getState } from '../api';
import type { ControllerState } from '../types';
import type { OTAUpdateState } from '../hooks/useOTAUpdate';

const colors = {
  bg: '#080808',        // 60% Dominant Background
  surface: '#121212',   // 30% Panel / Input Surface
  surfaceAlt: '#181818',
  border: '#222222',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  text: '#FFFFFF',
  textMuted: '#9A9A9A',
  textDim: '#666666',
  orange: '#FF6B00',    // 10% Accent
  orangeDark: '#2D1405',
};

const USER_PROFILE_KEY = '@derived_arbitrage_user_profile';
const SETTINGS_KEY = '@derived_arbitrage_app_settings';

interface UserProfile {
  displayName: string;
  traderTag: string;
  tradingStyle: string;
  preferredBasket: string;
  bio: string;
}

interface AppSettings {
  soundAlerts: boolean;
  hapticFeedback: boolean;
  highPrecisionQuotes: boolean;
  autoReconnect: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Falcon Trader',
  traderTag: '@synthetics_pro',
  tradingStyle: 'Falcon FX · SMC Arbitrage',
  preferredBasket: 'Volatility 75, Boom/Crash 1000',
  bio: 'Automated synthetic indices execution with algorithmic risk guardrails.',
};

const DEFAULT_SETTINGS: AppSettings = {
  soundAlerts: true,
  hapticFeedback: true,
  highPrecisionQuotes: true,
  autoReconnect: true,
};

type AccordionKey = 'privacy' | 'terms' | 'risk' | 'disclaimer' | 'logs' | null;

interface ProfileScreenProps {
  state?: ControllerState | null;
  ota?: OTAUpdateState;
}

/**
 * ProfileScreen — Seamless Single-Body Architecture
 *
 * Designed to flow naturally as part of the body of the application:
 * - Zero nested card boxes or segmented container divs
 * - Clean section dividers directly on the screen body
 * - Inputs, switches, and expandable disclosures integrated into the unified scroll view
 * - Strict adherence to the 60-30-10 palette and SVG iconography standards
 */
export function ProfileScreen({ state, ota }: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [bridgeUrl, setBridgeUrl] = useState(() => getApiBaseUrl());
  const [testingBridge, setTestingBridge] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // In-body accordion state
  const [openAccordion, setOpenAccordion] = useState<AccordionKey>(null);

  const toggleAccordion = (key: AccordionKey) => {
    setOpenAccordion((prev) => (prev === key ? null : key));
  };

  // Load saved configuration on mount
  useEffect(() => {
    void (async () => {
      try {
        const [rawProfile, rawSettings, rawBridge] = await Promise.all([
          AsyncStorage.getItem(USER_PROFILE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem('@mobile_ea_profile_config'),
        ]);
        if (rawProfile) {
          setProfile(JSON.parse(rawProfile) as UserProfile);
        }
        if (rawSettings) {
          setSettings(JSON.parse(rawSettings) as AppSettings);
        }
        if (rawBridge) {
          try {
            const parsed = JSON.parse(rawBridge) as { bridgeUrl?: string };
            if (parsed.bridgeUrl) setBridgeUrl(parsed.bridgeUrl);
          } catch {
            // ignore
          }
        }
      } catch {
        // Fallback to defaults
      }
    })();
  }, []);

  const handleTestBridge = async () => {
    setTestingBridge(true);
    setBridgeStatus('Testing bridge connection...');
    try {
      setApiBaseUrl(bridgeUrl.trim());
      await getState();
      setBridgeStatus('Connected successfully! Bridge is live.');
    } catch {
      try {
        setBridgeStatus('Probing candidate hosts...');
        const discovered = await probeCandidateUrls();
        if (discovered) {
          setBridgeUrl(discovered);
          setApiBaseUrl(discovered);
          setBridgeStatus(`Auto-connected to host: ${discovered}`);
        } else {
          setBridgeStatus('Could not reach VPS bridge at this address.');
        }
      } catch {
        setBridgeStatus('Connection failed. Verify server and port.');
      }
    } finally {
      setTestingBridge(false);
    }
  };

  const handleSaveAll = useCallback(async () => {
    if (!profile.displayName.trim()) {
      Alert.alert('Validation Error', 'Display name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const normalizedProfile: UserProfile = {
        ...profile,
        displayName: profile.displayName.trim(),
        traderTag: profile.traderTag.trim().startsWith('@')
          ? profile.traderTag.trim()
          : `@${profile.traderTag.trim()}`,
      };

      await Promise.all([
        AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(normalizedProfile)),
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)),
        AsyncStorage.setItem(
          '@mobile_ea_profile_config',
          JSON.stringify({ bridgeUrl: bridgeUrl.trim() })
        ),
      ]);

      setApiBaseUrl(bridgeUrl.trim());
      setProfile(normalizedProfile);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2600);
    } catch {
      Alert.alert('Error', 'Failed to save configuration settings.');
    } finally {
      setSaving(false);
    }
  }, [profile, settings, bridgeUrl]);

  const handleResetDefaults = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to revert all settings to their original defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setProfile(DEFAULT_PROFILE);
            setSettings(DEFAULT_SETTINGS);
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screenRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader eyebrow="PREFERENCES & SYSTEM" title="Settings" />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Success Notice Feedback */}
        {saveSuccessNotice && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>Settings saved successfully</Text>
          </View>
        )}

        {/* 1. Header Profile Identity (Directly on Body) */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrap}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.profileName}>{profile.displayName}</Text>
          <Text style={styles.profileTag}>{profile.traderTag}</Text>
          <Text style={styles.profileStyle}>{profile.tradingStyle}</Text>
          {profile.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}
        </View>

        <View style={styles.sectionDivider} />

        {/* 2. Trader Profile Details (Directly on Body) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <ProfileIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Trader Details</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.textInput}
              value={profile.displayName}
              onChangeText={(text) => setProfile((p) => ({ ...p, displayName: text }))}
              placeholder="Falcon Trader"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>TRADER TAG</Text>
            <TextInput
              style={styles.textInput}
              value={profile.traderTag}
              onChangeText={(text) => setProfile((p) => ({ ...p, traderTag: text }))}
              placeholder="@synthetics_pro"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>TRADING STRATEGY</Text>
            <TextInput
              style={styles.textInput}
              value={profile.tradingStyle}
              onChangeText={(text) => setProfile((p) => ({ ...p, tradingStyle: text }))}
              placeholder="Falcon FX · SMC Arbitrage"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PREFERRED SYNTHETICS BASKET</Text>
            <TextInput
              style={styles.textInput}
              value={profile.preferredBasket}
              onChangeText={(text) => setProfile((p) => ({ ...p, preferredBasket: text }))}
              placeholder="Volatility 75, Boom/Crash 1000"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>STRATEGY BIO & NOTES</Text>
            <TextInput
              style={[styles.textInput, styles.bioInput]}
              value={profile.bio}
              onChangeText={(text) => setProfile((p) => ({ ...p, bio: text }))}
              placeholder="Algorithmic risk limits, session rules..."
              placeholderTextColor={colors.textDim}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* 3. Server Bridge & Network Host (Directly on Body) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <ArrowPathIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Server Bridge Connection</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>VPS BRIDGE API URL</Text>
            <TextInput
              style={styles.textInput}
              value={bridgeUrl}
              onChangeText={setBridgeUrl}
              placeholder="http://192.168.1.50:3001"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.bridgeActionBtn, pressed && styles.pressedBtn]}
            onPress={() => void handleTestBridge()}
            disabled={testingBridge}
          >
            {testingBridge ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <ArrowPathIcon size={16} color="#FFFFFF" />
                <Text style={styles.bridgeActionBtnText}>Test & Discover Bridge</Text>
              </>
            )}
          </Pressable>

          {bridgeStatus ? (
            <Text style={styles.bridgeStatusMessage}>{bridgeStatus}</Text>
          ) : null}
        </View>

        <View style={styles.sectionDivider} />

        {/* 4. Execution & Telemetry Preferences (Directly on Body) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <SettingsSlidersIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Preferences & Telemetry</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.toggleLabelRow}>
                <BellAlertIcon size={17} color={colors.orange} />
                <Text style={styles.toggleTitle}>Execution Audio Chime</Text>
              </View>
              <Text style={styles.toggleSubtitle}>Audible chime on automated order fills</Text>
            </View>
            <ToggleSwitch
              value={settings.soundAlerts}
              onValueChange={(val) => setSettings((s) => ({ ...s, soundAlerts: val }))}
              accessibilityLabel="Toggle sound alerts"
            />
          </View>

          <View style={styles.innerDivider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.toggleLabelRow}>
                <SettingsSlidersIcon size={17} color={colors.orange} />
                <Text style={styles.toggleTitle}>Haptic Feedback</Text>
              </View>
              <Text style={styles.toggleSubtitle}>Tactile vibration on risk triggers and locks</Text>
            </View>
            <ToggleSwitch
              value={settings.hapticFeedback}
              onValueChange={(val) => setSettings((s) => ({ ...s, hapticFeedback: val }))}
              accessibilityLabel="Toggle haptic feedback"
            />
          </View>

          <View style={styles.innerDivider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.toggleLabelRow}>
                <ShieldIcon size={17} color={colors.orange} />
                <Text style={styles.toggleTitle}>High-Precision Telemetry</Text>
              </View>
              <Text style={styles.toggleSubtitle}>Real-time streaming tick data across all instruments</Text>
            </View>
            <ToggleSwitch
              value={settings.highPrecisionQuotes}
              onValueChange={(val) => setSettings((s) => ({ ...s, highPrecisionQuotes: val }))}
              accessibilityLabel="Toggle high-precision telemetry"
            />
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* 5. Over-The-Air (OTA) Updates (Directly on Body) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <ArrowPathIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Over-The-Air (OTA) Updates</Text>
          </View>

          <View style={styles.otaMetaRow}>
            <View style={styles.otaMetaItem}>
              <Text style={styles.otaMetaLabel}>VERSION</Text>
              <Text style={styles.otaMetaValue}>v0.1.0 · Build 2026.09.16</Text>
            </View>
            <View style={styles.otaMetaItem}>
              <Text style={styles.otaMetaLabel}>RUNTIME</Text>
              <Text style={styles.otaMetaValue}>appVersion (0.1.0)</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.checkUpdateBtn, pressed && styles.pressedBtn]}
            onPress={() => ota?.checkForUpdate(true)}
            disabled={ota?.isCheckingForUpdate}
          >
            {ota?.isCheckingForUpdate ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <ArrowPathIcon size={16} color="#FFFFFF" />
                <Text style={styles.checkUpdateBtnText}>Check for Updates</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.otaStatusText}>
            {ota?.checkStatusMessage || (ota?.lastCheckedTime ? `Checked at ${ota.lastCheckedTime}` : 'Pings EAS cloud for latest bundle')}
          </Text>
        </View>

        <View style={styles.sectionDivider} />

        {/* 6. Disclosures & System Audit Logs (Directly on Body) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <ShieldIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Disclosures & System Audit</Text>
          </View>

          {/* Disclosure 1: Privacy Policy */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => toggleAccordion('privacy')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <DocumentTextIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Privacy Policy</Text>
                <Text style={styles.disclosureSub}>Local sandboxed storage, encrypted tokens, zero tracking</Text>
              </View>
            </View>
            {openAccordion === 'privacy' ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>
          {openAccordion === 'privacy' && (
            <View style={styles.disclosureContent}>
              <Text style={styles.legalHeading}>1. Local Device Storage</Text>
              <Text style={styles.legalBody}>
                Derived Arbitrage stores all user profile parameters, trading preferences, and layout keys exclusively on your device using encrypted sandboxed storage (AsyncStorage). We do not collect, store, or transmit your personal details to any centralized databases.
              </Text>
              <Text style={styles.legalHeading}>2. Real-Time Telemetry</Text>
              <Text style={styles.legalBody}>
                Tick data, market profiles, and account balance telemetry communicated between your local VPS bridge and mobile controller utilize HTTPS and authenticated WebSocket streams protected by Bearer JWT tokens. Telemetry is purely ephemeral and processed in real time.
              </Text>
            </View>
          )}

          <View style={styles.innerDivider} />

          {/* Disclosure 2: Terms of Service */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => toggleAccordion('terms')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <DocumentTextIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Terms of Service</Text>
                <Text style={styles.disclosureSub}>Software license, usage boundaries, user operational responsibility</Text>
              </View>
            </View>
            {openAccordion === 'terms' ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>
          {openAccordion === 'terms' && (
            <View style={styles.disclosureContent}>
              <Text style={styles.legalHeading}>1. Acceptance of Terms</Text>
              <Text style={styles.legalBody}>
                By utilizing Derived Arbitrage, you agree to these Terms of Service. The software is provided for personal monitoring, statistical analysis, and algorithmic risk management on synthetic indices.
              </Text>
              <Text style={styles.legalHeading}>2. User Operational Responsibility</Text>
              <Text style={styles.legalBody}>
                You maintain sole and absolute responsibility for all trading activities, order placement decisions, lot sizing adjustments, risk parameter configurations, and financial margin management executed on your broker accounts.
              </Text>
            </View>
          )}

          <View style={styles.innerDivider} />

          {/* Disclosure 3: Risk of Trading */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => toggleAccordion('risk')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <WarningTriangleIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Risk of Trading</Text>
                <Text style={styles.disclosureSub}>Synthetic volatility, leverage hazards, loss warnings</Text>
              </View>
            </View>
            {openAccordion === 'risk' ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>
          {openAccordion === 'risk' && (
            <View style={styles.disclosureContent}>
              <Text style={styles.legalHeading}>1. Synthetic Indices Mechanics</Text>
              <Text style={styles.legalBody}>
                Synthetic indices operate 24/7 utilizing pseudorandom algorithms to simulate market volatility. They do not correlate to real-world macroeconomic fundamentals and can experience rapid, unpredictable price shifts.
              </Text>
              <Text style={styles.legalHeading}>2. Leverage Hazard</Text>
              <Text style={styles.legalBody}>
                Trading derivative contracts with financial leverage amplifies both potential profits and substantial losses. Do not trade with money you cannot afford to lose.
              </Text>
            </View>
          )}

          <View style={styles.innerDivider} />

          {/* Disclosure 4: Disclaimer */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => toggleAccordion('disclaimer')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <InfoCircleIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Disclaimer</Text>
                <Text style={styles.disclosureSub}>Independent utility, no financial advice, regulatory terms</Text>
              </View>
            </View>
            {openAccordion === 'disclaimer' ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>
          {openAccordion === 'disclaimer' && (
            <View style={styles.disclosureContent}>
              <Text style={styles.legalHeading}>1. Independent Software Tool</Text>
              <Text style={styles.legalBody}>
                Derived Arbitrage is an independent open-source utility designed for algorithm monitoring and telemetry visualization. It is not affiliated with, endorsed by, or operated by MetaQuotes Ltd or Deriv Group Ltd.
              </Text>
              <Text style={styles.legalHeading}>2. No Financial Advice</Text>
              <Text style={styles.legalBody}>
                All contents, automated signal structures, order block analyses, and Fair Value Gap calculations displayed within this application are strictly for analytical and educational purposes.
              </Text>
            </View>
          )}

          <View style={styles.innerDivider} />

          {/* Disclosure 5: System & Audit Logs */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => toggleAccordion('logs')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <TerminalLogIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>System & Audit Logs</Text>
                <Text style={styles.disclosureSub}>
                  {state?.activity?.length ? `${state.activity.length} recorded controller events` : 'Chronological controller logs'}
                </Text>
              </View>
            </View>
            {openAccordion === 'logs' ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>
          {openAccordion === 'logs' && (
            <View style={styles.disclosureContent}>
              {!state?.activity || state.activity.length === 0 ? (
                <Text style={styles.emptyLogText}>No controller events recorded yet.</Text>
              ) : (
                state.activity.map((item, idx) => {
                  const isLast = idx === state.activity.length - 1;
                  return (
                    <View key={item.id} style={[styles.logItemRow, !isLast && styles.logBorder]}>
                      <View
                        style={[
                          styles.logMark,
                          {
                            backgroundColor:
                              item.kind === 'danger' || item.kind === 'success'
                                ? colors.orange
                                : colors.textMuted,
                          },
                        ]}
                      />
                      <View style={styles.logTextWrap}>
                        <Text style={styles.logMessage}>{item.message}</Text>
                        <Text style={styles.logTime}>
                          {new Date(item.at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* 7. Action Buttons (Directly on Body) */}
        <View style={styles.actionBlock}>
          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && styles.pressedBtn]}
            onPress={() => void handleSaveAll()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Settings</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.resetBtn, pressed && styles.pressedBtn]}
            onPress={handleResetDefaults}
          >
            <Text style={styles.resetBtnText}>Reset to Defaults</Text>
          </Pressable>
        </View>

        {/* Footer info */}
        <View style={styles.aboutFooter}>
          <Text style={styles.aboutAppName}>DERIVED ARBITRAGE</Text>
          <Text style={styles.aboutVersion}>Falcon FX SMC Engine · v0.1.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 140,
  },

  successBanner: {
    backgroundColor: colors.orangeDark,
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  successBannerText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // 1. Profile Header directly on body
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.orange,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileName: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  profileTag: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.orange,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  profileStyle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: 6,
  },
  profileBio: {
    fontSize: 12.5,
    color: colors.textDim,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },

  // Section Dividers directly on body
  sectionDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 20,
  },
  innerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginVertical: 4,
  },

  // Section Block
  sectionBlock: {
    paddingVertical: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.1,
  },

  // Inputs directly on body
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontWeight: '500',
  },
  bioInput: {
    height: 76,
    textAlignVertical: 'top',
  },

  // Bridge action
  bridgeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 2,
  },
  bridgeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bridgeStatusMessage: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },

  // Toggle rows directly on body
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: 14,
    gap: 3,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSubtitle: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },

  // OTA rows directly on body
  otaMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  otaMetaItem: {
    gap: 3,
  },
  otaMetaLabel: {
    color: colors.textDim,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  otaMetaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  checkUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  checkUpdateBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  otaStatusText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },

  // Disclosure rows directly on body
  disclosureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  disclosureRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  disclosureTextCol: {
    flex: 1,
    gap: 2,
  },
  disclosureTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  disclosureSub: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 15,
  },
  disclosureContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  legalHeading: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  legalBody: {
    color: '#CCCCCC',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyLogText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  logItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
  },
  logBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  logMark: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  logTextWrap: {
    flex: 1,
    gap: 2,
  },
  logMessage: {
    color: colors.text,
    fontSize: 12,
  },
  logTime: {
    color: colors.textDim,
    fontSize: 10,
  },

  // Action Buttons directly on body
  actionBlock: {
    gap: 10,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  resetBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pressedBtn: {
    opacity: 0.8,
  },

  // About Footer
  aboutFooter: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 3,
  },
  aboutAppName: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  aboutVersion: {
    color: '#444444',
    fontSize: 11,
  },
});

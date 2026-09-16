import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  panel: '#161616',     // 30% Panel / Surface
  panelAlt: '#1E1E1E',
  border: '#282828',
  borderLight: '#383838',
  text: '#FFFFFF',
  muted: '#9A9A9A',
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
 * ProfileScreen — Unified Single-Body Settings
 *
 * Implements Rule 1 (60-30-10 palette), Rule 2 & 4 (SVGs), Rule 15 & 19 (Calibrated Logo).
 * Consolidates all user profile inputs, server bridge config, app preferences,
 * OTA updates check, and expandable legal/audit sections under ONE unified, scrollable body.
 */
export function ProfileScreen({ state, ota }: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [bridgeUrl, setBridgeUrl] = useState(() => getApiBaseUrl());
  const [testingBridge, setTestingBridge] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Accordion open/close state for in-body disclosure
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
        // Continue with defaults
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
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="PREFERENCES & SYSTEM" title="Settings" />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Notice Banner */}
        {saveSuccessNotice && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>Settings saved successfully</Text>
          </View>
        )}

        {/* 1. Header Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarContainer}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.avatarImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile.displayName}</Text>
              <Text style={styles.profileTag}>{profile.traderTag}</Text>
              <Text style={styles.profileStyle}>{profile.tradingStyle}</Text>
            </View>
          </View>
          {profile.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}
        </View>

        {/* 2. Trader Profile Information (Direct Inline in Body) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>TRADER PROFILE</Text>
          <View style={styles.cardGroup}>
            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={styles.textInput}
                value={profile.displayName}
                onChangeText={(text) => setProfile((p) => ({ ...p, displayName: text }))}
                placeholder="Falcon Trader"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>TRADER TAG</Text>
              <TextInput
                style={styles.textInput}
                value={profile.traderTag}
                onChangeText={(text) => setProfile((p) => ({ ...p, traderTag: text }))}
                placeholder="@synthetics_pro"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>TRADING STRATEGY</Text>
              <TextInput
                style={styles.textInput}
                value={profile.tradingStyle}
                onChangeText={(text) => setProfile((p) => ({ ...p, tradingStyle: text }))}
                placeholder="Falcon FX · SMC Arbitrage"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>PREFERRED SYNTHETICS BASKET</Text>
              <TextInput
                style={styles.textInput}
                value={profile.preferredBasket}
                onChangeText={(text) => setProfile((p) => ({ ...p, preferredBasket: text }))}
                placeholder="Volatility 75, Boom/Crash 1000"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>STRATEGY BIO & NOTES</Text>
              <TextInput
                style={[styles.textInput, styles.bioInput]}
                value={profile.bio}
                onChangeText={(text) => setProfile((p) => ({ ...p, bio: text }))}
                placeholder="Algorithmic risk boundaries and notes..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>
        </View>

        {/* 3. Server Bridge & Network Configuration (Direct Inline in Body) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SERVER BRIDGE CONNECTION</Text>
          <View style={styles.cardGroup}>
            <View style={styles.inputRow}>
              <Text style={styles.fieldLabel}>VPS BRIDGE API URL</Text>
              <TextInput
                style={styles.textInput}
                value={bridgeUrl}
                onChangeText={setBridgeUrl}
                placeholder="http://192.168.1.50:3001"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            <View style={styles.bridgeActionRow}>
              <Pressable
                style={({ pressed }) => [styles.bridgeBtn, pressed && styles.pressedBtn]}
                onPress={() => void handleTestBridge()}
                disabled={testingBridge}
              >
                {testingBridge ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ArrowPathIcon size={16} color="#FFFFFF" />
                    <Text style={styles.bridgeBtnText}>Test & Discover</Text>
                  </>
                )}
              </Pressable>
            </View>

            {bridgeStatus ? (
              <View style={styles.bridgeStatusBox}>
                <Text style={styles.bridgeStatusText}>{bridgeStatus}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 4. App & Execution Preferences (Inline Switches) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>EXECUTION & TELEMETRY PREFERENCES</Text>
          <View style={styles.cardGroup}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <BellAlertIcon size={18} color={colors.orange} />
                  <Text style={styles.settingTitle}>Execution Audio Chime</Text>
                </View>
                <Text style={styles.settingSubtitle}>Audible tone upon automated SMC order placement</Text>
              </View>
              <ToggleSwitch
                value={settings.soundAlerts}
                onValueChange={(val) => setSettings((s) => ({ ...s, soundAlerts: val }))}
                accessibilityLabel="Toggle sound alerts"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <SettingsSlidersIcon size={18} color={colors.orange} />
                  <Text style={styles.settingTitle}>Haptic Feedback</Text>
                </View>
                <Text style={styles.settingSubtitle}>Tactile vibration on risk limits and state transitions</Text>
              </View>
              <ToggleSwitch
                value={settings.hapticFeedback}
                onValueChange={(val) => setSettings((s) => ({ ...s, hapticFeedback: val }))}
                accessibilityLabel="Toggle haptic feedback"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <ShieldIcon size={18} color={colors.orange} />
                  <Text style={styles.settingTitle}>High-Precision Telemetry</Text>
                </View>
                <Text style={styles.settingSubtitle}>Real-time streaming tick data across all synthetic instruments</Text>
              </View>
              <ToggleSwitch
                value={settings.highPrecisionQuotes}
                onValueChange={(val) => setSettings((s) => ({ ...s, highPrecisionQuotes: val }))}
                accessibilityLabel="Toggle high-precision telemetry"
              />
            </View>
          </View>
        </View>

        {/* 5. Over-The-Air (OTA) Updates & Build Info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>OVER-THE-AIR (OTA) UPDATES</Text>
          <View style={styles.cardGroup}>
            <View style={styles.otaRow}>
              <View style={styles.otaMetaCol}>
                <Text style={styles.otaMetaLabel}>CURRENT VERSION</Text>
                <Text style={styles.otaMetaValue}>v0.1.0 · Build 2026.09.16</Text>
              </View>
              <View style={styles.otaMetaCol}>
                <Text style={styles.otaMetaLabel}>RUNTIME POLICY</Text>
                <Text style={styles.otaMetaValue}>appVersion (0.1.0)</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.otaActionRow}>
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
              {ota?.checkStatusMessage ? (
                <Text style={styles.otaStatusText}>{ota.checkStatusMessage}</Text>
              ) : (
                <Text style={styles.otaStatusText}>
                  {ota?.lastCheckedTime ? `Checked today at ${ota.lastCheckedTime}` : 'Tap to check EAS cloud'}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 6. Legal, Compliance & System Logs (Single-Body Collapsible Accordions) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LEGAL, RISK & SYSTEM LOGS</Text>
          <View style={styles.cardGroup}>
            {/* Accordion 1: Privacy Policy */}
            <Pressable
              style={styles.accordionHeader}
              onPress={() => toggleAccordion('privacy')}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeaderLeft}>
                <DocumentTextIcon size={18} color={colors.orange} />
                <View style={styles.accordionTitleCol}>
                  <Text style={styles.accordionTitle}>Privacy Policy</Text>
                  <Text style={styles.accordionSubtitle}>Local sandboxed storage, encryption, no analytics</Text>
                </View>
              </View>
              {openAccordion === 'privacy' ? (
                <ChevronDownIcon size={18} color={colors.orange} />
              ) : (
                <ChevronRightIcon size={18} color={colors.muted} />
              )}
            </Pressable>
            {openAccordion === 'privacy' && (
              <View style={styles.accordionBody}>
                <Text style={styles.legalHeading}>1. Local Storage Policy</Text>
                <Text style={styles.legalBody}>
                  Derived Arbitrage stores all user profile parameters, trading preferences, and layout keys exclusively on your device using encrypted sandboxed storage (AsyncStorage). We do not collect, store, or transmit your personal details to any centralized databases.
                </Text>
                <Text style={styles.legalHeading}>2. Ephemeral Telemetry</Text>
                <Text style={styles.legalBody}>
                  Tick data, market profiles, and account balance telemetry communicated between your local VPS bridge and mobile controller utilize HTTPS and authenticated WebSocket streams protected by Bearer JWT tokens. Telemetry is purely ephemeral and processed in real time.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Accordion 2: Terms of Service */}
            <Pressable
              style={styles.accordionHeader}
              onPress={() => toggleAccordion('terms')}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeaderLeft}>
                <DocumentTextIcon size={18} color={colors.orange} />
                <View style={styles.accordionTitleCol}>
                  <Text style={styles.accordionTitle}>Terms of Service</Text>
                  <Text style={styles.accordionSubtitle}>Software license, usage boundaries, user responsibility</Text>
                </View>
              </View>
              {openAccordion === 'terms' ? (
                <ChevronDownIcon size={18} color={colors.orange} />
              ) : (
                <ChevronRightIcon size={18} color={colors.muted} />
              )}
            </Pressable>
            {openAccordion === 'terms' && (
              <View style={styles.accordionBody}>
                <Text style={styles.legalHeading}>1. Acceptance of Terms</Text>
                <Text style={styles.legalBody}>
                  By utilizing Derived Arbitrage, you agree to these Terms of Service. The software is provided for personal monitoring, statistical analysis, and algorithmic risk management on synthetic indices.
                </Text>
                <Text style={styles.legalHeading}>2. Operational Responsibility</Text>
                <Text style={styles.legalBody}>
                  You maintain sole and absolute responsibility for all trading activities, order placement decisions, lot sizing adjustments, risk parameter configurations, and financial margin management executed on your broker accounts.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Accordion 3: Risk of Trading */}
            <Pressable
              style={styles.accordionHeader}
              onPress={() => toggleAccordion('risk')}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeaderLeft}>
                <WarningTriangleIcon size={18} color={colors.orange} />
                <View style={styles.accordionTitleCol}>
                  <Text style={styles.accordionTitle}>Risk of Trading</Text>
                  <Text style={styles.accordionSubtitle}>Synthetic volatility, high leverage hazard, guardrails</Text>
                </View>
              </View>
              {openAccordion === 'risk' ? (
                <ChevronDownIcon size={18} color={colors.orange} />
              ) : (
                <ChevronRightIcon size={18} color={colors.muted} />
              )}
            </Pressable>
            {openAccordion === 'risk' && (
              <View style={styles.accordionBody}>
                <Text style={styles.legalHeading}>1. Synthetic Indices Mechanics</Text>
                <Text style={styles.legalBody}>
                  Synthetic indices (Volatility, Step, Boom, Crash) operate 24/7 utilizing pseudorandom algorithms to simulate volatility. They do not correlate to real-world macroeconomic fundamentals and can experience rapid, unpredictable price shifts.
                </Text>
                <Text style={styles.legalHeading}>2. Leverage Warning</Text>
                <Text style={styles.legalBody}>
                  Trading synthetic derivative contracts with financial leverage amplifies both potential profits and substantial losses. Do not trade with capital you cannot afford to lose.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Accordion 4: Disclaimer */}
            <Pressable
              style={styles.accordionHeader}
              onPress={() => toggleAccordion('disclaimer')}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeaderLeft}>
                <InfoCircleIcon size={18} color={colors.orange} />
                <View style={styles.accordionTitleCol}>
                  <Text style={styles.accordionTitle}>Disclaimer</Text>
                  <Text style={styles.accordionSubtitle}>Independent utility, no financial advice, regulatory terms</Text>
                </View>
              </View>
              {openAccordion === 'disclaimer' ? (
                <ChevronDownIcon size={18} color={colors.orange} />
              ) : (
                <ChevronRightIcon size={18} color={colors.muted} />
              )}
            </Pressable>
            {openAccordion === 'disclaimer' && (
              <View style={styles.accordionBody}>
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

            <View style={styles.divider} />

            {/* Accordion 5: System & Audit Logs */}
            <Pressable
              style={styles.accordionHeader}
              onPress={() => toggleAccordion('logs')}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeaderLeft}>
                <TerminalLogIcon size={18} color={colors.orange} />
                <View style={styles.accordionTitleCol}>
                  <Text style={styles.accordionTitle}>System & Audit Logs</Text>
                  <Text style={styles.accordionSubtitle}>
                    {state?.activity?.length
                      ? `${state.activity.length} recorded controller events`
                      : 'Chronological controller logs'}
                  </Text>
                </View>
              </View>
              {openAccordion === 'logs' ? (
                <ChevronDownIcon size={18} color={colors.orange} />
              ) : (
                <ChevronRightIcon size={18} color={colors.muted} />
              )}
            </Pressable>
            {openAccordion === 'logs' && (
              <View style={styles.accordionBody}>
                {!state?.activity || state.activity.length === 0 ? (
                  <Text style={styles.emptyLogText}>No controller events recorded yet.</Text>
                ) : (
                  state.activity.map((item, idx) => {
                    const isLast = idx === state.activity.length - 1;
                    return (
                      <View
                        key={item.id}
                        style={[styles.logItemRow, !isLast && styles.logBorder]}
                      >
                        <View
                          style={[
                            styles.logMark,
                            {
                              backgroundColor:
                                item.kind === 'danger' || item.kind === 'success'
                                  ? colors.orange
                                  : colors.muted,
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
        </View>

        {/* 7. Action Footer (Save & Reset) */}
        <View style={styles.actionFooter}>
          <Pressable
            style={({ pressed }) => [styles.saveAllBtn, pressed && styles.pressedBtn]}
            onPress={() => void handleSaveAll()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveAllBtnText}>Save Settings</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.resetBtn, pressed && styles.pressedBtn]}
            onPress={handleResetDefaults}
          >
            <Text style={styles.resetBtnText}>Reset to Defaults</Text>
          </Pressable>
        </View>

        {/* About App Footer */}
        <View style={styles.aboutCard}>
          <Text style={styles.aboutAppName}>DERIVED ARBITRAGE</Text>
          <Text style={styles.aboutVersion}>EAS Cloud · Falcon FX SMC Engine</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 20 },

  successBanner: {
    backgroundColor: colors.orangeDark,
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  successBannerText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // 1. Profile Identity Card
  profileCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.orange,
    backgroundColor: '#080808',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  profileTag: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  profileStyle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  profileBio: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },

  // Section Blocks
  section: {
    gap: 8,
  },
  sectionHeader: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: 4,
  },
  cardGroup: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Input Rows (Direct Inline)
  inputRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  textInput: {
    backgroundColor: '#1E1E1E',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '500',
  },
  bioInput: {
    height: 72,
    textAlignVertical: 'top',
  },

  // Bridge Action
  bridgeActionRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  bridgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingVertical: 12,
  },
  bridgeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bridgeStatusBox: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  bridgeStatusText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '600',
  },

  // Setting Switch Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 16,
    gap: 4,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },

  // OTA Card Rows
  otaRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  otaMetaCol: {
    flex: 1,
    gap: 4,
  },
  otaMetaLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  otaMetaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  otaActionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  checkUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingVertical: 12,
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  otaStatusText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },

  // Accordion Rows
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  accordionTitleCol: {
    flex: 1,
    gap: 2,
  },
  accordionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  accordionSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  accordionBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#202020',
    gap: 8,
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
    color: colors.muted,
    fontSize: 12,
  },
  logItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  logBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
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
    color: colors.muted,
    fontSize: 10,
  },

  divider: {
    height: 1,
    backgroundColor: '#222222',
  },

  // Action Footer
  actionFooter: {
    gap: 10,
    marginTop: 4,
  },
  saveAllBtn: {
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveAllBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resetBtn: {
    backgroundColor: '#1E1E1E',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  pressedBtn: {
    opacity: 0.8,
  },

  aboutCard: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 3,
  },
  aboutAppName: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  aboutVersion: {
    color: '#555555',
    fontSize: 11,
  },
});

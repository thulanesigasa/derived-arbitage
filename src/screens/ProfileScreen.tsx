import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
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
  BellAlertIcon,
  ChevronRightIcon,
  CrossIcon,
  DocumentTextIcon,
  EditPencilIcon,
  InfoCircleIcon,
  LockIcon,
  SettingsSlidersIcon,
  ShieldIcon,
  TerminalLogIcon,
  WarningTriangleIcon,
} from '../components/TabIcons';
import type { ControllerState } from '../types';

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

type ActiveModal = 'edit-profile' | 'privacy' | 'terms' | 'risk' | 'disclaimer' | 'logs' | null;

interface ProfileScreenProps {
  state?: ControllerState | null;
}

export function ProfileScreen({ state }: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Edit profile form draft state
  const [draftName, setDraftName] = useState(DEFAULT_PROFILE.displayName);
  const [draftTag, setDraftTag] = useState(DEFAULT_PROFILE.traderTag);
  const [draftStyle, setDraftStyle] = useState(DEFAULT_PROFILE.tradingStyle);
  const [draftBasket, setDraftBasket] = useState(DEFAULT_PROFILE.preferredBasket);
  const [draftBio, setDraftBio] = useState(DEFAULT_PROFILE.bio);

  // Load saved profile & settings on mount
  useEffect(() => {
    void (async () => {
      try {
        const [rawProfile, rawSettings] = await Promise.all([
          AsyncStorage.getItem(USER_PROFILE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (rawProfile) {
          const parsed = JSON.parse(rawProfile) as UserProfile;
          setProfile(parsed);
          setDraftName(parsed.displayName);
          setDraftTag(parsed.traderTag);
          setDraftStyle(parsed.tradingStyle);
          setDraftBasket(parsed.preferredBasket);
          setDraftBio(parsed.bio);
        }
        if (rawSettings) {
          setSettings(JSON.parse(rawSettings) as AppSettings);
        }
      } catch {
        // Fallback to defaults
      }
    })();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!draftName.trim()) {
      Alert.alert('Validation Error', 'Display name cannot be empty.');
      return;
    }
    const updated: UserProfile = {
      displayName: draftName.trim(),
      traderTag: draftTag.trim().startsWith('@') ? draftTag.trim() : `@${draftTag.trim()}`,
      tradingStyle: draftStyle.trim() || 'SMC Arbitrage',
      preferredBasket: draftBasket.trim() || 'Synthetic Basket',
      bio: draftBio.trim(),
    };
    try {
      await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(updated));
      setProfile(updated);
      setActiveModal(null);
    } catch {
      Alert.alert('Error', 'Could not save profile changes.');
    }
  }, [draftName, draftTag, draftStyle, draftBasket, draftBio]);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
      const updated = { ...settings, [key]: val };
      setSettings(updated);
      try {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      } catch {
        // Continue in memory
      }
    },
    [settings]
  );

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="USER & SETTINGS" title="Profile" />

      <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarContainer}>
              <Image
                source={require('../../assets/robot_hero.jpg')}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile.displayName}</Text>
              <Text style={styles.profileTag}>{profile.traderTag}</Text>
              <Text style={styles.profileStyle}>{profile.tradingStyle}</Text>
            </View>
          </View>

          {profile.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit Profile"
            onPress={() => {
              setDraftName(profile.displayName);
              setDraftTag(profile.traderTag);
              setDraftStyle(profile.tradingStyle);
              setDraftBasket(profile.preferredBasket);
              setDraftBio(profile.bio);
              setActiveModal('edit-profile');
            }}
            style={({ pressed }) => [styles.editProfileBtn, pressed && styles.pressedBtn]}
          >
            <EditPencilIcon size={16} color={colors.orange} />
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* 2. Preferences & App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APP PREFERENCES</Text>
          <View style={styles.cardGroup}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <BellAlertIcon size={18} color={colors.orange} />
                  <Text style={styles.settingTitle}>Execution Alerts</Text>
                </View>
                <Text style={styles.settingSubtitle}>Audio chime on automated SMC order execution</Text>
              </View>
              <ToggleSwitch
                value={settings.soundAlerts}
                onValueChange={(val) => void updateSetting('soundAlerts', val)}
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
                <Text style={styles.settingSubtitle}>Vibration on risk thresholds and state transitions</Text>
              </View>
              <ToggleSwitch
                value={settings.hapticFeedback}
                onValueChange={(val) => void updateSetting('hapticFeedback', val)}
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
                <Text style={styles.settingSubtitle}>Real-time streaming ticks for all 10 synthetic instruments</Text>
              </View>
              <ToggleSwitch
                value={settings.highPrecisionQuotes}
                onValueChange={(val) => void updateSetting('highPrecisionQuotes', val)}
                accessibilityLabel="Toggle telemetry stream"
              />
            </View>
          </View>
        </View>

        {/* 3. Legal & Compliance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LEGAL & COMPLIANCE</Text>
          <View style={styles.cardGroup}>
            {/* Privacy Policy Row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Privacy Policy"
              onPress={() => setActiveModal('privacy')}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressedRow]}
            >
              <View style={styles.navRowLeft}>
                <DocumentTextIcon size={18} color={colors.orange} />
                <View style={styles.navTextCol}>
                  <Text style={styles.navRowTitle}>Privacy Policy</Text>
                  <Text style={styles.navRowSubtitle}>Local storage, data security, and telemetry handling</Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>

            <View style={styles.divider} />

            {/* Terms of Service Row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Terms of Service"
              onPress={() => setActiveModal('terms')}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressedRow]}
            >
              <View style={styles.navRowLeft}>
                <DocumentTextIcon size={18} color={colors.orange} />
                <View style={styles.navTextCol}>
                  <Text style={styles.navRowTitle}>Terms of Service</Text>
                  <Text style={styles.navRowSubtitle}>Software license, usage boundaries, and user agreement</Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>

            <View style={styles.divider} />

            {/* Risk of Trading Row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Risk of Trading"
              onPress={() => setActiveModal('risk')}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressedRow]}
            >
              <View style={styles.navRowLeft}>
                <WarningTriangleIcon size={18} color={colors.orange} />
                <View style={styles.navTextCol}>
                  <Text style={styles.navRowTitle}>Risk of Trading</Text>
                  <Text style={styles.navRowSubtitle}>Synthetic indices mechanics, volatility, and leverage warning</Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>

            <View style={styles.divider} />

            {/* Disclaimer Section Row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disclaimer"
              onPress={() => setActiveModal('disclaimer')}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressedRow]}
            >
              <View style={styles.navRowLeft}>
                <InfoCircleIcon size={18} color={colors.orange} />
                <View style={styles.navTextCol}>
                  <Text style={styles.navRowTitle}>Disclaimer</Text>
                  <Text style={styles.navRowSubtitle}>Independent utility, no financial advice, regulatory terms</Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* 4. System & Audit Logs Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SYSTEM & AUDIT LOGS</Text>
          <View style={styles.cardGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="System & Audit Logs"
              onPress={() => setActiveModal('logs')}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressedRow]}
            >
              <View style={styles.navRowLeft}>
                <TerminalLogIcon size={18} color={colors.orange} />
                <View style={styles.navTextCol}>
                  <Text style={styles.navRowTitle}>System & Audit Logs</Text>
                  <Text style={styles.navRowSubtitle}>
                    {state?.activity?.length ? `${state.activity.length} recorded events` : 'Chronological controller logs'}
                  </Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* 5. About & Version Info */}
        <View style={styles.aboutCard}>
          <Text style={styles.aboutAppName}>Derived Arbitrage</Text>
          <Text style={styles.aboutVersion}>Version 0.1.0 · Build 2026.09.14</Text>
          <Text style={styles.aboutEngine}>Falcon FX SMC Engine · MetaTrader 5 MQL5</Text>
        </View>
      </ScrollView>

      {/* ─── MODAL 1: Edit Profile ─── */}
      <Modal visible={activeModal === 'edit-profile'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close modal"
                onPress={() => setActiveModal(null)}
                style={styles.closeBtn}
              >
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                <TextInput
                  style={styles.input}
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="e.g. Falcon Trader"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>TRADER TAG</Text>
                <TextInput
                  style={styles.input}
                  value={draftTag}
                  onChangeText={setDraftTag}
                  placeholder="e.g. @synthetics_pro"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>TRADING STRATEGY</Text>
                <TextInput
                  style={styles.input}
                  value={draftStyle}
                  onChangeText={setDraftStyle}
                  placeholder="e.g. Falcon FX · SMC Arbitrage"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>FAVORITE SYNTHETIC BASKET</Text>
                <TextInput
                  style={styles.input}
                  value={draftBasket}
                  onChangeText={setDraftBasket}
                  placeholder="e.g. Volatility 75, Boom 1000"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>TRADER BIO</Text>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  value={draftBio}
                  onChangeText={setDraftBio}
                  placeholder="Brief trading overview or notes"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Profile Changes"
                onPress={() => void handleSaveProfile()}
                style={({ pressed }) => [styles.saveActionBtn, pressed && styles.pressedBtn]}
              >
                <Text style={styles.saveActionBtnText}>Save Profile</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 2: Privacy Policy ─── */}
      <Modal visible={activeModal === 'privacy'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <Pressable onPress={() => setActiveModal(null)} style={styles.closeBtn}>
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={styles.legalSectionTitle}>1. Local Storage Policy</Text>
              <Text style={styles.legalBodyText}>
                Derived Arbitrage stores all user profile information, trading preferences, and layout settings exclusively on your local device using encrypted sandboxed storage (AsyncStorage). We do not collect, store, or sell your personal details to any central remote databases.
              </Text>

              <Text style={styles.legalSectionTitle}>2. Security & Credentials</Text>
              <Text style={styles.legalBodyText}>
                The application operates as an analytical and execution management interface. Your MetaTrader 5 live account passwords are never accessed, saved, or transmitted by the mobile interface.
              </Text>

              <Text style={styles.legalSectionTitle}>3. Real-Time Telemetry</Text>
              <Text style={styles.legalBodyText}>
                Tick data, market profiles, and account balance telemetry communicated between your local VPS bridge and mobile controller utilize HTTPS and authenticated WebSocket streams protected by Bearer JWT tokens. Telemetry is purely ephemeral and processed in real time.
              </Text>

              <Text style={styles.legalSectionTitle}>4. No Third-Party Tracking</Text>
              <Text style={styles.legalBodyText}>
                Derived Arbitrage contains strictly zero third-party advertising SDKs, tracking beacons, analytics telemetry frameworks, or external user profiling cookies.
              </Text>

              <Pressable onPress={() => setActiveModal(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>Understood</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 3: Terms of Service ─── */}
      <Modal visible={activeModal === 'terms'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Terms of Service</Text>
              <Pressable onPress={() => setActiveModal(null)} style={styles.closeBtn}>
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={styles.legalSectionTitle}>1. Acceptance of Terms</Text>
              <Text style={styles.legalBodyText}>
                By accessing or utilizing the Derived Arbitrage application, you agree to be bound by these Terms of Service. If you do not agree with any provision, do not deploy or operate the software.
              </Text>

              <Text style={styles.legalSectionTitle}>2. License & Authorized Use</Text>
              <Text style={styles.legalBodyText}>
                The software is provided for personal monitoring, statistical analysis, and algorithmic risk management on synthetic indices. You agree not to reverse-engineer, decompile, or exploit the software for fraudulent or malicious purposes.
              </Text>

              <Text style={styles.legalSectionTitle}>3. User Operational Responsibility</Text>
              <Text style={styles.legalBodyText}>
                You maintain sole and absolute responsibility for all trading activities, order placement decisions, lot sizing adjustments, risk parameter configurations, and financial margin management executed on your broker accounts.
              </Text>

              <Text style={styles.legalSectionTitle}>4. Network Availability & Latency</Text>
              <Text style={styles.legalBodyText}>
                Automated order transmission relies upon third-party network providers, local VPS stability, and MetaTrader 5 execution servers. Derived Arbitrage makes no guarantee against network latency, packet loss, or execution slippage caused by internet drops.
              </Text>

              <Pressable onPress={() => setActiveModal(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>Accept & Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 4: Risk of Trading ─── */}
      <Modal visible={activeModal === 'risk'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Risk of Trading</Text>
              <Pressable onPress={() => setActiveModal(null)} style={styles.closeBtn}>
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={styles.legalSectionTitle}>1. Synthetic Indices Mechanics</Text>
              <Text style={styles.legalBodyText}>
                Synthetic indices (including Volatility 10/50/75/100, Step, Boom, and Crash) operate 24 hours a day, 7 days a week, utilizing pseudorandom algorithms to simulate market volatility. They do not correlate to real-world macroeconomic fundamentals and can experience rapid, unpredictable price shifts.
              </Text>

              <Text style={styles.legalSectionTitle}>2. High Leverage Hazard</Text>
              <Text style={styles.legalBodyText}>
                Trading derivative synthetic contracts with financial leverage amplifies both potential profits and substantial losses. A minor adverse price movement can lead to the rapid liquidation of your entire trading capital.
              </Text>

              <Text style={styles.legalSectionTitle}>3. Algorithmic Guardrails</Text>
              <Text style={styles.legalBodyText}>
                While the FalconEA engine incorporates strict invariants ($15 equity floor, $0.40 daily loss lock, and maximum position caps), extreme market spikes or broker network delays can cause execution slippage beyond specified stop levels.
              </Text>

              <Text style={styles.legalSectionTitle}>4. Total Loss Warning</Text>
              <Text style={styles.legalBodyText}>
                Do not trade with money you cannot afford to lose. If you do not fully understand the risks associated with synthetic volatility and leveraged derivative trading, you should consult an independent financial advisor.
              </Text>

              <Pressable onPress={() => setActiveModal(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>I Acknowledge the Risks</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 5: Disclaimer Section ─── */}
      <Modal visible={activeModal === 'disclaimer'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disclaimer</Text>
              <Pressable onPress={() => setActiveModal(null)} style={styles.closeBtn}>
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={styles.legalSectionTitle}>1. Independent Software Tool</Text>
              <Text style={styles.legalBodyText}>
                Derived Arbitrage is an independent open-source client utility designed for algorithm monitoring and telemetry visualization. It is not affiliated with, sponsored by, endorsed by, or operated by MetaQuotes Ltd or Deriv Group Ltd.
              </Text>

              <Text style={styles.legalSectionTitle}>2. No Financial Advice</Text>
              <Text style={styles.legalBodyText}>
                All contents, automated signal structures, order block analyses, and Fair Value Gap calculations displayed within this application are strictly for analytical, informational, and educational purposes. Nothing herein constitutes financial, investment, legal, or tax advice.
              </Text>

              <Text style={styles.legalSectionTitle}>3. Hypothetical & Backtested Results</Text>
              <Text style={styles.legalBodyText}>
                Past performance, backtest simulations, and historical statistical models do not represent a guarantee of future operational performance. Real-time market execution involves latency, spread variability, and liquidity nuances.
              </Text>

              <Text style={styles.legalSectionTitle}>4. Regulatory Compliance</Text>
              <Text style={styles.legalBodyText}>
                It is the user's sole responsibility to ensure compliance with all applicable financial regulations, laws, and broker terms of service in their respective jurisdiction.
              </Text>

              <Pressable onPress={() => setActiveModal(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>Close Disclaimer</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 6: System & Audit Logs ─── */}
      <Modal visible={activeModal === 'logs'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCol}>
                <Text style={styles.modalTitle}>System & Audit Logs</Text>
                <Text style={styles.modalSub}>
                  {state?.activity?.length ? `${state.activity.length} events recorded` : 'Controller event stream'}
                </Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)} style={styles.closeBtn}>
                <CrossIcon size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {!state?.activity || state.activity.length === 0 ? (
                <View style={styles.emptyLogBox}>
                  <TerminalLogIcon size={32} color={colors.muted} />
                  <Text style={styles.emptyLogTitle}>No logged events</Text>
                  <Text style={styles.emptyLogSub}>
                    Robot actions and risk engine state changes will appear here in real time.
                  </Text>
                </View>
              ) : (
                state.activity.map((item, idx) => {
                  const isLast = idx === state.activity.length - 1;
                  const markColor =
                    item.kind === 'danger' || item.kind === 'success' ? colors.orange : colors.muted;

                  return (
                    <View key={item.id} style={[styles.logItemRow, !isLast && styles.logBorder]}>
                      <View style={[styles.logMark, { backgroundColor: markColor }]} />
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

              <Pressable onPress={() => setActiveModal(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>Close Logs</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 136, gap: 24 },

  // ─── Profile Identity Card ───
  profileCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 16,
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
  editProfileBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E1E1E',
    borderColor: '#303030',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  editProfileBtnText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Section Blocks ───
  section: {
    gap: 10,
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

  // ─── Setting Switch Row ───
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

  // ─── Navigation Row ───
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  navTextCol: {
    flex: 1,
    gap: 3,
  },
  navRowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  navRowSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },

  divider: {
    height: 1,
    backgroundColor: '#222222',
    marginLeft: 46,
  },

  // ─── About Card ───
  aboutCard: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  aboutAppName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  aboutVersion: {
    color: colors.muted,
    fontSize: 12,
  },
  aboutEngine: {
    color: '#666666',
    fontSize: 11,
  },

  // ─── Modal Elements ───
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '85%',
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  modalHeaderCol: {
    flex: 1,
    gap: 2,
  },
  modalSub: {
    color: colors.muted,
    fontSize: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },

  // Form inputs
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#181818',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveActionBtn: {
    minHeight: 50,
    backgroundColor: colors.orange,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveActionBtnText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
  },

  // Legal Text
  legalSectionTitle: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 0.3,
  },
  legalBodyText: {
    color: '#CCCCCC',
    fontSize: 13,
    lineHeight: 20,
  },
  dismissBtn: {
    minHeight: 48,
    backgroundColor: '#202020',
    borderColor: '#333333',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  dismissBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  pressedBtn: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pressedRow: {
    backgroundColor: '#1C1C1C',
  },

  // ─── Log Item Elements ───
  logItemRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  logBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#202020',
  },
  logMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  logTextWrap: {
    flex: 1,
    gap: 4,
  },
  logMessage: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  logTime: {
    color: colors.muted,
    fontSize: 11,
  },
  emptyLogBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  emptyLogTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyLogSub: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});

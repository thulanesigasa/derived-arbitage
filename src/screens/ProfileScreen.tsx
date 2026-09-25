import { useCallback, useEffect, useRef, useState } from 'react';
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
  BellAlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  InfoCircleIcon,
  LockClosedIcon,
  ProfileIcon,
  SettingsSlidersIcon,
  ShieldIcon,
  TerminalLogIcon,
  WarningTriangleIcon,
} from '../components/TabIcons';
import { ALL_SYMBOLS, type ControllerState, type SymbolName } from '../types';

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

const USER_PROFILE_KEY = '@mobile_ea_user_profile';
const SETTINGS_KEY = '@mobile_ea_app_settings';

interface UserProfile {
  displayName: string;
  traderTag: string;
  tradingStyle: string;
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
  tradingStyle: 'Falcon FX · SMC Liquidity Matrix',
};

const DEFAULT_SETTINGS: AppSettings = {
  soundAlerts: true,
  hapticFeedback: true,
  highPrecisionQuotes: true,
  autoReconnect: true,
};

// Preset basket definitions for quick selection
const BASKET_PRESETS: Array<{
  label: string;
  symbols: SymbolName[];
}> = [
  {
    label: 'All (10)',
    symbols: [...ALL_SYMBOLS],
  },
  {
    label: 'High Volatility',
    symbols: ['Volatility 75 Index', 'Volatility 100 Index', 'Volatility 100 (1s) Index'],
  },
  {
    label: 'Boom & Crash',
    symbols: ['Boom 500 Index', 'Boom 1000 Index', 'Crash 500 Index', 'Crash 100 Index'],
  },
  {
    label: 'Step & Micro',
    symbols: ['Step Index', 'Volatility 50 Index', 'Volatility 10 Index'],
  },
  {
    label: 'Clear (0)',
    symbols: [],
  },
];

interface ProfileScreenProps {
  state?: ControllerState | null;
  onNavigateLegal: (section: 'privacy' | 'terms' | 'risk' | 'disclaimer') => void;
  onUpdateSymbols?: (symbols: SymbolName[]) => Promise<void>;
  scrollToBasketTrigger?: number;
}

export function ProfileScreen({
  state,
  onNavigateLegal,
  onUpdateSymbols,
  scrollToBasketTrigger,
}: ProfileScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const basketLayoutY = useRef<number>(0);

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Dropdown state for Preferred Synthetics Basket
  const [basketDropdownOpen, setBasketDropdownOpen] = useState(false);
  const [isBasketHighlighted, setIsBasketHighlighted] = useState(false);
  const [updatingSymbols, setUpdatingSymbols] = useState(false);

  // System logs accordion state
  const [logsOpen, setLogsOpen] = useState(false);

  // Watch for external scroll-to-basket trigger from Zero-Instrument Modal
  useEffect(() => {
    if (scrollToBasketTrigger && scrollToBasketTrigger > 0) {
      setBasketDropdownOpen(true);
      setIsBasketHighlighted(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, basketLayoutY.current - 20),
          animated: true,
        });
      }, 150);

      const timer = setTimeout(() => {
        setIsBasketHighlighted(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [scrollToBasketTrigger]);

  // Load saved configuration on mount
  useEffect(() => {
    void (async () => {
      try {
        const [rawProfile, rawSettings] = await Promise.all([
          AsyncStorage.getItem(USER_PROFILE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (rawProfile) {
          setProfile(JSON.parse(rawProfile) as UserProfile);
        }
        if (rawSettings) {
          setSettings(JSON.parse(rawSettings) as AppSettings);
        }
      } catch {
        // Fallback to defaults
      }
    })();
  }, []);

  const handleToggleSymbol = async (symbol: SymbolName) => {
    if (!onUpdateSymbols || updatingSymbols) return;
    const currentList = state?.selectedSymbols ?? [];
    const isSelected = currentList.includes(symbol);
    const nextList = isSelected
      ? currentList.filter((s) => s !== symbol)
      : [...currentList, symbol];

    setUpdatingSymbols(true);
    try {
      await onUpdateSymbols(nextList);
    } catch {
      // Error handled by app
    } finally {
      setUpdatingSymbols(false);
    }
  };

  const handleApplyPreset = async (presetSymbols: SymbolName[]) => {
    if (!onUpdateSymbols || updatingSymbols) return;
    setUpdatingSymbols(true);
    try {
      await onUpdateSymbols(presetSymbols);
    } catch {
      // Error handled by app
    } finally {
      setUpdatingSymbols(false);
    }
  };

  const handleSaveAll = useCallback(async () => {
    if (!profile.displayName.trim()) {
      Alert.alert('Validation Error', 'Display name cannot be empty.');
      return;
    }
    if (!profile.traderTag.trim()) {
      Alert.alert('Validation Error', 'Trader tag cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile)),
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)),
      ]);

      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    } catch {
      Alert.alert('Save Failed', 'Could not persist settings to storage.');
    } finally {
      setSaving(false);
    }
  }, [profile, settings]);

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

  const activeSymbols = state?.selectedSymbols ?? [];
  const selectedCount = activeSymbols.length;

  return (
    <KeyboardAvoidingView
      style={styles.screenRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader eyebrow="PREFERENCES & SYSTEM" title="Settings" />

      <ScrollView
        ref={scrollViewRef}
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
          <Text style={styles.profileStyle}>Falcon FX · SMC Liquidity Matrix</Text>
        </View>

        <View style={styles.sectionDivider} />

        {/* 2. Trader Profile Details (Edits Only Display Name & Tag) */}
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

          {/* Locked Read-Only Strategy */}
          <View style={styles.inputGroup}>
            <View style={styles.labelWithLockRow}>
              <Text style={styles.inputLabel}>TRADING STRATEGY (LOCKED)</Text>
              <LockClosedIcon size={12} color={colors.orange} />
            </View>
            <View style={styles.readOnlyBox}>
              <Text style={styles.readOnlyTitle}>Falcon FX · SMC Liquidity Matrix</Text>
              <Text style={styles.readOnlySub}>
                Institutional Smart Money Algorithm · Fixed Strategy Engine
              </Text>
            </View>
          </View>

          {/* Preferred Synthetics Basket (Dropdown Menu Box) */}
          <View
            style={[styles.inputGroup, isBasketHighlighted && styles.basketHighlightedContainer]}
            onLayout={(e) => {
              basketLayoutY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.inputLabel}>PREFERRED SYNTHETICS BASKET</Text>

            {/* Dropdown Header Trigger Box */}
            <Pressable
              style={[
                styles.dropdownTriggerBox,
                basketDropdownOpen && styles.dropdownTriggerBoxOpen,
                selectedCount === 0 && styles.dropdownTriggerBoxWarning,
              ]}
              onPress={() => setBasketDropdownOpen((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Select Preferred Synthetics Basket"
            >
              <View style={styles.dropdownTriggerLeft}>
                <Text
                  style={[
                    styles.dropdownValueText,
                    selectedCount === 0 && styles.dropdownValueTextWarning,
                  ]}
                  numberOfLines={1}
                >
                  {selectedCount === 0
                    ? '0 Selected · Blocked from Placing Trades'
                    : selectedCount === ALL_SYMBOLS.length
                    ? 'All 10 Synthetic Indices Selected'
                    : `${selectedCount} Indices Selected`}
                </Text>
                <Text style={styles.dropdownHintText}>
                  {selectedCount === 0
                    ? 'Tap to select instruments for the EA'
                    : activeSymbols.map((s) => s.replace(' Index', '')).join(', ')}
                </Text>
              </View>

              <View style={styles.dropdownChevronWrap}>
                {updatingSymbols ? (
                  <ActivityIndicator size="small" color={colors.orange} />
                ) : basketDropdownOpen ? (
                  <ChevronUpIcon size={18} color={colors.orange} />
                ) : (
                  <ChevronDownIcon size={18} color={colors.textMuted} />
                )}
              </View>
            </Pressable>

            {/* Dropdown Menu Content Body */}
            {basketDropdownOpen && (
              <View style={styles.dropdownMenuBody}>
                {/* Presets Row */}
                <Text style={styles.dropdownPresetsHeader}>QUICK BASKET PRESETS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetsRowContent}
                >
                  {BASKET_PRESETS.map((preset) => {
                    const isPresetMatch =
                      preset.symbols.length === selectedCount &&
                      preset.symbols.every((sym) => activeSymbols.includes(sym));
                    return (
                      <Pressable
                        key={preset.label}
                        style={[
                          styles.presetChip,
                          isPresetMatch && styles.presetChipActive,
                        ]}
                        onPress={() => void handleApplyPreset(preset.symbols)}
                        disabled={updatingSymbols}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isPresetMatch && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.dropdownInnerDivider} />

                {/* Individual Symbols Toggle List */}
                <Text style={styles.dropdownPresetsHeader}>SYNTHETIC INSTRUMENTS (10)</Text>
                <View style={styles.symbolListContainer}>
                  {ALL_SYMBOLS.map((sym, idx) => {
                    const isChecked = activeSymbols.includes(sym);
                    const isLast = idx === ALL_SYMBOLS.length - 1;
                    return (
                      <Pressable
                        key={sym}
                        style={[styles.symbolRow, !isLast && styles.symbolRowBorder]}
                        onPress={() => void handleToggleSymbol(sym)}
                        disabled={updatingSymbols}
                      >
                        <View style={styles.symbolTextCol}>
                          <Text
                            style={[
                              styles.symbolNameText,
                              isChecked && styles.symbolNameTextActive,
                            ]}
                          >
                            {sym}
                          </Text>
                          <Text style={styles.symbolSubText}>
                            {sym.includes('Volatility')
                              ? 'Continuous Volatility Index'
                              : sym.includes('Boom') || sym.includes('Crash')
                              ? 'Algorithmic Spike Index'
                              : 'Step Sequence Index'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.checkboxBox,
                            isChecked && styles.checkboxBoxActive,
                          ]}
                        >
                          {isChecked && <CheckIcon size={12} color="#080808" />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* 3. Execution & Telemetry Preferences */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <SettingsSlidersIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Execution & Telemetry</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.toggleLabelRow}>
                <BellAlertIcon size={17} color={colors.orange} />
                <Text style={styles.toggleTitle}>Audio Alerts</Text>
              </View>
              <Text style={styles.toggleSubtitle}>Audible ping on order placement & SL/TP exit</Text>
            </View>
            <ToggleSwitch
              value={settings.soundAlerts}
              onValueChange={(val) => setSettings((s) => ({ ...s, soundAlerts: val }))}
              accessibilityLabel="Toggle audio alerts"
            />
          </View>

          <View style={styles.innerDivider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.toggleLabelRow}>
                <AdjustmentsIcon size={17} color={colors.orange} />
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

        {/* 4. Legal & Disclosures (Opens Dedicated Individual Screens) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <ShieldIcon size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Legal & System Audit</Text>
          </View>

          {/* Privacy Policy Nav Row */}
          <Pressable
            style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressedBtn]}
            onPress={() => onNavigateLegal('privacy')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <DocumentTextIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Privacy Policy</Text>
                <Text style={styles.disclosureSub}>
                  Sandboxed storage, JWT tokens, zero remote tracking
                </Text>
              </View>
            </View>
            <ChevronRightIcon size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.innerDivider} />

          {/* Terms of Service Nav Row */}
          <Pressable
            style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressedBtn]}
            onPress={() => onNavigateLegal('terms')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <DocumentTextIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Terms of Service</Text>
                <Text style={styles.disclosureSub}>
                  Software license, personal scope, user responsibility
                </Text>
              </View>
            </View>
            <ChevronRightIcon size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.innerDivider} />

          {/* Risk of Trading Nav Row */}
          <Pressable
            style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressedBtn]}
            onPress={() => onNavigateLegal('risk')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <WarningTriangleIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Risk of Trading</Text>
                <Text style={styles.disclosureSub}>
                  Synthetic volatility, leverage hazards, loss warnings
                </Text>
              </View>
            </View>
            <ChevronRightIcon size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.innerDivider} />

          {/* Disclaimer Nav Row */}
          <Pressable
            style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressedBtn]}
            onPress={() => onNavigateLegal('disclaimer')}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <InfoCircleIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>Disclaimer</Text>
                <Text style={styles.disclosureSub}>
                  Independent utility, no financial advice, regulatory terms
                </Text>
              </View>
            </View>
            <ChevronRightIcon size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.innerDivider} />

          {/* System & Audit Logs (Collapsible In-Body Accordion) */}
          <Pressable
            style={styles.disclosureRow}
            onPress={() => setLogsOpen((prev) => !prev)}
            accessibilityRole="button"
          >
            <View style={styles.disclosureRowLeft}>
              <TerminalLogIcon size={18} color={colors.orange} />
              <View style={styles.disclosureTextCol}>
                <Text style={styles.disclosureTitle}>System & Audit Logs</Text>
                <Text style={styles.disclosureSub}>
                  {state?.activity?.length
                    ? `${state.activity.length} recorded controller events`
                    : 'Chronological controller logs'}
                </Text>
              </View>
            </View>
            {logsOpen ? (
              <ChevronDownIcon size={18} color={colors.orange} />
            ) : (
              <ChevronRightIcon size={18} color={colors.textMuted} />
            )}
          </Pressable>

          {logsOpen && (
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
                        <Text style={styles.logTime}>{new Date(item.at).toLocaleTimeString()}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* 5. Action Buttons */}
        <View style={styles.actionBlock}>
          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && styles.pressedBtn]}
            onPress={() => void handleSaveAll()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#080808" />
            ) : (
              <Text style={styles.saveBtnText}>Save Preferences</Text>
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

function AdjustmentsIcon({ size = 18, color = '#FF6B00' }: { size?: number; color?: string }) {
  return <SettingsSlidersIcon size={size} color={color} />;
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
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  successBannerText: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
  },

  profileHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  profileName: {
    color: colors.text,
    fontSize: 20,
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
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  sectionDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 18,
  },
  innerDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 10,
  },

  sectionBlock: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  inputGroup: {
    gap: 6,
  },
  labelWithLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputLabel: {
    color: colors.textDim,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  readOnlyBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  readOnlyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  readOnlySub: {
    color: colors.textDim,
    fontSize: 11,
  },

  // Basket Dropdown Menu Styles
  basketHighlightedContainer: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    padding: 6,
    borderWidth: 1,
    borderColor: colors.orange,
  },
  dropdownTriggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownTriggerBoxOpen: {
    borderColor: colors.orange,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownTriggerBoxWarning: {
    borderColor: 'rgba(255, 107, 0, 0.5)',
  },
  dropdownTriggerLeft: {
    flex: 1,
    gap: 2,
  },
  dropdownValueText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownValueTextWarning: {
    color: colors.orange,
  },
  dropdownHintText: {
    color: colors.textDim,
    fontSize: 11,
  },
  dropdownChevronWrap: {
    paddingLeft: 8,
  },

  dropdownMenuBody: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
    gap: 10,
  },
  dropdownPresetsHeader: {
    color: colors.textDim,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  presetsRowContent: {
    gap: 6,
    paddingVertical: 4,
  },
  presetChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetChipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    borderColor: colors.orange,
  },
  presetChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: colors.orange,
    fontWeight: '700',
  },
  dropdownInnerDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  symbolListContainer: {
    gap: 2,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  symbolRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  symbolTextCol: {
    flex: 1,
    gap: 2,
  },
  symbolNameText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  symbolNameTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  symbolSubText: {
    color: colors.textDim,
    fontSize: 10.5,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },



  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: 16,
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
    lineHeight: 15,
  },

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
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
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
    color: colors.textDim,
    fontSize: 10,
  },
});

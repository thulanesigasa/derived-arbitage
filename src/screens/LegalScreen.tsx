import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppHeader } from '../components/AppHeader';

export type LegalSectionKey = 'privacy' | 'terms' | 'risk' | 'disclaimer';

interface LegalScreenProps {
  initialSection?: LegalSectionKey;
  onBack: () => void;
}

const colors = {
  bg: '#080808',
  panel: '#141414',
  panelAlt: '#1C1C1C',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  textDim: '#707070',
  orange: '#FF6B00',
  orangeDark: '#2D1405',
};

// SVGs from svgrepo.com (CC0)
const documentSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>
`;

const shieldSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
</svg>
`;

const warningSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
`;

const infoCircleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <line x1="12" y1="16" x2="12" y2="12"/>
  <line x1="12" y1="8" x2="12.01" y2="8"/>
</svg>
`;

const SECTIONS: Array<{
  key: LegalSectionKey;
  label: string;
  shortLabel: string;
  iconSvg: string;
  eyebrow: string;
  title: string;
}> = [
  {
    key: 'privacy',
    label: 'Privacy Policy',
    shortLabel: 'Privacy',
    iconSvg: shieldSvg,
    eyebrow: 'DATA & TELEMETRY',
    title: 'Privacy Policy',
  },
  {
    key: 'terms',
    label: 'Terms of Service',
    shortLabel: 'Terms',
    iconSvg: documentSvg,
    eyebrow: 'LEGAL AGREEMENT',
    title: 'Terms of Service',
  },
  {
    key: 'risk',
    label: 'Risk of Trading',
    shortLabel: 'Risk Warning',
    iconSvg: warningSvg,
    eyebrow: 'FINANCIAL RISK DISCLOSURE',
    title: 'Risk of Trading',
  },
  {
    key: 'disclaimer',
    label: 'Disclaimer',
    shortLabel: 'Disclaimer',
    iconSvg: infoCircleSvg,
    eyebrow: 'REGULATORY & SOFTWARE NOTICE',
    title: 'Disclaimer',
  },
];

export function LegalScreen({ initialSection = 'privacy', onBack }: LegalScreenProps) {
  const [activeSection, setActiveSection] = useState<LegalSectionKey>(initialSection);

  const currentDef = SECTIONS.find((s) => s.key === activeSection) ?? SECTIONS[0]!;

  return (
    <View style={styles.screenRoot}>
      <AppHeader
        eyebrow={currentDef.eyebrow}
        title={currentDef.title}
        onBack={onBack}
        backLabel="Settings"
      />

      {/* Top Segmented Selector Bar */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {SECTIONS.map((sec) => {
            const isActive = sec.key === activeSection;
            return (
              <Pressable
                key={sec.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveSection(sec.key)}
                accessibilityRole="button"
                accessibilityLabel={sec.label}
              >
                <SvgXml
                  xml={sec.iconSvg}
                  width={14}
                  height={14}
                  color={isActive ? colors.orange : colors.muted}
                />
                <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]}>
                  {sec.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeSection === 'privacy' && <PrivacyPolicyContent />}
        {activeSection === 'terms' && <TermsOfServiceContent />}
        {activeSection === 'risk' && <RiskOfTradingContent />}
        {activeSection === 'disclaimer' && <DisclaimerContent />}
      </ScrollView>
    </View>
  );
}

// ─── Individual Content Modules ─────────────────────────────────────────────

function PrivacyPolicyContent() {
  return (
    <View style={styles.articleCard}>
      <View style={styles.badgeRow}>
        <Text style={styles.badgeText}>LAST REVISED · SEPTEMBER 2026</Text>
      </View>

      <Text style={styles.sectionHeading}>1. Zero Data Collection Architecture</Text>
      <Text style={styles.bodyParagraph}>
        Derived Arbitrage operates on a strictly non-custodial, client-side execution model. We do not operate centralized user databases, profile tracking services, marketing analytics trackers, or remote telemetry logging servers. All configuration settings, MT5 identifiers, broker server parameters, and custom watchlist settings remain entirely stored on your physical mobile device.
      </Text>

      <Text style={styles.sectionHeading}>2. Sandboxed Local Storage (AsyncStorage)</Text>
      <Text style={styles.bodyParagraph}>
        User preferences, trading tags, audio alert options, and host bridge credentials reside strictly in the operating system's private sandboxed storage space allocated exclusively to this application. No external application or cloud endpoint can access or read these records without physical device authorization.
      </Text>

      <Text style={styles.sectionHeading}>3. Telemetry & WebSocket Streaming</Text>
      <Text style={styles.bodyParagraph}>
        Communication between your local VPS bridge and this mobile application utilizes HTTPS and authenticated WebSocket channels. Streaming tick metrics, synthetic candle formations, and session P&amp;L records are ephemeral in-memory frames processed in real time and discarded upon session completion.
      </Text>

      <Text style={styles.sectionHeading}>4. Broker Credentials & MetaQuotes IDs</Text>
      <Text style={styles.bodyParagraph}>
        The application does not request, store, or transmit master trading passwords or private withdrawal keys. Broker credentials entered in the settings tab serve solely as local visual identifiers for your multi-terminal bridge routing.
      </Text>

      <Text style={styles.sectionHeading}>5. User Rights & Data Deletion</Text>
      <Text style={styles.bodyParagraph}>
        You maintain full autonomy over your data at all times. Tapping "Reset to Defaults" on the Settings screen or clearing application storage in your operating system instantly wipes all cached configurations, keys, and journals from your device.
      </Text>
    </View>
  );
}

function TermsOfServiceContent() {
  return (
    <View style={styles.articleCard}>
      <View style={styles.badgeRow}>
        <Text style={styles.badgeText}>OPERATIONAL AGREEMENT · v0.1.0</Text>
      </View>

      <Text style={styles.sectionHeading}>1. Acceptance of Terms</Text>
      <Text style={styles.bodyParagraph}>
        By launching, connecting, or operating the Derived Arbitrage mobile controller or associated Falcon FX expert advisor components, you unconditionally agree to these Terms of Service. If you disagree with any clause, you must immediately cease usage and disconnect all bridge servers.
      </Text>

      <Text style={styles.sectionHeading}>2. Nature of Software & Non-Custodial License</Text>
      <Text style={styles.bodyParagraph}>
        Derived Arbitrage is provided strictly as personal automation software and an algorithmic analytics interface under an open personal license. The software does not provide financial asset custody, broker clearing services, or commercial fund management.
      </Text>

      <Text style={styles.sectionHeading}>3. Operational Responsibility</Text>
      <Text style={styles.bodyParagraph}>
        You retain sole, absolute, and unshared responsibility for configuring lot sizes, risk multipliers, equity stop floors, trailing stop margins, and network latency thresholds. You acknowledge that algorithmic systems require constant human oversight and dependable network connectivity.
      </Text>

      <Text style={styles.sectionHeading}>4. No Guarantees of Profitability</Text>
      <Text style={styles.bodyParagraph}>
        Past algorithmic backtesting results, simulated order block mitigations, Fair Value Gap historical statistics, and live performance metrics do not constitute a guarantee of future financial results. Financial markets and synthetic algorithms inherently carry substantial risk of financial loss.
      </Text>

      <Text style={styles.sectionHeading}>5. System Interventions & Circuit Breakers</Text>
      <Text style={styles.bodyParagraph}>
        You agree to maintain familiarity with the emergency stop procedures within the Controller tab. The application incorporates built-in equity floors and daily loss locks as software safeguards, but cannot prevent broker slippage or external server outages.
      </Text>
    </View>
  );
}

function RiskOfTradingContent() {
  return (
    <View style={styles.articleCard}>
      <View style={[styles.badgeRow, { borderColor: 'rgba(255, 107, 0, 0.4)' }]}>
        <Text style={[styles.badgeText, { color: colors.orange }]}>HIGH RISK WARNING · MANDATORY NOTICE</Text>
      </View>

      <Text style={styles.sectionHeading}>1. Mechanics of Synthetic Indices</Text>
      <Text style={styles.bodyParagraph}>
        Synthetic indices (such as Volatility 75, Boom 1000, Crash 500, and Step Index) are algorithmically engineered financial derivatives simulating 24/7 market volatility. They are governed by cryptographically audited pseudorandom number generators and do not reflect real-world macroeconomic fundamentals, central bank rates, or corporate earnings.
      </Text>

      <Text style={styles.sectionHeading}>2. Leverage & Margin Liquidation Hazard</Text>
      <Text style={styles.bodyParagraph}>
        Trading synthetic derivatives on margin involves high leverage. High leverage can amplify both gains and catastrophic capital loss. A slight adverse price movement can lead to rapid total margin depletion and automatic broker stop-out liquidation.
      </Text>

      <Text style={styles.sectionHeading}>3. Extreme Spike & Gap Regimes</Text>
      <Text style={styles.bodyParagraph}>
        Certain synthetic products (notably Boom and Crash indices) feature sudden, instantaneous mathematical tick spikes occurring within milliseconds. During explosive price spikes, stop-loss orders may experience severe negative execution slippage beyond your pre-configured exit price.
      </Text>

      <Text style={styles.sectionHeading}>4. Capital Allocation Policy</Text>
      <Text style={styles.bodyParagraph}>
        Do not commit capital that you cannot afford to lose entirely. Never risk emergency living funds, borrowed capital, or funds required for essential living obligations on derivative trading accounts.
      </Text>
    </View>
  );
}

function DisclaimerContent() {
  return (
    <View style={styles.articleCard}>
      <View style={styles.badgeRow}>
        <Text style={styles.badgeText}>LEGAL & REGULATORY DISCLAIMER</Text>
      </View>

      <Text style={styles.sectionHeading}>1. Independent Open-Source Tool</Text>
      <Text style={styles.bodyParagraph}>
        Derived Arbitrage is an independent open-source engineering initiative. It is not affiliated with, sponsored by, endorsed by, or operated by MetaQuotes Ltd, Deriv Group Ltd, or any regulated broker entity. MetaTrader 5 and Deriv are registered trademarks of their respective proprietors.
      </Text>

      <Text style={styles.sectionHeading}>2. No Investment or Financial Advice</Text>
      <Text style={styles.bodyParagraph}>
        No material, telemetry chart, signal indicator, Smart Money Concept (SMC) structure detection, or quantitative metric presented within this application constitutes investment advice, financial counseling, or a solicitation to purchase or trade securities or derivative contracts.
      </Text>

      <Text style={styles.sectionHeading}>3. "As-Is" Software Provision</Text>
      <Text style={styles.bodyParagraph}>
        This application is provided "as is" and "as available" without warranty of any kind, express or implied, including but not limited to fitness for a particular trading strategy, uninterrupted uptime, or error-free execution. The developers assume zero liability for financial damages arising from system usage.
      </Text>

      <Text style={styles.sectionHeading}>4. Jurisdictional Compliance</Text>
      <Text style={styles.bodyParagraph}>
        It is your sole responsibility to ensure that derivative trading, synthetic index speculation, and automated Expert Advisor operation comply fully with all applicable local statutes, regulatory frameworks, and tax laws in your country of residence.
      </Text>
    </View>
  );
}

// ─── Modular Export Wrappers ────────────────────────────────────────────────

export function PrivacyPolicyScreen({ onBack }: { onBack: () => void }) {
  return <LegalScreen initialSection="privacy" onBack={onBack} />;
}

export function TermsOfServiceScreen({ onBack }: { onBack: () => void }) {
  return <LegalScreen initialSection="terms" onBack={onBack} />;
}

export function RiskOfTradingScreen({ onBack }: { onBack: () => void }) {
  return <LegalScreen initialSection="risk" onBack={onBack} />;
}

export function DisclaimerScreen({ onBack }: { onBack: () => void }) {
  return <LegalScreen initialSection="disclaimer" onBack={onBack} />;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabBarWrapper: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderColor: colors.orange,
  },
  tabItemText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabItemTextActive: {
    color: colors.orange,
    fontWeight: '800',
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 60,
  },
  articleCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 20,
  },
  badgeRow: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 20,
  },
  badgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 8,
    marginTop: 14,
  },
  bodyParagraph: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 14,
  },
});

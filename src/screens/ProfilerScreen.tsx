import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  DEFAULT_PROFILER_SNAPSHOT,
  getApiBaseUrl,
  getProfilerStatus,
  getStrategySignals,
  onApiBaseUrlChange,
} from '../api';
import { AppHeader } from '../components/AppHeader';
import { SmcStructureModal } from '../components/SmcStructureModal';
import type { ProfilerApiState, StrategyApiState, StrategySignal, SymbolProfile } from '../types';

// ─── Design tokens (matches App.tsx palette) ─────────────────────────────────
const C = {
  bg:       '#080808',
  panel:    '#161616',
  panelAlt: '#1E1E1E',
  border:   '#282828',
  text:     '#FFFFFF',
  muted:    '#9A9A9A',
  accent:   '#FF6B00',
  orange:   '#FF6B00',
};

const GROUP_LABEL: Record<SymbolProfile['group'], string> = {
  volatility: 'VOL',
  boom:       'BOOM',
  crash:      'CRASH',
  step:       'STEP',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3) return 'now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

function fmt(v: number | null, decimals = 2): string {
  return v === null ? '—' : v.toFixed(decimals);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={styles.sparkTrack}>
      <View style={[styles.sparkFill, { width: `${width}%`, backgroundColor: color }]} />
    </View>
  );
}

function SymbolCard({
  profile,
  onOpenStructure,
}: {
  profile: SymbolProfile;
  onOpenStructure: (profile: SymbolProfile) => void;
}) {
  const decimals = profile.pip < 0.01 ? 4 : 2;

  return (
    <View style={[styles.card, !profile.available && styles.cardDimmed]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.groupChip}>
            <Text style={styles.groupChipText}>{GROUP_LABEL[profile.group]}</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.symbolName}>{profile.display}</Text>
            <Text style={styles.symbolCode}>{profile.code}</Text>
          </View>
        </View>

        {/* Structure inspection button (Rule 15: >= 48dp touch target) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Inspect structure for ${profile.display}`}
          onPress={() => onOpenStructure(profile)}
          style={({ pressed }) => [styles.inspectBtn, pressed && styles.pressedBtn]}
        >
          <Text style={styles.inspectBtnText}>SMC Structure</Text>
        </Pressable>
      </View>

      {/* Metrics grid */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPOT</Text>
          <Text style={styles.metricValue}>
            {profile.spotPrice > 0
              ? profile.spotPrice.toLocaleString(undefined, { maximumFractionDigits: decimals })
              : '—'}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPREAD (MED)</Text>
          <Text
            style={[
              styles.metricValue,
              { color: profile.spreadMedian !== null ? C.orange : C.muted },
            ]}
          >
            {fmt(profile.spreadMedian, decimals)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPREAD (P95)</Text>
          <Text style={[styles.metricValue, { color: C.muted }]}>
            {fmt(profile.spreadP95, decimals)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>TICKS/SEC</Text>
          <Text style={[styles.metricValue, { color: C.orange }]}>
            {profile.tickVelocity > 0 ? profile.tickVelocity.toFixed(2) : '—'}
          </Text>
        </View>
      </View>

      {/* Tick velocity bar */}
      {profile.tickVelocity > 0 && (
        <View style={styles.velRow}>
          <Text style={styles.velLabel}>Tick velocity</Text>
          <SparkBar value={profile.tickVelocity} max={2} color={C.orange} />
          <Text style={styles.velCount}>{profile.tickCount.toLocaleString()} collected</Text>
        </View>
      )}

      {/* Affordability note */}
      <View style={styles.noteRow}>
        <View
          style={[styles.noteDot, { backgroundColor: profile.affordable ? C.orange : C.muted }]}
        />
        <Text style={styles.noteText}>{profile.affordabilityNote}</Text>
      </View>

      {/* Last tick */}
      {profile.lastTickAt && (
        <Text style={styles.lastTick}>Last tick: {relativeTime(profile.lastTickAt)}</Text>
      )}
    </View>
  );
}

function SignalCard({ signal }: { signal: StrategySignal }) {
  const isBuy = signal.side === 'BUY';

  return (
    <View style={styles.signalCard}>
      <View style={styles.signalHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.signalSymbol}>{signal.symbol}</Text>
          <Text style={styles.signalSetup}>{signal.setupName.replace(/_/g, ' ')}</Text>
        </View>
        <View style={[styles.sidePill, isBuy ? styles.buyPill : styles.sellPill]}>
          <Text style={[styles.sideText, isBuy ? styles.buyText : styles.sellText]}>
            {signal.side}
          </Text>
        </View>
      </View>

      <View style={styles.signalGrid}>
        <View style={styles.signalCell}>
          <Text style={styles.signalCellLabel}>ENTRY</Text>
          <Text style={styles.signalCellValue}>{signal.entryPrice.toFixed(2)}</Text>
        </View>
        <View style={styles.signalCell}>
          <Text style={styles.signalCellLabel}>STOP LOSS</Text>
          <Text style={styles.signalCellValue}>{signal.stopLoss.toFixed(2)}</Text>
        </View>
        <View style={styles.signalCell}>
          <Text style={styles.signalCellLabel}>TAKE PROFIT</Text>
          <Text style={[styles.signalCellValue, { color: C.orange }]}>
            {signal.takeProfit.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.signalFooter}>
        <Text style={styles.signalFooterText}>
          Target: 1:{signal.rrRatio.toFixed(1)} R:R · Risk: ${signal.riskUsd.toFixed(2)}
        </Text>
        <Text style={styles.signalFooterTime}>{relativeTime(signal.createdAt)}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ProfilerScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(windowWidth > 32 ? windowWidth - 32 : 360);
  const [segmentPillWidth, setSegmentPillWidth] = useState(0);

  const [activeSegment, setActiveSegment] = useState<'profiles' | 'signals'>('profiles');
  const [data, setData] = useState<ProfilerApiState>(DEFAULT_PROFILER_SNAPSHOT);
  const [signalsData, setSignalsData] = useState<StrategyApiState | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const mounted = useRef(true);

  // Animated values for sliding transitions
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Adaptive height measurement for sliding content container
  const [profilesHeight, setProfilesHeight] = useState<number | null>(null);
  const [signalsHeight, setSignalsHeight] = useState<number | null>(null);
  const heightAnim = useRef(new Animated.Value(1200)).current;

  useEffect(() => {
    const toValue = activeSegment === 'profiles' ? 0 : 1;
    Animated.spring(slideAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [activeSegment, slideAnim]);

  useEffect(() => {
    const targetH = activeSegment === 'profiles' ? profilesHeight : signalsHeight;
    if (targetH && targetH > 0) {
      Animated.spring(heightAnim, {
        toValue: targetH,
        useNativeDriver: false,
        friction: 9,
        tension: 65,
      }).start();
    }
  }, [activeSegment, profilesHeight, signalsHeight, heightAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -viewportWidth],
  });

  const profilesOpacity = slideAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.4, 0],
  });

  const signalsOpacity = slideAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.4, 1],
  });

  const activeHeight = activeSegment === 'profiles' ? profilesHeight : signalsHeight;

  const fetchProfiler = useCallback(async () => {
    try {
      const [respP, respS] = await Promise.allSettled([
        getProfilerStatus(),
        getStrategySignals(),
      ]);

      if (respP.status === 'fulfilled' && respP.value) {
        if (mounted.current) {
          setData(respP.value);
          setError(null);
        }
      } else if (respP.status === 'rejected') {
        if (mounted.current) {
          setError(respP.reason instanceof Error ? respP.reason.message : 'Could not reach profiler bridge');
        }
      }

      if (respS.status === 'fulfilled' && mounted.current) {
        setSignalsData(respS.value);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Could not reach profiler endpoint.');
      }
    } finally {
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchProfiler();
    const unsubUrl = onApiBaseUrlChange((newUrl) => {
      if (mounted.current) {
        setApiUrl(newUrl);
        void fetchProfiler();
      }
    });
    const pollTimer = setInterval(() => {
      void fetchProfiler();
    }, 4_000);
    const clockTimer = setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      mounted.current = false;
      unsubUrl();
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [fetchProfiler]);

  const affordable = data?.profiles.filter((p) => p.affordable).length ?? 0;
  const available = data?.profiles.filter((p) => p.available).length ?? 0;
  const total = data?.profiles.length ?? 0;
  const recentSignals = signalsData?.recentSignals ?? [];

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="MARKET TELEMETRY &amp; SIGNALS" title="Profiler" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor={C.orange}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchProfiler();
            }}
          />
        }
      >
        {/* Top Segmented Control */}
        <View
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) setSegmentPillWidth((w - 8) / 2);
          }}
          style={styles.segmentContainer}
        >
          {segmentPillWidth > 0 && (
            <Animated.View
              style={[
                styles.segmentSlider,
                {
                  width: segmentPillWidth,
                  transform: [
                    {
                      translateX: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, segmentPillWidth],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Instrument Profiles"
            accessibilityState={{ selected: activeSegment === 'profiles' }}
            onPress={() => setActiveSegment('profiles')}
            style={styles.segmentBtn}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'profiles' && styles.segmentTextActive,
              ]}
            >
              PROFILES ({total})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Falcon FX and SMC Signals"
            accessibilityState={{ selected: activeSegment === 'signals' }}
            onPress={() => setActiveSegment('signals')}
            style={styles.segmentBtn}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'signals' && styles.segmentTextActive,
              ]}
            >
              SMC SIGNALS ({recentSignals.length})
            </Text>
          </Pressable>
        </View>

        {/* Animated Sliding Viewport between Profiles and SMC Signals */}
        <Animated.View
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - viewportWidth) > 1) {
              setViewportWidth(w);
            }
          }}
          style={[
            styles.viewportWrapper,
            activeHeight !== null
              ? { height: heightAnim, overflow: 'hidden' }
              : { overflow: 'hidden' },
          ]}
        >
          <Animated.View
            style={[
              styles.slidingTrack,
              {
                width: viewportWidth * 2,
                transform: [{ translateX }],
              },
            ]}
          >
            {/* Pane 1: Instrument Profiles */}
            <Animated.View
              pointerEvents={activeSegment === 'profiles' ? 'auto' : 'none'}
              style={[
                styles.paneContainer,
                { width: viewportWidth, opacity: profilesOpacity },
              ]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && h !== profilesHeight) {
                  setProfilesHeight(h);
                  if (activeSegment === 'profiles' && profilesHeight === null) {
                    heightAnim.setValue(h);
                  }
                }
              }}
            >
              {/* Summary bar */}
              {data && (
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCell}>
                    <Text style={[styles.summaryValue, { color: C.orange }]}>{affordable}</Text>
                    <Text style={styles.summaryLabel}>Affordable</Text>
                  </View>
                  <View style={styles.sumDivider} />
                  <View style={styles.summaryCell}>
                    <Text style={[styles.summaryValue, { color: C.text }]}>{available}</Text>
                    <Text style={styles.summaryLabel}>Available</Text>
                  </View>
                  <View style={styles.sumDivider} />
                  <View style={styles.summaryCell}>
                    <Text style={[styles.summaryValue, { color: C.text }]}>{total}</Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                  </View>
                  <View style={styles.sumDivider} />
                  <View style={styles.summaryCell}>
                    <Text style={[styles.summaryValue, { color: C.muted }]}>
                      {data.lastRefreshedAt ? relativeTime(data.lastRefreshedAt) : '—'}
                    </Text>
                    <Text style={styles.summaryLabel}>Refreshed</Text>
                  </View>
                </View>
              )}

              {/* Error banner */}
              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable onPress={() => void fetchProfiler()} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              )}

              {/* Symbol cards */}
              {data?.profiles.map((profile) => (
                <SymbolCard
                  key={profile.code}
                  profile={profile}
                  onOpenStructure={(p) => setSelectedSymbol(p)}
                />
              ))}
            </Animated.View>

            {/* Pane 2: SMC Signals */}
            <Animated.View
              pointerEvents={activeSegment === 'signals' ? 'auto' : 'none'}
              style={[
                styles.paneContainer,
                { width: viewportWidth, opacity: signalsOpacity },
              ]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && h !== signalsHeight) {
                  setSignalsHeight(h);
                  if (activeSegment === 'signals' && signalsHeight === null) {
                    heightAnim.setValue(h);
                  }
                }
              }}
            >
              <View style={styles.signalsContainer}>
                {recentSignals.length === 0 ? (
                  <View style={styles.emptySignalsCard}>
                    <Text style={styles.emptySignalsTitle}>No active setups detected</Text>
                    <Text style={styles.emptySignalsHint}>
                      Falcon FX &amp; SMC engine is monitoring 10 synthetic index feeds for Break of Structure,
                      liquidity sweeps, and fair value gap retracements.
                    </Text>
                  </View>
                ) : (
                  recentSignals.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>FALCON FX · SMC ENGINE</Text>
          <Text style={styles.footerText}>
            Continuous candle reconstruction &amp; market structure profiling.{'\n'}
            Dynamic ATR 1.5x stop losses strictly enforced with minimum 1:2.5 R:R.
          </Text>
          <Text style={styles.footerApi}>{apiUrl}</Text>
          <Text style={styles.footerClock}>{new Date(clock).toLocaleTimeString()}</Text>
        </View>
      </ScrollView>

      {/* SMC Structure Modal */}
      {selectedSymbol && (
        <SmcStructureModal
          visible={!!selectedSymbol}
          symbolCode={selectedSymbol.code}
          symbolDisplay={selectedSymbol.display}
          spotPrice={selectedSymbol.spotPrice}
          pip={selectedSymbol.pip}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: C.bg },
  root:       { flex: 1, backgroundColor: C.bg },
  content:    { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 128, gap: 16 },

  // Segmented control
  segmentContainer: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
  },
  segmentSlider: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: '#26140E',
    borderColor: C.orange,
    borderWidth: 1,
    borderRadius: 10,
    zIndex: 0,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    zIndex: 1,
  },
  segmentText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  segmentTextActive: {
    color: C.orange,
  },

  viewportWrapper: {
    width: '100%',
  },
  slidingTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  paneContainer: {
    gap: 16,
  },

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  summaryCell:  { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { color: C.muted, fontSize: 10, marginTop: 2 },
  sumDivider:   { width: 1, backgroundColor: C.border },

  centered:    { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: C.text, fontSize: 16, fontWeight: '600' },
  loadingHint: { color: C.muted, fontSize: 12 },

  errorBanner: {
    backgroundColor: '#26140E',
    borderColor: C.orange,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  errorText: { color: '#FFFFFF', fontSize: 13 },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: 48,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.orange,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryText: { color: '#080808', fontSize: 13, fontWeight: '700' },

  // Symbol card
  card: {
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  cardDimmed:     { opacity: 0.55 },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupChip: {
    backgroundColor: '#1C1C1C',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  groupChipText: { color: C.orange, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  nameBlock:     { flex: 1 },
  symbolName:    { color: C.text, fontSize: 13, fontWeight: '700' },
  symbolCode:    { color: C.muted, fontSize: 10, marginTop: 1 },

  inspectBtn: {
    minHeight: 48,
    minWidth: 100,
    backgroundColor: '#1E1E1E',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inspectBtnText: {
    color: C.orange,
    fontSize: 11,
    fontWeight: '800',
  },
  pressedBtn: {
    opacity: 0.8,
  },

  metricsRow:  { flexDirection: 'row', gap: 4 },
  metricCell:  { flex: 1, backgroundColor: '#101010', borderRadius: 10, padding: 10 },
  metricLabel: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  metricValue: { color: C.text, fontSize: 14, fontWeight: '800', marginTop: 4 },

  velRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  velLabel:   { color: C.muted, fontSize: 10, width: 72 },
  velCount:   { color: C.muted, fontSize: 10 },
  sparkTrack: { flex: 1, height: 4, backgroundColor: '#262626', borderRadius: 2, overflow: 'hidden' },
  sparkFill:  { height: '100%', borderRadius: 2 },

  noteRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  noteDot:  { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  noteText: { color: C.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  lastTick: { color: C.muted, fontSize: 10, textAlign: 'right' },

  // Signal cards
  signalsContainer: {
    gap: 12,
  },
  signalCard: {
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signalSymbol: {
    color: C.text,
    fontSize: 15,
    fontWeight: '800',
  },
  signalSetup: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  sidePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  buyPill: {
    backgroundColor: C.orange,
  },
  sellPill: {
    backgroundColor: '#262626',
    borderColor: C.border,
    borderWidth: 1,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  buyText: {
    color: '#080808',
  },
  sellText: {
    color: C.text,
  },

  signalGrid: {
    flexDirection: 'row',
    backgroundColor: '#101010',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  signalCell: {
    flex: 1,
    alignItems: 'center',
  },
  signalCellLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  signalCellValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
    fontFamily: 'monospace',
  },

  signalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalFooterText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  signalFooterTime: {
    color: C.muted,
    fontSize: 10,
  },

  emptySignalsCard: {
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptySignalsTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '800',
  },
  emptySignalsHint: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  footer:      { alignItems: 'center', paddingTop: 16, gap: 6 },
  footerTitle: { color: C.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  footerText:  { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  footerApi:   { color: C.muted, fontSize: 11 },
  footerClock: { color: C.muted, fontSize: 10 },
});

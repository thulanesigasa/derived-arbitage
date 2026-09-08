import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ProfilerApiState, SymbolProfile } from '../types';
import { API_BASE_URL } from '../api';
import { AppHeader } from '../components/AppHeader';

// ─── Design tokens (matches App.tsx palette) ─────────────────────────────────
const C = {
  bg:         '#07111F',
  panel:      '#0D1A2B',
  panelAlt:   '#102238',
  border:     '#21344C',
  text:       '#F1F5F9',
  muted:      '#91A4BB',
  accent:     '#2DD4BF',
  cyan:       '#2DD4BF',
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

function SymbolCard({ profile }: { profile: SymbolProfile }) {
  const decimals = profile.pip < 0.01 ? 5 : 2;

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
      </View>

      {/* Metrics grid */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPOT</Text>
          <Text style={styles.metricValue}>{profile.spotPrice > 0 ? profile.spotPrice.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—'}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPREAD (MED)</Text>
          <Text style={[styles.metricValue, { color: profile.spreadMedian !== null ? C.cyan : C.muted }]}>
            {fmt(profile.spreadMedian, decimals)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPREAD (P95)</Text>
          <Text style={[styles.metricValue, { color: C.muted }]}>{fmt(profile.spreadP95, decimals)}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>TICKS/SEC</Text>
          <Text style={[styles.metricValue, { color: C.cyan }]}>
            {profile.tickVelocity > 0 ? profile.tickVelocity.toFixed(2) : '—'}
          </Text>
        </View>
      </View>

      {/* Tick velocity bar */}
      {profile.tickVelocity > 0 && (
        <View style={styles.velRow}>
          <Text style={styles.velLabel}>Tick velocity</Text>
          <SparkBar value={profile.tickVelocity} max={2} color={C.cyan} />
          <Text style={styles.velCount}>{profile.tickCount.toLocaleString()} collected</Text>
        </View>
      )}

      {/* Affordability note */}
      <View style={styles.noteRow}>
        <View style={[styles.noteDot, { backgroundColor: profile.affordable ? C.cyan : C.muted }]} />
        <Text style={styles.noteText}>{profile.affordabilityNote}</Text>
      </View>

      {/* Last tick */}
      {profile.lastTickAt && (
        <Text style={styles.lastTick}>Last tick: {relativeTime(profile.lastTickAt)}</Text>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ProfilerScreen() {
  const [data,       setData]       = useState<ProfilerApiState | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [clock,      setClock]      = useState(Date.now());
  const mounted = useRef(true);

  const fetchProfiler = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/profiler/status`);
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const json = (await resp.json()) as ProfilerApiState;
      if (mounted.current) { setData(json); setError(null); }
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : 'Could not reach profiler endpoint.');
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchProfiler();
    const pollTimer  = setInterval(() => { void fetchProfiler(true); }, 4_000);
    const clockTimer = setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      mounted.current = false;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [fetchProfiler]);

  // Derived summary counts
  const affordable = data?.profiles.filter((p) => p.affordable).length ?? 0;
  const available  = data?.profiles.filter((p) => p.available).length ?? 0;
  const total      = data?.profiles.length ?? 0;

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="LIVE MARKET DATA" title="Profiler" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={C.cyan}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void fetchProfiler(true); }}
          />
        }
      >
        {/* Summary bar */}
      {data && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: C.cyan }]}>{affordable}</Text>
            <Text style={styles.summaryLabel}>Affordable</Text>
          </View>
          <View style={[styles.sumDivider]} />
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: C.text }]}>{available}</Text>
            <Text style={styles.summaryLabel}>Available</Text>
          </View>
          <View style={[styles.sumDivider]} />
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: C.text }]}>{total}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={[styles.sumDivider]} />
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: C.muted }]}>
              {data.lastRefreshedAt ? relativeTime(data.lastRefreshedAt) : '—'}
            </Text>
            <Text style={styles.summaryLabel}>Refreshed</Text>
          </View>
        </View>
      )}

      {/* Loading state */}
      {loading && !data && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.cyan} />
          <Text style={styles.loadingText}>Connecting to Deriv API…</Text>
          <Text style={styles.loadingHint}>{API_BASE_URL}/api/profiler/status</Text>
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
        <SymbolCard key={profile.code} profile={profile} />
      ))}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>MARKET PROFILER · PHASE 2</Text>
        <Text style={styles.footerText}>
          Live tick data via Deriv WebSocket API. No trades. No orders.{'\n'}
          Affordability is indicative — actual lot costs require MT5 specs.
        </Text>
        <Text style={styles.footerApi}>{API_BASE_URL}</Text>
        <Text style={styles.footerClock}>{new Date(clock).toLocaleTimeString()}</Text>
      </View>
    </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenRoot:    { flex: 1, backgroundColor: C.bg },
  root:          { flex: 1, backgroundColor: C.bg },
  content:       { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 16 },

  summaryRow:    { flexDirection: 'row', backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  summaryCell:   { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryValue:  { fontSize: 20, fontWeight: '800' },
  summaryLabel:  { color: C.muted, fontSize: 10, marginTop: 2 },
  sumDivider:    { width: 1, backgroundColor: C.border },

  centered:      { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText:   { color: C.text, fontSize: 16, fontWeight: '600' },
  loadingHint:   { color: C.muted, fontSize: 12 },

  errorBanner:   { backgroundColor: '#3A141D', borderColor: '#7F2940', borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  errorText:     { color: '#FECDD3', fontSize: 13 },
  retryBtn:      { alignSelf: 'flex-start', minHeight: 48, minWidth: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7F2940', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  retryText:     { color: C.text, fontSize: 13, fontWeight: '700' },

  // Symbol card
  card:          { backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  cardDimmed:    { opacity: 0.55 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLeft:{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupChip:     { backgroundColor: '#102238', borderColor: C.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  groupChipText: { color: C.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  nameBlock:     { flex: 1 },
  symbolName:    { color: C.text, fontSize: 13, fontWeight: '700' },
  symbolCode:    { color: C.muted, fontSize: 10, marginTop: 1 },

  metricsRow:    { flexDirection: 'row', gap: 4 },
  metricCell:    { flex: 1, backgroundColor: '#091828', borderRadius: 10, padding: 10 },
  metricLabel:   { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  metricValue:   { color: C.text, fontSize: 14, fontWeight: '800', marginTop: 4 },

  velRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  velLabel:      { color: C.muted, fontSize: 10, width: 72 },
  velCount:      { color: C.muted, fontSize: 10 },
  sparkTrack:    { flex: 1, height: 4, backgroundColor: '#1C2C3E', borderRadius: 2, overflow: 'hidden' },
  sparkFill:     { height: '100%', borderRadius: 2 },

  noteRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  noteDot:       { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  noteText:      { color: C.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  lastTick:      { color: '#4A6480', fontSize: 10, textAlign: 'right' },

  footer:        { alignItems: 'center', paddingTop: 16, gap: 6 },
  footerTitle:   { color: C.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  footerText:    { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  footerApi:     { color: C.muted, fontSize: 11 },
  footerClock:   { color: C.muted, fontSize: 10 },
});

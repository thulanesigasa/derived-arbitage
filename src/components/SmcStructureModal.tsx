import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { getMarketStructure } from '../api';
import type { Candle, InstrumentStructureResponse } from '../types';

interface SmcStructureModalProps {
  visible: boolean;
  symbolCode: string;
  symbolDisplay: string;
  spotPrice: number;
  pip: number;
  onClose: () => void;
}

const colors = {
  bg: '#080808',
  panel: '#161616',
  panelAlt: '#1E1E1E',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  orange: '#FF6B00',
  orangeMuted: 'rgba(255, 107, 0, 0.15)',
};

export function SmcStructureModal({
  visible,
  symbolCode,
  symbolDisplay,
  spotPrice,
  pip,
  onClose,
}: SmcStructureModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InstrumentStructureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStructure = () => {
    if (!symbolCode) return;
    setLoading(true);
    setError(null);

    getMarketStructure(symbolCode)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load structure');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!visible || !symbolCode) return;
    loadStructure();
  }, [visible, symbolCode]);

  const decimals = pip < 0.01 ? 4 : 2;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalEyebrow}>SMC &amp; FALCON STRUCTURE</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {symbolDisplay}
              </Text>
              <Text style={styles.modalSub}>
                {symbolCode} · Spot: {spotPrice > 0 ? spotPrice.toFixed(decimals) : '—'}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close modal"
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressedBtn]}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.orange} />
              <Text style={styles.loadingText}>Analyzing market structure…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={loadStructure}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressedBtn]}
              >
                <Text style={styles.retryBtnText}>Retry Analysis</Text>
              </Pressable>
            </View>
          ) : data ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Candlestick Sparkline */}
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Text style={styles.cardLabel}>M1 CANDLE RECONSTRUCTION</Text>
                  <Text style={styles.cardSub}>Rolling 30 bars</Text>
                </View>
                <CandleChart candles={data.candles.slice(-25)} decimals={decimals} />
              </View>

              {/* SMC Structural Analysis Grid */}
              <View style={styles.gridCard}>
                <Text style={styles.cardLabel}>MARKET STRUCTURE</Text>

                <View style={styles.gridRow}>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridItemLabel}>TREND BIAS</Text>
                    <Text style={[styles.gridItemValue, { color: colors.orange }]}>
                      {data.structure.trend}
                    </Text>
                  </View>
                  <View style={styles.gridDivider} />
                  <View style={styles.gridItem}>
                    <Text style={styles.gridItemLabel}>DYNAMIC ATR</Text>
                    <Text style={styles.gridItemValue}>
                      {data.atr > 0 ? data.atr.toFixed(decimals) : '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.horizontalLine} />

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Break of Structure (BOS):</Text>
                  <Text style={styles.detailVal}>
                    {data.structure.lastBOS
                      ? `${data.structure.lastBOS.type} @ ${data.structure.lastBOS.brokenPrice.toFixed(decimals)}`
                      : 'None active'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Change of Character (CHoCH):</Text>
                  <Text style={styles.detailVal}>
                    {data.structure.lastCHoCH
                      ? `${data.structure.lastCHoCH.type} @ ${data.structure.lastCHoCH.brokenPrice.toFixed(decimals)}`
                      : 'None active'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Active Fair Value Gaps:</Text>
                  <Text style={[styles.detailVal, { color: colors.orange }]}>
                    {data.structure.activeFVGs.length > 0
                      ? `${data.structure.activeFVGs.length} unmitigated zones`
                      : 'Fully balanced'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Swing Points Tracked:</Text>
                  <Text style={styles.detailVal}>
                    {data.structure.swingHighs.length} Highs · {data.structure.swingLows.length} Lows
                  </Text>
                </View>
              </View>

              {/* SMC Analytical Reference Guide */}
              <View style={styles.guideCard}>
                <Text style={styles.cardLabel}>SMC TELEMETRY DEFINITIONS</Text>

                <View style={styles.guideItem}>
                  <Text style={styles.guideTitle}>• Trend Bias</Text>
                  <Text style={styles.guideDesc}>
                    Current directional order flow derived from higher-highs/higher-lows (BULLISH) vs lower-highs/lower-lows (BEARISH).
                  </Text>
                </View>

                <View style={styles.guideItem}>
                  <Text style={styles.guideTitle}>• Break of Structure (BOS)</Text>
                  <Text style={styles.guideDesc}>
                    Occurs when price breaches and closes past a recent swing fractal, confirming trend continuation.
                  </Text>
                </View>

                <View style={styles.guideItem}>
                  <Text style={styles.guideTitle}>• Change of Character (CHoCH)</Text>
                  <Text style={styles.guideDesc}>
                    Initial break of opposing market structure, signaling an institutional trend reversal.
                  </Text>
                </View>

                <View style={styles.guideItem}>
                  <Text style={styles.guideTitle}>• Fair Value Gaps (FVG)</Text>
                  <Text style={styles.guideDesc}>
                    3-candle liquidity imbalances left by aggressive smart money buying or selling.
                  </Text>
                </View>

                <View style={styles.guideItem}>
                  <Text style={styles.guideTitle}>• Dynamic ATR</Text>
                  <Text style={styles.guideDesc}>
                    Average True Range calculated across forming bars, determining minimum stop loss buffer and risk scaling.
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function CandleChart({ candles, decimals }: { candles: Candle[]; decimals: number }) {
  if (candles.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyChartTitle}>Awaiting Candle Accumulation</Text>
        <Text style={styles.emptyChartText}>
          Constructing live M1 bars from broker feed. Visual candlestick sparklines and fractal swing levels appear once completed 1-minute bars accumulate.
        </Text>
      </View>
    );
  }

  const chartWidth = 320;
  const chartHeight = 110;
  const padding = 12;

  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  const range = maxPrice - minPrice || 1;
  const candleSlotWidth = (chartWidth - padding * 2) / candles.length;
  const bodyWidth = Math.max(candleSlotWidth * 0.65, 3);

  const scaleY = (price: number) => {
    return chartHeight - padding - ((price - minPrice) / range) * (chartHeight - padding * 2);
  };

  return (
    <View style={styles.chartWrapper}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* High / Low reference lines */}
        <Line
          x1={padding}
          y1={padding}
          x2={chartWidth - padding}
          y2={padding}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4, 4"
        />
        <Line
          x1={padding}
          y1={chartHeight - padding}
          x2={chartWidth - padding}
          y2={chartHeight - padding}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4, 4"
        />

        {/* Candles */}
        {candles.map((c, i) => {
          const isBullish = c.close >= c.open;
          const x = padding + i * candleSlotWidth + candleSlotWidth / 2;
          const yHigh = scaleY(c.high);
          const yLow = scaleY(c.low);
          const yOpen = scaleY(c.open);
          const yClose = scaleY(c.close);

          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);
          const candleColor = isBullish ? colors.orange : colors.text;

          return (
            <React.Fragment key={c.timestamp}>
              {/* Wick */}
              <Line
                x1={x}
                y1={yHigh}
                x2={x}
                y2={yLow}
                stroke={candleColor}
                strokeWidth={1.2}
              />
              {/* Body */}
              <Rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={candleColor}
                rx={1}
              />
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={styles.chartLabels}>
        <Text style={styles.chartPriceLabel}>{maxPrice.toFixed(decimals)}</Text>
        <Text style={styles.chartPriceLabel}>{minPrice.toFixed(decimals)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: colors.border,
    borderWidth: 1,
    height: '82%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalEyebrow: {
    color: colors.orange,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  modalSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pressedBtn: {
    opacity: 0.8,
  },

  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  errorText: {
    color: colors.orange,
    fontSize: 13,
  },
  retryBtn: {
    marginTop: 8,
    minHeight: 48,
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 16,
  },

  chartCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardSub: {
    color: colors.muted,
    fontSize: 11,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  chartLabels: {
    position: 'absolute',
    right: 4,
    top: 6,
    bottom: 6,
    justifyContent: 'space-between',
  },
  chartPriceLabel: {
    color: colors.muted,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  emptyChart: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyChartTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyChartText: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  gridCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  gridDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  gridItemLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  gridItemValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  horizontalLine: {
    height: 1,
    backgroundColor: colors.border,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  detailVal: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },

  guideCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  guideItem: {
    gap: 2,
  },
  guideTitle: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
  },
  guideDesc: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
});


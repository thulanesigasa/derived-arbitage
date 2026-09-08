import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ControllerState, LiveActivationReport } from '../types';
import { activateLiveMode, getLiveActivationReport } from '../api';
import { CheckIcon, CrossIcon, ShieldIcon } from './TabIcons';

interface LiveActivationModalProps {
  visible: boolean;
  onClose: () => void;
  controllerState: ControllerState;
  onActivated?: (updatedState: ControllerState) => void;
}

const colors = {
  bg: '#080808',
  panel: '#161616',
  panelAlt: '#1C1C1C',
  border: '#282828',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  orange: '#FF6B00',
  orangeDark: '#2D1405',
};

export function LiveActivationModal({
  visible,
  onClose,
  controllerState,
  onActivated,
}: LiveActivationModalProps) {
  const [report, setReport] = useState<LiveActivationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (visible) {
      void fetchReport();
    }
  }, [visible]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await getLiveActivationReport();
      setReport(res);
    } catch {
      // Ignore network errors in demo
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = () => {
    if (!report?.eligibleForLive) {
      Alert.alert(
        'Activation Gate Locked',
        'All 5 quantitative safety gates must pass before live capital trading can be enabled.'
      );
      return;
    }

    Alert.alert(
      'Activate Live Trading',
      'You are transitioning from simulation to live capital execution on DerivSVG-Server-03. Hard equity floor ($15.00) and daily loss lock ($0.40) remain active. Confirm live activation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Live Activation',
          style: 'destructive',
          onPress: async () => {
            setActivating(true);
            try {
              const requestId = `act-${Date.now()}`;
              const res = await activateLiveMode(controllerState.revision, requestId);
              if (res.ok) {
                onActivated?.(res.state);
                Alert.alert(
                  'Live Mode Activated',
                  'The controller is now operating in LIVE execution mode.'
                );
                onClose();
              }
            } catch (err) {
              Alert.alert(
                'Activation Failed',
                err instanceof Error ? err.message : 'Could not activate live mode.'
              );
            } finally {
              setActivating(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <ShieldIcon size={22} color={colors.orange} />
            <Text style={styles.headerTitle}>LIVE ACTIVATION GATE</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <CrossIcon size={20} color={colors.muted} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.orange} />
            <Text style={styles.loadingText}>Evaluating 5 Non-Negotiable Gates…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Overview Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.sectionEyebrow}>GATE VERIFICATION AUDIT</Text>
              <Text style={styles.summaryTitle}>
                {report?.eligibleForLive
                  ? 'Strategy Verified for Live Capital'
                  : 'Activation Gates Locked'}
              </Text>
              <Text style={styles.summaryDescription}>{report?.summary}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statVal}>{report?.totalTradesEvaluated ?? 0}</Text>
                  <Text style={styles.statLbl}>TRADES EVALUATED</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statVal}>{report?.demoPeriodDays ?? 0}d</Text>
                  <Text style={styles.statLbl}>DEMO DURATION</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statVal}>
                    ${report?.monteCarlo.simulatedMaxDrawdown.toFixed(2) ?? '0.00'}
                  </Text>
                  <Text style={styles.statLbl}>95% MC DRAWDOWN</Text>
                </View>
              </View>
            </View>

            {/* 5 Non-Negotiable Gate Cards */}
            <Text style={styles.sectionEyebrow}>MANDATORY GATES</Text>

            {report?.gates.map((gate) => (
              <View key={gate.id} style={styles.gateCard}>
                <View style={styles.gateHeader}>
                  <View style={styles.iconCircle}>
                    {gate.passed ? (
                      <CheckIcon size={16} color={colors.orange} />
                    ) : (
                      <CrossIcon size={16} color={colors.muted} />
                    )}
                  </View>
                  <View style={styles.gateTitleBlock}>
                    <Text style={styles.gateTitle}>{gate.title}</Text>
                    <Text style={styles.gateMetric}>
                      Current: {gate.currentValue} {gate.unit} · Required: {gate.threshold} {gate.unit}
                    </Text>
                  </View>
                </View>
                <Text style={styles.gateDesc}>{gate.description}</Text>
              </View>
            ))}

            {/* Action Button */}
            <Pressable
              accessibilityRole="button"
              disabled={!report?.eligibleForLive || activating}
              onPress={handleActivate}
              style={({ pressed }) => [
                styles.activateBtn,
                !report?.eligibleForLive && styles.activateBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              {activating ? (
                <ActivityIndicator color="#080808" />
              ) : (
                <Text
                  style={[
                    styles.activateBtnText,
                    !report?.eligibleForLive && styles.activateBtnTextDisabled,
                  ]}
                >
                  {report?.eligibleForLive
                    ? 'Activate Live Trading Mode'
                    : 'Live Mode Locked (Gates Required)'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
  },
  sectionEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  summaryDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  statCol: {
    alignItems: 'center',
  },
  statVal: {
    color: colors.orange,
    fontSize: 15,
    fontWeight: '800',
  },
  statLbl: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  gateCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  gateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitleBlock: {
    flex: 1,
  },
  gateTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  gateMetric: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  gateDesc: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  activateBtn: {
    minHeight: 52,
    backgroundColor: colors.orange,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  activateBtnDisabled: {
    backgroundColor: '#262626',
  },
  activateBtnText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '800',
  },
  activateBtnTextDisabled: {
    color: colors.muted,
  },
  pressed: {
    opacity: 0.8,
  },
});

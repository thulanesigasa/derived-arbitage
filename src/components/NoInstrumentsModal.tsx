import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const warningTriangleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
`;

interface NoInstrumentsModalProps {
  visible: boolean;
  onDismiss: () => void;
  onAddInstruments: () => void;
}

export function NoInstrumentsModal({
  visible,
  onDismiss,
  onAddInstruments,
}: NoInstrumentsModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={styles.backdropTouchArea} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <SvgXml xml={warningTriangleSvg} width={28} height={28} color="#FF6B00" />
          </View>

          <Text style={styles.title}>Unable to Place Trades</Text>
          <Text style={styles.body}>
            No synthetic instruments are selected in your active trading basket. The EA cannot execute orders or generate signals without active market feeds.
          </Text>

          <View style={styles.actionsColumn}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              onPress={onAddInstruments}
              accessibilityRole="button"
              accessibilityLabel="Add Instruments"
            >
              <Text style={styles.primaryBtnText}>Add Instruments</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.secondaryBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdropTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#282828',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  actionsColumn: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#FF6B00',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#080808',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryBtnText: {
    color: '#9A9A9A',
    fontSize: 13,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.75,
  },
});

import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
  Animated,
  PanResponder,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

// Download arrow SVG (from svgrepo.com — CC0 licensed)
const downloadSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>
`;

interface UpdateModalProps {
  visible: boolean;
  isDownloading: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  accent?: string;
}

/**
 * UpdateModal
 *
 * Modern bottom-sheet modal that appears when an in-app Over-The-Air (OTA) update is detected.
 *
 * Calibrated strictly per Rule 15 & Rule 19:
 * - App logo: 50x50 centered inside a 68x68 rounded container (border radius 18px, image radius 12px)
 * - 60-30-10 Dark Palette: #080808 base backdrop, #161616 surface sheet, #FF6B00 primary action
 * - Gesture handle with smooth PanResponder swipe-down dismissal
 * - Backdrop tap-outside dismissal
 */
export function UpdateModal({
  visible,
  isDownloading,
  onUpdate,
  onDismiss,
  accent = '#FF6B00',
}: UpdateModalProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  // Reset sheet translation when modal becomes visible
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  // PanResponder for smooth drag-down dismissal
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isDownloading,
      onMoveShouldSetPanResponder: (_, gestureState) => !isDownloading && gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: 500,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onDismiss();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        {/* Tap anywhere outside the sheet to dismiss */}
        <TouchableWithoutFeedback onPress={onDismiss} disabled={isDownloading}>
          <View style={styles.backdropTouchArea} />
        </TouchableWithoutFeedback>

        {/* Draggable bottom-sheet container */}
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Pill drag-down handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handleIndicator} />
          </View>

          {/* App Logo: 50x50 inside a 68x68 rounded container (Rule 15 & 19) */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* Headings */}
          <Text style={styles.title}>Falcon EA Update Ready</Text>
          <Text style={styles.body}>
            A fresh algorithmic update for Derived Arbitrage is ready.
            Tap below to apply the latest strategies and improvements instantly without reinstalling.
          </Text>

          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accent }]}
            onPress={onUpdate}
            disabled={isDownloading}
            activeOpacity={0.85}
          >
            {isDownloading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <SvgXml xml={downloadSvg} width={18} height={18} color="#FFFFFF" style={styles.btnIcon} />
                <Text style={styles.btnText}>Update Now</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Secondary dismiss button */}
          {!isDownloading && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.dismissText}>Remind me later</Text>
            </TouchableOpacity>
          )}

          {isDownloading && (
            <Text style={styles.downloadingHint}>Downloading bundle, reloading app shortly...</Text>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdropTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#161616', // 30% Panel surface (60-30-10)
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#282828',
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 24,
  },
  handleContainer: {
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#383838',
  },
  logoContainer: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#2D1405',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 6,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  logoImage: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: '#9A9A9A',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width: '100%',
    minHeight: 52,
    marginBottom: 8,
  },
  btnIcon: {
    marginRight: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  dismissText: {
    color: '#9A9A9A',
    fontSize: 14,
    fontWeight: '500',
  },
  downloadingHint: {
    marginTop: 8,
    color: '#9A9A9A',
    fontSize: 13,
    textAlign: 'center',
  },
});

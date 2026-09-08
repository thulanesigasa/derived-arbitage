import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Custom Pill Toggle Switch inspired by Uiverse.io (by ErzenXz).
 * Adapted for React Native with smooth sliding animation and Rule 15 (48x48 touch target, 60-30-10 palette).
 */
export function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleSwitchProps) {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 27],
  });

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#142236', '#2DD4BF'],
  });

  const borderColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#283D56', '#22AB99'],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={styles.touchArea}
    >
      <Animated.View style={[styles.track, { backgroundColor, borderColor }]}>
        <Animated.View style={[styles.handle, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    minHeight: 48,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    width: 54,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    justifyContent: 'center',
  },
  handle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 4,
  },
});

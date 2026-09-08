import { Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AppHeaderProps {
  eyebrow: string;
  title: string;
}

export function AppHeader({ eyebrow, title }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 24)
      : Math.max(insets.top, 54);
  const appBarHeight = Platform.OS === 'android' ? 56 : 96;

  return (
    <View style={[styles.container, { paddingTop: statusBarHeight }]}>
      <View style={[styles.appBar, { height: appBarHeight }]}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#080808',
    borderBottomWidth: 1,
    borderBottomColor: '#202020',
  },
  appBar: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#FF6B00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
});

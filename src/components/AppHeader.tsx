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
    backgroundColor: '#07111F',
    borderBottomWidth: 1,
    borderBottomColor: '#21344C',
  },
  appBar: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#2DD4BF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
});

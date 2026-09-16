import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

const chevronLeftSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 18 9 12 15 6"/>
</svg>
`;

interface AppHeaderProps {
  eyebrow: string;
  title: string;
  onBack?: () => void;
  backLabel?: string;
}

export function AppHeader({ eyebrow, title, onBack, backLabel = 'Back' }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 24)
      : Math.max(insets.top, 54);
  const appBarHeight = Platform.OS === 'android' ? 56 : 96;

  return (
    <View style={[styles.container, { paddingTop: statusBarHeight }]}>
      <View style={[styles.appBar, { height: appBarHeight }]}>
        {onBack ? (
          <View style={styles.headerWithBackRow}>
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              hitSlop={12}
            >
              <SvgXml xml={chevronLeftSvg} width={18} height={18} color="#FF6B00" />
              <Text style={styles.backBtnText}>{backLabel}</Text>
            </Pressable>

            <View style={styles.titleWrapWithBack}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
          </>
        )}
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
  headerWithBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 40,
  },
  backBtnPressed: {
    opacity: 0.7,
    backgroundColor: '#202020',
  },
  backBtnText: {
    color: '#FF6B00',
    fontSize: 13,
    fontWeight: '700',
  },
  titleWrapWithBack: {
    flex: 1,
  },
  eyebrow: {
    color: '#FF6B00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 1,
  },
});

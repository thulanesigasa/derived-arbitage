import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import type { ControllerState } from '../types';

interface ActivityScreenProps {
  state: ControllerState | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const colors = {
  bg: '#07111F',
  panel: '#0D1A2B',
  border: '#21344C',
  text: '#F1F5F9',
  muted: '#91A4BB',
  cyan: '#2DD4BF',
};

export function ActivityScreen({ state, refreshing, onRefresh }: ActivityScreenProps) {
  const activities = state?.activity ?? [];

  return (
    <View style={styles.screenRoot}>
      <AppHeader eyebrow="AUDIT & EVENT LOG" title="Activity" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl tintColor={colors.cyan} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            CHRONOLOGICAL EVENTS ({activities.length})
          </Text>

          {activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No logged events</Text>
              <Text style={styles.emptyHint}>Robot actions and risk limits will appear here in real time.</Text>
            </View>
          ) : (
            activities.map((item, index) => {
              const isLast = index === activities.length - 1;
              const markColor =
                item.kind === 'danger'
                  ? '#FB7185'
                  : item.kind === 'success'
                  ? colors.cyan
                  : colors.muted;

              return (
                <View key={item.id} style={[styles.activityRow, !isLast && styles.rowBorder]}>
                  <View style={[styles.mark, { backgroundColor: markColor }]} />
                  <View style={styles.textWrap}>
                    <Text style={styles.message}>{item.message}</Text>
                    <Text style={styles.time}>
                      {new Date(item.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 16 },

  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  textWrap: {
    flex: 1,
  },
  message: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  time: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },

  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

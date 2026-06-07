import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import type { FeedItem } from '../../utils/admissionsFeed'

interface Source {
  label?: string
  url: string
}

interface Props {
  item: FeedItem
  onClose: () => void
}

export function NewsDetailModal({ item, onClose }: Props) {
  const { theme: t, typo } = useTheme()

  const sources: Source[] = Array.isArray(item.sources)
    ? (item.sources as Source[]).filter((s) => typeof s.url === 'string' && s.url.length > 0)
    : []

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: t.bg }]}
        edges={['top', 'bottom']}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: t.divider }]}>
          <Text
            style={[styles.headerTitle, { color: t.textPrimary, fontSize: typo.base }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Text style={[styles.closeText, { color: t.accent, fontSize: typo.base }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Meta row */}
          <View style={styles.metaRow}>
            {item.schoolName != null && item.schoolName.length > 0 ? (
              <Text style={[styles.meta, { color: t.textSecondary, fontSize: typo.xs }]}>
                {item.schoolName}
              </Text>
            ) : null}
            {item.reportDate.length > 0 ? (
              <Text style={[styles.meta, { color: t.textTertiary, fontSize: typo.xs }]}>
                {item.reportDate}
              </Text>
            ) : null}
          </View>

          {/* Body */}
          <Text style={[styles.body, { color: t.textPrimary, fontSize: typo.sm }]}>
            {item.body}
          </Text>

          {/* Action Required */}
          {item.actionRequired != null && item.actionRequired.length > 0 ? (
            <View style={[styles.actionBox, { backgroundColor: t.surface2, borderColor: t.accent }]}>
              <Text style={[styles.actionLabel, { color: t.accent, fontSize: typo.xs }]}>
                ACTION REQUIRED
              </Text>
              <Text style={[styles.actionText, { color: t.textPrimary, fontSize: typo.sm }]}>
                {item.actionRequired}
              </Text>
            </View>
          ) : null}

          {/* Sources */}
          {sources.length > 0 ? (
            <View style={styles.sourcesSection}>
              <Text style={[styles.sourcesLabel, { color: t.textSecondary, fontSize: typo.xs }]}>
                SOURCES
              </Text>
              {sources.map((src, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(src.url)}
                  style={[styles.sourceLink, { borderColor: t.divider }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sourceLinkText, { color: t.accent, fontSize: typo.xs }]}>
                    {src.label != null && src.label.length > 0 ? src.label : src.url}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontWeight: '600',
    lineHeight: 22,
  },
  closeBtn: {
    paddingTop: 2,
  },
  closeText: {
    fontWeight: '600',
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  meta: {
    fontWeight: '500',
  },
  body: {
    lineHeight: 22,
    fontWeight: '400',
  },
  actionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  actionLabel: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  actionText: {
    fontWeight: '400',
    lineHeight: 20,
  },
  sourcesSection: {
    gap: 8,
  },
  sourcesLabel: {
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  sourceLink: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceLinkText: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})

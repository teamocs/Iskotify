import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, Modal, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSchoolSearch, MIN_QUERY_LENGTH } from '../hooks/useSchoolSearch'
import { useTheme } from '../theme/ThemeContext'
import type { SchoolResult } from '../hooks/useSchoolSearch'

interface SchoolPickerProps {
  value: string
  onChange: (school: string) => void
  /** Fires with the picked school's region/province when known (DB results only). */
  onSelectMeta?: (meta: { region?: string; province?: string }) => void
}

export function SchoolPicker({ value, onChange, onSelectMeta }: SchoolPickerProps) {
  const [modalVisible, setModalVisible] = useState(false)
  const { query, setQuery, results, loading, error, errorMessage, retry, contributeSchool } = useSchoolSearch()
  const { theme: t, typo, isDark } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    input: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.md,
      color: t.textPrimary,
    },
    trigger: { justifyContent: 'center' },
    triggerText: { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary },
    triggerTextPlaceholder: { color: t.textTertiary },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalDismissOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: '82%',
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    // Bottom sheet handle
    handle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.lg, color: t.textPrimary, flex: 1 },
    closeText: { fontFamily: 'Lexend_400Regular', fontSize: 18, color: t.textSecondary, padding: 4 },
    searchInput: { marginBottom: 10 },
    contentArea: { flex: 1, minHeight: 200 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    hintText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textTertiary,
      textAlign: 'center',
      paddingTop: 40,
      paddingHorizontal: 8,
    },
    sourceHeader: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: 10,
      color: t.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
      marginTop: 2,
    },
    listRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.surfaceSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    listTextWrap: { flex: 1 },
    listName: { fontFamily: 'Outfit_600SemiBold', fontSize: typo.md, color: t.textPrimary },
    listSubtitle: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
      marginTop: 2,
    },
    sourceBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      flexShrink: 0,
    },
    sourceBadgeDb: {
      backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(22,163,74,0.12)',
    },
    sourceBadgeDbTxt: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: 9,
      color: isDark ? '#4ade80' : '#16a34a',
    },
    sourceBadgePlaces: {
      backgroundColor: t.accentSurface,
    },
    sourceBadgePlacesTxt: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: 9,
      color: t.accentText,
    },
    errorText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.accentText,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    errorDetail: {
      fontFamily: 'Lexend_400Regular',
      fontSize: 11,
      color: t.textTertiary,
      textAlign: 'center',
      paddingHorizontal: 16,
      marginTop: 6,
    },
    retryBtn: { marginTop: 12, alignItems: 'center' },
    fallbackRow: {
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: t.surfaceSubtle,
      marginTop: 8,
    },
    fallbackLabel: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary },
    fallbackLink: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.md,
      color: t.accentText,
      marginTop: 2,
    },
  }), [t, typo, isDark])

  const closeModal = useCallback(() => {
    setQuery('')
    setModalVisible(false)
  }, [setQuery])

  const selectResult = useCallback((r: SchoolResult) => {
    onChange(r.name)
    onSelectMeta?.({ region: r.region, province: r.province })
    setQuery('')
    setModalVisible(false)
    // Backfill user-selected Places results into the schools directory so
    // future users searching the same school find it in the DB layer.
    if (r.source === 'places') void contributeSchool(r)
  }, [onChange, onSelectMeta, setQuery, contributeSchool])

  const selectTyped = useCallback(() => {
    const name = query.trim()
    if (!name) return
    onChange(name)
    onSelectMeta?.({}) // unknown region for free-typed schools
    setQuery('')
    setModalVisible(false)
    void contributeSchool({ name, subtitle: '', source: 'manual' })
  }, [onChange, onSelectMeta, query, setQuery, contributeSchool])

  const renderItem = useCallback(({ item }: { item: SchoolResult }) => (
    <TouchableOpacity onPress={() => selectResult(item)} style={s.listRow}>
      <View style={s.listTextWrap}>
        <Text style={s.listName}>{item.name}</Text>
        {item.subtitle ? <Text style={s.listSubtitle}>{item.subtitle}</Text> : null}
      </View>
      {item.source === 'database' && (
        <View style={[s.sourceBadge, s.sourceBadgeDb]}>
          <Text style={s.sourceBadgeDbTxt}>DB</Text>
        </View>
      )}
      {item.source === 'places' && (
        <View style={[s.sourceBadge, s.sourceBadgePlaces]}>
          <Text style={s.sourceBadgePlacesTxt}>Maps</Text>
        </View>
      )}
    </TouchableOpacity>
  ), [selectResult, s])

  function renderBody() {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      return <Text style={s.hintText}>Type at least {MIN_QUERY_LENGTH} characters to search</Text>
    }
    if (loading) {
      return (
        <View style={s.loadingContainer}>
          <ActivityIndicator testID="school-search-loading" color={t.accentText} />
          <Text style={[s.hintText, { paddingTop: 12 }]}>Searching...</Text>
        </View>
      )
    }
    if (error) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 24 }}>
          <Text style={s.errorText}>Could not search schools.</Text>
          {errorMessage && (
            <Text style={s.errorDetail}>{errorMessage}</Text>
          )}
          <TouchableOpacity onPress={retry} style={s.retryBtn}>
            <Text style={[s.errorText, { color: t.accentText }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    if (results.length === 0) {
      return <Text style={s.hintText}>No schools found.</Text>
    }

    return (
      <FlatList
        data={results}
        keyExtractor={(r: SchoolResult, i) => `${r.source}-${r.name}-${i}`}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    )
  }

  return (
    <>
      <TouchableOpacity
        testID="school-picker-trigger"
        onPress={() => { setQuery(''); setModalVisible(true) }}
        style={[s.input, s.trigger]}
      >
        <Text style={[s.triggerText, !value && s.triggerTextPlaceholder]} numberOfLines={1}>
          {value || 'Search your school...'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={s.modalBackdrop}>
          <TouchableOpacity
            style={s.modalDismissOverlay}
            activeOpacity={1}
            accessibilityLabel="Close school picker"
            accessibilityRole="button"
            onPress={closeModal}
          />
          <KeyboardAvoidingView
            behavior="padding"
            style={{ width: '100%' }}
          >
          <View style={s.sheet}>
            {/* iOS-style drag handle */}
            <View style={s.handle} />

            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>School / University</Text>
              <TouchableOpacity onPress={closeModal} accessibilityLabel="Close">
                <Text style={s.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[s.input, s.searchInput]}
              placeholder="Search schools..."
              placeholderTextColor={t.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              returnKeyType="search"
              autoFocus
            />

            <View style={s.contentArea}>
              {renderBody()}
            </View>

            {query.length >= 1 && (
              <TouchableOpacity onPress={selectTyped} style={s.fallbackRow}>
                <Text style={s.fallbackLabel}>Can't find your school?</Text>
                <Text style={s.fallbackLink}>Use "{query}" ›</Text>
              </TouchableOpacity>
            )}
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  )
}

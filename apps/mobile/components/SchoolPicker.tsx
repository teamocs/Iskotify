import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, Modal, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSchoolSearch } from '../hooks/useSchoolSearch'
import { useTheme } from '../theme/ThemeContext'
import type { SchoolResult } from '../hooks/useSchoolSearch'

interface SchoolPickerProps {
  value: string
  onChange: (school: string) => void
}

export function SchoolPicker({ value, onChange }: SchoolPickerProps) {
  const [modalVisible, setModalVisible] = useState(false)
  const { query, setQuery, results, loading, error, errorMessage, retry } = useSchoolSearch()
  const { theme: t, typo } = useTheme()

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
      maxHeight: '82%',
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.lg, color: t.textPrimary, flex: 1 },
    closeText: { fontFamily: 'Lexend_400Regular', fontSize: 18, color: t.textSecondary, padding: 4 },
    searchInput: { marginBottom: 10 },
    contentArea: { flex: 1 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    hintText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textTertiary,
      textAlign: 'center',
      paddingTop: 40,
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
    listRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.surfaceSubtle,
    },
    listName: { fontFamily: 'Outfit_600SemiBold', fontSize: typo.md, color: t.textPrimary },
    listSubtitle: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
      marginTop: 2,
    },
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
  }), [t, typo])

  const closeModal = useCallback(() => {
    setQuery('')
    setModalVisible(false)
  }, [setQuery])

  const selectResult = useCallback((r: SchoolResult) => {
    onChange(r.name)
    setQuery('')
    setModalVisible(false)
  }, [onChange, setQuery])

  const selectTyped = useCallback(() => {
    onChange(query)
    setQuery('')
    setModalVisible(false)
  }, [onChange, query, setQuery])

  const renderItem = useCallback(({ item }: { item: SchoolResult }) => (
    <TouchableOpacity onPress={() => selectResult(item)} style={s.listRow}>
      <Text style={s.listName}>{item.name}</Text>
      <Text style={s.listSubtitle}>{item.subtitle}</Text>
    </TouchableOpacity>
  ), [selectResult])

  function renderBody() {
    if (query.length < 3) {
      return <Text style={s.hintText}>Type at least 3 characters to search</Text>
    }
    if (loading) {
      return (
        <View style={s.loadingContainer}>
          <ActivityIndicator testID="school-search-loading" color={t.accentText} />
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
    return (
      <FlatList
        data={results}
        keyExtractor={r => `${r.name}-${r.subtitle}`}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        ListEmptyComponent={<Text style={s.hintText}>No schools found.</Text>}
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

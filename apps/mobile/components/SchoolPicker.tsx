import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, Modal, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSchoolPicker } from '../hooks/useSchoolPicker'
import type { PickerLevel } from '../hooks/useSchoolPicker'

interface SchoolPickerProps {
  value: string
  onChange: (school: string) => void
}

const LEVEL_LABEL: Record<PickerLevel, string> = {
  region: 'Select a region...',
  province: 'Select a province...',
  city: 'Select a city...',
  school: 'Select a school...',
}

export function SchoolPicker({ value, onChange }: SchoolPickerProps) {
  const [modalVisible, setModalVisible] = useState(false)
  const [isOthers, setIsOthers] = useState(false)
  const [search, setSearch] = useState('')
  const picker = useSchoolPicker()

  const filteredList = useMemo(() => {
    const q = search.toLowerCase()
    return picker.list.filter(item => item.toLowerCase().includes(q))
  }, [picker.list, search])

  function openModal() {
    picker.reset()
    setSearch('')
    setIsOthers(false)
    setModalVisible(true)
  }

  const handleSelectItem = useCallback((item: string) => {
    if (picker.level === 'region') {
      setSearch('')
      void picker.selectRegion(item)
    } else if (picker.level === 'province') {
      setSearch('')
      picker.selectProvince(item)
    } else if (picker.level === 'city') {
      setSearch('')
      picker.selectCity(item)
    } else {
      onChange(item)
      setIsOthers(false)
      setModalVisible(false)
    }
  }, [picker.level, picker.selectRegion, picker.selectProvince, picker.selectCity, onChange])

  const renderItem = useCallback(({ item }: { item: string }) => (
    <TouchableOpacity onPress={() => handleSelectItem(item)} style={s.listRow}>
      <Text style={s.listText}>{item}</Text>
      {picker.level !== 'school' && <Text style={s.chevron}>›</Text>}
    </TouchableOpacity>
  ), [handleSelectItem, picker.level])

  function handleOthers() {
    setIsOthers(true)
    onChange('')
    setModalVisible(false)
  }

  return (
    <>
      <TouchableOpacity
        testID="school-picker-trigger"
        onPress={openModal}
        style={[s.input, s.trigger]}
      >
        <Text
          style={[s.triggerText, !value && s.triggerTextPlaceholder]}
          numberOfLines={1}
        >
          {value || 'Search your school...'}
        </Text>
      </TouchableOpacity>

      {isOthers && (
        <TextInput
          style={[s.input, s.othersInput]}
          placeholder="Type your school name"
          placeholderTextColor="rgba(255,255,255,0.28)"
          value={value}
          onChangeText={onChange}
          autoCapitalize="words"
          returnKeyType="done"
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <TouchableOpacity
            style={s.modalDismissOverlay}
            activeOpacity={1}
            accessibilityLabel="Close school picker"
            accessibilityRole="button"
            onPress={() => setModalVisible(false)}
          />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select your school</Text>

            {/* Breadcrumb */}
            <View style={s.breadcrumb}>
              {picker.selectedRegion ? (
                <>
                  <TouchableOpacity onPress={() => { setSearch(''); picker.jumpToLevel('region') }}>
                    <Text style={s.crumbActive}>{picker.selectedRegion}</Text>
                  </TouchableOpacity>
                  <Text style={s.crumbSep}>›</Text>
                </>
              ) : null}
              {picker.selectedProvince ? (
                <>
                  <TouchableOpacity onPress={() => { setSearch(''); picker.jumpToLevel('province') }}>
                    <Text style={s.crumbActive}>{picker.selectedProvince}</Text>
                  </TouchableOpacity>
                  <Text style={s.crumbSep}>›</Text>
                </>
              ) : null}
              {picker.selectedCity ? (
                <>
                  <TouchableOpacity onPress={() => { setSearch(''); picker.jumpToLevel('city') }}>
                    <Text style={s.crumbActive}>{picker.selectedCity}</Text>
                  </TouchableOpacity>
                  <Text style={s.crumbSep}>›</Text>
                </>
              ) : null}
              <Text style={s.crumbPending}>{LEVEL_LABEL[picker.level]}</Text>
            </View>

            {/* Search */}
            <TextInput
              style={[s.input, s.searchInput]}
              placeholder="Type to search..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              returnKeyType="search"
              autoFocus
            />

            {picker.loading ? (
              <View style={s.loadingContainer}>
                <ActivityIndicator testID="school-picker-loading" color="#fff" />
              </View>
            ) : picker.error ? (
              <View style={{ alignItems: 'center', paddingTop: 24 }}>
                <Text style={s.errorText}>{picker.error}</Text>
                <TouchableOpacity onPress={picker.retryLoadRegions} style={{ marginTop: 12 }}>
                  <Text style={[s.errorText, { color: '#fca5a5' }]}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={filteredList}
                keyExtractor={item => item}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={100}
                renderItem={renderItem}
                ListFooterComponent={
                  picker.level === 'school' ? (
                    <TouchableOpacity onPress={handleOthers} style={s.listRow}>
                      <Text style={s.othersText}>Others — type my school name</Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: '#fff',
  },
  trigger: {
    justifyContent: 'center',
  },
  triggerText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: '#fff',
  },
  triggerTextPlaceholder: {
    color: 'rgba(255,255,255,0.28)',
  },
  othersInput: {
    marginTop: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalDismissOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 12,
    alignItems: 'center',
  },
  crumbActive: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 11,
    color: '#fca5a5',
  },
  crumbSep: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.30)',
  },
  crumbPending: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.40)',
  },
  searchInput: {
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 13,
    color: '#fff',
    flex: 1,
  },
  chevron: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 18,
    marginLeft: 8,
  },
  othersText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 13,
    color: 'rgba(252,165,165,0.8)',
  },
  errorText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 12,
    color: 'rgba(252,165,165,0.8)',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
})

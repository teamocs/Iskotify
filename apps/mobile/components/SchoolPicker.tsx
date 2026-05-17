import { useState, useCallback } from 'react'
import {
  View, Text, TextInput, FlatList, Modal, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSchoolPicker } from '../hooks/useSchoolPicker'

interface SchoolPickerProps {
  value: string
  onChange: (school: string) => void
}

export function SchoolPicker({ value, onChange }: SchoolPickerProps) {
  const [modalVisible, setModalVisible] = useState(false)
  const [isOthers, setIsOthers] = useState(false)
  const [search, setSearch] = useState('')
  const picker = useSchoolPicker()

  const filteredList = picker.list.filter(item =>
    item.toLowerCase().includes(search.toLowerCase()),
  )

  const openModal = useCallback(() => {
    picker.reset()
    setSearch('')
    setIsOthers(false)
    setModalVisible(true)
  }, [picker])

  function handleSelectItem(item: string) {
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
      setModalVisible(false)
    }
  }

  function handleOthers() {
    setIsOthers(true)
    onChange('')
    setModalVisible(false)
  }

  const levelLabel: Record<string, string> = {
    region: 'Select a region...',
    province: 'Select a province...',
    city: 'Select a city...',
    school: 'Select a school...',
  }

  return (
    <>
      <TouchableOpacity
        testID="school-picker-trigger"
        onPress={openModal}
        style={[s.input, { justifyContent: 'center' }]}
      >
        <Text
          style={{ fontFamily: 'Lexend_400Regular', fontSize: 14, color: value ? '#fff' : 'rgba(255,255,255,0.28)' }}
          numberOfLines={1}
        >
          {value || 'Search your school...'}
        </Text>
      </TouchableOpacity>

      {isOthers && (
        <TextInput
          style={[s.input, { marginTop: 10 }]}
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select your school</Text>

            {/* Breadcrumb */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12, alignItems: 'center' }}>
              {picker.selectedRegion ? (
                <>
                  <TouchableOpacity onPress={() => { setSearch(''); picker.jumpToLevel('province') }}>
                    <Text style={s.crumbActive}>{picker.selectedRegion}</Text>
                  </TouchableOpacity>
                  <Text style={s.crumbSep}>›</Text>
                </>
              ) : null}
              {picker.selectedProvince ? (
                <>
                  <TouchableOpacity onPress={() => { setSearch(''); picker.jumpToLevel('city') }}>
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
              <Text style={s.crumbPending}>{levelLabel[picker.level]}</Text>
            </View>

            {/* Search */}
            <TextInput
              style={[s.input, { marginBottom: 10 }]}
              placeholder="Type to search..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />

            {picker.loading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator testID="school-picker-loading" color="#fff" />
              </View>
            ) : picker.error ? (
              <Text style={s.errorText}>{picker.error}</Text>
            ) : (
              <FlatList
                data={filteredList}
                keyExtractor={item => item}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={100}
                ListFooterComponent={
                  picker.level === 'school' ? (
                    <TouchableOpacity onPress={handleOthers} style={s.listRow}>
                      <Text style={s.othersText}>Others — type my school name</Text>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleSelectItem(item)} style={s.listRow}>
                    <Text style={s.listText}>{item}</Text>
                    {picker.level !== 'school' && <Text style={s.chevron}>›</Text>}
                  </TouchableOpacity>
                )}
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

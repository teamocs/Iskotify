import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, FlatList,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { SchoolPicker } from '../components/SchoolPicker'

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  exam_date: string | null
}

const GRADES = [9, 10, 11, 12] as const

export default function OnboardingScreen() {
  const db = useDb()

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1)
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)

  // Step 2 state
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selecting, setSelecting] = useState(false)

  // Fetch listings when we reach step 2
  useEffect(() => {
    if (step !== 2) return
    setLoadingListings(true)
    supabase
      .from('listings')
      .select('id,slug,title,type,exam_date')
      .in('status', ['active', 'upcoming'])
      .order('title')
      .then(({ data, error }) => {
        if (error) console.error('[onboarding] fetch listings:', error)
        setListings(data ?? [])
        setLoadingListings(false)
      })
  }, [step])

  function handleNextStep() {
    if (!fullName.trim()) return
    if (!gradeLevel) return
    setStep(2)
  }

  async function handleSelectListing(listing: ListingRow) {
    setSelecting(true)
    try {
      await db.insert(userSettings)
        .values({
          id: 1,
          selectedListingSlug: listing.slug,
          lastSyncedAt: 0,
          fullName: fullName.trim(),
          school: school.trim(),
          gradeLevel: gradeLevel ?? undefined,
        })
        .onConflictDoUpdate({
          target: userSettings.id,
          set: {
            selectedListingSlug: listing.slug,
            lastSyncedAt: 0,
            fullName: fullName.trim(),
            school: school.trim(),
            gradeLevel: gradeLevel ?? undefined,
          },
        })
      await syncOnLaunch(db)
      router.replace('/(tabs)')
    } catch (e) {
      console.error('[onboarding] select error:', e)
    } finally {
      setSelecting(false)
    }
  }

  if (step === 1) {
    const isValid = fullName.trim().length > 0 && gradeLevel !== null
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

            {/* Progress dots */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 28 }}>
              <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
              <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
            </View>

            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#fff', marginBottom: 6 }}>
              Tell us about yourself
            </Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 28, lineHeight: 19 }}>
              This helps us personalise your experience.
            </Text>

            {/* Full Name */}
            <Text style={labelStyle}>Full Name *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Juan dela Cruz"
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* School */}
            <Text style={[labelStyle, { marginTop: 18 }]}>School / University</Text>
            <SchoolPicker value={school} onChange={setSchool} />

            {/* Grade Level */}
            <Text style={[labelStyle, { marginTop: 18 }]}>Grade Level *</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 10 }}>
              Philippines K-12 curriculum — select your current grade
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GRADES.map(g => {
                const active = gradeLevel === g
                return (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGradeLevel(g)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                      backgroundColor: active ? '#831626' : 'rgba(255,255,255,0.08)',
                      borderWidth: 1,
                      borderColor: active ? '#831626' : 'rgba(255,255,255,0.16)',
                    }}
                  >
                    <Text style={{
                      fontFamily: 'Outfit_700Bold',
                      fontSize: 13,
                      color: active ? '#fff' : 'rgba(255,255,255,0.50)',
                    }}>
                      G{g}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Next */}
            <TouchableOpacity
              onPress={handleNextStep}
              disabled={!isValid}
              style={{
                marginTop: 32,
                backgroundColor: isValid ? 'rgba(128,0,0,0.82)' : 'rgba(255,255,255,0.08)',
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, color: isValid ? '#fff' : 'rgba(255,255,255,0.28)' }}>
                Next →
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>

      </SafeAreaView>
    )
  }

  // Step 2 — Listing picker
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      {/* Progress dots */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 24, marginBottom: 0 }}>
        <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => setStep(1)} style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#fff', marginBottom: 4 }}>
          Which exam are you{'\n'}preparing for?
        </Text>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>
          You can change this later from your profile.
        </Text>
      </View>

      {loadingListings ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelectListing(item)}
              disabled={selecting}
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 18,
                padding: 16,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.14)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: item.type === 'exam' ? 'rgba(128,0,0,0.18)' : 'rgba(34,197,94,0.14)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 16 }}>{item.type === 'exam' ? '📋' : '🎓'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: '#fff' }}>{item.title}</Text>
                  {item.exam_date ? (
                    <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                      {new Date(item.exam_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.30)', fontSize: 18 }}>›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {selecting ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.50)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const labelStyle = {
  fontFamily: 'Lexend_500Medium' as const,
  fontSize: 12,
  color: 'rgba(255,255,255,0.62)',
  marginBottom: 8,
}

const inputStyle = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.14)',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontFamily: 'Lexend_400Regular' as const,
  fontSize: 14,
  color: '#fff',
}

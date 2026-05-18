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
import { userSettings, flashcards, userProgress } from '../db/schema'
import { SchoolPicker } from '../components/SchoolPicker'

interface ListingRow { id: string; slug: string; title: string; type: string; exam_date: string | null }
interface AssessCard { id: string; question: string; answer: string; topicId: string }

const GRADES = [9, 10, 11, 12] as const
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

// Extract option letter from answer like "C) Mitochondria" → "C"
function answerLetter(answer: string): string {
  return answer.match(/^([A-D])\)/)?.[1] ?? answer.charAt(0)
}

// Parse MCQ options from embedded question text
function parseOptions(question: string): string[] | null {
  const m = question.match(/\bA\)\s*(.*?)\s+B\)\s*(.*?)\s+C\)\s*(.*?)\s+D\)\s*([\s\S]+?)$/)
  if (!m) return null
  return [`A) ${m[1]!.trim()}`, `B) ${m[2]!.trim()}`, `C) ${m[3]!.trim()}`, `D) ${m[4]!.trim()}`]
}

function parseQuestionStem(question: string): string {
  return question.replace(/\s+A\)\s[\s\S]*$/, '').trim()
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

export default function OnboardingScreen() {
  const db = useDb()

  // Step 1
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)

  // Step 2
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState('')

  // Step 3 — pre-assessment
  const [assessCards, setAssessCards] = useState<AssessCard[]>([])
  const [assessIdx, setAssessIdx] = useState(0)
  const [assessResults, setAssessResults] = useState<Array<{ flashcardId: string; correct: boolean; topicId: string }>>([])
  const [assessDone, setAssessDone] = useState(false)
  const [loadingAssess, setLoadingAssess] = useState(true)

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

  // Load assessment cards from local DB once we're on step 3
  useEffect(() => {
    if (step !== 3) return
    setLoadingAssess(true)
    async function loadAssessCards() {
      try {
        const allCards = await db.select({
          id: flashcards.id,
          topicId: flashcards.topicId,
          question: flashcards.question,
          answer: flashcards.answer,
          listingSlugs: flashcards.listingSlugs,
        }).from(flashcards)

        const matching = allCards.filter(fc => {
          try {
            const slugs = JSON.parse(fc.listingSlugs ?? '[]') as string[]
            return slugs.includes(selectedSlug)
          } catch { return false }
        })

        // Only cards with parseable MCQ options
        const mcqCards = matching.filter(fc => parseOptions(fc.question) !== null)
        setAssessCards(shuffle(mcqCards).slice(0, 5))
      } catch (e) {
        console.error('[onboarding] load assess cards:', e)
      } finally {
        setLoadingAssess(false)
      }
    }
    void loadAssessCards()
  }, [step, selectedSlug, db])

  function handleNextStep() {
    if (!fullName.trim() || !gradeLevel) return
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
      setSelectedSlug(listing.slug)
      setStep(3)
    } catch (e) {
      console.error('[onboarding] select error:', e)
    } finally {
      setSelecting(false)
    }
  }

  function handleAssessAnswer(optionLetter: string) {
    const card = assessCards[assessIdx]!
    const correct = optionLetter === answerLetter(card.answer)
    const newResults = [...assessResults, { flashcardId: card.id, correct, topicId: card.topicId }]

    if (assessIdx === assessCards.length - 1) {
      // Save progress to local DB
      const now = Date.now()
      db.transaction(tx => {
        for (const r of newResults) {
          tx.insert(userProgress)
            .values({ flashcardId: r.flashcardId, correct: r.correct, answeredAt: now })
            .run()
        }
      })
      setAssessResults(newResults)
      setAssessDone(true)
    } else {
      setAssessResults(newResults)
      setAssessIdx(i => i + 1)
    }
  }

  function finishOnboarding() {
    router.replace('/(tabs)')
  }

  // ── Step 1: Profile ───────────────────────────────────────────────────────

  if (step === 1) {
    const isValid = fullName.trim().length > 0 && gradeLevel !== null
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 28 }}>
              <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
              <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
              <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
            </View>

            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#fff', marginBottom: 6 }}>
              Tell us about yourself
            </Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 28, lineHeight: 19 }}>
              This helps us personalise your experience.
            </Text>

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

            <Text style={[labelStyle, { marginTop: 18 }]}>School / University</Text>
            <SchoolPicker value={school} onChange={setSchool} />

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
                      flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                      backgroundColor: active ? '#831626' : 'rgba(255,255,255,0.08)',
                      borderWidth: 1, borderColor: active ? '#831626' : 'rgba(255,255,255,0.16)',
                    }}
                  >
                    <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 13, color: active ? '#fff' : 'rgba(255,255,255,0.50)' }}>
                      G{g}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity
              onPress={handleNextStep}
              disabled={!isValid}
              style={{ marginTop: 32, backgroundColor: isValid ? 'rgba(128,0,0,0.82)' : 'rgba(255,255,255,0.08)', borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}
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

  // ── Step 2: Listing picker ────────────────────────────────────────────────

  if (step === 2) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 24, marginBottom: 0 }}>
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
          <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
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
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.type === 'exam' ? 'rgba(128,0,0,0.18)' : 'rgba(34,197,94,0.14)', alignItems: 'center', justifyContent: 'center' }}>
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
            <Text style={{ color: 'rgba(255,255,255,0.70)', fontFamily: 'Lexend_400Regular', marginTop: 12, fontSize: 12 }}>Syncing your content…</Text>
          </View>
        ) : null}
      </SafeAreaView>
    )
  }

  // ── Step 3: Pre-assessment ────────────────────────────────────────────────

  if (loadingAssess) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={{ color: 'rgba(255,255,255,0.50)', marginTop: 12, fontFamily: 'Lexend_400Regular', fontSize: 12 }}>
          Preparing your assessment…
        </Text>
      </SafeAreaView>
    )
  }

  // No MCQ cards available → skip straight to app
  if (assessCards.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 10 }}>
          You're all set!
        </Text>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', marginBottom: 32 }}>
          No pre-assessment available yet. Start practicing to build your profile.
        </Text>
        <TouchableOpacity style={assessStyle.primaryBtn} onPress={finishOnboarding}>
          <Text style={assessStyle.primaryBtnTxt}>Start Learning →</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  if (assessDone) {
    const correct = assessResults.filter(r => r.correct).length
    const pct = Math.round((correct / assessResults.length) * 100)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={assessStyle.resultPct}>{pct}%</Text>
          <Text style={assessStyle.resultTitle}>Pre-assessment Complete!</Text>
          <Text style={assessStyle.resultSub}>
            You got {correct} out of {assessResults.length} correct.
            {'\n'}We've calibrated your starting level.
          </Text>
          <View style={assessStyle.resultCounts}>
            <View style={assessStyle.resultCount}>
              <Text style={[assessStyle.resultNum, { color: '#4ade80' }]}>{correct}</Text>
              <Text style={assessStyle.resultLbl}>Correct</Text>
            </View>
            <View style={assessStyle.resultCount}>
              <Text style={[assessStyle.resultNum, { color: '#f87171' }]}>{assessResults.length - correct}</Text>
              <Text style={assessStyle.resultLbl}>Incorrect</Text>
            </View>
          </View>
          <TouchableOpacity style={assessStyle.primaryBtn} onPress={finishOnboarding}>
            <Text style={assessStyle.primaryBtnTxt}>Start Learning →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const card = assessCards[assessIdx]!
  const stem = parseQuestionStem(card.question)
  const options = parseOptions(card.question) ?? OPTION_LETTERS.map(l => `${l}) —`)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 20, marginBottom: 0 }}>
        <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 16, color: '#fff' }}>
            Quick Pre-assessment
          </Text>
          <TouchableOpacity onPress={finishOnboarding} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
              Skip
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
          Question {assessIdx + 1} of {assessCards.length}
        </Text>
        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99, marginTop: 10 }}>
          <View style={{ height: 3, backgroundColor: '#831626', borderRadius: 99, width: `${((assessIdx + 1) / assessCards.length) * 100}%` as any }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Question card */}
        <View style={assessStyle.questionCard}>
          <Text style={assessStyle.questionLabel}>QUESTION</Text>
          <Text style={assessStyle.questionText}>{stem}</Text>
        </View>

        {/* Options */}
        <View style={{ gap: 10, marginTop: 8 }}>
          {options.map((opt, i) => {
            const letter = OPTION_LETTERS[i] ?? String(i)
            return (
              <TouchableOpacity
                key={letter}
                style={assessStyle.optionBtn}
                onPress={() => handleAssessAnswer(letter)}
                activeOpacity={0.75}
              >
                <View style={assessStyle.optionLetter}>
                  <Text style={assessStyle.optionLetterTxt}>{letter}</Text>
                </View>
                <Text style={assessStyle.optionText}>{opt.replace(/^[A-D]\)\s*/, '')}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
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

import { StyleSheet } from 'react-native'

const assessStyle = StyleSheet.create({
  questionCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 20, marginBottom: 4 },
  questionLabel: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: 15, fontWeight: '600', color: '#fff', lineHeight: 23, fontFamily: 'Outfit_600SemiBold' },
  optionBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLetter: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterTxt: { fontSize: 11, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  optionText: { fontSize: 13, color: '#fff', fontFamily: 'Lexend_400Regular', flex: 1, lineHeight: 19 },
  resultPct: { fontSize: 64, fontWeight: '700', color: '#fca5a5', letterSpacing: -2, fontFamily: 'Outfit_700Bold', marginBottom: 8 },
  resultTitle: { fontSize: 18, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 8, textAlign: 'center' },
  resultSub: { fontSize: 13, color: 'rgba(255,255,255,0.50)', fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  resultCounts: { flexDirection: 'row', gap: 40, marginBottom: 32 },
  resultCount: { alignItems: 'center' },
  resultNum: { fontSize: 32, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  resultLbl: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  primaryBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
})

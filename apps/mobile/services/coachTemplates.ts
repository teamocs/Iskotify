import type { HomeStats } from '../hooks/useHomeStats'

type Template = (s: HomeStats) => string

const RING: Template[] = [
  s => s.listing
    ? `Kamusta! Handa ka na ba para sa ${s.listing.title}? Simulan na natin! 💪`
    : `Kamusta! Simulan na natin ang pag-aaral! 💪`,

  s => s.daysLeft != null && s.listing
    ? `${s.daysLeft} days na lang bago ang ${s.listing.title}. Kayang-kaya mo 'yan! 🔥`
    : `Konting effort lang, may progress ka na! 🔥`,

  s => s.weakTopics[0]
    ? `Pansin ko, ${s.weakTopics[0].topicName} mo ay nasa ${s.weakTopics[0].accuracy}% pa lang. Mag-focus tayo dyan ngayon!`
    : `Magaling! Tuloy-tuloy lang ang practice. 👏`,

  s => s.streakDays >= 3
    ? `${s.streakDays}-day streak! Sobrang consistent mo, idol. Wag mong puputulin! 🔥`
    : `Simulan natin ang streak mo ngayon. Konti lang naman, kayang-kaya. 💪`,

  s => s.todayAccuracy != null && s.todayAccuracy >= 70
    ? `${s.todayAccuracy}% accuracy today — solid! Galingan pa more. 🎯`
    : `Tara, mag-review tayo. Each card brings you closer sa exam. 📚`,

  s => s.daysLeft != null && s.daysLeft <= 7
    ? `${s.daysLeft} days na lang! Crunch time na 'to. Focus mode on. 🔥`
    : `Slow and steady wins. Wag ka mag-stress, kaya mo 'yan. 💪`,

  s => s.weakTopics.length >= 2
    ? `May ${s.weakTopics.length} weak areas ka pa. Isa-isa lang, today si ${s.weakTopics[0]?.topicName ?? 'topic'} muna. 🎯`
    : `Maganda ang progress mo. Tuloy lang ang review! 📚`,

  s => s.listing && s.daysLeft != null && s.daysLeft > 30
    ? `${s.daysLeft} days pa bago ${s.listing.title}. Maraming time pa para mag-prep. 😎`
    : `Today is a good day to review. Tara! 📚`,

  s => `Reminder lang: konting tiyaga, malaking ginhawa. Tara, 10 cards na lang ngayon. 💪`,

  s => s.fullName
    ? `Hi ${s.fullName}! Ready ka na ba mag-review? Andito lang ako para mag-support. 🤝`
    : `Hi! Ready ka na ba mag-review? Andito lang ako para mag-support. 🤝`,

  s => s.streakDays > 0
    ? `Day ${s.streakDays + 1} of your streak — letssgo! 🚀`
    : `Today's the day we start. Walang masyadong drama, tara lang. 🚀`,

  s => s.weakTopics[0]
    ? `Solid sana yung ${s.weakTopics[0].topicName} mo. Try mo 5 cards muna. 🎯`
    : `Try mo 5 cards muna. Madali lang naman, promise. 🎯`,

  s => s.listing
    ? `Bawat card, isang step closer sa ${s.listing.title}. Tara! 📈`
    : `Bawat card, isang step closer sa goal mo. Tara! 📈`,

  s => `Wag kang mahihiya mag-review ulit. Repetition is the mother of skill, idol. 🧠`,

  s => s.daysLeft != null && s.daysLeft <= 3
    ? `${s.daysLeft} days na lang!! Pero wag mag-panic — review what you know, ayoko na yung cram. 🙏`
    : `Ayos ka lang. Konting practice everyday, lalakas ka. 💪`,
]

export function pickTemplate(stats: HomeStats, ringIndex: number): string {
  const idx = ((ringIndex % RING.length) + RING.length) % RING.length
  const fn = RING[idx]
  if (!fn) return 'Tara, mag-review tayo!'
  try {
    return fn(stats)
  } catch {
    return 'Tara, mag-review tayo!'
  }
}

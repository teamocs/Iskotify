# 50 — Voice & Tone

Status: done (2026-10-12)

## Raw

- Q: What language should Iskotify speak to her in — English, Filipino, or Taglish? Does it change between a deadline reminder and an explanation?
  A: "English"
- Q: Are a few Filipino words allowed as signature moments (tagline, Kuya Baw, a celebration), or English everywhere?
  A: "English everywhere, tagline excepted"
- Q: Which reminder sounds like your kuya? A: "DOST-SEI closes Oct 20, in 8 days. You meet 3 of 4 requirements. Source: sei.dost.gov.ph" / B: "Heads up! Only 8 days left for DOST-SEI. You've got this. Let's finish your requirements today." / C: "DOST-SEI closes in 8 days. You're 1 requirement away. Want to finish it now?"
  A: "B"
- Q: Would B still sound like him with the exact date and source added (and without "Only … left!")?
  A: "Yes, keep the date and source"

## Synthesis

**Language:** English everywhere. The single exception is the tagline "Para sa mga Iskolar ng Bayan". No Taglish in UI copy, notifications or celebrations.

**Voice (constant):** the warm, steady older sibling who knows the facts.
- **Warm:** encourages and acts *with* her — "You've got this.", "Let's finish…".
- **Factual:** every deadline carries the exact date and the official source. Facts first, encouragement second.
- **Calm:** no countdown panic, no "only X left!", no "you're behind". Gaps become a doable next step.
- **Plain:** short sentences, everyday words, no jargon, no hype adjectives.

**Tone (varies by moment):**
| Moment | Tone | Example |
|---|---|---|
| Deadline reminder | warm + factual | "Heads up: DOST-SEI closes Oct 20, 8 days from now. You've got this. Let's finish your requirements today. Source: sei.dost.gov.ph" |
| One Next Step | inviting | "Let's do 15 Reading questions. About 12 minutes." |
| Wrong answer | kind, explanatory | "Not quite. The answer is B. Here's why…" |
| Plan done | quietly proud | "That's today done. See you tomorrow." |
| Missed / gap | forward-looking | "2 sessions to catch up this week. Want to start one now?" |
| Error / offline | honest, reassuring | "You're offline. Your answers are saved and will sync later." |

**Do:** lead with the date; name the source; say "we/let's" for shared effort; end reminders with one clear action.
**Don't:** "behind", "only … left!", exclamation stacks, emoji, fake urgency, Filipino/Taglish in UI (tagline excepted), scores framed as verdicts.

**Three candidate voice lines:**
1. "Warm like a kuya. Exact like a registrar."
2. "Encourage, then cite."
3. "Facts first. Then: you've got this."

**Product follow-ups:**
- Replace "Tapos na for today" (apps/mobile/components/home) with English (P4 Today PR).
- Notification copy template: `{Name} closes {Mon D}, {N} days from now. You've got this. {Action}. Source: {domain}` — verify listing records carry a source URL.
- Add copy guard test: no "behind", no "only … left", no emoji in user-facing strings.

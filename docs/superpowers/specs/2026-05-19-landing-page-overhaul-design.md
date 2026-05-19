# Landing Page UI/UX Overhaul — Design Spec

## Overview

Refresh the Iskotify landing page (`apps/admin/`) to reflect the real app launch state: honest early-adopter messaging, official store badge styling, fixed mobile CTA button proportions, and a clean testimonials empty state with deep-link scaffolding.

---

## Scope

Four component files, no new routes, no new dependencies.

| File | Changes |
|------|---------|
| `apps/admin/components/landing/Hero.tsx` | Button radius fix, social proof strip rewrite |
| `apps/admin/components/landing/Testimonials.tsx` | Full replacement with empty state |
| `apps/admin/components/landing/FAQ.tsx` | Pricing answer update, iOS/Android answer tweak |
| `apps/admin/components/landing/FooterCTA.tsx` | Button radius fix, tagline update |

---

## 1. Hero Section

### 1a. Download Buttons

**Problem:** `rounded-[980px]` with `px-6 py-3` creates elongated pills at all viewport sizes.

**Fix:** Replace `rounded-[980px]` with `rounded-xl` on both `<a>` buttons. All other classes stay the same (`bg-[#1d1d1f] text-white px-6 py-3 text-sm font-medium`).

Both buttons remain identical dark color (`#1d1d1f`) — uniform style (Option B from design review).

### 1b. Social Proof Strip

**Remove:** The three fake stat badges (4.8 Rating / 10K+ Students / Free to Use) and the separator dots.

**Replace with:**
```
✓ One-time ₱129  ·  No subscription  ·  Be among the first 🎉
```

Markup pattern:
```html
<div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
  <div className="flex items-center gap-1.5">
    <span className="text-[#800000]">✓</span>
    <span className="font-medium text-[#1d1d1f] text-sm">One-time ₱129</span>
  </div>
  <span className="text-[#d2d2d7]">·</span>
  <span className="text-[#6e6e73] text-sm font-body">No subscription</span>
  <span className="text-[#d2d2d7]">·</span>
  <span className="text-[#6e6e73] text-sm font-body">Be among the first 🎉</span>
</div>
```

---

## 2. Testimonials Section

### What changes

Remove the `testimonials` array and all `StarRating` / card rendering code entirely.

Replace the testimonial grid with a single centered empty state block inside the existing `<section>`:

**Layout:**
- Section header stays: "Student Reviews" label + "What Students Are Saying" heading
- Grid replaced by: centered column with 💬 emoji, heading, body text, two store CTA buttons

**Store CTA buttons:**
- App Store: `bg-[#1d1d1f] text-white rounded-xl px-5 py-2.5 text-sm font-medium`
- Google Play: `bg-[#01875f] text-white rounded-xl px-5 py-2.5 text-sm font-medium`

**Deep-link scaffolding (at top of file):**
```ts
const APP_STORE_REVIEW_URL = '#'      // TODO: replace with App Store review URL when live
const PLAY_STORE_REVIEW_URL = '#'     // TODO: replace with Google Play review URL when live
```

These constants will be replaced with live store review URLs when the app is published. The `href` attributes on the CTA buttons reference these constants.

**Copy:**
- Heading: "Be the first to review Iskotify"
- Body: "Downloaded the app? Share your experience and help other Filipino students discover their scholarship path."

---

## 3. FAQ

### 3a. Pricing answer (FAQ item 0)

**Old:** "Yes! Iskotify is completely free for students. Browse scholarships, track deadlines, and study with flashcards at no cost."

**New:** "Iskotify is available for a one-time payment of ₱129 — no subscription, no hidden fees. Pay once and get lifetime access to all scholarships, exam content, and AI coach features."

### 3b. iOS/Android answer (FAQ item 4)

**Old:** "Yes! Iskotify is fully optimized for iOS 15+ and Android 10+. Download it for free from the App Store or Google Play."

**New:** "Yes! Iskotify is fully optimized for iOS 15+ and Android 10+. Available on the App Store and Google Play."

*(Remove the "for free" phrase since the app has a one-time price.)*

---

## 4. FooterCTA

### 4a. Button radius

Same fix as Hero: `rounded-[980px]` → `rounded-xl` on both `<a>` buttons.

### 4b. Tagline

**Old:** "Free forever for students. No credit card required."

**New:** "One-time ₱129 · Lifetime access · No subscription ever."

---

## Mobile Responsiveness Notes

The `flex-col sm:flex-row` pattern already exists on both button containers — it stacks on mobile and goes side-by-side on sm+. The pill radius fix alone resolves the visual distortion on small screens. No structural changes to the responsive layout are needed.

---

## Out of Scope

- Real store URLs (left as `#` constants until the app is published)
- Animation or skeleton loading for testimonials
- Dynamic review counts or star ratings from an API
- Any change to the `Navbar`, `Features`, or other landing sections

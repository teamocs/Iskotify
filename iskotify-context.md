# Iskotify: Project Blueprint & Technical Architecture

## 1. Project Overview
**Iskotify** is a multi-platform ecosystem designed for Philippine students. It consists of a public-facing marketing website with live listings, an offline-first mobile app for deep learning, and an automated admin CMS.

**The Ecosystem:**
*   **Marketing Landing Page:** Public web portal for discovering scholarships/exams and driving app installs.
*   **Mobile App:** The core "Practice & Review" engine with **Kalaw** (Offline AI Coach) and a dynamic calendar.
*   **Admin CMS:** Automated management via Google Sheets and AI-powered PDF parsing.

## 2. Tech Stack Recommendations
### Consumer Landing Page & Web Admin (Unified Web)
*   **Framework:** Next.js (App Router) - *Essential for SEO of public listings.*
*   **Styling:** Tailwind CSS + shadcn/ui.
*   **Deployment:** Vercel.

### Mobile App (Student Interface)
*   **Framework:** React Native + Expo (Expo Router).
*   **Offline Database:** WatermelonDB.
*   **Local AI Inference:** `react-native-llama` (Google Gemma 3n (1B & 3B)).
*   **Calendar UI:** `react-native-calendars` + `@gorhom/bottom-sheet`.

### Backend & Infrastructure
*   **BaaS:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
*   **Monetization:** RevenueCat.
*   **Automations:** Google Sheets API & Claude API (for PDF data extraction).

---

## 3. Screen-by-Screen Architecture

### A. Consumer Landing Page (Web)
*   **Hero Section:** High-conversion marketing copy, app screenshots, and "Download Now" buttons for App Store/Play Store.
*   **Public Listings Feed:** A searchable, filterable version of the scholarship/exam database.
*   **Listing Detail Page:** Publicly accessible routes (e.g., `iskotify.ph/listings/dost-2026`). 
    *   Shows full details (requirements, coverage, dates).
    *   **The Conversion Hook:** A prominent "Save to My Calendar" or "Start Practice" button that redirects the user to the mobile app store or opens the app via Deep Linking.
*   **Feature Showcases:** Sections explaining Kalaw (AI Coach), Offline Mode, and the Dynamic Calendar.

### B. Mobile App (Student Interface)
1.  **Onboarding & Auto-Save:** Users select target exams. The app automatically saves those listings, populating the calendar and "Recommended" practice feed immediately.
2.  **Home Dashboard:** 
    *   **Dynamic Activity Calendar:** Weekly strip showing milestones from saved listings.
    *   **Kalaw Hero:** Daily AI-generated greeting and motivation.
3.  **Practice Hub:**
    *   **Recommended Feed:** Content filtered by the user's profile and target exams.
    *   **Saved Decks:** Organized folders for custom-titled sessions (e.g., "Algebra Mastery").
    *   **Flashcard Engine:** Swipeable, offline-first Q&A.
4.  **Listings Hub:**
    *   Tabs for "Scholarships", "Exams", and "**Saved/Favorites**".
    *   One-tap bookmarking that updates the Home Calendar.

---

## 4. Admin CMS & Automations
*   **Listing Management:** Managed via a Master Google Sheet. Next.js triggers a sync to Supabase whenever the sheet is updated.
*   **Flashcard Generation:** Admin uploads a PDF (reviewer/textbook).
    *   **Claude API** parses the PDF, extracts Q&A pairs, categorizes the subject/topic, and pushes them to the production database.

---

## 5. Kalaw: The Offline Edge AI Coach
*   **Hardware-Aware:** App checks for >4GB RAM before allowing the 1.5GB Gemma model download.
*   **Contextual Intelligence:** Uses Local RAG to read the user's WatermelonDB data (Readiness scores, missed questions, calendar deadlines) to provide 100% offline, personalized advice.

---

## 6. Phased Development Sprints

*   **Sprint 1: Foundation & Database**
    *   Supabase schema setup and Google Sheets sync integration.
*   **Sprint 2: Web - Landing Page & Admin CMS**
    *   Build the public Listings feed (SEO-optimized) and the PDF-to-Flashcard AI pipeline.
*   **Sprint 3: Mobile App - Infrastructure & Sync**
    *   Expo Router setup and WatermelonDB offline sync with Supabase.
*   **Sprint 4: Mobile App - Core Learning Loop**
    *   Onboarding, Pre-assessment, and the Swipeable Flashcard engine with "Recommended" logic.
*   **Sprint 5: Mobile App - Calendar & Folders**
    *   Dynamic Activity Calendar integration and Saved Decks/Folders management.
*   **Sprint 6: Kalaw AI & Final Launch**
    *   Local LLM integration, deep-linking from Landing Page to App, and RevenueCat setup.
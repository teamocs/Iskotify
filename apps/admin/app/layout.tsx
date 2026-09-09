import type { Metadata, Viewport } from "next";
import { Outfit, Lexend } from "next/font/google";
import "./globals.css";

/*
 * Self-hosted through next/font: the files are served from our own origin,
 * preloaded, and carry a size-adjusted fallback, so there is no render-blocking
 * request to fonts.googleapis.com and no layout shift when the face swaps in.
 */
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-heading",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://iskotify.ph"),
  title: "Iskotify — Scholarships & Exam Prep for Filipino Students",
  description: "Find scholarships, track deadlines, and prepare for your qualifying exams — para sa mga Iskolar ng Bayan. Free on Early Access.",
  openGraph: {
    title: "Iskotify — Scholarships & Exam Prep for Filipino Students",
    description: "Find scholarships, track deadlines, and prepare for your qualifying exams — para sa mga Iskolar ng Bayan.",
    siteName: "Iskotify",
    type: "website",
    images: [{ url: "/icon.png", width: 1024, height: 1024, alt: "Iskotify" }],
  },
  twitter: {
    card: "summary",
    title: "Iskotify",
    description: "Find scholarships and ace your exams — para sa mga Iskolar ng Bayan",
    images: ["/icon.png"],
  },
};

// initialScale 1 with no maximumScale, so pinch-zoom stays available (WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${lexend.variable}`}>
      <body className="min-h-screen font-body antialiased">
        {/*
          First thing in the tab order on every page. Hidden until focused, then
          it lands on the page's own <main id="main-content"> landmark.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:z-[100] focus:top-3 focus:left-3 focus:rounded-lg focus:bg-maroon focus:text-ink-inverse focus:font-body focus:text-sm focus:font-semibold focus:shadow-card"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

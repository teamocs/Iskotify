import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Iskotify — Scholarships & Exam Prep for Filipino Students",
  description: "Find scholarships, track deadlines, and prepare for your qualifying exams — para sa mga Iskolar ng Bayan. One-time ₱129, lifetime access.",
  openGraph: {
    title: "Iskotify — Scholarships & Exam Prep for Filipino Students",
    description: "Find scholarships, track deadlines, and prepare for your qualifying exams — para sa mga Iskolar ng Bayan.",
    siteName: "Iskotify",
    type: "website",
    images: [{ url: "/logo.svg", width: 512, height: 512, alt: "Iskotify" }],
  },
  twitter: {
    card: "summary",
    title: "Iskotify",
    description: "Find scholarships and ace your exams — para sa mga Iskolar ng Bayan",
    images: ["/logo.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Lexend:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.lineicons.com/5.1/line/lineicons.css"
        />
      </head>
      <body className="min-h-screen font-body antialiased">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { APP_NAME, APP_TAGLINE } from "@iskotify/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} Admin`,
  description: APP_TAGLINE
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-ink antialiased">
        {children}
      </body>
    </html>
  );
}

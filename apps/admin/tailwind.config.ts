import type { Config } from "tailwindcss";
import sharedPreset from "@iskotify/ui/tailwind-preset";

// Brand colours, the contrast-audited ink ramp, fonts, radii and shadows all live
// in the shared preset so the admin console and the landing page cannot drift
// apart. Only admin-specific additions belong here.
//
// Everything below EXTENDS the preset; nothing replaces a preset token. Ratios are
// WCAG contrast, measured from the hex values (2026-09 admin redesign, phase A1).
const config: Config = {
  presets: [sharedPreset],
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          // Pressed/hover step for maroon fills. White on it: 13.42:1.
          hover: "#660000"
        },
        surface: {
          // Row / ghost-button hover. ink-subtle on it stays 4.58:1, so any
          // text step can sit on a hovered row without re-checking.
          hover: "#f3f3f5"
        },
        // Neutral badge / skeleton fill (background only). ink-muted on it
        // over white ≈ 6.4:1.
        neutral: { soft: "rgba(0,0,0,0.06)" },
        // Modal backdrop.
        scrim: "rgba(0,0,0,0.40)",
        /*
         * The dark sidebar sits outside the light text ramp, so it gets its own,
         * measured on sidebar #1d1d1f (and on the hover/active fills):
         *
         *   sidebar-ink        #f5f5f7   15.46 on bg · 10.42 on active
         *   sidebar-ink-muted  #a1a1a6    6.54 on bg ·  5.42 on hover
         *
         * Replaces the old white/25–35 labels (2.3–3.1:1). The focus ring on
         * this background uses sidebar-ink (maroon would be ~1.5:1).
         */
        sidebar: {
          DEFAULT: "#1d1d1f",
          ink: "#f5f5f7",
          "ink-muted": "#a1a1a6",
          hover: "#2c2c2e",
          active: "#3a3a3c",
          line: "#2c2c2e"
        }
      },
      borderColor: {
        // Hairline dividers between rows and around cards (decorative).
        subtle: "rgba(0,0,0,0.08)",
        // Visible edge for secondary buttons.
        strong: "rgba(0,0,0,0.16)",
        // Form-control boundary: 3.44:1 on white, 3.16:1 on surface-2 —
        // clears the 3:1 non-text minimum (WCAG 1.4.11).
        control: "#8a8a8e"
      },
      fontSize: {
        // Dense UI text (tables, nav, secondary buttons). Floor stays at xs/12px.
        ui: ["0.8125rem", { lineHeight: "1.25rem" }]
      },
      boxShadow: {
        // Floating layers only (dialogs, drawers). Cards use a border instead.
        overlay: "0 24px 64px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)"
      },
      animation: {
        slideUp: "slideUp 0.2s ease-out"
      },
      keyframes: {
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

export default config;

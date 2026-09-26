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
         * The sidebar is a light second neutral layer (2026-09 sidebar redesign;
         * it was a dark #1d1d1f panel). With the white Topbar it frames the grey
         * surface-2 workspace. Measured on sidebar #fafafa and on its fills:
         *
         *   sidebar-ink        #1d1d1f   16.12 on bg · 14.60 on hover · 13.76 on active
         *   sidebar-ink-muted  #55555a    7.10 on bg ·  6.43 on hover ·  6.06 on active
         *   maroon (icon)      #800000   10.49 on bg ·  8.96 on active
         *
         * Active = maroon-dim fill + semibold ink + maroon icon, so the state
         * never rests on colour alone. The global maroon focus ring works here.
         */
        sidebar: {
          DEFAULT: "#fafafa",
          ink: "#1d1d1f",
          "ink-muted": "#55555a",
          hover: "rgba(0,0,0,0.045)",
          active: "rgba(128,0,0,0.08)",
          line: "rgba(0,0,0,0.08)"
        },
        /*
         * Rail tooltips: dark chip on the light sidebar. White on it 16.83;
         * tooltip-muted (the shortcut or count hint) 6.54.
         */
        tooltip: {
          DEFAULT: "#1d1d1f",
          ink: "#ffffff",
          muted: "#a1a1a6"
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
        slideUp: "slideUp 0.2s ease-out",
        // Rail tooltip entrance: a short nudge out from the rail.
        tooltipIn: "tooltipIn 140ms cubic-bezier(0.16, 1, 0.3, 1)"
      },
      keyframes: {
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        // Keeps the -50% vertical centring the tooltip's class applies.
        tooltipIn: {
          "0%":   { opacity: "0", transform: "translate(-4px, -50%)" },
          "100%": { opacity: "1", transform: "translate(0, -50%)" }
        }
      }
    }
  },
  plugins: []
};

export default config;

import type { Config } from "tailwindcss";
import sharedPreset from "@iskotify/ui/tailwind-preset";

// Brand colours, the contrast-audited ink ramp, fonts, radii and shadows all live
// in the shared preset so the admin console and the landing page cannot drift
// apart. Only admin-specific additions belong here.
const config: Config = {
  presets: [sharedPreset],
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
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

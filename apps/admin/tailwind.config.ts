import type { Config } from "tailwindcss";
import sharedPreset from "@iskotify/ui/tailwind-preset";

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
          DEFAULT: "#800000",
          light: "#a00000",
          dim: "rgba(128,0,0,0.08)",
          mid: "rgba(128,0,0,0.15)"
        },
        surface: {
          DEFAULT: "#ffffff",
          2: "#f5f5f7",
          3: "#fafafa"
        },
        sidebar: "#1d1d1f",
        "text-primary": "#1d1d1f",
        "text-secondary": "#6e6e73",
        "text-tertiary": "#aeaeb2"
      },
      fontFamily: {
        heading: ["Outfit", "sans-serif"],
        body: ["Lexend", "-apple-system", "sans-serif"]
      },
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "22px",
        pill: "980px"
      },
      boxShadow: {
        sm: "0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)",
        card: "0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
      },
      animation: {
        slideUp: 'slideUp 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    }
  },
  plugins: []
};

export default config;

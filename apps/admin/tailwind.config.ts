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
    extend: {}
  },
  plugins: []
};

export default config;

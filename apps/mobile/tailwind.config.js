const sharedPreset = require("@iskotify/ui/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset"), sharedPreset],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        heading:       ['Outfit_700Bold'],
        'heading-semi':['Outfit_600SemiBold'],
        body:          ['Lexend_400Regular'],
        'body-medium': ['Lexend_500Medium'],
        'body-semi':   ['Lexend_600SemiBold'],
      }
    }
  },
  plugins: []
};

/**
 * Iskotify brand preset — the single source of Tailwind design truth shared by
 * every web surface (admin console + landing page).
 *
 * The text ramp is contrast-audited against the three backgrounds this system
 * actually paints on (#ffffff, surface-2 #f5f5f7, surface-3 #fafafa). Every step
 * clears WCAG AA 4.5:1 on the darkest of them, so a token can be used for small
 * text anywhere without re-checking:
 *
 *   ink         #1d1d1f   16.83 / 15.46 / 16.12
 *   ink.muted   #55555a    7.41 /  6.81 /  7.10
 *   ink.subtle  #6e6e73    5.07 /  4.66 /  4.86
 *
 * There is deliberately no lighter step: nothing above #6e6e73 can pass 4.5:1 on
 * #f5f5f7, so a fourth tier would be a token that is illegal to use for body copy.
 * Reach for weight, size, or spacing to de-emphasize instead of a lighter grey.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: "#800000",   // 10.95:1 on white — safe for small text and as a fill behind white
          light:   "#a00000",   //  8.42:1 on white
          dim:     "rgba(128,0,0,0.08)",
          mid:     "rgba(128,0,0,0.15)"
        },
        ink: {
          DEFAULT: "#1d1d1f",
          muted:   "#55555a",
          subtle:  "#6e6e73",
          inverse: "#ffffff"
        },
        surface: {
          DEFAULT: "#ffffff",
          2:       "#f5f5f7",
          3:       "#fafafa"
        },
        sidebar: "#1d1d1f",
        /*
         * Semantic status colours. Each has three roles, and picking the wrong
         * one is the easy way to ship a contrast bug:
         *
         *   DEFAULT  text or icon on a plain surface (white / surface-2 / -3)
         *   strong   text on that status's own `soft` tint
         *   soft     a tint used as BACKGROUND ONLY
         *
         * `strong` exists because a 10% tint eats roughly 0.2-0.5 off the ratio,
         * which is enough to drop DEFAULT below 4.5:1 for success and warning.
         * Ratios below are the worst case across white and surface-2.
         */
        success: { DEFAULT: "#15803d", strong: "#166534", soft: "rgba(21,128,61,0.10)" },  // 4.61 / 5.75
        warning: { DEFAULT: "#b45309", strong: "#92400e", soft: "rgba(180,83,9,0.10)" },   // 4.61 / 5.71
        danger:  { DEFAULT: "#b91c1c", strong: "#991b1b", soft: "rgba(185,28,28,0.10)" },  // 5.94 / 6.47
        info:    { DEFAULT: "#1e40af", strong: "#1e3a8a", soft: "rgba(30,64,175,0.10)" }   // 8.01 / 8.08
      },
      fontFamily: {
        // next/font sets these variables on <html>; the literal family names are
        // the fallback for any surface that loads the faces some other way.
        heading: ["var(--font-heading)", "Outfit", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "Lexend", "-apple-system", "system-ui", "sans-serif"]
      },
      borderRadius: {
        sm:   "10px",
        md:   "16px",
        lg:   "22px",
        pill: "980px"
      },
      boxShadow: {
        sm:   "0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)",
        card: "0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
      }
    }
  },
  plugins: []
};

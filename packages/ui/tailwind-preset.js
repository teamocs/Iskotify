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
      /*
       * iOS text styles (2026-10 iOS-language redesign, P5a), as [size, {lineHeight}].
       * Additive: the stock xs…9xl scale is untouched, and the admin console keeps
       * its denser `text-ui` 13/20 for tables and nav.
       */
      fontSize: {
        "large-title": ["34px", { lineHeight: "41px" }],
        "title-1":     ["28px", { lineHeight: "34px" }],
        "title-2":     ["22px", { lineHeight: "28px" }],
        "title-3":     ["20px", { lineHeight: "25px" }],
        headline:      ["17px", { lineHeight: "22px", fontWeight: "600" }],
        body:          ["17px", { lineHeight: "22px" }],
        callout:       ["16px", { lineHeight: "21px" }],
        subhead:       ["15px", { lineHeight: "20px" }],
        footnote:      ["13px", { lineHeight: "18px" }],
        caption:       ["12px", { lineHeight: "16px" }]
      },
      borderRadius: {
        sm:   "10px",
        md:   "16px",
        lg:   "22px",
        pill: "980px",
        // iOS-language radii, by role (P5a). Additive to the keys above.
        chip:    "8px",
        field:   "12px",
        button:  "14px",
        group:   "18px",
        card:    "22px",
        sheet:   "28px",
        capsule: "9999px"
      },
      /*
       * Motion. `snappy` for small state changes (toggles, segment thumbs),
       * `smooth` for things that travel (sheets, menus). Durations: 200 for
       * micro, 280 standard, 480 for a full-screen entrance.
       */
      transitionTimingFunction: {
        snappy: "cubic-bezier(.2,.9,.25,1)",
        smooth: "cubic-bezier(.32,.72,0,1)"
      },
      transitionDuration: {
        200: "200ms",
        280: "280ms",
        480: "480ms"
      },
      boxShadow: {
        sm:   "0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)",
        card: "0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
      }
    }
  },
  plugins: [
    /*
     * `glass`: the translucent material for toolbars and the landing nav. The
     * only place its rgba values live (components never write raw colours).
     * Falls back to a solid surface where backdrop-filter is unsupported, and
     * when the OS asks for reduced transparency.
     */
    function glassPlugin({ addUtilities, theme }) {
      const solid = {
        // The surface token itself, so the fallback can never drift from it.
        backgroundColor: theme("colors.surface.DEFAULT"),
        backdropFilter: "none",
        WebkitBackdropFilter: "none"
      };
      addUtilities({
        ".glass": {
          backgroundColor: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          // Inset hairline along the bottom edge, so a frosted bar still reads
          // as a separate layer over white content.
          boxShadow: "inset 0 -0.5px 0 rgba(0,0,0,0.12)",
          "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))": solid,
          "@media (prefers-reduced-transparency: reduce)": solid
        }
      });
    }
  ]
};

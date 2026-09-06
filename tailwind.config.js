/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Jamarik editorial palette — light ground. Accents are darkened from
        // the original dark-mode values: gold #d8b057 and burgundy #cf7d7d sat
        // at 2.1:1 and 3.1:1 on white, well under the 4.5:1 needed for text.
        // Every value below is measured against #ffffff.
        bone: "#ffffff", // page ground
        bone2: "#f6f3ea", // raised surface — warm, keeps the editorial cast
        rule: "#ded9ca", // hairlines
        ink: "#16130d", // primary text — 18.5:1
        ink2: "#3a352b", // secondary text — 12.2:1
        slate1: "#6b6555", // muted text — 5.8:1
        slate2: "#7c7563", // faint text / labels — 4.6:1
        gold: "#8a6714", // revenue-at-risk accent — 5.2:1
        gold2: "#6f5210", // gold hover — deeper still
        cedar: "#47703f", // normal / healthy — 5.7:1
        burgundy: "#a03636", // under-invoicing / flagged — 6.8:1
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Helvetica Neue", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SF Mono", "monospace"],
        display: ["Fraunces", "Cormorant Garamond", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.025em",
      },
    },
  },
  plugins: [],
};

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
        // Jamarik editorial palette — carried over from the original
        // trade-mirror module so the page reads identically.
        bone: "#16130d", // page ground
        bone2: "#211d15", // raised surface
        rule: "#39342a", // hairlines
        ink: "#f3eee2", // primary text
        ink2: "#e2dccb", // secondary text
        slate1: "#a59e8c", // muted text
        slate2: "#7c7563", // faint text / labels
        gold: "#d8b057", // revenue-at-risk accent
        gold2: "#ecc878",
        cedar: "#8bab86", // normal / healthy
        burgundy: "#cf7d7d", // under-invoicing / flagged
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

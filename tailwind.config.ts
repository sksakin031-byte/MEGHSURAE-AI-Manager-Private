import type { Config } from "tailwindcss";

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        card: c("card"),
        line: c("line"),
        fg: c("fg"),
        muted: c("muted"),
        brand: c("brand"),
        "brand-fg": c("brand-fg"),
        ok: c("ok"),
        warn: c("warn"),
        danger: c("danger"),
      },
      fontFamily: {
        sans: ['system-ui', '"Noto Sans Bengali"', '"Segoe UI"', "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

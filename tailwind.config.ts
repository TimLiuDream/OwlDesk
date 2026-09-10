import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#0b0f1a",
          900: "#111827",
          800: "#141c2e",
          700: "#182238",
        },
        line: {
          DEFAULT: "#24304d",
          strong: "#31406a",
        },
        owl: {
          amber: "#f5b544",
          teal: "#3ddbc4",
          red: "#f2686f",
          blue: "#6ea8ff",
        },
      },
    },
  },
  plugins: [typography],
};
export default config;

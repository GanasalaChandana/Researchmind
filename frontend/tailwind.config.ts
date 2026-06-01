import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          500: "#4f6ef7",
          600: "#3b55e6",
          900: "#1a2680",
        },
      },
    },
  },
  plugins: [],
};

export default config;

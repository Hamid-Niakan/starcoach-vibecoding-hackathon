import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "../../packages/chat-ui/src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: "#f7b500", ink: "#171717" } } },
  plugins: [],
} satisfies Config;

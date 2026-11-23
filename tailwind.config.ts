import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14110F",
          soft: "#4A433E",
          mute: "#8B8178",
          line: "#E7DFD6",
        },
        cream: {
          DEFAULT: "#FBF7F2",
          card: "#FFFFFF",
          sunk: "#F3ECE3",
        },
        brand: {
          DEFAULT: "#FF5A1F",
          dark: "#E0430C",
          soft: "#FFEDE4",
        },
        moss: "#2F7D5D",
        ocean: "#1F6FEB",
        plum: "#7C3AED",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,17,15,0.04), 0 8px 24px -12px rgba(20,17,15,0.16)",
        float: "0 12px 40px -12px rgba(20,17,15,0.24)",
      },
      borderRadius: {
        xl2: "20px",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        rise: "rise 0.35s ease-out both",
        pulseSoft: "pulseSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

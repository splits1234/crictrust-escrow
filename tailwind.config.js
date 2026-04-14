/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // PSL Team Colors
        psl: {
          lahore: "#00a651",       // Lahore Qalandars — Green
          islamabad: "#e4002b",    // Islamabad United — Red
          karachi: "#0057b8",      // Karachi Kings — Blue
          multan: "#ffd100",       // Multan Sultans — Yellow
          peshawar: "#c8a951",     // Peshawar Zalmi — Gold
          quetta: "#6f2da8",       // Quetta Gladiators — Purple
        },
        // Tech-noir palette
        noir: {
          900: "#0a0a0f",
          800: "#12121a",
          700: "#1a1a2e",
          600: "#242440",
          500: "#2d2d50",
        },
        neon: {
          blue: "#00d4ff",
          cyan: "#00fff5",
          pink: "#ff006e",
          green: "#39ff14",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 212, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 212, 255, 0.6)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

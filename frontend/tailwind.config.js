/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: {
            primary: '#080808',
            secondary: '#0a0a0a',
            tertiary: '#0f0f0f',
            elevated: '#111',
            accent: '#1a1a1a',
          },
          text: {
            primary: '#e5e5e5',
            secondary: '#b0b0b0',
            muted: '#888888',
            link: '#60a5fa',
          },
          border: {
            subtle: '#222',
            default: '#333',
            hover: '#444',
          },
        },
        status: {
          positive: '#22c55e',
          negative: '#f43f5e',
          neutral: '#F7931A',
          muted: '#94a3b8',
        },
        accent: {
          DEFAULT: '#F7931A',
          hover: '#E8830C',
          glow: '#F7931A30',
        },
        cyan: {
          DEFAULT: '#06b6d4',
          light: '#22d3ee',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

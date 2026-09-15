/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0b0e',
        surface: '#12141a',
        'surface-elevated': '#181b22',
        border: '#232733',
        'border-subtle': '#1a1d26',
        risk: {
          healthy: '#10B981',
          warning: '#F59E0B',
          danger: '#F97316',
          critical: '#EF4444',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

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
        'surface-0': '#15130F',
        'surface-1': '#1D1A15',
        'surface-2': '#28241D',
        'text-primary': '#F3EFE7',
        'text-muted': '#9C9284',
        brand: {
          DEFAULT: '#3E7CB1',
          hover: '#4D8EC7',
          active: '#2E6696',
          muted: 'rgba(62, 124, 177, 0.15)',
          border: 'rgba(62, 124, 177, 0.35)',
        },
        risk: {
          healthy: '#4ADE80',
          warning: '#F5B942',
          danger: '#F5793A',
          critical: '#F0473E',
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        fraunces: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"Public Sans"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

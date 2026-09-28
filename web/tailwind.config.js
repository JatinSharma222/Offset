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
        // Atelier Obsidian Base & Surfaces
        surface: '#0b0b0f',
        'surface-dim': '#0a0a0d',
        'surface-bright': '#39393e',
        'surface-container-lowest': '#07070a',
        'surface-container-low': '#121217',
        'surface-container': '#17171e',
        'surface-container-high': '#20202a',
        'surface-container-highest': '#2c2c38',
        'surface-variant': '#35343a',
        'on-surface': '#edeaf2',
        'on-surface-variant': '#9ba0a6',
        outline: '#89938f',
        'outline-variant': '#3f4945',
        'outline-subtle': 'rgba(255, 255, 255, 0.08)',
        'surface-tint': '#92d3c1',

        // Material Palettes
        patina: {
          DEFAULT: '#5b9b8a',
          light: '#92d3c1',
          dim: '#27695a',
        },
        bohemian: {
          DEFAULT: '#a35846',
          light: '#c86e59',
          crimson: '#e05252',
        },
        'amber-gold': '#ffb873',

        primary: {
          DEFAULT: '#5b9b8a',
          light: '#92d3c1',
          dim: '#27695a',
          container: '#5c9d8b',
          'fixed-dim': '#92d3c1',
        },
        secondary: {
          DEFAULT: '#a35846',
          container: '#743324',
          fixed: '#ffdad2',
          'fixed-dim': '#ffb4a3',
        },
        tertiary: {
          DEFAULT: '#ffb873',
          container: '#c28344',
          fixed: '#ffdcbf',
          'fixed-dim': '#ffb873',
        },
        error: {
          DEFAULT: '#e05252',
          container: '#93000a',
        },

        // Status Colors (strictly reserved for risk/health, never decorative)
        risk: {
          healthy: '#5b9b8a',
          warning: '#ffb873',
          danger: '#f5793a',
          critical: '#e05252',
        },

        // Backwards compatibility tokens
        'surface-0': '#0b0b0f',
        'surface-1': '#121217',
        'surface-2': '#17171e',
        'text-primary': '#edeaf2',
        'text-muted': '#9ba0a6',
        brand: {
          DEFAULT: '#5b9b8a',
          hover: '#6eb5a3',
          active: '#27695a',
          muted: 'rgba(91, 155, 138, 0.15)',
          border: 'rgba(91, 155, 138, 0.35)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        fraunces: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  corePlugins: {
    // Disable preflight to avoid clashing with Docusaurus/Infima base styles.
    preflight: false,
    container: false,
  },
  // Use Docusaurus data-theme attribute for dark mode (class strategy + selector)
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/**/*.{js,jsx,tsx,ts,md,mdx}',
    './docs/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // GitHub-inspired system font stack for excellent readability & native feel
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans',
          'Helvetica',
          'Arial',
          'sans-serif',
          ...fontFamily.sans,
        ],
        // Slightly more premium for headings
        jakarta: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
          ...fontFamily.mono,
        ],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      screens: {
        // Align with Docusaurus mobile breakpoint
        sm: '0px',
        lg: '997px',
      },
      colors: {
        // GitHub-inspired semantic tokens (used via Tailwind + CSS vars fallback)
        'gh-blue': {
          DEFAULT: '#0969da',
          light: '#0969da',
          dark: '#58a6ff',
        },
        primary: {
          DEFAULT: 'rgb(var(--docs-color-primary-rgb, 9 105 218) / <alpha-value>)',
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9d9ff',
          600: '#0969da',
          700: '#0550ae',
        },
        secondary: {
          DEFAULT: 'rgb(var(--docs-color-secondary-rgb, 248 250 252) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'var(--docs-color-text)',
          100: 'var(--docs-color-text-100)',
          400: 'rgb(var(--docs-color-text-400, 101 109 118) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
    },
  },
  plugins: [],
};

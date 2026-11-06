/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // A tap shouldn't leave a button looking hovered.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        gold: 'var(--gold)',
        'gold-soft': 'var(--gold-soft)',
      },
      fontFamily: {
        sans: ['"Sofia Sans Semi Condensed"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Bevan', 'Georgia', 'serif'],
      },
      // Sofia Sans runs narrow, so the small sizes sit a step larger than Tailwind's defaults.
      fontSize: {
        xs: ['0.8125rem', '1.125rem'],
        sm: ['0.9375rem', '1.3125rem'],
      },
      borderRadius: {
        md: '0.1875rem',
        lg: '0.25rem',
      },
    },
  },
  plugins: [],
}

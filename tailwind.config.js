/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#111110',
        surface: '#1a1a19',
        raised: '#262624',
        line: '#34342f',
        ink: '#f0efec',
        'ink-2': '#c3c2b7',
        'ink-3': '#9a9990',
      },
    },
  },
  plugins: [],
}
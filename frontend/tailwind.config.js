/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c0d2ff',
          300: '#93adff',
          400: '#6080f5',
          500: '#3d5bdb',
          600: '#2a40b8',
          700: '#1e2f8f',
          800: '#172368',
          900: '#0f1a4f',
          950: '#080e30',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

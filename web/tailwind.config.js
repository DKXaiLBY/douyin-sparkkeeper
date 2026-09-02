/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ember: '#ff8a3d',
        rose: '#ff5d73',
        gold: '#ffd479',
        ink: '#0b0712',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'PingFang SC',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        glass: '28px',
      },
    },
  },
  plugins: [],
};

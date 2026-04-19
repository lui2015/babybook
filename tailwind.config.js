/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        hand: ['"Caveat"', 'cursive'],
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FAF3E7',
        peach: '#F8D5C2',
        rose: '#E8A4A0',
        sky: '#BFD8E8',
        mint: '#C8E2C7',
        lavender: '#D6C8E2',
      },
      boxShadow: {
        book: '0 20px 40px -20px rgba(80, 40, 20, 0.35)',
      },
    },
  },
  plugins: [],
};

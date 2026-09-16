import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf3f0',
          600: '#b8442f',
          700: '#963824',
        },
      },
    },
  },
  plugins: [],
};

export default config;

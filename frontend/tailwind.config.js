/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0A0C10',
          surface: '#12151C',
          surface2: '#191D26',
          border: '#232838',
        },
        ink: {
          primary: '#E9ECF3',
          secondary: '#8A93A6',
          muted: '#5B6274',
        },
        rarity: {
          consumer: '#B0C3D9',
          industrial: '#5E98D9',
          milspec: '#4B69FF',
          restricted: '#8847FF',
          classified: '#D32CE6',
          covert: '#EB4B4B',
          gold: '#FFD700',
        },
        signal: {
          success: '#3ECF8E',
          danger: '#FF5B5B',
          warning: '#F5A623',
        },
      },
      fontFamily: {
        display: ['"Rajdhani"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.04), 0 8px 24px -8px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};

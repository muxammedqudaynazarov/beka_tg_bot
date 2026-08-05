/** @type {import('tailwindcss').Config} */
// DIQQAT: bu Admin panel — 2-band talabiga ko'ra "chiroyli dizayn shart emas",
// shuning uchun asosiy foydalanuvchi ilovasidagi maxsus shrift/rarity-rang
// tizimi ATAYIN qo'llanilmagan — faqat funksional, sodda, tungi mavzu.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0F1115',
        surface: '#181B21',
        border: '#2A2E37',
        ink: '#E7E9ED',
        muted: '#8A8F98',
        accent: '#4B69FF',
        danger: '#EB4B4B',
        success: '#3ECF8E',
        warning: '#F5A623',
      },
    },
  },
  plugins: [],
};

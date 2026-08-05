import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite 5+ xavfsizlik uchun faqat ma'lum hostlardan kelgan so'rovlarni
    // qabul qiladi. ngrok/tunnel orqali test qilganda bu hostni ruxsat
    // etilganlar ro'yxatiga (yoki umuman tekshiruvni o'chirishga) qo'shish kerak.
    allowedHosts: true, // DIQQAT: bu FAQAT lokal rivojlantirish uchun; production'da kerak emas (build qilingan statik fayllar bilan ishlaydi, bu tekshiruv umuman ishlamaydi)
  },
});

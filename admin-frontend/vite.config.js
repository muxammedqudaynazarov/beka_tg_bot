import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    allowedHosts: true, // DIQQAT: faqat lokal rivojlantirish uchun (ngrok bilan test qilishda kerak)
  },
});

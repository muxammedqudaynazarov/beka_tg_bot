import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Har build'da index.html'dagi __BUILD_TS__ ni haqiqiy vaqt bilan almashtiradi.
// Bu — Telegram Mini App WebView'ning ichki keshiga qarshi asosiy mexanizm:
// JavaScript localStorage'dagi saqlangan versiyani yangi bilan solishtiradi va
// farq topsa, majburan reload qiladi (foydalanuvchi hech narsa qilmasin).
function buildTimestampPlugin() {
  const ts = Date.now().toString();
  return {
    name: 'build-timestamp',
    transformIndexHtml(html) {
      // /g flagi — barcha uchrashlar almashtiriladi (faqat birinchisi emas)
      return html.replace(/__BUILD_TS__/g, ts);
    },
  };
}

export default defineConfig({
  plugins: [react(), buildTimestampPlugin()],
  server: {
    port: 5173,
    allowedHosts: true,
  },
});

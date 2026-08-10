require('dotenv').config();

// Barcha muhit o'zgaruvchilarini bitta joydan boshqarish — xato bo'lsa serverni
// darhol to'xtatib, aniq xabar beramiz (production'da "undefined token" bilan
// jim ishlab, keyin g'alati xatolik berishning oldini olish uchun).
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[config] Muhit o'zgaruvchisi topilmadi: ${name}. .env faylini tekshiring (.env.example'ga qarang).`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`,

  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  userBotToken: process.env.USER_BOT_TOKEN || '',
  adminBotToken: process.env.ADMIN_BOT_TOKEN || '',
  miniAppUrl: process.env.MINI_APP_URL || 'http://localhost:5173',
  adminMiniAppUrl: process.env.ADMIN_MINI_APP_URL || 'http://localhost:5174',
  // "Yordam" tugmasi shu guruh/kanalga yo'naltiriladi (4-band javobi)
  supportGroupUrl: process.env.SUPPORT_GROUP_URL || '',
  // 7-band: yangi auksion qo'shilganda shu kanalga rasmli e'lon yuboriladi
  // (bot shu kanalda ADMIN bo'lishi shart — aks holda xabar yuborib bo'lmaydi)
  announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || '',

  // 5/13-band: Trade URL'ni haqiqiy tekshirish va skinlarni avtomatik
  // Steam orqali yuborish uchun bot-akkaunt. Bo'sh qoldirilsa, bu
  // funksiyalar shunchaki o'chirilgan holda qoladi (xato bermaydi).
  steam: {
    username: process.env.STEAM_BOT_USERNAME || '',
    password: process.env.STEAM_BOT_PASSWORD || '',
    sharedSecret: process.env.STEAM_BOT_SHARED_SECRET || '',
    identitySecret: process.env.STEAM_BOT_IDENTITY_SECRET || '',
    apiKey: process.env.STEAM_API_KEY || '',
  },
  superadminTelegramIds: (process.env.SUPERADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  click: {
    serviceId: process.env.CLICK_SERVICE_ID || '',
    merchantId: process.env.CLICK_MERCHANT_ID || '',
    merchantUserId: process.env.CLICK_MERCHANT_USER_ID || '',
    secretKey: process.env.CLICK_SECRET_KEY || '',
    checkoutBaseUrl: process.env.CLICK_CHECKOUT_BASE_URL || 'https://my.click.uz/services/pay',
    merchantApiUrl: process.env.CLICK_MERCHANT_API_URL || 'https://api.click.uz/v2/merchant',
  },

  auction: {
    depositPercent: Number(process.env.AUCTION_DEPOSIT_PERCENT || 25),
    maxConsecutiveRaises: Number(process.env.AUCTION_MAX_CONSECUTIVE_RAISES || 10),
    extendThresholdMinutes: Number(process.env.AUCTION_EXTEND_THRESHOLD_MINUTES || 5),
    extendByMinutes: Number(process.env.AUCTION_EXTEND_BY_MINUTES || 5),
    // 4-band: har bir yangi taklif (qo'lda kiritilgan bo'lsa ham) joriy narxdan
    // kamida shu foizga yuqori bo'lishi SHART (standart: 5%). "Narxni oshirish"
    // tugmasi ham standart holatda aynan shu foizni taklif qiladi.
    minRaisePercent: Number(process.env.AUCTION_MIN_RAISE_PERCENT || 5),
    // 3-band: g'olib qolgan 75%ni to'lashi uchun berilgan muddat (soatda)
    winnerPaymentWindowHours: Number(process.env.WINNER_PAYMENT_WINDOW_HOURS || 5),
    // Muddat o'tib ketsa, ushlab turilgan zakladning necha foizi foydalanuvchiga qaytariladi
    // (qolgani — masalan 100-50=50% — boshqalarga to'sqinlik qilgani uchun jarima sifatida ushlab qolinadi)
    depositRefundOnExpiryPercent: Number(process.env.DEPOSIT_REFUND_ON_EXPIRY_PERCENT || 50),
  },
};

module.exports = { env, required };

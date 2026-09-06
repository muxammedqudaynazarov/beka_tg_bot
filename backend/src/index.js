// Umumiy xavfsizlik: kod ichida boshqa joyda ham kimdir ".catch()" qo'shishni
// unutib qo'ysa, server "unhandled rejection" tufayli kutilmaganda o'chib
// qolmasligi uchun oxirgi himoya chizig'i. Productionda buni monitoring
// tizimiga (masalan Sentry) ulash tavsiya etiladi.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { env } = require('./config/env');
const { attachAuctionSocket } = require('./sockets/auctionSocket');
const { startAuctionScheduler } = require('./jobs/auctionScheduler');
const { createUserBot } = require('./bots/userBot');
const { createAdminBot } = require('./bots/adminBot');

const authRoutes = require('./routes/auth.routes');
const auctionsRoutes = require('./routes/auctions.routes');
const categoriesRoutes = require('./routes/categories.routes');
const paymentsRoutes = require('./routes/payments.routes');
const paymeRoutes = require('./routes/payme.routes');
const clickRoutes = require('./routes/click.routes');
const wheelRoutes = require('./routes/wheel.routes');
const profileRoutes = require('./routes/profile.routes');
const favoritesRoutes = require('./routes/favorites.routes');
const adsRoutes = require('./routes/ads.routes');
const promoRoutes = require('./routes/promo.routes');
const mediaRoutes = require('./routes/media.routes');
const adminRoutes = require('./routes/admin.routes');

// Prisma Decimal/BigInt qiymatlarini JSON'ga xavfsiz aylantirish (masalan
// User.telegramId BigInt turida saqlanadi — JSON.stringify standart holda
// BigInt'ni qo'llab-quvvatlamaydi).
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// CORS: production'da faqat aniq FRONTEND_URL'ga ruxsat beriladi. Development'da
// (lokal/ngrok bilan test qilishda) buni ham qabul qiladi, QO'SHIMCHA ravishda
// istalgan ".ngrok-free.app" manzilidan kelgan so'rovga ham ruxsat beradi —
// chunki ngrok bepul tarifda har safar yangi tasodifiy subdomen beradi va
// FRONTEND_URL bilan qo'lda sinxron tutish oson unutiladi.
function isAllowedOrigin(origin) {
  if (!origin) return true; // server-server so'rovlar, curl, Postman va h.k.
  // Ikkala Mini App'ning HAM manziliga ruxsat berilishi kerak — foydalanuvchi
  // frontend'i VA admin frontend'i ikkita mutlaqo boshqa domen/subdomen.
  if (origin === env.frontendUrl) return true;
  if (origin === env.adminMiniAppUrl) return true;
  if (env.nodeEnv !== 'production') {
    try {
      if (new URL(origin).hostname.endsWith('.ngrok-free.app')) return true;
    } catch {
      /* noto'g'ri origin qiymati — rad etiladi */
    }
  }
  return false;
}
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error(`CORS: "${origin}" manbasiga ruxsat berilmagan`));
  },
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
app.set('io', io);

app.use(cors(corsOptions));
// MUHIM: Click.uz "Prepare"/"Complete" so'rovlarini ba'zan
// application/x-www-form-urlencoded ko'rinishida yuboradi, JSON emas.
// Faqat express.json() bo'lsa, bunday so'rovda req.body BO'SH ({}) bo'lib
// qoladi — natijada imzo tekshiruvi "undefined" qiymatlar bilan ishlab,
// har doim rad javobi qaytaradi (to'lov Click tomonida muvaffaqiyatli
// bo'lsa ham, bizning tizimda balans hech qachon oshmaydi). Ikkalasini ham
// qo'shib qo'yish xavfsiz — Content-Type'ga qarab faqat kerakli middleware ishlaydi.
app.use(express.urlencoded({ extended: true }));
// 1-band: standart 'application/json'dan tashqari, Payme'ning o'z
// hujjatlarida ko'rsatilgan "text/json" turini ham qabul qilamiz — aks holda
// ularning webhook so'rovlari bo'sh req.body bilan kelib qolishi mumkin.
app.use(express.json({ type: ['application/json', 'text/json'] }));
// Rasm yuklash bo'limi orqali optimallashtirilgan fayllar shu yerdan xizmat qiladi
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
// 6-band: zaklad foizi (va kelajakda shunga o'xshash sozlamalar) FAQAT
// .env'dan boshqarilishi uchun — frontend endi bu qiymatni o'zida qattiq
// yozib qo'ymaydi, shu yerdan (jonli, .env'ga bog'liq holda) oladi.
app.get('/api/config', (req, res) => res.json({ depositPercent: env.auction.depositPercent }));

app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/payments', paymentsRoutes);
// 1-band: Payme'ning YAGONA Merchant API kirish nuqtasi — barcha
// CheckPerformTransaction/CreateTransaction/... so'rovlari shu manzilga keladi
app.use('/api/payme', paymeRoutes);
// MUHIM: Click Merchant kabinetida ALLAQACHON /api/payments/click/... manzili
// ko'rsatilgan (avvalgi integratsiyadan qolgan) — shu sabab YANGI /api/click
// emas, aynan shu ESKI, kabinetda saqlangan manzilga mos qilib o'rnatamiz.
// Bu yerda hech narsa Click kabinetida o'zgartirilishi shart emas.
app.use('/api/payments/click', clickRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/admin/media', mediaRoutes);
app.use('/api/admin', adminRoutes);

// Umumiy xato ushlagich — hech qanday kutilmagan xato butun serverni
// yiqitmasligi va foydalanuvchiga tushunarli javob qaytarilishi uchun.
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Server xatosi yuz berdi.' });
});

attachAuctionSocket(io);
startAuctionScheduler(io);

const userBot = createUserBot();
const adminBot = createAdminBot();

if (userBot) {
  // Endi butun backend (marshrutlar, auctionService, scheduler) shu bitta
  // umumiy notifier orqali foydalanuvchiga Telegram xabar yubora oladi.
  require('./services/notifier').setUserBot(userBot);
}
if (adminBot) {
  require('./services/notifier').setAdminBot(adminBot);
}

// 5/13-band: Steam bot — sozlanmagan bo'lsa ham xavfsiz (hech narsa buzilmaydi)
require('./services/steamBotService').initSteamBot();

// MUHIM TUZATISH: bot.launch() Telegram serveriga ulanishda xato bersa
// (noto'g'ri token, yoki tarmoq Telegram API'ga vaqtincha ulanolmasa), va bu
// xato ushlanmasa — Node.js "unhandled promise rejection" tufayli BUTUN
// backend jarayonini yiqitib yuboradi (API ham, ikkala bot ham o'chib qoladi).
// .catch() qo'shib, faqat shu botning ulanmaganini logga yozamiz — server va
// ikkinchi bot ishlashda davom etadi.
if (userBot) {
  userBot.launch().catch((err) => {
    console.error('[userBot] Telegram bilan ulanishda xato (bot ishlamaydi, lekin server davom etadi):', err.message);
  });
}
if (adminBot) {
  adminBot.launch().catch((err) => {
    console.error('[adminBot] Telegram bilan ulanishda xato (bot ishlamaydi, lekin server davom etadi):', err.message);
  });
}

server.listen(env.port, () => {
  console.log(`✅ Backend http://localhost:${env.port} portida ishga tushdi (${env.nodeEnv} rejimi)`);
});

// Botlarni va serverni to'g'ri to'xtatish (masalan systemd/docker restart paytida)
process.once('SIGINT', () => {
  userBot?.stop('SIGINT');
  adminBot?.stop('SIGINT');
  server.close(() => process.exit(0));
});
process.once('SIGTERM', () => {
  userBot?.stop('SIGTERM');
  adminBot?.stop('SIGTERM');
  server.close(() => process.exit(0));
});

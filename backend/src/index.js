// Umumiy xavfsizlik: kod ichida boshqa joyda ham kimdir ".catch()" qo'shishni
// unutib qo'ysa, server "unhandled rejection" tufayli kutilmaganda o'chib
// qolmasligi uchun oxirgi himoya chizig'i. Productionda buni monitoring
// tizimiga (masalan Sentry) ulash tavsiya etiladi.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const express = require('express');
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
const profileRoutes = require('./routes/profile.routes');
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
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/profile', profileRoutes);
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
  // Scheduler'ga (auktsion yutuqlari/muddat tugashi haqida) xabar yuborish
  // imkoniyatini ulaymiz.
  const { setNotifier } = require('./jobs/auctionScheduler');
  setNotifier(require('./bots/userBot').makeNotifier(userBot));
}

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

const { Telegraf, Markup } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { buildTelegrafOptions } = require('./telegrafOptions');

// 1.d-band: "Botni birinchi marotaba ishga tushirgan foydalanuvchi avtomatik
// botni ishlata olsin, avtoregistratsiya qilinsin". Asosiy ro'yxatdan o'tish
// aslida Mini App ochilganda /api/auth/telegram orqali amalga oshadi (initData
// bilan), lekin shu yerda ham /start bosilganda foydalanuvchi bazada
// bo'lmasa yaratib qo'yamiz — shunda admin panelida ham darhol ko'rinadi va
// botga oddiy matnli buyruqlar bilan murojaat qilsa ham xato bermaydi.
function createUserBot() {
  if (!env.userBotToken) {
    console.warn('[userBot] USER_BOT_TOKEN sozlanmagan — foydalanuvchi boti ishga tushmaydi.');
    return null;
  }

  const bot = new Telegraf(env.userBotToken, buildTelegrafOptions());

  // Xabar yozish maydoni yonidagi doimiy "Menu" tugmasi — bu ham initData'ni
  // to'g'ri to'ldiradigan usullardan biri (inline tugma bilan bir qatorda) va
  // foydalanuvchiga istalgan vaqtda ilovani ochish imkonini beradi.
  bot.telegram.setChatMenuButton({
    menuButton: { type: 'web_app', text: 'Auksion', web_app: { url: env.miniAppUrl } },
  }).catch((err) => console.warn('[userBot] setChatMenuButton xatosi:', err.message));

  bot.start(async (ctx) => {
    const tg = ctx.from;
    await prisma.user.upsert({
      where: { telegramId: BigInt(tg.id) },
      update: { username: tg.username || null, firstName: tg.first_name || null, lastName: tg.last_name || null },
      create: {
        telegramId: BigInt(tg.id),
        username: tg.username || null,
        firstName: tg.first_name || null,
        lastName: tg.last_name || null,
      },
    });

    await ctx.reply(
      `Assalomu alaykum, ${tg.first_name || 'do\'stim'}! 🔫\n\n` +
        'CS2 skinlar auksioniga xush kelibsiz. Pastdagi tugma orqali auksionni oching, ' +
        'qiziqqan skiningizga narx taklif qiling va omadingizni sinab ko\'ring.',
      // DIQQAT: web_app tugmasi oddiy "reply keyboard" (Markup.keyboard) ichida
      // bo'lsa, Telegram.WebApp.initData BO'SH keladi (bu Telegramning o'zining
      // rasmiy xatti-harakati — https://core.telegram.org/bots/webapps#webappinitdata).
      // Shu sababli initData to'g'ri ishlashi uchun web_app tugmasi albatta
      // INLINE klaviaturada (xabarning o'ziga bog'langan tugma) bo'lishi kerak.
      Markup.inlineKeyboard([[Markup.button.webApp('🎮 Auksionni ochish', env.miniAppUrl)]])
    );
  });

  bot.help((ctx) =>
    ctx.reply(
      'Qanday ishlaydi:\n' +
        '1. "Auksionni ochish" tugmasini bosing.\n' +
        '2. Yoqqan skiningizni tanlang va narx taklif qiling.\n' +
        '3. Har bir taklif uchun narxning 25% i zaklad sifatida hisobingizdan ushlab qolinadi.\n' +
        '4. Auksionni yutsangiz, qolgan summa hisobingizdan yechiladi va skin sizniki bo\'ladi.\n\n' +
        'Hisobni to\'ldirish uchun Mini App ichidagi "To\'lov" bo\'limidan foydalaning.'
    )
  );

  bot.catch((err, ctx) => {
    console.error(`[userBot] xato (update ${ctx.updateType}):`, err);
  });

  return bot;
}

module.exports = { createUserBot };

/**
 * auctionScheduler kabi boshqa modullar foydalanuvchiga Telegram orqali
 * xabar yuborishi uchun. index.js botni yaratgandan keyin shu funksiyani
 * scheduler'ga ulaydi (setNotifier orqali) — shunda aylanma import kelib
 * chiqmaydi.
 */
function makeNotifier(bot) {
  return async (telegramId, text) => {
    if (!bot) return;
    await bot.telegram.sendMessage(String(telegramId), text);
  };
}
module.exports.makeNotifier = makeNotifier;

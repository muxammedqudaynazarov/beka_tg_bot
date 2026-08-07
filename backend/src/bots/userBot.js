const { Telegraf, Markup } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { safeUpsertUser } = require('../services/userService');

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

  const bot = new Telegraf(env.userBotToken);

  // Xabar yozish maydoni yonidagi doimiy "Menu" tugmasi — bu ham initData'ni
  // to'g'ri to'ldiradigan usullardan biri (inline tugma bilan bir qatorda) va
  // foydalanuvchiga istalgan vaqtda ilovani ochish imkonini beradi.
  bot.telegram.setChatMenuButton({
    menuButton: { type: 'web_app', text: 'Аукцион', web_app: { url: env.miniAppUrl } },
  }).catch((err) => console.warn('[userBot] setChatMenuButton xatosi:', err.message));

  bot.start(async (ctx) => {
    const tg = ctx.from;
    await safeUpsertUser({
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
      `Здравствуйте, ${tg.first_name || 'друг'}! 🔫\n\n` +
        'Добро пожаловать на аукцион скинов CS2. Откройте аукцион по кнопке ниже, ' +
        'делайте ставки на понравившиеся скины и испытайте удачу.',
      // DIQQAT: web_app tugmasi oddiy "reply keyboard" (Markup.keyboard) ichida
      // bo'lsa, Telegram.WebApp.initData BO'SH keladi (bu Telegramning o'zining
      // rasmiy xatti-harakati — https://core.telegram.org/bots/webapps#webappinitdata).
      // Shu sababli initData to'g'ri ishlashi uchun web_app tugmasi albatta
      // INLINE klaviaturada (xabarning o'ziga bog'langan tugma) bo'lishi kerak.
      Markup.inlineKeyboard([[Markup.button.webApp('🎮 Открыть аукцион', env.miniAppUrl)]])
    );
  });

  bot.help((ctx) =>
    ctx.reply(
      'Как это работает:\n' +
        '1. Нажмите кнопку «Открыть аукцион».\n' +
        '2. Выберите понравившийся скин и сделайте ставку.\n' +
        '3. За каждую ставку с вашего баланса удерживается 25% от цены в качестве залога.\n' +
        '4. Если вы выиграете аукцион, оставшаяся сумма спишется с баланса, и скин станет вашим.\n\n' +
        'Чтобы пополнить баланс, откройте раздел «Платежи» в Mini App.'
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

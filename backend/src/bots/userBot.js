const { Telegraf, Markup } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { safeUpsertUser } = require('../services/userService');
const { notifyText } = require('../services/notifier');

async function isAdminTelegramUser(telegramId) {
  if (!telegramId) return null;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (user && ['ADMIN', 'SUPERADMIN'].includes(user.role) && !user.isBanned) return user;
  return null;
}

// ============================================================================
// 3-band (yangi, ishonchli yechim): oldingi "inline" usuli Telegram'ning
// chosen_inline_result webhook'iga bog'liq edi — bu maxsus BotFather
// sozlamasini talab qiladi va ba'zan ishonchsiz yetkaziladi (aynan shu
// sabab avvalgi urinishlar "xabar keladi-yu, baza yangilanmaydi" holatiga
// olib kelgan bo'lishi mumkin).
//
// YANGI YECHIM — "forward" (xabarni yo'naytirish) orqali: Telegram bot
// O'ZIGA yuborilgan har qanday oddiy xabarni 100% ishonchli oladi (bu
// botning eng asosiy, hech qanday qo'shimcha sozlamasiz ishlaydigan
// funksiyasi). Shuning uchun endi:
//   1. Admin sotuvchi bilan (yoki istalgan chatda) yozishayotganda, o'sha
//      odamning BITTA xabarini uzoq bosib, "Forward" -> @cs2auksion_bot'ga
//      yo'naytiradi (2 marta bosish, hech narsa yozish shart emas).
//   2. Bot kimdan yo'naltirilganini avtomatik aniqlaydi (Telegram buni
//      forward_origin orqali beradi) va shu odamni "joriy sotuvchi" deb
//      belgilab qo'yadi (15 daqiqaga).
//   3. Admin ENDI botning o'zига (ya'ni shu yerga, forward qilingan joyga)
//      oddiygina "Predmet % Summa" deb yozadi — masalan "AWP % 50000".
//   4. Bot darhol bazaga yozadi va tasdiqlaydi.
//
// Muqobil (agar forward qilib bo'lmasa — masalan xabar allaqachon
// o'chirilgan bo'lsa): "username Predmet % Summa" yoki "id Predmet % Summa"
// deb ham to'g'ridan-to'g'ri yozish mumkin — bu ilgarigidek ishlayveradi.
// ============================================================================

const PENDING_MS = 15 * 60 * 1000; // 15 daqiqa
const pendingSeller = new Map(); // adminId (bizning DB id) -> { seller, expiresAt }

function setPendingSeller(adminId, seller) {
  pendingSeller.set(adminId, { seller, expiresAt: Date.now() + PENDING_MS });
}
function getPendingSeller(adminId) {
  const ctx = pendingSeller.get(adminId);
  if (!ctx) return null;
  if (Date.now() > ctx.expiresAt) {
    pendingSeller.delete(adminId);
    return null;
  }
  return ctx.seller;
}

const ITEM_AMOUNT_RE = /^(.+?)\s*%\s*(\d+(?:\.\d+)?)$/; // "Predmet % Summa"
const WITH_IDENTIFIER_RE = /^@?(\S+)\s+(.+?)\s*%\s*(\d+(?:\.\d+)?)$/; // "username/id Predmet % Summa"

function sellerLabel(seller) {
  return seller.username ? `@${seller.username}` : seller.firstName || String(seller.telegramId);
}

async function recordSale({ admin, seller, itemName, amount, ctx }) {
  const sale = await prisma.userSale.create({
    data: { sellerId: seller.id, recordedById: admin.id, itemName: itemName.trim(), agreedAmount: amount },
  });
  await prisma.adminAuditLog.create({
    data: { actorId: admin.id, action: 'USER_SALE_RECORDED', targetType: 'UserSale', targetId: sale.id, meta: { itemName, amount } },
  });
  console.log(`[sale] BAZAGA YOZILDI: saleId=${sale.id}, seller=${sellerLabel(seller)}, item="${itemName.trim()}", amount=${amount}`);

  await ctx.reply(
    `✅ Записано: «${itemName.trim()}» — ${amount.toLocaleString('ru-RU')} сум от ${sellerLabel(seller)}.\n` +
      `Выплата будет доступна через 8 дней.`
  );
  await notifyText(
    seller.telegramId,
    `✅ Ваш предмет «${itemName.trim()}» принят администратором за ${amount.toLocaleString('ru-RU')} сум. ` +
      `Выплата будет произведена в течение 8 дней после проверки сделки.`
  );
  pendingSeller.delete(admin.id);
}

function createUserBot() {
  if (!env.userBotToken) {
    console.warn('[userBot] USER_BOT_TOKEN sozlanmagan — foydalanuvchi boti ishga tushmaydi.');
    return null;
  }

  const bot = new Telegraf(env.userBotToken);

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

  // 3-band: admin botning O'Z shaxsiy chatiga yozadigan xabarlar — forward
  // orqali sotuvchini aniqlash, yoki "Predmet % Summa" bilan sotuvni yozish.
  bot.on('message', async (ctx, next) => {
    const text = ctx.message.text;
    if (text && text.startsWith('/')) return next(); // buyruqlarga (/start va h.k.) tegmaymiz

    const admin = await isAdminTelegramUser(ctx.from.id);
    if (!admin) return next(); // admin bo'lmasa — oddiy foydalanuvchi sifatida davom etadi

    // 1-QADAM: forward qilingan xabar — kimdan kelganini aniqlaymiz
    const origin = ctx.message.forward_origin;
    if (origin) {
      if (origin.type === 'hidden_user') {
        await ctx.reply(
          `⚠️ Bu foydalanuvchi forward orqali aniqlanishni cheklagan (maxfiylik sozlamasi). ` +
            `Iltimos, "username Predmet % Summa" yoki "id Predmet % Summa" ko'rinishida to'g'ridan-to'g'ri yozing.`
        );
        return;
      }
      if (origin.type === 'user') {
        const tgSeller = origin.sender_user;
        const seller = await safeUpsertUser({
          where: { telegramId: BigInt(tgSeller.id) },
          update: { username: tgSeller.username || null, firstName: tgSeller.first_name || null },
          create: {
            telegramId: BigInt(tgSeller.id),
            username: tgSeller.username || null,
            firstName: tgSeller.first_name || null,
          },
        });
        setPendingSeller(admin.id, seller);
        await ctx.reply(
          `🎯 Продавец определён: ${sellerLabel(seller)}.\n` +
            `Теперь напишите сюда: Предмет % Сумма (например: AWP % 50000)`
        );
        return;
      }
      // Kanal/guruhdan forward bo'lsa — bu sotuvchi bo'la olmaydi, e'tibor bermaymiz
      return;
    }

    if (!text) return; // rasm/fayl va h.k. — e'tibor bermaymiz

    // 2-QADAM (variant A): oldin forward qilingan bo'lsa, endi shunchaki
    // "Predmet % Summa" yetarli.
    const pending = getPendingSeller(admin.id);
    const simpleMatch = text.trim().match(ITEM_AMOUNT_RE);
    if (pending && simpleMatch) {
      const [, itemName, amountStr] = simpleMatch;
      return recordSale({ admin, seller: pending, itemName, amount: Number(amountStr), ctx });
    }

    // 2-QADAM (variant B, muqobil): forward qilinmagan bo'lsa ham,
    // "username/id Predmet % Summa" to'g'ridan-to'g'ri yozilishi mumkin.
    const withIdMatch = text.trim().match(WITH_IDENTIFIER_RE);
    if (withIdMatch) {
      const [, identifier, itemName, amountStr] = withIdMatch;
      const seller = /^\d+$/.test(identifier)
        ? await prisma.user.findUnique({ where: { telegramId: BigInt(identifier) } }).catch(() => null)
        : await prisma.user.findFirst({ where: { username: identifier } });
      if (!seller) {
        await ctx.reply(`⚠️ Пользователь "${identifier}" не найден в системе.`);
        return;
      }
      return recordSale({ admin, seller, itemName, amount: Number(amountStr), ctx });
    }

    // Yordam: format "%"ga yaqin ko'rinadi-yu, lekin mos kelmadi — jim
    // qolib, adminni chalkashtirib qo'ymaslik uchun aniq izoh beramiz.
    if (text.includes('%')) {
      await ctx.reply(
        pending
          ? `⚠️ Не удалось распознать. Продавец уже определён (${sellerLabel(pending)}) — просто напишите: Предмет % Сумма`
          : `⚠️ Не удалось распознать. Перешлите (forward) сообщение продавца, затем напишите: Предмет % Сумма.\n` +
            `Либо сразу: username Предмет % Сумма`
      );
    }
  });

  bot.catch((err, ctx) => {
    console.error(`[userBot] xato (update ${ctx.updateType}):`, err);
  });

  return bot;
}

module.exports = { createUserBot };

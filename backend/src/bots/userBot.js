const { Telegraf, Markup } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { safeUpsertUser } = require('../services/userService');
const { notifyText } = require('../services/notifier');

// 1-band: sotuv yozuvini kim yozayotgani darhol tekshiriladi (faqat admin
// uchun ishlaydi — boshqa hech kim bu formatdan foydalana olmaydi/bilmaydi,
// chunki natija umuman ko'rsatilmaydi).
async function isAdminTelegramUser(telegramId) {
  if (!telegramId) return null;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (user && ['ADMIN', 'SUPERADMIN'].includes(user.role) && !user.isBanned) return user;
  return null;
}

// "username Predmet % Summa" — masalan: "nks2level AWP % 5000" yoki "@nks2level AWP % 5000"
// MUHIM: username so'rovning O'ZIDA bo'lishi SHART — Telegram botga inline
// yozuv qaysi shaxsiy suhbatda yozilayotganini HECH QACHON bermaydi (bu
// ularning maxfiylik siyosati, aylanib o'tib bo'lmaydi). Shu sababli avvalgi
// "avval faollashtiring" oraliq bosqichi olib tashlandi — buning o'rniga
// endi sotuvchi to'g'ridan-to'g'ri so'rovning ichida ko'rsatiladi, bitta
// qadamda ishlaydi.
const SALE_QUERY_RE = /^@?(\S+)\s+(.+?)\s*%\s*(\d+(?:\.\d+)?)$/;

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

  // ===========================================================================
  // 1-band: admin, sotuvchi bilan shaxsiy yozishmada (yoki istalgan chatda)
  // "@cs2auksion_bot username Predmet % Summa" yozib, savdoni Admin App'ni
  // ochmasdan, bitta qadamda bazaga yozadi. FAQAT admin uchun ishlaydi —
  // boshqa foydalanuvchilar bu inline natijani UMUMAN ko'rmaydi.
  // SOZLASH (shart!): @BotFather -> /setinline -> @cs2auksion_bot -> istalgan
  // matn, so'ng /setinlinefeedback -> @cs2auksion_bot -> 100%.
  // ===========================================================================
  bot.on('inline_query', async (ctx) => {
    const admin = await isAdminTelegramUser(ctx.from.id);
    if (!admin) return ctx.answerInlineQuery([]); // adminlardan boshqa hech kimga hech narsa ko'rsatilmaydi

    const query = (ctx.inlineQuery.query || '').trim();
    const match = query.match(SALE_QUERY_RE);
    // Username'siz, lekin "Predmet % Summa" qismi to'g'ri yozilgan holatni
    // ALOHIDA aniqlaymiz — bu eng ko'p uchraydigan xato, aniqroq yordam beramiz.
    const missingUsernameOnly = !match && /^(.+?)\s*%\s*(\d+(?:\.\d+)?)$/.test(query);

    if (missingUsernameOnly) {
      return ctx.answerInlineQuery(
        [{
          type: 'article',
          id: 'hint',
          title: '⚠️ В начале не хватает username или ID продавца',
          description: `Добавьте username перед этим: username ${query}`,
          input_message_content: {
            message_text: `⚠️ В начале нужно добавить username (или Telegram ID) продавца.\nДолжно быть: username ${query}`,
          },
        }],
        { cache_time: 0 }
      );
    }

    if (!match) {
      return ctx.answerInlineQuery(
        [{
          type: 'article',
          id: 'hint',
          title: '⚠️ Не хватает username/ID продавца',
          description: `Формат: username Предмет % Сумма (или Telegram ID вместо username)`,
          input_message_content: {
            message_text:
              `⚠️ Не хватает username (или Telegram ID) продавца в начале.\n\n` +
              `Правильный формат: username Предмет % Сумма\n` +
              `Например: nks2level AWP % 50000`,
          },
        }],
        { cache_time: 0 }
      );
    }

    const [, identifier, itemName, amountStr] = match;
    const amount = Number(amountStr);
    const seller = /^\d+$/.test(identifier)
      ? await prisma.user.findUnique({ where: { telegramId: BigInt(identifier) } }).catch(() => null)
      : await prisma.user.findFirst({ where: { username: identifier } });

    if (!seller) {
      return ctx.answerInlineQuery(
        [{
          type: 'article',
          id: 'not-found',
          title: `⚠️ Пользователь "${identifier}" не найден`,
          description: 'Проверьте username или Telegram ID (см. в разделе «Пользователи»)',
          input_message_content: { message_text: `⚠️ Пользователь "${identifier}" не найден в системе.` },
        }],
        { cache_time: 0 }
      );
    }

    const sellerLabel = seller.username ? `@${seller.username}` : seller.firstName || identifier;
    return ctx.answerInlineQuery(
      [{
        type: 'article',
        id: 'confirm',
        title: `✅ ${itemName.trim()} — ${amount.toLocaleString('ru-RU')} сум`,
        description: `Продавец: ${sellerLabel} · нажмите, чтобы отправить`,
        input_message_content: {
          message_text:
            `✅ Обмен принят: «${itemName.trim()}» за ${amount.toLocaleString('ru-RU')} сум.\n` +
            `Выплата будет произведена после проверки (в течение нескольких дней).`,
        },
      }],
      { cache_time: 0 }
    );
  });

  bot.on('chosen_inline_result', async (ctx) => {
    const result = ctx.update.chosen_inline_result;
    if (!result || result.result_id !== 'confirm') return;

    const admin = await isAdminTelegramUser(result.from.id);
    if (!admin) return;
    console.log(`[inline-sale] Boshlanmoqda: adminId=${admin.id}, so'rov="${result.query}"`);

    const match = (result.query || '').trim().match(SALE_QUERY_RE);
    if (!match) {
      console.warn(`[inline-sale] Format mos kelmadi: "${result.query}"`);
      return;
    }
    const [, identifier, itemName, amountStr] = match;
    const amount = Number(amountStr);
    // 2-band: har bir foydalanuvchida username bo'lavermaydi (bu Telegram'da
    // ixtiyoriy) — shuning uchun agar identifikator FAQAT raqamlardan iborat
    // bo'lsa, uni Telegram ID sifatida qidiramiz; aks holda username sifatida.
    const seller = /^\d+$/.test(identifier)
      ? await prisma.user.findUnique({ where: { telegramId: BigInt(identifier) } }).catch(() => null)
      : await prisma.user.findFirst({ where: { username: identifier } });
    if (!seller) {
      console.warn(`[inline-sale] Sotuvchi topilmadi: identifikator="${identifier}"`);
      return;
    }
    console.log(`[inline-sale] Sotuvchi topildi: id=${seller.id}, telegramId=${seller.telegramId}`);

    const sale = await prisma.userSale.create({
      data: { sellerId: seller.id, recordedById: admin.id, itemName: itemName.trim(), agreedAmount: amount },
    });
    console.log(`[inline-sale] BAZAGA YOZILDI: saleId=${sale.id}, itemName="${itemName.trim()}", amount=${amount}`);
    await prisma.adminAuditLog.create({
      data: { actorId: admin.id, action: 'USER_SALE_RECORDED_INLINE', targetType: 'UserSale', targetId: sale.id, meta: { itemName, amount } },
    });

    // Adminning O'ZIGA (botning shaxsiy chatida) alohida tasdiq — chunki bot
    // sotuvchi bilan adminning shaxsiy suhbatiga ALOHIDA xabar yubora olmaydi
    // (Telegram bunga ruxsat bermaydi, faqat o'z suhbatiga yuborishi mumkin).
    // DIQQAT: bu xabar sotuvchi bilan yozishayotgan chatga EMAS, balki
    // sizning @cs2auksion_bot bilan bo'lgan ALOHIDA shaxsiy chatingizga keladi.
    try {
      await bot.telegram.sendMessage(
        result.from.id,
        `📋 Записано в систему: «${itemName.trim()}» — ${amount.toLocaleString('ru-RU')} сум (${seller.username ? '@' + seller.username : seller.firstName || identifier}).\n` +
          `Выплата будет доступна через 8 дней.`
      );
      console.log(`[inline-sale] Admin'ga tasdiq yuborildi (adminTelegramId=${result.from.id})`);
    } catch (err) {
      console.error(`[inline-sale] Admin'ga tasdiq YUBORILMADI:`, err.message);
    }

    // Sotuvchiga ham rasmiy xabar — ishonchli kanal orqali (bot orqali, chat
    // kontekstiga bog'liq emas).
    await notifyText(
      seller.telegramId,
      `✅ Ваш предмет «${itemName.trim()}» принят администратором за ${amount.toLocaleString('ru-RU')} сум. ` +
        `Выплата будет произведена в течение 8 дней после проверки сделки.`
    );
    console.log(`[inline-sale] Yakunlandi: saleId=${sale.id}`);
  });

  bot.catch((err, ctx) => {
    console.error(`[userBot] xato (update ${ctx.updateType}):`, err);
  });

  return bot;
}

module.exports = { createUserBot };

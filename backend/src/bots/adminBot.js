const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { safeUpsertUser } = require('../services/userService');
const { getActiveSeller, clearActiveSeller } = require('../services/inlineSaleContext');
const { notifyText } = require('../services/notifier');

// 2-band: bu ALOHIDA bot (masalan @cs2admin_auksion_bot), lekin xuddi shu
// backend jarayoni ichida ishlaydi va xuddi shu ma'lumotlar bazasidan
// foydalanadi — shuning uchun "tizim bitta" talabi bajariladi.
//
// MUHIM (2-band, "qat'iyan man etiladi"): bu bot orqali HECH QACHON auksionda
// narx belgilash funksiyasi yo'q — bunday tugma yoki buyruq atayin yaratilmagan.
//
// Yangi auksion yaratish endi faqat Admin Mini App orqali (kategoriya/
// sub-kategoriya tanlash uchun chat-sehrgar noqulay bo'lardi — Mini App'da
// live-search select bilan ancha qulayroq).

async function isAdminTelegramUser(telegramId) {
  if (env.superadminTelegramIds.includes(String(telegramId))) {
    // Superadmin ro'yxatidagi ID birinchi marta yozilganda avtomatik SUPERADMIN qilinadi
    const user = await safeUpsertUser({
      where: { telegramId: BigInt(telegramId) },
      update: { role: 'SUPERADMIN' },
      create: { telegramId: BigInt(telegramId), role: 'SUPERADMIN' },
    });
    return user;
  }
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN')) return user;
  return null;
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🆕 Yangi auksion (Mini App)', env.adminMiniAppUrl)],
    [Markup.button.callback('🗂 Kategoriyalar', 'menu:categories')],
    [Markup.button.callback('⏱ Auksion vaqtini o\'zgartirish', 'menu:auction_time')],
    [Markup.button.callback('👥 Foydalanuvchilar / Ban', 'menu:users')],
  ]);
}

// ---------------------------------------------------------------------------
// SCENE: Yangi kategoriya qo'shish (3.a-band)
// ---------------------------------------------------------------------------
const newCategoryScene = new Scenes.WizardScene(
  'NEW_CATEGORY',
  async (ctx) => {
    await ctx.reply('Yangi kategoriya nomini kiriting (masalan: AK-47, Glock, Karambit):');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const name = (ctx.message?.text || '').trim();
    if (!name) {
      await ctx.reply('Bekor qilindi.');
      return ctx.scene.leave();
    }
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const category = await prisma.weaponCategory.create({ data: { name, slug } });
    await ctx.reply(`✅ "${category.name}" kategoriyasi yaratildi.`, mainMenuKeyboard());
    return ctx.scene.leave();
  }
);

// ---------------------------------------------------------------------------
// SCENE: Auksion vaqtini o'zgartirish (3.b-band)
// ---------------------------------------------------------------------------
const auctionTimeScene = new Scenes.WizardScene(
  'AUCTION_TIME',
  async (ctx) => {
    const active = await prisma.auction.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { endsAt: 'asc' },
      take: 20,
    });
    if (!active.length) {
      await ctx.reply('Hozircha faol auksionlar yo\'q.');
      return ctx.scene.leave();
    }
    const buttons = active.map((a) => [
      Markup.button.callback(`${a.skinName} (tugaydi: ${a.endsAt.toLocaleString('uz-UZ')})`, `pick:${a.id}`),
    ]);
    await ctx.reply('Qaysi auksion vaqtini o\'zgartiramiz?', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    ctx.wizard.state.auctionId = ctx.callbackQuery.data.replace('pick:', '');
    await ctx.answerCbQuery();
    await ctx.reply(
      'Auksion hozirdan qancha daqiqadan keyin tugasin? (musbat son yozing, masalan 30) — ' +
        'yoki quyidagi tugma orqali darhol bekor qiling:',
      Markup.inlineKeyboard([[Markup.button.callback('🛑 Auksionni bekor qilish', 'cancel_auction')]])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const dbUser = ctx.state.dbUser;

    // Aniq, matnga bog'liq bo'lmagan bekor qilish yo'li — tugma orqali
    // (avvalgi "0 deb yozing" konvensiyasi matn talqin qilishda xato berishi
    // mumkin edi, masalan ba'zi klaviaturalar "0" o'rniga emoji-raqam yuborishi).
    if (ctx.callbackQuery?.data === 'cancel_auction') {
      await ctx.answerCbQuery();
      const auction = await prisma.auction.update({
        where: { id: ctx.wizard.state.auctionId },
        data: { status: 'CANCELLED' },
      });
      await prisma.adminAuditLog.create({
        data: { actorId: dbUser.id, action: 'AUCTION_CANCELLED', targetType: 'Auction', targetId: auction.id },
      });
      await ctx.reply('🛑 Auksion bekor qilindi.', mainMenuKeyboard());
      return ctx.scene.leave();
    }

    const minutes = Number(ctx.message?.text);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      await ctx.reply(
        'Noto\'g\'ri qiymat. Musbat son kiriting (masalan 30), yoki yuqoridagi "🛑 Auksionni bekor qilish" tugmasini bosing:'
      );
      return;
    }
    const newEndsAt = new Date(Date.now() + minutes * 60 * 1000);
    const auction = await prisma.auction.update({
      where: { id: ctx.wizard.state.auctionId },
      data: { endsAt: newEndsAt },
    });
    await prisma.adminAuditLog.create({
      data: {
        actorId: dbUser.id,
        action: 'AUCTION_TIME_CHANGED',
        targetType: 'Auction',
        targetId: auction.id,
        meta: { newEndsAt },
      },
    });
    await ctx.reply(`⏱ Yangi tugash vaqti: ${newEndsAt.toLocaleString('uz-UZ')}`, mainMenuKeyboard());
    return ctx.scene.leave();
  }
);

// ---------------------------------------------------------------------------
// SCENE: Foydalanuvchini ban/unban qilish (3.d-band)
// ---------------------------------------------------------------------------
const userManageScene = new Scenes.WizardScene(
  'USER_MANAGE',
  async (ctx) => {
    await ctx.reply('Foydalanuvchi @username\'ini (@ belgisisiz) yoki Telegram ID\'sini kiriting:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const query = (ctx.message?.text || '').trim().replace('@', '');
    const user = /^\d+$/.test(query)
      ? await prisma.user.findUnique({ where: { telegramId: BigInt(query) } })
      : await prisma.user.findFirst({ where: { username: query } });

    if (!user) {
      await ctx.reply('Foydalanuvchi topilmadi. Qaytadan kiriting yoki /cancel bilan bekor qiling:');
      return;
    }
    ctx.wizard.state.targetUserId = user.id;
    await ctx.reply(
      `👤 ${user.firstName || ''} (@${user.username || 'username yo\'q'})\n` +
        `Holat: ${user.isBanned ? '🚫 Bloklangan' : '✅ Faol'}\n` +
        `Balans: ${user.balance} so'm | Reyting: ${user.ratingScore}`,
      Markup.inlineKeyboard([
        user.isBanned
          ? [Markup.button.callback('✅ Blokdan chiqarish', 'action:unban')]
          : [Markup.button.callback('🚫 Ban qilish', 'action:ban')],
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const action = ctx.callbackQuery.data;
    const dbUser = ctx.state.dbUser;
    if (action === 'action:ban') {
      await prisma.user.update({
        where: { id: ctx.wizard.state.targetUserId },
        data: { isBanned: true, bannedAt: new Date() },
      });
      await prisma.adminAuditLog.create({
        data: { actorId: dbUser.id, action: 'USER_BANNED', targetType: 'User', targetId: ctx.wizard.state.targetUserId },
      });
      await ctx.answerCbQuery('Bloklandi');
      await ctx.reply('🚫 Foydalanuvchi bloklandi.', mainMenuKeyboard());
    } else {
      await prisma.user.update({
        where: { id: ctx.wizard.state.targetUserId },
        data: { isBanned: false, bannedReason: null, bannedAt: null },
      });
      await prisma.adminAuditLog.create({
        data: { actorId: dbUser.id, action: 'USER_UNBANNED', targetType: 'User', targetId: ctx.wizard.state.targetUserId },
      });
      await ctx.answerCbQuery('Blokdan chiqarildi');
      await ctx.reply('✅ Foydalanuvchi blokdan chiqarildi.', mainMenuKeyboard());
    }
    return ctx.scene.leave();
  }
);

function createAdminBot() {
  if (!env.adminBotToken) {
    console.warn('[adminBot] ADMIN_BOT_TOKEN sozlanmagan — admin boti ishga tushmaydi.');
    return null;
  }

  const bot = new Telegraf(env.adminBotToken);

  // Foydalanuvchi botidagi kabi — doimiy Menu tugmasi (initData to'g'ri
  // ishlashi uchun; batafsil izoh userBot.js'da).
  bot.telegram.setChatMenuButton({
    menuButton: { type: 'web_app', text: 'Admin panel', web_app: { url: env.adminMiniAppUrl } },
  }).catch((err) => console.warn('[adminBot] setChatMenuButton xatosi:', err.message));
  const stage = new Scenes.Stage([newCategoryScene, auctionTimeScene, userManageScene]);
  bot.use(session());
  bot.use(stage.middleware());

  // Har bir so'rovda: foydalanuvchi haqiqatan ham admin ekanini tekshiramiz.
  bot.use(async (ctx, next) => {
    const dbUser = await isAdminTelegramUser(ctx.from?.id);
    if (!dbUser) {
      if (ctx.updateType === 'message') {
        await ctx.reply('⛔️ Sizda administrator huquqi yo\'q. Bu bot faqat tizim adminlari uchun.');
      }
      return; // zanjirni to'xtatamiz — keyingi handlerlarga o'tkazmaymiz
    }
    ctx.state.dbUser = dbUser;
    return next();
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      `Salom, ${ctx.state.dbUser.role === 'SUPERADMIN' ? 'bosh admin' : 'admin'}! ` +
        `Yangi auksion yaratish uchun eng qulay yo'l — pastdagi "🛠 Admin panel" tugmasi (Mini App). ` +
        `Quyidagi tugmalar orqali ham xuddi shu amallarni bajarishingiz mumkin:`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🛠 Admin panel (Mini App)', env.adminMiniAppUrl)],
        ...mainMenuKeyboard().reply_markup.inline_keyboard,
      ])
    );
  });

  bot.command('menu', (ctx) => ctx.reply('Boshqaruv paneli:', mainMenuKeyboard()));
  bot.command('cancel', async (ctx) => {
    await ctx.scene.leave();
    await ctx.reply('Bekor qilindi.', mainMenuKeyboard());
  });

  bot.action('menu:categories', async (ctx) => {
    await ctx.answerCbQuery();
    const categories = await prisma.weaponCategory.findMany({ where: { isActive: true } });
    const list = categories.map((c) => `• ${c.name}`).join('\n') || 'Hali kategoriya yo\'q.';
    await ctx.reply(
      `🗂 Kategoriyalar:\n${list}`,
      Markup.inlineKeyboard([[Markup.button.callback('➕ Yangi kategoriya', 'menu:new_category')]])
    );
  });
  bot.action('menu:new_category', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('NEW_CATEGORY');
  });
  bot.action('menu:auction_time', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('AUCTION_TIME');
  });
  bot.action('menu:users', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('USER_MANAGE');
  });

  // ===========================================================================
  // 3-band: shaxsiy xabarda "@bot ItemName % Summa" yozib, savdoni darhol
  // qayd etish. Avval Admin Mini App > Foydalanuvchilar'dan sotuvchi
  // "faollashtirilgan" bo'lishi kerak (inlineSaleContext.js'ga qarang —
  // Telegram bot'ga inline so'rov QAYSI chatda yozilayotganini bermaydi,
  // shuning uchun sotuvchini oldindan belgilab qo'yish shart).
  // SOZLASH: BotFather'da shu bot uchun /setinline VA /setinlinefeedback
  // (100% ga) yoqilgan bo'lishi SHART — aks holda bu handlerlar chaqirilmaydi.
  // ===========================================================================
  const SALE_QUERY_RE = /^(.+?)\s*%\s*(\d+(?:\.\d+)?)$/;

  bot.on('inline_query', async (ctx) => {
    const query = (ctx.inlineQuery.query || '').trim();
    const match = query.match(SALE_QUERY_RE);
    const active = getActiveSeller(ctx.from.id);

    if (!active) {
      return ctx.answerInlineQuery(
        [{
          type: 'article',
          id: 'no-context',
          title: '⚠️ Avval sotuvchini faollashtiring',
          description: 'Admin Mini App > Foydalanuvchilar > sotuvchini toping > "Faollashtirish"',
          input_message_content: { message_text: 'ℹ️ Сначала активируйте продавца в Админ-панели (раздел «Пользователи»).' },
        }],
        { cache_time: 0 }
      );
    }

    if (!match) {
      return ctx.answerInlineQuery(
        [{
          type: 'article',
          id: 'hint',
          title: `Формат: Предмет % Сумма (для @${active.sellerUsername || active.sellerFirstName})`,
          description: 'Например: AWP | Asiimov % 500000',
          input_message_content: { message_text: 'ℹ️ Формат: Предмет % Сумма' },
        }],
        { cache_time: 0 }
      );
    }

    const [, itemName, amountStr] = match;
    const amount = Number(amountStr);
    const label = active.sellerUsername ? `@${active.sellerUsername}` : active.sellerFirstName;

    return ctx.answerInlineQuery(
      [{
        type: 'article',
        id: 'confirm',
        title: `✅ ${itemName.trim()} — ${amount.toLocaleString('ru-RU')} сум`,
        description: `Продавец: ${label} · нажмите, чтобы отправить`,
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
    if (!result || result.result_id !== 'confirm') return; // faqat haqiqiy tasdiqlash natijasi qayd etiladi

    const match = (result.query || '').trim().match(SALE_QUERY_RE);
    const active = getActiveSeller(result.from.id);
    if (!match || !active) return;

    const [, itemName, amountStr] = match;
    const amount = Number(amountStr);

    const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(result.from.id) } });
    if (!admin) return;

    const sale = await prisma.userSale.create({
      data: {
        sellerId: active.sellerId,
        recordedById: admin.id,
        itemName: itemName.trim(),
        agreedAmount: amount,
      },
    });

    // Adminning O'ZIGA (botning shaxsiy chatida) alohida tasdiq — chunki bot
    // sotuvchi bilan adminning shaxsiy suhbatiga ALOHIDA xabar yubora olmaydi
    // (Telegram bunga ruxsat bermaydi, faqat o'z suhbatiga yuborishi mumkin).
    await bot.telegram.sendMessage(
      result.from.id,
      `📋 Записано в систему: «${itemName.trim()}» — ${amount.toLocaleString('ru-RU')} сум ` +
        `(${active.sellerUsername ? '@' + active.sellerUsername : active.sellerFirstName}).\n` +
        `Выплата будет доступна через 8 дней.`
    );

    // 3-band: sotuvchiga @cs2auksion_bot (foydalanuvchi boti) orqali ham
    // rasmiy xabar — bu ishonchli kanal, chat kontekstiga bog'liq emas.
    await notifyText(
      active.sellerTelegramId,
      `✅ Ваш предмет «${itemName.trim()}» принят администратором за ${amount.toLocaleString('ru-RU')} сум. ` +
        `Выплата будет произведена в течение 8 дней после проверки сделки.`
    );

    clearActiveSeller(result.from.id);
    await prisma.adminAuditLog.create({
      data: { actorId: admin.id, action: 'USER_SALE_RECORDED_INLINE', targetType: 'UserSale', targetId: sale.id, meta: { itemName, amount } },
    });
  });

  bot.catch((err, ctx) => {
    console.error(`[adminBot] xato (update ${ctx.updateType}):`, err);
  });

  return bot;
}

module.exports = { createAdminBot };

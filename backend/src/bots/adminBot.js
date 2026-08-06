const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { env } = require('../config/env');
const prisma = require('../db/prisma');
const { buildTelegrafOptions } = require('./telegrafOptions');

// 2-band: bu ALOHIDA bot (masalan @cs2admin_auksion_bot), lekin xuddi shu
// backend jarayoni ichida ishlaydi va xuddi shu ma'lumotlar bazasidan
// foydalanadi — shuning uchun "tizim bitta" talabi bajariladi.
//
// MUHIM (2-band, "qat'iyan man etiladi"): bu bot orqali HECH QACHON auksionda
// narx belgilash funksiyasi yo'q — bunday tugma yoki buyruq atayin yaratilmagan.

const RARITIES = ['CONSUMER', 'INDUSTRIAL', 'MILSPEC', 'RESTRICTED', 'CLASSIFIED', 'COVERT', 'GOLD'];
const RARITY_LABELS = {
  CONSUMER: 'Oq (Consumer)',
  INDUSTRIAL: 'Ochiq ko\'k (Industrial)',
  MILSPEC: 'Ko\'k (Mil-Spec)',
  RESTRICTED: 'Fiolet (Restricted)',
  CLASSIFIED: 'Pushti (Classified)',
  COVERT: 'Qizil (Covert)',
  GOLD: 'Oltin (Pichoq/Qo\'lqop)',
};
const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];

async function isAdminTelegramUser(telegramId) {
  if (env.superadminTelegramIds.includes(String(telegramId))) {
    // Superadmin ro'yxatidagi ID birinchi marta yozilganda avtomatik SUPERADMIN qilinadi
    const user = await prisma.user.upsert({
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
    [Markup.button.callback('🗂 Kategoriyalar', 'menu:categories')],
    [Markup.button.callback('🆕 Yangi auksion', 'menu:new_auction')],
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
// SCENE: Yangi auksion qo'shish (3.c-band) — rasm, nom, kategoriya, format factory,
// StatTrack, narx — barchasi ketma-ket so'raladi.
// ---------------------------------------------------------------------------
const newAuctionScene = new Scenes.WizardScene(
  'NEW_AUCTION',
  async (ctx) => {
    ctx.wizard.state.draft = {};
    await ctx.reply('Skin rasmini yuboring (rasm sifatida) YOKI rasm havolasini (URL) yozing.');
    return ctx.wizard.next();
  },
  async (ctx) => {
    let imageUrl = null;
    if (ctx.message?.photo?.length) {
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      imageUrl = await ctx.telegram.getFileLink(fileId).then((l) => l.toString());
    } else if (ctx.message?.text?.startsWith('http')) {
      imageUrl = ctx.message.text.trim();
    }
    if (!imageUrl) {
      await ctx.reply('Rasm topilmadi. Iltimos rasm yuboring yoki https bilan boshlanuvchi havola yozing.');
      return; // shu bosqichda qoladi
    }
    ctx.wizard.state.draft.imageUrl = imageUrl;
    await ctx.reply('Skin nomini kiriting (masalan: "AK-47 | Redline"):');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.draft.skinName = (ctx.message?.text || '').trim();
    const categories = await prisma.weaponCategory.findMany({ where: { isActive: true } });
    if (!categories.length) {
      await ctx.reply('Avval kamida bitta kategoriya yarating ("🗂 Kategoriyalar" menyusidan).');
      return ctx.scene.leave();
    }
    const buttons = categories.map((c) => [Markup.button.callback(c.name, `cat:${c.id}`)]);
    await ctx.reply('Kategoriyani tanlang:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Iltimos, tugmalardan birini tanlang.');
      return;
    }
    const categoryId = ctx.callbackQuery.data.replace('cat:', '');
    ctx.wizard.state.draft.categoryId = categoryId;
    await ctx.answerCbQuery();
    const buttons = RARITIES.map((r) => [Markup.button.callback(RARITY_LABELS[r], `rarity:${r}`)]);
    await ctx.reply('Kategoriya rangini (rarity) tanlang:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Iltimos, tugmalardan birini tanlang.');
      return;
    }
    const rarity = ctx.callbackQuery.data.replace('rarity:', '');
    ctx.wizard.state.draft.rarity = rarity;
    await ctx.answerCbQuery();
    await ctx.reply('Format factory (float) qiymatini kiriting, masalan: 0.132541');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const floatValue = Number(ctx.message?.text);
    if (!Number.isFinite(floatValue) || floatValue < 0 || floatValue > 1) {
      await ctx.reply('Noto\'g\'ri qiymat. 0 va 1 oralig\'ida son kiriting (masalan 0.1325410):');
      return;
    }
    ctx.wizard.state.draft.floatValue = floatValue;
    const buttons = WEARS.map((w) => [Markup.button.callback(w, `wear:${w}`)]);
    await ctx.reply('Format factory kategoriyasini tanlang:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Iltimos, tugmalardan birini tanlang.');
      return;
    }
    ctx.wizard.state.draft.wearCondition = ctx.callbackQuery.data.replace('wear:', '');
    await ctx.answerCbQuery();
    await ctx.reply(
      'StatTrak™ mi?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Ha', 'stattrak:yes'), Markup.button.callback('Yo\'q', 'stattrak:no')],
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Iltimos, tugmalardan birini tanlang.');
      return;
    }
    ctx.wizard.state.draft.isStatTrak = ctx.callbackQuery.data === 'stattrak:yes';
    await ctx.answerCbQuery();
    await ctx.reply('Boshlang\'ich narxni kiriting (so\'mda), masalan: 150000');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const price = Number(ctx.message?.text);
    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply('Noto\'g\'ri narx. Musbat son kiriting:');
      return;
    }
    ctx.wizard.state.draft.startPrice = price;
    await ctx.reply('Auksion necha daqiqa davom etsin? (masalan: 60)');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const minutes = Number(ctx.message?.text);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      await ctx.reply('Noto\'g\'ri qiymat. Musbat son kiriting (daqiqada):');
      return;
    }
    const draft = ctx.wizard.state.draft;
    const endsAt = new Date(Date.now() + minutes * 60 * 1000);

    const dbUser = ctx.state.dbUser;
    const auction = await prisma.auction.create({
      data: {
        skinName: draft.skinName,
        imageUrl: draft.imageUrl,
        categoryId: draft.categoryId,
        rarity: draft.rarity,
        floatValue: draft.floatValue,
        wearCondition: draft.wearCondition,
        isStatTrak: draft.isStatTrak,
        startPrice: draft.startPrice,
        currentPrice: draft.startPrice,
        status: 'ACTIVE',
        endsAt,
        originalEndsAt: endsAt,
        createdById: dbUser.id,
      },
    });
    await prisma.adminAuditLog.create({
      data: { actorId: dbUser.id, action: 'AUCTION_CREATED', targetType: 'Auction', targetId: auction.id },
    });

    await ctx.reply(
      `✅ Auksion yaratildi!\n\n` +
        `${draft.skinName}\nBoshlang'ich narx: ${draft.startPrice.toLocaleString('uz-UZ')} so'm\n` +
        `Davomiyligi: ${minutes} daqiqa`,
      mainMenuKeyboard()
    );
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
      'Auksion hozirdan qancha daqiqadan keyin tugasin? (musbat son yozing, masalan 30). ' +
        'Darhol bekor qilish uchun 0 yozing.'
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const minutes = Number(ctx.message?.text);
    if (!Number.isFinite(minutes) || minutes < 0) {
      await ctx.reply('Noto\'g\'ri qiymat. Musbat son (yoki bekor qilish uchun 0) kiriting:');
      return;
    }
    const dbUser = ctx.state.dbUser;
    if (minutes === 0) {
      const auction = await prisma.auction.update({
        where: { id: ctx.wizard.state.auctionId },
        data: { status: 'CANCELLED' },
      });
      await prisma.adminAuditLog.create({
        data: { actorId: dbUser.id, action: 'AUCTION_CANCELLED', targetType: 'Auction', targetId: auction.id },
      });
      await ctx.reply('🛑 Auksion bekor qilindi.', mainMenuKeyboard());
    } else {
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
    }
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

  const bot = new Telegraf(env.adminBotToken, buildTelegrafOptions());

  // Foydalanuvchi botidagi kabi — doimiy Menu tugmasi (initData to'g'ri
  // ishlashi uchun; batafsil izoh userBot.js'da).
  bot.telegram.setChatMenuButton({
    menuButton: { type: 'web_app', text: 'Admin panel', web_app: { url: env.adminMiniAppUrl } },
  }).catch((err) => console.warn('[adminBot] setChatMenuButton xatosi:', err.message));
  const stage = new Scenes.Stage([newCategoryScene, newAuctionScene, auctionTimeScene, userManageScene]);
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
  bot.action('menu:new_auction', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('NEW_AUCTION');
  });
  bot.action('menu:auction_time', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('AUCTION_TIME');
  });
  bot.action('menu:users', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('USER_MANAGE');
  });

  bot.catch((err, ctx) => {
    console.error(`[adminBot] xato (update ${ctx.updateType}):`, err);
  });

  return bot;
}

module.exports = { createAdminBot };

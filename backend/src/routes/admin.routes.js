const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyText, notifyPhoto } = require('../services/notifier');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPERADMIN'));

async function logAction(actorId, action, targetType, targetId, meta) {
  await prisma.adminAuditLog.create({ data: { actorId, action, targetType, targetId, meta } });
}

// 2-band: Telegram'ning "Markdown" (legacy) rejimi FAQAT yagona *bold* va
// _italic_ belgilarini tushunadi — ko'pchilik odatlangan **bold**/__italic__
// (qo'sh belgili) formatini emas. Shu sabab admin qo'sh belgi bilan yozganda
// hech narsa ishlamay, xom matn sifatida ketardi. Bu yerda ikkalasini ham
// qabul qilib, Telegram tushunadigan yagona-belgili formatga o'giramiz.
function normalizeMarkdownForTelegram(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // **bold** -> *bold*
    .replace(/__(.+?)__/g, '_$1_');    // __italic__ -> _italic_
}

// 9-band: shu "Тип"lardagi narsalarda format factory (float/wear) YO'Q —
// admin forma bilan bir xil ro'yxat, seed.js'dagi Тип nomlariga mos bo'lishi shart.
const NO_FLOAT_TYPE_NAMES = ['Ключи', 'Стикеры', 'Брелки', 'Агенты', 'Граффити', 'Значки', 'Наборы музыки', 'Кейсы и Капсулы'];

async function subcategoryNeedsFloat(subcategoryId) {
  const sub = await prisma.weaponSubcategory.findUnique({ where: { id: subcategoryId }, include: { category: true } });
  if (!sub) return true; // topilmasa, xavfsiz tomonga — talab qilingan deb hisoblaymiz
  return !NO_FLOAT_TYPE_NAMES.includes(sub.category.name);
}

// ===========================================================================
// 7-band: BARCHA foydalanuvchilarga bir vaqtda xabar yuborish (rasm bilan
// yoki rasmsiz). Yuborish fon jarayonida amalga oshadi (javob darhol
// qaytadi), Telegram'ning so'rov chegarasiga hurmat sifatida har bir xabar
// orasida qisqa tanaffus qilinadi.
// ===========================================================================

router.get('/broadcasts', async (req, res) => {
  const items = await prisma.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5, // 6-band: faqat oxirgi 5tasi ko'rsatiladi — bazada HAMMASI saqlanadi
    include: { admin: { select: { firstName: true, username: true } } },
  });
  res.json({ items });
});

router.post('/broadcasts', async (req, res) => {
  const { message, imageUrl } = req.body || {};
  const trimmed = normalizeMarkdownForTelegram(String(message || '').trim());
  if (!trimmed) return res.status(400).json({ error: 'Текст сообщения обязателен.' });

  const broadcast = await prisma.broadcast.create({
    data: { adminId: req.user.id, message: trimmed, imageUrl: imageUrl || null },
  });
  await logAction(req.user.id, 'BROADCAST_STARTED', 'Broadcast', broadcast.id, {});

  // Javobni darhol qaytaramiz — yuborish fon jarayonida davom etadi,
  // holatni GET /broadcasts orqali keyinroq ko'rish mumkin.
  res.status(202).json({ ok: true, broadcastId: broadcast.id });

  setImmediate(async () => {
    const users = await prisma.user.findMany({ where: { isBanned: false }, select: { telegramId: true } });
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      const ok = broadcast.imageUrl
        ? await notifyPhoto(u.telegramId, broadcast.imageUrl, trimmed, { parse_mode: 'Markdown' })
        : await notifyText(u.telegramId, trimmed, { parse_mode: 'Markdown' });
      if (ok) sent++; else failed++;
      // Telegram bot API'ning umumiy chegarasi ~30 xabar/soniya — xavfsiz
      // bo'lish uchun tanaffus qilamiz.
      await new Promise((r) => setTimeout(r, 40));
    }
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { sentCount: sent, failedCount: failed } });
    console.log(`[broadcast] ${broadcast.id}: ${sent} muvaffaqiyatli, ${failed} muvaffaqiyatsiz.`);
  });
});

// 3.c-band: Yangi auksion (skin) qo'shish
router.post('/auctions', async (req, res) => {
  const {
    skinName,
    imageUrl,
    subcategoryId,
    rarity,
    floatValue,
    wearCondition,
    isStatTrak,
    paintSeed,
    steamAssetId,
    startPrice,
    buyNowPrice,
    durationMinutes,
    stickers, // [{ name, imageUrl }] — 9-band, soni oldindan noma'lum
  } = req.body || {};

  if (!skinName || !imageUrl || !subcategoryId || !rarity || !startPrice || !durationMinutes) {
    return res.status(400).json({ error: 'Barcha majburiy maydonlarni to\'ldiring.' });
  }
  const needsFloat = await subcategoryNeedsFloat(subcategoryId);
  if (needsFloat && (!wearCondition || floatValue === undefined || floatValue === null || floatValue === '')) {
    return res.status(400).json({ error: 'Для этого типа предмета укажите класс износа и float.' });
  }

  const endsAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);

  const auction = await prisma.auction.create({
    data: {
      skinName,
      imageUrl,
      subcategoryId,
      rarity,
      floatValue: needsFloat ? floatValue : null,
      wearCondition: needsFloat ? wearCondition : null,
      isStatTrak: Boolean(isStatTrak),
      paintSeed: paintSeed === '' || paintSeed === undefined || paintSeed === null ? null : Number(paintSeed),
      steamAssetId: steamAssetId || null,
      startPrice,
      currentPrice: startPrice,
      buyNowPrice: buyNowPrice || null,
      status: 'ACTIVE',
      endsAt,
      originalEndsAt: endsAt,
      createdById: req.user.id,
      stickers: Array.isArray(stickers) && stickers.length
        ? { create: stickers.filter((s) => s?.name && s?.imageUrl).map((s, i) => ({ name: s.name, imageUrl: s.imageUrl, slot: i })) }
        : undefined,
    },
  });

  await logAction(req.user.id, 'AUCTION_CREATED', 'Auction', auction.id, { skinName, startPrice });
  res.status(201).json(auction);
});

// 2-band foydalanuvchi so'rovi: auksion materialini (rasm, nom, kategoriya,
// kamyoblik, format factory, StatTrak, boshlang'ich narx) to'liq tahrirlash.
// XAVFSIZLIK QOIDASI: bu FAQAT hali birorta ham taklif kelmagan auksionlarda
// ruxsat etiladi — aks holda kimdir allaqachon "AK-47 Redline"ga narx
// taklif qilgan bo'lishi mumkin, admin uni butunlay boshqa skinga
// almashtirib qo'ysa, bu taklif beruvchilar uchun adolatsizlik bo'ladi.
// Taklif kelib bo'lgan auksionlar uchun faqat vaqtni o'zgartirish/bekor
// qilish mumkin (pastdagi /time va /cancel endpointlari).
router.patch('/auctions/:id', async (req, res) => {
  const existing = await prisma.auction.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { bids: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Auksion topilmadi.' });
  if (existing._count.bids > 0) {
    return res.status(400).json({
      error:
        'Bu auksionga allaqachon taklif(lar) kelgan — endi asosiy ma\'lumotlarini o\'zgartirib bo\'lmaydi ' +
        '(adolatsizlikning oldini olish uchun). Faqat vaqtini o\'zgartirish yoki bekor qilish mumkin.',
    });
  }

  const { skinName, imageUrl, subcategoryId, rarity, floatValue, wearCondition, isStatTrak, paintSeed, steamAssetId, startPrice, buyNowPrice, stickers } =
    req.body || {};

  const effectiveSubcategoryId = subcategoryId !== undefined ? subcategoryId : existing.subcategoryId;
  const needsFloat = await subcategoryNeedsFloat(effectiveSubcategoryId);

  const data = {};
  if (skinName !== undefined) data.skinName = skinName;
  if (imageUrl !== undefined) data.imageUrl = imageUrl;
  if (subcategoryId !== undefined) data.subcategoryId = subcategoryId;
  if (rarity !== undefined) data.rarity = rarity;
  data.floatValue = needsFloat ? (floatValue !== undefined ? Number(floatValue) : existing.floatValue) : null;
  data.wearCondition = needsFloat ? (wearCondition !== undefined ? wearCondition : existing.wearCondition) : null;
  if (isStatTrak !== undefined) data.isStatTrak = Boolean(isStatTrak);
  if (paintSeed !== undefined) data.paintSeed = paintSeed === '' || paintSeed === null ? null : Number(paintSeed);
  if (steamAssetId !== undefined) data.steamAssetId = steamAssetId || null;
  if (buyNowPrice !== undefined) data.buyNowPrice = buyNowPrice === '' || buyNowPrice === null ? null : Number(buyNowPrice);
  if (startPrice !== undefined) {
    // Hali taklif yo'q bo'lgani uchun currentPrice ham startPrice bilan birga yangilanadi
    data.startPrice = Number(startPrice);
    data.currentPrice = Number(startPrice);
  }

  if (Array.isArray(stickers)) {
    // Sodda va xavfsiz yondashuv: eskilarini o'chirib, yangilarini qayta yaratamiz
    // (hali taklif kelmagan auksion bo'lgani uchun bu xavfsiz).
    await prisma.auctionSticker.deleteMany({ where: { auctionId: req.params.id } });
    data.stickers = stickers.length
      ? { create: stickers.filter((s) => s?.name && s?.imageUrl).map((s, i) => ({ name: s.name, imageUrl: s.imageUrl, slot: i })) }
      : undefined;
  }

  const auction = await prisma.auction.update({ where: { id: req.params.id }, data });
  await logAction(req.user.id, 'AUCTION_EDITED', 'Auction', auction.id, { skinName, startPrice });
  res.json(auction);
});

// 3.b-band: Auksion vaqtini o'zgartirish (cho'zish / qisqartirish / bekor qilish)
router.patch('/auctions/:id/time', async (req, res) => {
  const { newEndsAt } = req.body || {};
  if (!newEndsAt) return res.status(400).json({ error: 'newEndsAt majburiy.' });

  const auction = await prisma.auction.update({
    where: { id: req.params.id },
    data: { endsAt: new Date(newEndsAt) },
  });
  await logAction(req.user.id, 'AUCTION_TIME_CHANGED', 'Auction', auction.id, { newEndsAt });
  res.json(auction);
});

router.post('/auctions/:id/cancel', async (req, res) => {
  const auction = await prisma.auction.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
  });
  // TODO: agar auksionda aktiv zaklad ushlab turgan foydalanuvchi bo'lsa,
  // uning holdBalance'ini balansiga qaytarish kerak (bu yerda soddalik uchun
  // qoldirilgan — production'da auctionService'ga "refundAllHolds(auctionId)"
  // funksiyasi qo'shilishi tavsiya etiladi).
  await logAction(req.user.id, 'AUCTION_CANCELLED', 'Auction', auction.id, {});
  res.json(auction);
});

// 8-band: to'liq to'lov qilingan (status=PAID) auksionni admin Steam Trade
// orqali g'olibga qo'lda yuborgach, shu yerda "yuborildi" deb belgilaydi.
// (Steam bilan avtomatik integratsiya hozircha yo'q — pastdagi izohga qarang.)
router.get('/auctions/awaiting-delivery', async (req, res) => {
  const items = await prisma.auction.findMany({
    where: { status: 'PAID' },
    orderBy: { paidAt: 'asc' },
    include: { subcategory: { include: { category: true } }, currentLeader: { select: { id: true, username: true, firstName: true, tradeUrl: true } } },
  });
  res.json({ items });
});

router.post('/auctions/:id/deliver', async (req, res) => {
  const auction = await prisma.auction.findUnique({
    where: { id: req.params.id },
    include: { currentLeader: { select: { telegramId: true, tradeUrl: true } } },
  });
  if (!auction) return res.status(404).json({ error: 'Auksion topilmadi.' });
  if (auction.status !== 'PAID') {
    return res.status(400).json({ error: 'Faqat to\'liq to\'langan (PAID) auksionlarni "yuborildi" deb belgilash mumkin.' });
  }

  // 13-band: agar admin steamAssetId kiritgan bo'lsa VA g'olibning Trade
  // URL'i bor bo'lsa — avtomatik yuborishga urinib ko'ramiz. Muvaffaqiyatsiz
  // bo'lsa ham (yoki umuman sozlanmagan bo'lsa ham), admin baribir pastdagi
  // qo'lda "yuborildi" belgisini bosishda davom eta oladi — bu urinish hech
  // qachon jarayonni to'xtatib qo'ymaydi.
  let autoSendResult = null;
  if (auction.steamAssetId && auction.currentLeader?.tradeUrl) {
    const { sendItemAutomatically } = require('../services/steamBotService');
    autoSendResult = await sendItemAutomatically({
      tradeUrl: auction.currentLeader.tradeUrl,
      steamAssetId: auction.steamAssetId,
    });
  }

  const updated = await prisma.auction.update({
    where: { id: req.params.id },
    data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredById: req.user.id },
  });
  await logAction(req.user.id, 'AUCTION_DELIVERED', 'Auction', auction.id, { autoSendResult });

  // 6/13-band: skin Steam'ga yuborilgani haqida g'olibga xabar
  if (auction.currentLeaderId) {
    const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
    await notifyText(
      winner?.telegramId,
      `📦 Скин "${auction.skinName}" отправлен на ваш Steam-аккаунт. Проверьте предложения обмена в Steam.`
    );
  }

  res.json({ ...updated, autoSendResult });
});

// 3.d-band: Foydalanuvchilarni boshqarish
router.get('/users', async (req, res) => {
  const { search } = req.query;
  const where = search
    ? { OR: [{ username: { contains: String(search) } }] } // mode:'insensitive' MySQL/MariaDB'da qo'llab-quvvatlanmaydi
    : {};
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, username: true, firstName: true, lastName: true, role: true,
      balance: true, ratingScore: true, discountPct: true, isBanned: true, createdAt: true,
    },
  });
  res.json({ items: users });
});

router.post('/users/:id/ban', async (req, res) => {
  const { reason } = req.body || {};
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned: true, bannedReason: reason || null, bannedAt: new Date() },
  });
  await logAction(req.user.id, 'USER_BANNED', 'User', user.id, { reason });
  res.json({ ok: true });
});

router.post('/users/:id/unban', async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned: false, bannedReason: null, bannedAt: null },
  });
  await logAction(req.user.id, 'USER_UNBANNED', 'User', req.params.id, {});
  res.json({ ok: true });
});

// Faqat SUPERADMIN boshqa foydalanuvchini admin qila oladi / admindan tushira oladi
router.post('/users/:id/set-role', requireRole('SUPERADMIN'), async (req, res) => {
  const { role } = req.body || {};
  if (!['USER', 'ADMIN', 'SUPERADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Noto\'g\'ri rol.' });
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await logAction(req.user.id, 'USER_ROLE_CHANGED', 'User', req.params.id, { role });
  res.json({ ok: true });
});

// 1.e-band: reyting asosida skidka — LEKIN admin tasdig'isiz avtomatik berilmaydi,
// shu sabab bu alohida, faqat admin chaqira oladigan endpoint.
router.post('/users/:id/discount', async (req, res) => {
  const { discountPct } = req.body || {};
  const pct = Number(discountPct);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'Skidka foizi 0-100 oralig\'ida bo\'lishi kerak.' });
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { discountPct: pct } });
  await logAction(req.user.id, 'DISCOUNT_GRANTED', 'User', req.params.id, { discountPct: pct });
  res.json({ ok: true });
});

// ===========================================================================
// 12-band: OYLIK TO'LOV STATISTIKASI. Tizim 2026-yil avgust oyida ishga
// tushirilgan — shu sababli bundan oldinga o'tish taqiqlanadi (canGoBack).
// Hozirgi (real) oydan keyingi oylarga o'tish ham taqiqlanadi (canGoForward).
// ===========================================================================
const ANALYTICS_START_YEAR = 2026;
const ANALYTICS_START_MONTH = 8; // avgust

router.get('/analytics', async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1; // 1-12

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // keyingi oy boshi (chegara sifatida)

  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const prevStart = prevMonthDate;
  const prevEnd = start;

  const [deposited, spent, pendingCount, failedCount, prevDeposited, balanceAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: 'TOPUP', status: 'SUCCESS', createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'PURCHASE', status: 'SUCCESS', createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.transaction.count({ where: { type: 'TOPUP', status: 'PENDING', createdAt: { gte: start, lt: end } } }),
    prisma.transaction.count({ where: { type: 'TOPUP', status: { in: ['FAILED', 'CANCELLED'] }, createdAt: { gte: start, lt: end } } }),
    prisma.transaction.aggregate({ where: { type: 'TOPUP', status: 'SUCCESS', createdAt: { gte: prevStart, lt: prevEnd } }, _sum: { amount: true } }),
    prisma.user.aggregate({ _sum: { balance: true } }),
  ]);

  const totalDeposited = Number(deposited._sum.amount || 0);
  const prevTotalDeposited = Number(prevDeposited._sum.amount || 0);
  const percentChange =
    prevTotalDeposited > 0
      ? Math.round(((totalDeposited - prevTotalDeposited) / prevTotalDeposited) * 1000) / 10
      : totalDeposited > 0 ? 100 : 0;

  const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const startMonthStart = new Date(Date.UTC(ANALYTICS_START_YEAR, ANALYTICS_START_MONTH - 1, 1));

  res.json({
    year,
    month,
    totalDeposited,
    totalSpent: Number(spent._sum.amount || 0),
    unsuccessfulPaymentsCount: pendingCount + failedCount,
    // "hozirda" — tizimdagi barcha foydalanuvchilar balansining JORIY yig'indisi
    // (tanlangan oyga bog'liq emas, doim real vaqtdagi qiymat)
    currentTotalUserBalance: Number(balanceAgg._sum.balance || 0),
    percentChangeVsPrevMonth: percentChange,
    canGoBack: start > startMonthStart,
    canGoForward: start < currentMonthStart,
  });
});

// ===========================================================================
// 5/6-band: TIZIM SOZLAMALARI — kelajakdagi "foydalanuvchi o'z skinini
// sotadi" funksiyasi uchun admin belgilaydigan maksimal byudjet va kurs.
// ===========================================================================
router.get('/settings', async (req, res) => {
  const { getOrCreateSettings } = require('../services/steamMarketService');
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.patch('/settings', async (req, res) => {
  const { maxBuybackBudget, usdToSomRate } = req.body || {};
  const { getOrCreateSettings } = require('../services/steamMarketService');
  await getOrCreateSettings();
  const data = {};
  if (maxBuybackBudget !== undefined) data.maxBuybackBudget = Number(maxBuybackBudget);
  if (usdToSomRate !== undefined) data.usdToSomRate = Number(usdToSomRate);
  const updated = await prisma.systemSetting.update({ where: { id: 1 }, data });
  await logAction(req.user.id, 'SETTINGS_UPDATED', 'SystemSetting', '1', data);
  res.json(updated);
});

// ===========================================================================
// 1-band: FOYDALANUVCHILAR bo'limi — qidiruv, shaxsiy Steam savdosini qayd
// etish, va 7 kunlik "Trade Protection" muddati tugagan (to'lovga tayyor)
// foydalanuvchilar ro'yxati.
// ===========================================================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

router.get('/users', async (req, res) => {
  const { search } = req.query;
  const where = search
    ? {
        OR: [
          { username: { contains: String(search) } },
          { firstName: { contains: String(search) } },
          { lastName: { contains: String(search) } },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true, telegramId: true, username: true, firstName: true, lastName: true,
      balance: true, isBanned: true, createdAt: true,
      _count: { select: { soldItems: true } },
    },
  });
  res.json({ items: users });
});

router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { soldItems: { orderBy: { createdAt: 'desc' } } },
  });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  res.json(user);
});

// Admin shaxsiy Steam savdosi orqali foydalanuvchidan inventar sotib
// olganda shuni qayd etadi (summa, item nomi, izoh).
router.post('/users/:id/sales', async (req, res) => {
  const { itemName, agreedAmount, note } = req.body || {};
  if (!itemName || !Number.isFinite(Number(agreedAmount)) || Number(agreedAmount) <= 0) {
    return res.status(400).json({ error: 'Название предмета и сумма обязательны.' });
  }
  const seller = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!seller) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const sale = await prisma.userSale.create({
    data: {
      sellerId: seller.id,
      recordedById: req.user.id,
      itemName,
      agreedAmount: Number(agreedAmount),
      note: note || null,
    },
  });
  await logAction(req.user.id, 'USER_SALE_RECORDED', 'UserSale', sale.id, { itemName, agreedAmount });

  await notifyText(
    seller.telegramId,
    `📥 Администратор зафиксировал получение вашего предмета "${itemName}" на сумму ${Number(agreedAmount).toLocaleString('ru-RU')} сум. ` +
      `Выплата будет произведена после истечения 7-дневного периода защиты сделки в Steam.`
  );

  res.status(201).json(sale);
});

// 7 kunlik muddat tugagan, LEKIN hali to'lanmagan barcha savdolar —
// "admin foydalanuvchiga pul o'tkazib berishi mumkin" ro'yxati.
router.get('/sales/ready-to-pay', async (req, res) => {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const items = await prisma.userSale.findMany({
    where: { paidAt: null, createdAt: { lte: cutoff } },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { id: true, username: true, firstName: true, telegramId: true } } },
  });
  res.json({ items });
});

// Hali 7 kun to'lmagan, kutilayotgan savdolar (ma'lumot uchun — pastda
// alohida ko'rsatiladi, hali "tayyor" emas).
router.get('/sales/pending', async (req, res) => {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const items = await prisma.userSale.findMany({
    where: { paidAt: null, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { id: true, username: true, firstName: true } } },
  });
  res.json({ items });
});

router.post('/sales/:id/mark-paid', async (req, res) => {
  const sale = await prisma.userSale.findUnique({ where: { id: req.params.id }, include: { seller: true } });
  if (!sale) return res.status(404).json({ error: 'Yozuv topilmadi.' });
  if (sale.paidAt) return res.status(400).json({ error: 'Bu allaqachon to\'langan deb belgilangan.' });

  const updated = await prisma.userSale.update({ where: { id: sale.id }, data: { paidAt: new Date() } });
  await logAction(req.user.id, 'USER_SALE_PAID', 'UserSale', sale.id, {});
  await notifyText(
    sale.seller.telegramId,
    `💸 Оплата за "${sale.itemName}" (${Number(sale.agreedAmount).toLocaleString('ru-RU')} сум) произведена. Спасибо за сделку!`
  );
  res.json(updated);
});

module.exports = router;

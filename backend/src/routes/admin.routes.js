const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPERADMIN'));

async function logAction(actorId, action, targetType, targetId, meta) {
  await prisma.adminAuditLog.create({ data: { actorId, action, targetType, targetId, meta } });
}

// 3.c-band: Yangi auksion (skin) qo'shish
router.post('/auctions', async (req, res) => {
  const {
    skinName,
    imageUrl,
    categoryId,
    rarity,
    floatValue,
    wearCondition,
    isStatTrak,
    startPrice,
    buyNowPrice,
    durationMinutes,
  } = req.body || {};

  if (!skinName || !imageUrl || !categoryId || !rarity || !wearCondition || !startPrice || !durationMinutes) {
    return res.status(400).json({ error: 'Barcha majburiy maydonlarni to\'ldiring.' });
  }

  const endsAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);

  const auction = await prisma.auction.create({
    data: {
      skinName,
      imageUrl,
      categoryId,
      rarity,
      floatValue,
      wearCondition,
      isStatTrak: Boolean(isStatTrak),
      startPrice,
      currentPrice: startPrice,
      buyNowPrice: buyNowPrice || null,
      status: 'ACTIVE',
      endsAt,
      originalEndsAt: endsAt,
      createdById: req.user.id,
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

  const { skinName, imageUrl, categoryId, rarity, floatValue, wearCondition, isStatTrak, startPrice, buyNowPrice } =
    req.body || {};

  const data = {};
  if (skinName !== undefined) data.skinName = skinName;
  if (imageUrl !== undefined) data.imageUrl = imageUrl;
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (rarity !== undefined) data.rarity = rarity;
  if (floatValue !== undefined) data.floatValue = Number(floatValue);
  if (wearCondition !== undefined) data.wearCondition = wearCondition;
  if (isStatTrak !== undefined) data.isStatTrak = Boolean(isStatTrak);
  if (buyNowPrice !== undefined) data.buyNowPrice = buyNowPrice === '' || buyNowPrice === null ? null : Number(buyNowPrice);
  if (startPrice !== undefined) {
    // Hali taklif yo'q bo'lgani uchun currentPrice ham startPrice bilan birga yangilanadi
    data.startPrice = Number(startPrice);
    data.currentPrice = Number(startPrice);
  }

  const auction = await prisma.auction.update({ where: { id: req.params.id }, data });
  await logAction(req.user.id, 'AUCTION_EDITED', 'Auction', auction.id, data);
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
    include: { category: true, currentLeader: { select: { id: true, username: true, firstName: true, tradeUrl: true } } },
  });
  res.json({ items });
});

router.post('/auctions/:id/deliver', async (req, res) => {
  const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
  if (!auction) return res.status(404).json({ error: 'Auksion topilmadi.' });
  if (auction.status !== 'PAID') {
    return res.status(400).json({ error: 'Faqat to\'liq to\'langan (PAID) auksionlarni "yuborildi" deb belgilash mumkin.' });
  }
  const updated = await prisma.auction.update({
    where: { id: req.params.id },
    data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredById: req.user.id },
  });
  await logAction(req.user.id, 'AUCTION_DELIVERED', 'Auction', auction.id, {});
  res.json(updated);
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

module.exports = router;

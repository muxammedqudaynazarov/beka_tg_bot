const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { placeBid, attemptCompletePayment, AuctionError } = require('../services/auctionService');
const { notifyText, notifyAllAdmins } = require('../services/notifier');

// 2-band: takliflar tarixida Telegram username UMUMAN ko'rsatilmaydi, ism esa
// faqat birinchi (haqiqiy, ko'rinadigan) harfi bilan qisqartiriladi — masalan
// "Muxammed" -> "M***". Agar ism bo'sh yoki birinchi belgisi normal harf
// bo'lmasa (emoji, ko'rinmas Unicode belgilar va h.k.), to'liq "***" chiqadi.
function maskFirstName(firstName) {
  const trimmed = String(firstName || '').trim();
  const firstChar = trimmed[0];
  // \p{L} — istalgan tildagi "harf" (lotin, kirill va h.k.), \u{} bayrog'i bilan
  if (firstChar && /\p{L}/u.test(firstChar)) {
    return `${firstChar}***`;
  }
  return '***';
}

const router = express.Router();

// GET /api/auctions
// Bosh sahifa ro'yxati. Query parametrlar 1.b-1.c bandlaridagi barcha
// filtr/tab talablarini qamrab oladi:
//   tab=today       -> 1.b.i "Bugun" (24 soat ichida tugaydigan)
//   tab=new         -> 1.b.ii "Yangi" (oxirgi qo'shilganlar)
//   search=         -> yuqoridagi qidiruv maydoni (skin nomi bo'yicha)
//   categoryIds=    -> bir yoki bir nechta kategoriya ID (vergul bilan)
//   subcategoryIds= -> bir yoki bir nechta sub-kategoriya ID (vergul bilan)
//   wear=FN,MW      -> format factory kategoriyasi bo'yicha filtr
//   statTrak=true/false
//   sort=price_asc | price_desc
router.get('/', optionalAuth, async (req, res) => {
  const { tab, search, categoryIds, subcategoryIds, wear, statTrak, sort, cursor, take } = req.query;

  const where = { status: 'ACTIVE' };

  if (search) {
    // MUHIM: "mode: 'insensitive'" faqat PostgreSQL'da ishlaydi, MySQL/MariaDB'da
    // xato beradi. MySQL/MariaDB'da katta-kichik harf sezmasligi odatda ustun
    // kolatsiyasi (masalan utf8mb4_general_ci / utf8mb4_unicode_ci) orqali
    // avtomatik ta'minlanadi — shuning uchun shart emas.
    where.skinName = { contains: String(search) };
  }
  if (subcategoryIds) {
    const ids = String(subcategoryIds).split(',').filter(Boolean);
    if (ids.length) where.subcategoryId = { in: ids };
  } else if (categoryIds) {
    // Faqat kategoriya(lar) tanlangan, sub-kategoriya tanlanmagan bo'lsa —
    // shu kategoriya(lar)ning BARCHA sub-kategoriyalariga tegishli auksionlar.
    const ids = String(categoryIds).split(',').filter(Boolean);
    if (ids.length) where.subcategory = { categoryId: { in: ids } };
  }
  if (wear) {
    const wears = String(wear).split(',').filter(Boolean);
    if (wears.length) where.wearCondition = { in: wears };
  }
  if (statTrak === 'true') where.isStatTrak = true;
  if (statTrak === 'false') where.isStatTrak = false;

  if (tab === 'today') {
    where.endsAt = { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) };
  }

  let orderBy = { createdAt: 'desc' };
  if (tab === 'new') orderBy = { createdAt: 'desc' };
  if (sort === 'price_asc') orderBy = { currentPrice: 'asc' };
  if (sort === 'price_desc') orderBy = { currentPrice: 'desc' };

  const pageSize = Math.min(Number(take) || 20, 50);

  const auctions = await prisma.auction.findMany({
    where,
    orderBy,
    take: pageSize,
    ...(cursor ? { skip: 1, cursor: { id: String(cursor) } } : {}),
    include: { subcategory: { include: { category: true } }, _count: { select: { bids: true } } },
  });

  // Foydalanuvchi tizimga kirgan bo'lsa (optionalAuth), shu sahifadagi
  // auksionlardan qaysilari uning "Избранное"sida ekanini bitta so'rov bilan
  // aniqlaymiz — har bir element uchun alohida so'rov yubormaslik uchun.
  let favoritedIds = new Set();
  if (req.user) {
    const favs = await prisma.favorite.findMany({
      where: { userId: req.user.id, auctionId: { in: auctions.map((a) => a.id) } },
      select: { auctionId: true },
    });
    favoritedIds = new Set(favs.map((f) => f.auctionId));
  }

  res.json({
    items: auctions.map((a) => ({ ...a, isFavorited: favoritedIds.has(a.id) })),
    nextCursor: auctions.length === pageSize ? auctions[auctions.length - 1].id : null,
  });
});

// GET /api/auctions/ending-strip — 1.c-band: navigatsiyaning pastida
// bugun tugaydigan takliflarning qisqa "tasma"si (masalan bottom nav ustida)
router.get('/ending-strip', async (req, res) => {
  const items = await prisma.auction.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
    orderBy: { endsAt: 'asc' },
    take: 15,
    include: { subcategory: { include: { category: true } } },
  });
  res.json({ items });
});

router.get('/:id', optionalAuth, async (req, res) => {
  const auction = await prisma.auction.findUnique({
    where: { id: req.params.id },
    include: {
      subcategory: { include: { category: true } },
      currentLeader: { select: { id: true, firstName: true } },
      bids: {
        orderBy: { createdAt: 'desc' },
        take: 10, // 1-band: oxirgi 10ta
        select: { id: true, amount: true, createdAt: true, user: { select: { firstName: true } } },
      },
      stickers: { orderBy: { slot: 'asc' } },
    },
  });
  if (!auction) return res.status(404).json({ error: 'Аукцион не найден.' });

  let isFavorited = false;
  if (req.user) {
    const fav = await prisma.favorite.findUnique({
      where: { userId_auctionId: { userId: req.user.id, auctionId: auction.id } },
    });
    isFavorited = Boolean(fav);
  }

  const maskedAuction = {
    ...auction,
    currentLeader: auction.currentLeader ? { ...auction.currentLeader, firstName: maskFirstName(auction.currentLeader.firstName) } : null,
    bids: auction.bids.map((b) => ({ ...b, user: { firstName: maskFirstName(b.user?.firstName) } })),
  };
  res.json({ ...maskedAuction, isFavorited });
});

// POST /api/auctions/:id/bid — 1.i-1.l bandlaridagi barcha auksion qoidalari shu yerda ishlaydi
router.post('/:id/bid', requireAuth, async (req, res) => {
  const { mode = 'raise', amount, raiseStep } = req.body || {};
  try {
    const result = await placeBid({
      auctionId: req.params.id,
      userId: req.user.id,
      mode,
      customAmount: amount,
      raiseStep,
    });

    // Real-vaqtli yangilanishni shu auksionni kuzatib turgan barcha
      // foydalanuvchilarga Socket.io orqali yuboramiz.
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('auction:update', {
        auctionId: req.params.id,
        currentPrice: result.auction.currentPrice,
        currentLeader: result.auction.currentLeader
          ? { ...result.auction.currentLeader, firstName: maskFirstName(result.auction.currentLeader.firstName) }
          : null,
        endsAt: result.auction.endsAt,
        extended: result.extended,
      });
    }

    // 6-band: kimdir sizning taklifingizdan oshirib yuborsa — xabar beramiz.
    if (result.outbidUserId) {
      prisma.user.findUnique({ where: { id: result.outbidUserId } }).then((outbidUser) => {
        notifyText(
          outbidUser?.telegramId,
          `📈 Вашу ставку на "${result.auction.skinName}" перебили. Новая цена: ` +
            `${Number(result.auction.currentPrice).toLocaleString('ru-RU')} сум. Залог возвращён на баланс.`
        );
      });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof AuctionError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error('placeBid xatosi:', err);
    res.status(500).json({ error: 'Произошла непредвиденная ошибка.' });
  }
});

// POST /api/auctions/:id/complete-payment — 3-band: g'olib qolgan 75%ni
// 5 soatlik muddat ichida to'lash uchun shu tugmani bosadi.
router.post('/:id/complete-payment', requireAuth, async (req, res) => {
  const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
  if (!auction) return res.status(404).json({ error: 'Аукцион не найден.' });
  if (auction.currentLeaderId !== req.user.id) {
    return res.status(403).json({ error: 'Вы не являетесь победителем этого аукциона.' });
  }
  if (auction.status !== 'AWAITING_PAYMENT') {
    return res.status(400).json({ error: 'Этот аукцион сейчас не в статусе ожидания оплаты.' });
  }

  const result = await attemptCompletePayment(req.params.id, req.body?.discountId || undefined);
  if (!result.ok) {
    if (result.reason === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({
        error: `Недостаточно средств. Нужно ещё ${Number(result.missingAmount).toLocaleString('ru-RU')} сум — пополните баланс в разделе «Платежи».`,
        code: result.reason,
        missingAmount: result.missingAmount,
      });
    }
    if (result.reason === 'INVALID_DISCOUNT') {
      return res.status(400).json({ error: 'Эта скидка недоступна.', code: result.reason });
    }
    return res.status(400).json({ error: 'Не удалось завершить оплату.', code: result.reason });
  }

  const io = req.app.get('io');
  if (io) io.to(`auction:${req.params.id}`).emit('auction:closed', { auctionId: req.params.id, status: 'PAID' });

  res.json({ ok: true, auction: result.auction });
});

// GET /api/auctions/mine/awaiting-payment — joriy foydalanuvchi g'olib bo'lgan,
// hali to'lovi yakunlanmagan (yoki to'langan, lekin hali Steam'ga chiqarilmagan)
// auksionlar (Profil sahifasida ko'rsatish uchun)
router.get('/mine/awaiting-payment', requireAuth, async (req, res) => {
  const items = await prisma.auction.findMany({
    where: { currentLeaderId: req.user.id, status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
    orderBy: { paymentDueAt: 'asc' },
    include: { subcategory: { include: { category: true } } },
  });
  res.json({ items });
});

// POST /api/auctions/:id/claim — 10-band: g'olibning o'zi, o'zi xohlagan
// vaqtda "Отправить в Steam" tugmasini bosadi. Agar admin shu skin uchun
// avtomatik yuborishni sozlagan bo'lsa (steamAssetId), darhol yuboriladi;
// aks holda so'rov qabul qilinadi va adminlarga xabar beriladi (ular qo'lda
// yuborib, keyin admin panel orqali "yuborildi" deb belgilaydi).
router.post('/:id/claim', requireAuth, async (req, res) => {
  const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
  if (!auction) return res.status(404).json({ error: 'Аукцион не найден.' });
  if (auction.currentLeaderId !== req.user.id) {
    return res.status(403).json({ error: 'Вы не являетесь победителем этого аукциона.' });
  }
  if (auction.status !== 'PAID') {
    return res.status(400).json({ error: 'Этот скин ещё не готов к отправке.' });
  }
  if (!req.user.tradeUrl) {
    return res.status(400).json({ error: 'Сначала укажите Trade URL в разделе «Профиль».' });
  }

  if (auction.steamAssetId) {
    const { sendItemAutomatically } = require('../services/steamBotService');
    const result = await sendItemAutomatically({ tradeUrl: req.user.tradeUrl, steamAssetId: auction.steamAssetId });
    if (result.ok) {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      return res.json({ status: 'DELIVERED', message: 'Скин отправлен! Проверьте предложения обмена в Steam.' });
    }
    // Avtomatik urinish muvaffaqiyatsiz bo'lsa ham, so'rovni adminlarga
    // yuboramiz — pastdagi umumiy yo'lga tushamiz.
  }

  await notifyAllAdmins(
    `📬 @${req.user.username || req.user.firstName || req.user.id} "${auction.skinName}" skinini hoziroq Steam'ga chiqarishni so'ramoqda.\n` +
      `Admin panel > Auksionlar bo'limidan yuboring.`
  );
  res.json({ status: 'REQUESTED', message: 'Запрос отправлен администратору, скин будет отправлен в ближайшее время.' });
});

module.exports = router;

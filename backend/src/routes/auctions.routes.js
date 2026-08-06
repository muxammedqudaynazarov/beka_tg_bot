const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { placeBid, attemptCompletePayment, AuctionError } = require('../services/auctionService');

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
router.get('/', async (req, res) => {
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

  res.json({
    items: auctions,
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

router.get('/:id', async (req, res) => {
  const auction = await prisma.auction.findUnique({
    where: { id: req.params.id },
    include: {
      subcategory: { include: { category: true } },
      currentLeader: { select: { id: true, username: true, firstName: true } },
      bids: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { username: true, firstName: true } } } },
    },
  });
  if (!auction) return res.status(404).json({ error: 'Auksion topilmadi.' });
  res.json(auction);
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
        currentLeader: result.auction.currentLeader,
        endsAt: result.auction.endsAt,
        extended: result.extended,
      });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof AuctionError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error('placeBid xatosi:', err);
    res.status(500).json({ error: 'Kutilmagan xatolik yuz berdi.' });
  }
});

// POST /api/auctions/:id/complete-payment — 3-band: g'olib qolgan 75%ni
// 5 soatlik muddat ichida to'lash uchun shu tugmani bosadi.
router.post('/:id/complete-payment', requireAuth, async (req, res) => {
  const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
  if (!auction) return res.status(404).json({ error: 'Auksion topilmadi.' });
  if (auction.currentLeaderId !== req.user.id) {
    return res.status(403).json({ error: 'Bu auksion g\'olibi siz emassiz.' });
  }
  if (auction.status !== 'AWAITING_PAYMENT') {
    return res.status(400).json({ error: 'Bu auksion hozir to\'lov kutish holatida emas.' });
  }

  const result = await attemptCompletePayment(req.params.id);
  if (!result.ok) {
    if (result.reason === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({
        error: `Balansingiz yetarli emas. Yana ${Number(result.missingAmount).toLocaleString('uz-UZ')} so'm kerak — "To'lov" bo'limidan hisobingizni to'ldiring.`,
        code: result.reason,
        missingAmount: result.missingAmount,
      });
    }
    return res.status(400).json({ error: 'To\'lovni yakunlab bo\'lmadi.', code: result.reason });
  }

  const io = req.app.get('io');
  if (io) io.to(`auction:${req.params.id}`).emit('auction:closed', { auctionId: req.params.id, status: 'PAID' });

  res.json({ ok: true, auction: result.auction });
});

// GET /api/auctions/mine/awaiting-payment — joriy foydalanuvchi g'olib bo'lgan,
// hali to'lovi yakunlanmagan auksionlar (Profil sahifasida ko'rsatish uchun)
router.get('/mine/awaiting-payment', requireAuth, async (req, res) => {
  const items = await prisma.auction.findMany({
    where: { currentLeaderId: req.user.id, status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
    orderBy: { paymentDueAt: 'asc' },
    include: { subcategory: { include: { category: true } } },
  });
  res.json({ items });
});

module.exports = router;

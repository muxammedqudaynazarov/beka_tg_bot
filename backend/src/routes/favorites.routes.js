const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/favorites — foydalanuvchining sevimli (hali sotilmagan) auksionlari
router.get('/', requireAuth, async (req, res) => {
  const items = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { auction: { include: { subcategory: { include: { category: true } } } } },
  });
  // Faqat hali "tirik" (sotilmagan) auksionlarni ko'rsatamiz — sxema darajasida
  // sotilganda yozuv o'chiriladi (auctionService.js), lekin shu yerda ham
  // ehtiyot chorasi sifatida filtrlaymiz.
  const alive = items.filter((f) => !['DELIVERED'].includes(f.auction.status));
  res.json({ items: alive.map((f) => f.auction) });
});

// POST /api/favorites/:auctionId — yoqish/o'chirish (toggle)
router.post('/:auctionId', requireAuth, async (req, res) => {
  const { auctionId } = req.params;
  const existing = await prisma.favorite.findUnique({
    where: { userId_auctionId: { userId: req.user.id, auctionId } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return res.json({ favorited: false });
  }
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) return res.status(404).json({ error: 'Аукцион не найден.' });
  await prisma.favorite.create({ data: { userId: req.user.id, auctionId } });
  res.json({ favorited: true });
});

module.exports = router;

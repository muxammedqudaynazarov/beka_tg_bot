const express = require('express');
const prisma = require('../db/prisma');

const router = express.Router();

// 10-band: ikkala slot uchun ham FAQAT faol reklamani qaytaradi (yo'q
// bo'lsa yoki o'chirilgan bo'lsa — null, frontend hech narsa ko'rsatmaydi).
router.get('/:slot', async (req, res) => {
  const slot = String(req.params.slot || '').toUpperCase();
  if (!['BANNER', 'POPUP'].includes(slot)) return res.status(400).json({ error: 'Noto\'g\'ri slot.' });

  const ad = await prisma.advertisement.findUnique({ where: { slot } });
  if (!ad || !ad.isActive) return res.json({ ad: null });
  res.json({ ad: { id: ad.id, slot: ad.slot, imageUrl: ad.imageUrl, linkUrl: ad.linkUrl } });
});

// 11-band: reklama HAQIQATAN ko'rsatilganda frontend shuni chaqiradi
router.post('/:id/impression', async (req, res) => {
  await prisma.advertisement.update({ where: { id: req.params.id }, data: { impressions: { increment: 1 } } }).catch(() => {});
  res.json({ ok: true });
});

// 11-band: foydalanuvchi reklamaga bosganda
router.post('/:id/click', async (req, res) => {
  await prisma.advertisement.update({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;

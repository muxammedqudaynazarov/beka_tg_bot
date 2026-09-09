const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Qidiruv — streamer matn yozayotganda real-vaqtda chaqiriladi.
// nameLower contains qidiruvi — "fur" → "Furia", "FURIA", "furia" hammasi.
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 1) return res.json({ items: [] });
  const items = await prisma.team.findMany({
    where: { nameLower: { contains: q } },
    orderBy: { name: 'asc' },
    take: 8,
    select: { id: true, name: true, imageUrl: true },
  });
  res.json({ items });
});

// Barcha jamoalar ro'yxati (admin panel uchun)
router.get('/', requireAuth, async (req, res) => {
  const items = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, imageUrl: true, createdAt: true },
  });
  res.json({ items });
});

// Yangi jamoa qo'shish yoki mavjud nomni yangilash (upsert).
// nameLower orqali case-insensitive tekshiruv bajariladi.
router.post('/upsert', requireAuth, async (req, res) => {
  const { name, imageUrl } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Введите название команды.' });
  const nameLower = name.trim().toLowerCase();
  const team = await prisma.team.upsert({
    where: { nameLower },
    create: { name: name.trim(), nameLower, imageUrl: imageUrl?.trim() || null },
    update: { name: name.trim(), ...(imageUrl?.trim() ? { imageUrl: imageUrl.trim() } : {}) },
  });
  res.json(team);
});

// O'chirish
router.delete('/:id', requireAuth, async (req, res) => {
  await prisma.team.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;

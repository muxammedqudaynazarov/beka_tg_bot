const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const categories = await prisma.weaponCategory.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ items: categories });
});

// 3.a-band: kategoriyalarni boshqarish — faqat adminlar
router.post('/', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name, iconUrl } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Kategoriya nomi majburiy.' });
  const slug = String(name).toLowerCase().trim().replace(/\s+/g, '-');
  const category = await prisma.weaponCategory.create({ data: { name, slug, iconUrl } });
  res.status(201).json(category);
});

router.patch('/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name, iconUrl, isActive } = req.body || {};
  const category = await prisma.weaponCategory.update({
    where: { id: req.params.id },
    data: { name, iconUrl, isActive },
  });
  res.json(category);
});

router.delete('/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  await prisma.weaponCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

module.exports = router;

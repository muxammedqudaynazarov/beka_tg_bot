const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '');
}

// GET /api/categories — kategoriyalar RO'YXATI, har biri o'z sub-kategoriyalari
// bilan birga (Filtr sahifasi va admin formalar shu bitta so'rov bilan
// to'liq daraxtni oladi).
router.get('/', async (req, res) => {
  const categories = await prisma.weaponCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { subcategories: { where: { isActive: true }, orderBy: { name: 'asc' } } },
  });
  res.json({ items: categories });
});

// 2-band (Admin Mini App): yangi kategoriya qo'shish
router.post('/', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name, iconUrl, sortOrder } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Kategoriya nomi majburiy.' });
  const category = await prisma.weaponCategory.create({
    data: { name, slug: slugify(name), iconUrl: iconUrl || null, sortOrder: Number(sortOrder) || 0 },
  });
  res.status(201).json(category);
});

router.patch('/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name, iconUrl, isActive, sortOrder } = req.body || {};
  const data = {};
  if (name !== undefined) { data.name = name; data.slug = slugify(name); }
  if (iconUrl !== undefined) data.iconUrl = iconUrl || null;
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
  const category = await prisma.weaponCategory.update({ where: { id: req.params.id }, data });
  res.json(category);
});

router.delete('/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  await prisma.weaponCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// SUB-KATEGORIYALAR — kategoriyaga bog'liq (masalan "Винтовки" ichida "AK-47")
// ------------------------------------------------------------------

router.post('/:categoryId/subcategories', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Sub-kategoriya nomi majburiy.' });
  try {
    const sub = await prisma.weaponSubcategory.create({
      data: { categoryId: req.params.categoryId, name, slug: slugify(name) },
    });
    res.status(201).json(sub);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Bu kategoriyada shu nomli sub-kategoriya allaqachon bor.' });
    }
    throw err;
  }
});

router.patch('/subcategories/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { name, isActive } = req.body || {};
  const data = {};
  if (name !== undefined) { data.name = name; data.slug = slugify(name); }
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  const sub = await prisma.weaponSubcategory.update({ where: { id: req.params.id }, data });
  res.json(sub);
});

router.delete('/subcategories/:id', requireAuth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  await prisma.weaponSubcategory.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

module.exports = router;

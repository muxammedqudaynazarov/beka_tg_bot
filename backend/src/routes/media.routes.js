const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { env } = require('../config/env');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPERADMIN'));

// 5-band: optimizatsiya (sharp) olib tashlandi — rasm o'z holatida saqlanadi.
// GIF, PNG, WebP kabi barcha formatlar to'liq qo'llab-quvvatlanadi.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Faqat rasm fayllari qabul qilinadi.'));
    cb(null, true);
  },
});

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

router.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран.' });

  try {
    const url = `${env.publicBackendUrl}/uploads/${req.file.filename}`;
    const media = await prisma.uploadedMedia.create({
      data: {
        filename: req.file.filename,
        url,
        sizeBytes: req.file.size,
        width: null,
        height: null,
        createdById: req.user.id,
      },
    });
    res.status(201).json(media);
  } catch (err) {
    console.error('[media/upload] xato:', err.message);
    res.status(500).json({ error: 'Не удалось сохранить изображение.' });
  }
});

router.get('/', async (req, res) => {
  const items = await prisma.uploadedMedia.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ items });
});

router.delete('/:id', async (req, res) => {
  const media = await prisma.uploadedMedia.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ error: 'Topilmadi.' });
  const filePath = path.join(UPLOADS_DIR, media.filename);
  fs.unlink(filePath, () => {});
  await prisma.uploadedMedia.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;

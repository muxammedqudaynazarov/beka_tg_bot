const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { env } = require('../config/env');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPERADMIN'));

// Xotirada saqlaymiz (diskka to'g'ridan-to'g'ri emas) — chunki sharp orqali
// optimallashtirishdan O'TGAN holatini saqlashimiz kerak, xomini emas.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — bundan katta xom fayllarni ham qabul qilamiz, chunki optimallashtirish ancha kichraytiradi
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
    const filename = `${crypto.randomUUID()}.jpg`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Talab qilingan optimallashtirish: kenglik 1500px'dan oshmasin
    // (kichikroq rasmlar kattalashtirilmaydi — withoutEnlargement), balandlik
    // avtomatik proportsional, sifat 60% (JPEG'ga aylantiriladi — shaffof
    // fon bo'lsa oq fonga birlashtiriladi, chunki JPEG shaffoflikni
    // qo'llab-quvvatlamaydi).
    const info = await sharp(req.file.buffer)
      .resize({ width: 1500, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 60 })
      .toFile(outputPath);

    const url = `${env.publicBackendUrl}/uploads/${filename}`;

    const media = await prisma.uploadedMedia.create({
      data: {
        filename,
        url,
        sizeBytes: info.size,
        width: info.width,
        height: info.height,
        createdById: req.user.id,
      },
    });

    res.status(201).json(media);
  } catch (err) {
    console.error('[media/upload] xato:', err.message);
    res.status(500).json({ error: 'Не удалось обработать изображение.' });
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
  fs.unlink(filePath, () => {}); // fayl bo'lmasa ham xato bermaymiz
  await prisma.uploadedMedia.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;

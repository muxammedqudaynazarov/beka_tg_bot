const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyText } = require('../services/notifier');

const router = express.Router();

// Qisqa, o'qish oson promo-kod generatsiyasi (YY + 4 belgili tasodifiy)
function genPredictionCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += alpha[crypto.randomInt(alpha.length)];
  return 'PRD' + code;
}

// ============================================================
// UMUMIY — barcha autentifikatsiyalangan foydalanuvchilar
// ============================================================

// Faol prediction'lar ro'yxati (Главная'dagi banner uchun)
router.get('/active', requireAuth, async (req, res) => {
  const now = new Date();
  const predictions = await prisma.prediction.findMany({
    where: { status: 'ACTIVE', endsAt: { gt: now } },
    include: {
      createdBy: { select: { id: true, username: true, firstName: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: predictions });
});

// Bitta prediction batafsil
router.get('/:id', requireAuth, async (req, res) => {
  const p = await prisma.prediction.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: { id: true, username: true, firstName: true } },
      _count: { select: { entries: true } },
    },
  });
  if (!p) return res.status(404).json({ error: 'Прогноз не найден.' });

  // Foydalanuvchi allaqachon taxmin yozganmi?
  const myEntry = await prisma.predictionEntry.findUnique({
    where: { predictionId_userId: { predictionId: p.id, userId: req.user.id } },
  });

  // Natija kiritilgan bo'lsa — g'oliblarni ham ko'rsatamiz
  let winners = [];
  if (p.status === 'COMPLETED') {
    winners = await prisma.predictionWinner.findMany({
      where: { predictionId: p.id },
      include: { user: { select: { id: true, username: true, firstName: true } } },
      orderBy: { position: 'asc' },
    });
  }

  res.json({ prediction: p, myEntry, winners });
});

// Taxmin yozish
router.post('/:id/entries', requireAuth, async (req, res) => {
  const { guess } = req.body || {};
  if (!guess || !String(guess).trim()) return res.status(400).json({ error: 'Введите прогноз.' });

  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Прогноз не найден.' });
  if (p.status !== 'ACTIVE') return res.status(400).json({ error: 'Прём прогнозов завершён.' });
  if (new Date() > p.endsAt) return res.status(400).json({ error: 'Время для прогнозов истекло.' });

  const already = await prisma.predictionEntry.findUnique({
    where: { predictionId_userId: { predictionId: p.id, userId: req.user.id } },
  });
  if (already) return res.status(409).json({ error: 'Вы уже отправили прогноз по этому матчу.' });

  const entry = await prisma.predictionEntry.create({
    data: { predictionId: p.id, userId: req.user.id, guess: String(guess).trim() },
  });
  res.status(201).json(entry);
});

// ============================================================
// STREAMER — faqat isStreamer=true bo'lgan foydalanuvchilar
// ============================================================

function requireStreamer(req, res, next) {
  if (!req.user.isStreamer && req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Доступ только для стримеров.' });
  }
  next();
}

// Streamer'ning o'z arxivi (COMPLETED + CANCELLED)
router.get('/archive', requireAuth, requireStreamer, async (req, res) => {
  const items = await prisma.prediction.findMany({
    where: { createdById: req.user.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ items });
});

// Streamer'ning faol prediction'lari ro'yxati
router.get('/', requireAuth, requireStreamer, async (req, res) => {
  const items = await prisma.prediction.findMany({
    where: { createdById: req.user.id },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ items });
});

// Yangi prediction yaratish
router.post('/', requireAuth, requireStreamer, async (req, res) => {
  const { title, format, streamUrl, promoCode, endsAt, promoAmount, teamAImage, teamBImage } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Введите название матча.' });
  if (!['BO1', 'BO3', 'BO5'].includes(format)) return res.status(400).json({ error: 'Формат: BO1, BO3 или BO5.' });
  if (!endsAt) return res.status(400).json({ error: 'Укажите время окончания приёма прогнозов.' });

  const amount = Number(promoAmount) || 20000;
  if (amount < 1000 || amount > 40000) return res.status(400).json({ error: 'Сумма промокода: от 1 000 до 40 000 сум.' });

  const code = promoCode?.trim().toUpperCase() || genPredictionCode();

  const p = await prisma.prediction.create({
    data: {
      title: title.trim(),
      format,
      streamUrl: streamUrl?.trim() || null,
      promoCode: code,
      promoAmount: amount,
      teamAImage: teamAImage?.trim() || null,
      teamBImage: teamBImage?.trim() || null,
      endsAt: new Date(endsAt),
      createdById: req.user.id,
    },
  });
  res.status(201).json(p);
});

// Prediction o'chirish — faqat yaratuvchi, faqat ACTIVE yoki CANCELLED holat
router.delete('/:id', requireAuth, requireStreamer, async (req, res) => {
  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p || p.createdById !== req.user.id) return res.status(404).json({ error: 'Не найдено.' });
  if (p.status === 'COMPLETED') return res.status(400).json({ error: 'Завершённый прогноз удалить нельзя.' });
  await prisma.predictionEntry.deleteMany({ where: { predictionId: p.id } });
  await prisma.predictionWinner.deleteMany({ where: { predictionId: p.id } });
  await prisma.prediction.delete({ where: { id: p.id } });
  res.json({ ok: true });
});

// Prediction holatini yangilash (bekor qilish, yopish)
router.patch('/:id/status', requireAuth, requireStreamer, async (req, res) => {
  const { status } = req.body || {};
  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p || p.createdById !== req.user.id) return res.status(404).json({ error: 'Не найдено.' });

  await prisma.prediction.update({ where: { id: p.id }, data: { status } });
  res.json({ ok: true });
});

// Natijani kiritish + g'oliblarni avtomatik aniqlash
router.post('/:id/result', requireAuth, requireStreamer, async (req, res) => {
  const { result } = req.body || {};
  if (!result?.trim()) return res.status(400).json({ error: 'Введите результат матча.' });

  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p || p.createdById !== req.user.id) return res.status(404).json({ error: 'Не найдено.' });
  if (p.status === 'COMPLETED') return res.status(400).json({ error: 'Результат уже введён.' });

  const correctResult = result.trim();

  // MySQL 'mode: insensitive' ni qo'llab-quvvatlamaydi (bu PostgreSQL uchun).
  // Barcha entry'larni olib, JavaScript'da kichik harfga o'tkazib solishtirамиз.
  const allEntries = await prisma.predictionEntry.findMany({
    where: { predictionId: p.id },
    orderBy: { createdAt: 'asc' },
  });

  const correctEntries = allEntries
    .filter((e) => e.guess.trim().toLowerCase() === correctResult.toLowerCase())
    .slice(0, 3);

  const incorrectIds = allEntries
    .filter((e) => e.guess.trim().toLowerCase() !== correctResult.toLowerCase())
    .map((e) => e.id);

  await prisma.$transaction([
    // To'g'ri taxminlarni belgilaymiz
    ...(correctEntries.length > 0
      ? [prisma.predictionEntry.updateMany({
          where: { id: { in: correctEntries.map((e) => e.id) } },
          data: { isCorrect: true },
        })]
      : []),
    // Noto'g'ri taxminlarni belgilaymiz
    ...(incorrectIds.length > 0
      ? [prisma.predictionEntry.updateMany({
          where: { id: { in: incorrectIds } },
          data: { isCorrect: false },
        })]
      : []),
    // Prediction'ni yakunlaymiz
    prisma.prediction.update({
      where: { id: p.id },
      data: { correctResult, status: 'COMPLETED' },
    }),
    // G'oliblarni yozamiz (birinchi 3 ta)
    ...correctEntries.map((e, i) =>
      prisma.predictionWinner.upsert({
        where: { predictionId_userId: { predictionId: p.id, userId: e.userId } },
        create: { predictionId: p.id, userId: e.userId, position: i + 1 },
        update: {},
      })
    ),
  ]);

  // G'oliblarga xabar yuboramiz
  for (const [i, entry] of correctEntries.entries()) {
    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    await notifyText(
      user?.telegramId,
      `🏆 Ваш прогноз «${correctResult}» по матчу «${p.title}» оказался верным! Вы заняли ${i + 1}-е место. Стример скоро прикрепит вам промо-код — ожидайте!`
    );
  }

  const winners = await prisma.predictionWinner.findMany({
    where: { predictionId: p.id },
    include: { user: { select: { id: true, username: true, firstName: true, telegramId: true } } },
    orderBy: { position: 'asc' },
  });

  res.json({ correctResult, winners });
});

// G'olibga promo-kod biriktirish (Прикрепить)
router.post('/:id/winners/:userId/attach-promo', requireAuth, requireStreamer, async (req, res) => {
  const winner = await prisma.predictionWinner.findUnique({
    where: { predictionId_userId: { predictionId: req.params.id, userId: req.params.userId } },
    include: { user: true, prediction: true },
  });
  if (!winner) return res.status(404).json({ error: 'Победитель не найден.' });

  const p = winner.prediction;
  if (p.createdById !== req.user.id) return res.status(403).json({ error: 'Нет доступа.' });

  // PromoCode yaratamiz — balansni to'ldirish uchun (BALANCE_TOPUP)
  const existingPromo = await prisma.promoCode.findUnique({ where: { code: p.promoCode } });
  let promoCode = existingPromo;

  if (!promoCode) {
    promoCode = await prisma.promoCode.create({
      data: {
        code: p.promoCode,
        type: 'BALANCE_TOPUP',
        topupAmount: p.promoAmount || 20000,
        maxRedemptions: 1,
        restrictedToUserId: winner.userId,
        createdById: p.createdById,
      },
    });
  }

  // G'olibga promo-kodini biriktirish
  await prisma.predictionWinner.update({
    where: { predictionId_userId: { predictionId: req.params.id, userId: req.params.userId } },
    data: { promoCodeId: promoCode.id },
  });

  // G'olibga xabar
  await notifyText(
    winner.user.telegramId,
    `🎁 Поздравляем! За верный прогноз счёта «${p.correctResult}» матча «${p.title}» вам присвоен промо-код:\n\n<b>${p.promoCode}</b>\n\nАктивируйте его в разделе «Профиль → Промокод» в приложении!`,
    { parse_mode: 'HTML' }
  );

  res.json({ ok: true, promoCode: p.promoCode });
});

module.exports = router;

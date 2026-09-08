const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { notifyText } = require('../services/notifier');

const router = express.Router();

function genPredictionCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += alpha[crypto.randomInt(alpha.length)];
  return 'PRD' + code;
}

function requireStreamer(req, res, next) {
  if (!req.user.isStreamer && req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Доступ только для стримеров.' });
  }
  // 2-band: rol muddati tugaganmi?
  if (req.user.isStreamer && req.user.streamerExpiresAt) {
    if (new Date() > new Date(req.user.streamerExpiresAt)) {
      return res.status(403).json({ error: 'Срок действия роли стримера истёк.' });
    }
  }
  next();
}

// ============================================================
// MUHIM: aniq marshrutlar (:id) dan OLDIN kelishi shart
// ============================================================

// Faol prediction'lar (Главная banner uchun)
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

// Arxiv — COMPLETED + CANCELLED (/:id dan OLDIN bo'lishi shart!)
router.get('/archive', requireAuth, requireStreamer, async (req, res) => {
  const items = await prisma.prediction.findMany({
    where: { createdById: req.user.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ items });
});

// Streamer'ning faol prediction'lari
router.get('/', requireAuth, requireStreamer, async (req, res) => {
  const items = await prisma.prediction.findMany({
    where: { createdById: req.user.id, status: { in: ['ACTIVE', 'CLOSED'] } },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ items });
});

// Bitta prediction batafsil (/:id — eng oxirida)
router.get('/:id', requireAuth, async (req, res) => {
  const p = await prisma.prediction.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: { id: true, username: true, firstName: true } },
      _count: { select: { entries: true } },
    },
  });
  if (!p) return res.status(404).json({ error: 'Прогноз не найден.' });
  const myEntry = await prisma.predictionEntry.findUnique({
    where: { predictionId_userId: { predictionId: p.id, userId: req.user.id } },
  });
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

// Tahmin yozish
router.post('/:id/entries', requireAuth, async (req, res) => {
  const { guess } = req.body || {};
  if (!guess?.trim()) return res.status(400).json({ error: 'Введите прогноз.' });

  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Прогноз не найден.' });
  if (p.status !== 'ACTIVE') return res.status(400).json({ error: 'Прём прогнозов завершён.' });
  if (new Date() > p.endsAt) return res.status(400).json({ error: 'Время для прогнозов истекло.' });

  // 3-band: yaratuvchi o'zi tahmin bera olmaydi; adminlar ham bera olmaydi
  if (p.createdById === req.user.id) {
    return res.status(403).json({ error: 'Вы не можете участвовать в собственном прогнозе.' });
  }
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN') {
    return res.status(403).json({ error: 'Администраторы не могут участвовать в прогнозах.' });
  }

  const already = await prisma.predictionEntry.findUnique({
    where: { predictionId_userId: { predictionId: p.id, userId: req.user.id } },
  });
  if (already) return res.status(409).json({ error: 'Вы уже отправили прогноз по этому матчу.' });

  const entry = await prisma.predictionEntry.create({
    data: { predictionId: p.id, userId: req.user.id, guess: String(guess).trim() },
  });
  res.status(201).json(entry);
});

// Yangi prediction yaratish
router.post('/', requireAuth, requireStreamer, async (req, res) => {
  const { title, format, streamUrl, promoCode, endsAt, promoAmount, teamAImage, teamBImage } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Введите название матча.' });
  if (!['BO1', 'BO3', 'BO5'].includes(format)) return res.status(400).json({ error: 'Формат: BO1, BO3 или BO5.' });
  if (!endsAt) return res.status(400).json({ error: 'Укажите время окончания приёма прогнозов.' });

  const amount = Number(promoAmount) || 20000;
  if (amount < 1000 || amount > 40000) return res.status(400).json({ error: 'Сумма промокода: от 1 000 до 40 000 сум.' });

  // 2-band: kunlik limit tekshiruvi
  if (req.user.isStreamer && req.user.streamerDailyLimit) {
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const todayCount = await prisma.prediction.count({
      where: { createdById: req.user.id, createdAt: { gte: startOfDay } },
    });
    if (todayCount >= req.user.streamerDailyLimit) {
      return res.status(429).json({
        error: `Дневной лимит прогнозов (${req.user.streamerDailyLimit}) исчерпан. Попробуйте завтра.`,
      });
    }
  }

  const code = promoCode?.trim().toUpperCase() || genPredictionCode();
  const p = await prisma.prediction.create({
    data: {
      title: title.trim(), format,
      streamUrl: streamUrl?.trim() || null,
      promoCode: code, promoAmount: amount,
      teamAImage: teamAImage?.trim() || null,
      teamBImage: teamBImage?.trim() || null,
      endsAt: new Date(endsAt),
      createdById: req.user.id,
    },
  });
  res.status(201).json(p);
});

// Prediction o'chirish
router.delete('/:id', requireAuth, requireStreamer, async (req, res) => {
  const p = await prisma.prediction.findUnique({ where: { id: req.params.id } });
  if (!p || p.createdById !== req.user.id) return res.status(404).json({ error: 'Не найдено.' });
  if (p.status === 'COMPLETED') return res.status(400).json({ error: 'Завершённый прогноз удалить нельзя.' });
  await prisma.predictionEntry.deleteMany({ where: { predictionId: p.id } });
  await prisma.predictionWinner.deleteMany({ where: { predictionId: p.id } });
  await prisma.prediction.delete({ where: { id: p.id } });
  res.json({ ok: true });
});

// Holatni yangilash
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
  const allEntries = await prisma.predictionEntry.findMany({
    where: { predictionId: p.id },
    orderBy: { createdAt: 'asc' },
  });
  const correctEntries = allEntries
    .filter(e => e.guess.trim().toLowerCase() === correctResult.toLowerCase())
    .slice(0, 3);
  const incorrectIds = allEntries
    .filter(e => e.guess.trim().toLowerCase() !== correctResult.toLowerCase())
    .map(e => e.id);

  await prisma.$transaction([
    ...(correctEntries.length > 0
      ? [prisma.predictionEntry.updateMany({ where: { id: { in: correctEntries.map(e => e.id) } }, data: { isCorrect: true } })]
      : []),
    ...(incorrectIds.length > 0
      ? [prisma.predictionEntry.updateMany({ where: { id: { in: incorrectIds } }, data: { isCorrect: false } })]
      : []),
    prisma.prediction.update({ where: { id: p.id }, data: { correctResult, status: 'COMPLETED' } }),
    ...correctEntries.map((e, i) =>
      prisma.predictionWinner.upsert({
        where: { predictionId_userId: { predictionId: p.id, userId: e.userId } },
        create: { predictionId: p.id, userId: e.userId, position: i + 1 },
        update: {},
      })
    ),
  ]);

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

// G'olibga promo-kod biriktirish
router.post('/:id/winners/:userId/attach-promo', requireAuth, requireStreamer, async (req, res) => {
  const winner = await prisma.predictionWinner.findUnique({
    where: { predictionId_userId: { predictionId: req.params.id, userId: req.params.userId } },
    include: { user: true, prediction: true },
  });
  if (!winner) return res.status(404).json({ error: 'Победитель не найден.' });
  const p = winner.prediction;
  if (p.createdById !== req.user.id) return res.status(403).json({ error: 'Нет доступа.' });

  const existingPromo = await prisma.promoCode.findUnique({ where: { code: p.promoCode } });
  let promoCode = existingPromo;
  if (!promoCode) {
    promoCode = await prisma.promoCode.create({
      data: {
        code: p.promoCode, type: 'BALANCE_TOPUP',
        topupAmount: p.promoAmount || 20000,
        maxRedemptions: 1,
        restrictedToUserId: winner.userId,
        createdById: p.createdById,
      },
    });
  }

  await prisma.predictionWinner.update({
    where: { predictionId_userId: { predictionId: req.params.id, userId: req.params.userId } },
    data: { promoCodeId: promoCode.id },
  });

  await notifyText(
    winner.user.telegramId,
    `🎁 Поздравляем! За верный прогноз счёта «${p.correctResult}» матча «${p.title}» вам присвоен промо-код:\n\n<b>${p.promoCode}</b>\n\nАктивируйте его в разделе «Профиль → Промокод» в приложении!`,
    { parse_mode: 'HTML' }
  );

  res.json({ ok: true, promoCode: p.promoCode });
});

module.exports = router;

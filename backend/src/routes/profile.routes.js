const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { env } = require('../config/env');

const router = express.Router();

// Steam Trade URL formati: https://steamcommunity.com/tradeoffer/new/?partner=NNNNN&token=XXXXXXXX
const STEAM_TRADE_URL_RE = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/;

// 1.h-band: Profil oynasi — sotib olingan skinlar, hisobdagi pul, maxfiylik siyosati havolalari
router.get('/', requireAuth, async (req, res) => {
  const purchases = await prisma.transaction.findMany({
    where: { userId: req.user.id, type: 'PURCHASE', status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    take: 10, // 4-band: faqat oxirgi 10ta
    include: { auction: { include: { subcategory: { include: { category: true } } } } },
  });

  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      balance: req.user.balance,
      holdBalance: req.user.holdBalance,
      ratingScore: req.user.ratingScore,
      discountPct: req.user.discountPct,
      tradeUrl: req.user.tradeUrl,
      createdAt: req.user.createdAt,
    },
    purchases,
    links: {
      // Sozlanmagan bo'lsa frontend "Yordam" tugmasini yashiradi (bo'sh
      // havolaga bosib, xato sahifaga tushib qolmasin deb).
      supportGroupUrl: env.supportGroupUrl || null,
    },
  });
});

// 4-band: Profil qismida Trade URL kiritish maydoni. 8-band: bu havola
// orqali to'liq to'lov qilingan skinlar Steam inventariga yuboriladi.
// 5-band: shakl bilan birga, agar Steam bot sozlangan bo'lsa, HAQIQIY
// tekshiruv ham qilinadi (validateTradeUrl — steamBotService.js).
router.patch('/trade-url', requireAuth, async (req, res) => {
  const { tradeUrl } = req.body || {};
  const trimmed = String(tradeUrl || '').trim();

  if (trimmed && !STEAM_TRADE_URL_RE.test(trimmed)) {
    return res.status(400).json({
      error:
        'Неверный формат Trade URL. Он должен выглядеть так: https://steamcommunity.com/tradeoffer/new/?partner=...&token=... ' +
        'Найти его можно в Steam: Инвентарь → Обмены → «Кто может отправить мне предложение обмена».',
    });
  }

  let warning = null;
  if (trimmed) {
    const { validateTradeUrl } = require('../services/steamBotService');
    const result = await validateTradeUrl(trimmed);
    if (result.checked && !result.ok) {
      return res.status(400).json({
        error: 'Этот Trade URL недействителен или устарел в Steam. Проверьте ссылку ещё раз (возможно, вы её пересоздали).',
      });
    }
    if (!result.checked) warning = 'Формат ссылки корректен, но живая проверка через Steam сейчас недоступна.';
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { tradeUrl: trimmed || null },
  });
  res.json({ ok: true, tradeUrl: updated.tradeUrl, warning });
});

module.exports = router;

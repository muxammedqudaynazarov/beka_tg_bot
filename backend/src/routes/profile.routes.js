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
router.patch('/trade-url', requireAuth, async (req, res) => {
  const { tradeUrl } = req.body || {};
  const trimmed = String(tradeUrl || '').trim();

  if (trimmed && !STEAM_TRADE_URL_RE.test(trimmed)) {
    return res.status(400).json({
      error:
        'Trade URL formati noto\'g\'ri. U https://steamcommunity.com/tradeoffer/new/?partner=...&token=... ko\'rinishida bo\'lishi kerak. ' +
        'Buni Steam > Inventar > Trade takliflari > "Kim menga trade taklif qila oladi" sozlamalaridan topasiz.',
    });
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { tradeUrl: trimmed || null },
  });
  res.json({ ok: true, tradeUrl: updated.tradeUrl });
});

module.exports = router;

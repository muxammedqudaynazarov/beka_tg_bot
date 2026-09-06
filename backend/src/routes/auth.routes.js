const express = require('express');
const prisma = require('../db/prisma');
const { env } = require('../config/env');
const { verifyTelegramInitData } = require('../utils/telegramInitData');
const { signSession } = require('../middleware/auth');
const { safeUpsertUser } = require('../services/userService');

const router = express.Router();

// 1.d-band: birinchi marta kirgan foydalanuvchi avtomatik ro'yxatdan o'tadi.
// Mini App ochilganda frontend shu endpointga Telegram.WebApp.initData'ni yuboradi.
router.post('/telegram', async (req, res) => {
  const { initData } = req.body || {};
  const check = verifyTelegramInitData(initData, env.userBotToken);
  if (!check.ok) {
    return res.status(401).json({ error: `Ошибка авторизации через Telegram: ${check.reason}` });
  }

  const tgUser = check.user;
  if (!tgUser || !tgUser.id) {
    return res.status(400).json({ error: 'Не удалось получить данные пользователя Telegram.' });
  }

  const isSuperadmin = env.superadminTelegramIds.includes(String(tgUser.id));

  const user = await safeUpsertUser({
    where: { telegramId: BigInt(tgUser.id) },
    update: {
      username: tgUser.username || null,
      firstName: tgUser.first_name || null,
      lastName: tgUser.last_name || null,
    },
    create: {
      telegramId: BigInt(tgUser.id),
      username: tgUser.username || null,
      firstName: tgUser.first_name || null,
      lastName: tgUser.last_name || null,
      role: isSuperadmin ? 'SUPERADMIN' : 'USER',
    },
  });

  // 10/11-band: har bir haqiqiy ilova ochilishida (initData bilan, ya'ni
  // shu bitta so'rov — sahifa qayta yuklanganda emas) hisoblagich oshiriladi;
  // har 3-ochilishda bir marta popup-reklama ko'rsatiladi.
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { appOpenCount: { increment: 1 }, lastActiveAt: new Date() },
  });
  // 2-band: chastota endi admin tomonidan sozlanadi (1/1..1/5), qattiq
  // yozilgan "3" o'rniga Advertisement.popupFrequency'dan o'qiladi.
  const popupAd = await prisma.advertisement.findUnique({ where: { slot: 'POPUP' } });
  const frequency = popupAd?.popupFrequency || 1;
  const showPopupAd = updatedUser.appOpenCount % frequency === 0;

  const token = signSession(user);
  res.json({
    token,
    showPopupAd,
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      role: user.role,
      balance: user.balance,
      holdBalance: user.holdBalance,
      ratingScore: user.ratingScore,
      discountPct: user.discountPct,
    },
  });
});

// 2-band Admin Mini App uchun: initData ADMIN botining O'ZINING tokeni bilan
// imzolangan bo'ladi (foydalanuvchi Mini App'ini ochgan bot boshqa, shuning
// uchun tokeni ham boshqa) — shu sabab alohida endpoint va alohida tekshiruv
// kerak. Bundan tashqari, bu yerda USER roli bilan sessiya berilmaydi — hatto
// initData imzosi to'g'ri bo'lsa ham, base'da ADMIN/SUPERADMIN bo'lmagan odam
// admin panelga kira olmaydi.
router.post('/telegram-admin', async (req, res) => {
  const { initData } = req.body || {};
  const check = verifyTelegramInitData(initData, env.adminBotToken);
  if (!check.ok) {
    return res.status(401).json({ error: `Telegram autentifikatsiyasi muvaffaqiyatsiz: ${check.reason}` });
  }

  const tgUser = check.user;
  if (!tgUser || !tgUser.id) {
    return res.status(400).json({ error: 'Telegram foydalanuvchi ma\'lumoti topilmadi.' });
  }

  const isSuperadmin = env.superadminTelegramIds.includes(String(tgUser.id));
  let user = await prisma.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } });

  if (isSuperadmin) {
    user = await safeUpsertUser({
      where: { telegramId: BigInt(tgUser.id) },
      update: { role: 'SUPERADMIN', username: tgUser.username || null, firstName: tgUser.first_name || null },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username || null,
        firstName: tgUser.first_name || null,
        role: 'SUPERADMIN',
      },
    });
  }

  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN')) {
    return res.status(403).json({ error: 'Sizda administrator huquqi yo\'q.' });
  }

  const token = signSession(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, firstName: user.firstName, role: user.role },
  });
});

module.exports = router;

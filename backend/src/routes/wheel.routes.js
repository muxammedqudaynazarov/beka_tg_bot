const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { notifyText } = require('../services/notifier');

const router = express.Router();

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PROMO_EXPIRY_MS = 24 * 60 * 60 * 1000; // 4.d-band: 24 soat ichida faollashtirilmasa o'chadi

// "Y51SES" kabi qisqa, harf+raqamli kod — o'qish/nusxalash qulay bo'lishi
// uchun chalkash belgilar (0/O, 1/I) chiqarib tashlangan.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateShortCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function pickWeightedRandom(items) {
  const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// Барабан orqali yutilgan skinlar uchun maxsus, "ko'rinmas" (filtrlarda
// alohida ajratilmaydigan, lekin Auction jadvali talab qiladigan)
// Тип/Категория — bir marta yaratilib, keyin qayta ishlatiladi.
let cachedWheelSubcategoryId = null;
async function getWheelSubcategoryId() {
  if (cachedWheelSubcategoryId) return cachedWheelSubcategoryId;
  let category = await prisma.weaponCategory.findFirst({ where: { name: 'Барабан' } });
  if (!category) category = await prisma.weaponCategory.create({ data: { name: 'Барабан' } });
  let subcategory = await prisma.weaponSubcategory.findFirst({ where: { categoryId: category.id, name: 'Yutuq' } });
  if (!subcategory) subcategory = await prisma.weaponSubcategory.create({ data: { categoryId: category.id, name: 'Yutuq' } });
  cachedWheelSubcategoryId = subcategory.id;
  return subcategory.id;
}

router.get('/status', requireAuth, async (req, res) => {
  const items = await prisma.wheelItem.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  const nextAvailableAt = req.user.lastWheelSpinAt
    ? new Date(req.user.lastWheelSpinAt.getTime() + SPIN_COOLDOWN_MS)
    : null;
  const canSpin = !nextAvailableAt || Date.now() >= nextAvailableAt.getTime();
  res.json({ items, canSpin, nextAvailableAt });
});

router.post('/spin', requireAuth, async (req, res) => {
  try {
    if (req.user.lastWheelSpinAt) {
      const nextAvailableAt = req.user.lastWheelSpinAt.getTime() + SPIN_COOLDOWN_MS;
      if (Date.now() < nextAvailableAt) {
        return res.status(400).json({
          error: 'Следующее вращение будет доступно позже.',
          nextAvailableAt: new Date(nextAvailableAt),
        });
      }
    }

    const items = await prisma.wheelItem.findMany({ where: { isActive: true } });
    if (!items.length) return res.status(400).json({ error: 'Барабан пока пуст — обратитесь позже.' });

    const won = pickWeightedRandom(items);
    await prisma.user.update({ where: { id: req.user.id }, data: { lastWheelSpinAt: new Date() } });

    let promoCode = null;
    let auctionId = null;

    if (won.type === 'BOMB') {
      // Hech narsa berilmaydi
    } else if (won.type === 'SKIN') {
      const subcategoryId = await getWheelSubcategoryId();
      const auction = await prisma.auction.create({
        data: {
          skinName: won.skinName || 'Приз барабана',
          imageUrl: won.skinImageUrl || '',
          subcategoryId,
          rarity: won.skinRarity || 'CONSUMER',
          floatValue: won.skinFloatValue,
          wearCondition: won.skinWearCondition,
          paintSeed: won.skinPaintSeed,
          steamAssetId: won.skinSteamAssetId,
          startPrice: 0,
          currentPrice: 0,
          status: 'PAID',
          endsAt: new Date(),
          originalEndsAt: new Date(),
          currentLeaderId: req.user.id,
          paidAt: new Date(),
        },
      });
      auctionId = auction.id;
    } else {
      let code;
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateShortCode();
        const exists = await prisma.promoCode.findUnique({ where: { code } });
        if (!exists) break;
      }

      const data = {
        code,
        isActive: true,
        maxRedemptions: 1,
        restrictedToUserId: req.user.id,
        expiresAt: new Date(Date.now() + PROMO_EXPIRY_MS),
        wonViaWheel: true,
      };
      if (won.type === 'TOPUP_BONUS_PROMO') {
        data.type = 'NEXT_DEPOSIT_BONUS';
        data.bonusPercent = won.percent;
      } else if (won.type === 'PAID_PROMO') {
        data.type = 'BALANCE_TOPUP';
        data.topupAmount = won.amount;
      } else if (won.type === 'DISCOUNT_PROMO') {
        data.type = 'DISCOUNT';
        data.discountPercent = won.percent;
        data.discountUses = won.discountUses || 1;
      }

      promoCode = await prisma.promoCode.create({ data });
    }

    await prisma.wheelSpin.create({
      data: {
        userId: req.user.id,
        wheelItemId: won.id,
        resultType: won.type,
        resultLabel: won.label,
        promoCodeId: promoCode?.id,
        auctionId,
      },
    });

    setTimeout(() => {
      notifyText(
        req.user.telegramId,
        won.type === 'BOMB'
          ? '💣 Барабан: сегодня не повезло — попробуйте завтра!'
          : `🎉 Барабан: вы выиграли «${won.label}»! Подробности — в приложении.`
      ).catch(() => {});
    }, 4200);

    res.json({
      result: { wheelItemId: won.id, type: won.type, label: won.label, promoCode: promoCode?.code || null, auctionId },
    });
  } catch (err) {
    // MUHIM: bu try-catch ATAYLAB qo'shildi — "Barabanda skin bo'lsa
    // aylanmay qolmoqda" muammosini ANIQ log orqali topish uchun. Xato
    // matnini TO'LIQ (stack bilan) yozamiz.
    console.error('[wheel/spin] Kutilmagan xato:', err.message, '\n', err.stack);
    res.status(500).json({ error: 'Произошла ошибка при вращении барабана. Мы уже уведомлены и разберёмся.' });
  }
});

module.exports = router;

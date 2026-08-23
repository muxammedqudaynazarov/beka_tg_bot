const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ===========================================================================
// promo-kodni faollashtirish. Turlarga qarab har xil amaliyot:
//   DISCOUNT             -> UserDiscount yaratiladi
//   BALANCE_TOPUP        -> hisobga darhol belgilangan summa qo'shiladi
//   FIRST_DEPOSIT_BONUS  -> "faollashtiriladi", bonus faqat BIRINCHI to'lovda
//   NEXT_DEPOSIT_BONUS   -> (Барабан) "faollashtiriladi", bonus ENG YAQIN
//                           to'lovda (ilgari to'lov qilgan-qilmaganidan qat'iy
//                           nazar) — payments.routes.js'da amalga oshiriladi
// ===========================================================================
router.post('/redeem', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return res.status(400).json({ error: 'Введите промо-код.' });

  const promo = await prisma.promoCode.findUnique({ where: { code: cleanCode } });
  if (!promo || !promo.isActive) return res.status(404).json({ error: 'Промо-код не найден или больше не активен.' });

  // Барабан (4.d-band): 24 soat ichida faollashtirilmasa muddati tugaydi
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Срок действия этого промо-кода истёк.' });
  }
  // Барабан (4.e-band): faqat o'sha BITTA foydalanuvchiga tegishli
  if (promo.restrictedToUserId && promo.restrictedToUserId !== req.user.id) {
    return res.status(404).json({ error: 'Промо-код не найден или больше не активен.' });
  }
  if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) {
    return res.status(400).json({ error: 'Лимит использований этого промо-кода исчерпан.' });
  }

  const already = await prisma.promoCodeRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId: promo.id, userId: req.user.id } },
  });
  if (already) return res.status(400).json({ error: 'Вы уже использовали этот промо-код.' });

  if (promo.type === 'FIRST_DEPOSIT_BONUS' && req.user.hasEverDeposited) {
    return res.status(400).json({ error: 'Этот промо-код действует только для пользователей, которые ещё ни разу не пополняли баланс.' });
  }

  const result = await prisma.$transaction(async (tx) => {
    let message = '';

    if (promo.type === 'DISCOUNT') {
      await tx.userDiscount.create({
        data: {
          userId: req.user.id,
          percent: promo.discountPercent,
          remainingUses: promo.discountUses,
          totalUses: promo.discountUses,
          sourcePromoCodeId: promo.id,
        },
      });
      message = `🎁 Скидка ${promo.discountPercent}% начислена (можно использовать ${promo.discountUses} раз при выигрыше на аукционе)!`;
    } else if (promo.type === 'BALANCE_TOPUP') {
      await tx.user.update({ where: { id: req.user.id }, data: { balance: { increment: promo.topupAmount } } });
      await tx.transaction.create({
        data: {
          userId: req.user.id,
          type: 'PROMO_TOPUP',
          status: 'SUCCESS',
          amount: promo.topupAmount,
          note: `Промо-код: ${promo.code}`,
        },
      });
      message = `💰 Баланс пополнен на ${Number(promo.topupAmount).toLocaleString('ru-RU')} сум!`;
    } else if (promo.type === 'FIRST_DEPOSIT_BONUS') {
      message = `✅ Промо-код активирован! При первом пополнении баланса вы получите +${promo.bonusPercent}% бонус.`;
    } else if (promo.type === 'NEXT_DEPOSIT_BONUS') {
      message = `✅ Промо-код активирован! При ближайшем пополнении баланса вы получите +${promo.bonusPercent}% бонус.`;
    }

    const needsActivationTracking = promo.type === 'FIRST_DEPOSIT_BONUS' || promo.type === 'NEXT_DEPOSIT_BONUS';
    await tx.promoCodeRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId: req.user.id,
        status: needsActivationTracking ? 'ACTIVE' : 'CONSUMED',
      },
    });
    await tx.promoCode.update({ where: { id: promo.id }, data: { redemptionCount: { increment: 1 } } });

    return message;
  });

  res.json({ ok: true, message: result });
});

// Foydalanuvchi hozir FIRST_DEPOSIT_BONUS yoki NEXT_DEPOSIT_BONUS
// faollashtirgan-faollashtirmaganini bilish uchun (Платежи sahifasida
// banner ko'rsatish uchun).
router.get('/active-first-deposit-bonus', requireAuth, async (req, res) => {
  const redemption = await prisma.promoCodeRedemption.findFirst({
    where: { userId: req.user.id, status: 'ACTIVE' },
    include: { promoCode: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!redemption) return res.json({ bonus: null });
  const type = redemption.promoCode.type;
  if (type === 'FIRST_DEPOSIT_BONUS' && req.user.hasEverDeposited) return res.json({ bonus: null });
  if (type !== 'FIRST_DEPOSIT_BONUS' && type !== 'NEXT_DEPOSIT_BONUS') return res.json({ bonus: null });
  res.json({ bonus: { percent: Number(redemption.promoCode.bonusPercent) } });
});

// Барабан (4.e-band): foydalanuvchining o'ziga biriktirilgan, hali
// ISHLATILMAGAN va MUDDATI TUGAMAGAN yutuq kodlari — Промокод bo'limida
// ro'yxat sifatida ko'rsatish uchun.
router.get('/my-wheel-codes', requireAuth, async (req, res) => {
  const codes = await prisma.promoCode.findMany({
    where: {
      restrictedToUserId: req.user.id,
      wonViaWheel: true,
      isActive: true,
      redemptionCount: 0,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: codes });
});

module.exports = router;

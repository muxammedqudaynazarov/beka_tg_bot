const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ===========================================================================
// 4-band: promo-kodni faollashtirish. Uchta turga qarab har xil amaliyot:
//   DISCOUNT             -> UserDiscount yaratiladi (3-band bilan bir xil)
//   BALANCE_TOPUP        -> hisobga darhol belgilangan summa qo'shiladi
//   FIRST_DEPOSIT_BONUS  -> "faollashtiriladi" (ACTIVE), lekin bonus faqat
//                           birinchi haqiqiy to'lov amalga oshganda beriladi
//                           (bu qism payments.routes.js'da bajariladi)
// ===========================================================================
router.post('/redeem', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return res.status(400).json({ error: 'Введите промо-код.' });

  const promo = await prisma.promoCode.findUnique({ where: { code: cleanCode } });
  if (!promo || !promo.isActive) return res.status(404).json({ error: 'Промо-код не найден или больше не активен.' });
  if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) {
    return res.status(400).json({ error: 'Лимит использований этого промо-кода исчерпан.' });
  }

  const already = await prisma.promoCodeRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId: promo.id, userId: req.user.id } },
  });
  if (already) return res.status(400).json({ error: 'Вы уже использовали этот промо-код.' });

  // FIRST_DEPOSIT_BONUS uchun maxsus shart: foydalanuvchi ILGARI hech
  // qachon hisobini to'ldirmagan bo'lishi kerak.
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
    }

    await tx.promoCodeRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId: req.user.id,
        status: promo.type === 'FIRST_DEPOSIT_BONUS' ? 'ACTIVE' : 'CONSUMED',
      },
    });
    await tx.promoCode.update({ where: { id: promo.id }, data: { redemptionCount: { increment: 1 } } });

    return message;
  });

  res.json({ ok: true, message: result });
});

// Foydalanuvchi hozir FIRST_DEPOSIT_BONUS faollashtirgan-faollashtirmaganini
// bilish uchun (Платежи sahifasida banner ko'rsatish uchun).
router.get('/active-first-deposit-bonus', requireAuth, async (req, res) => {
  if (req.user.hasEverDeposited) return res.json({ bonus: null });
  const redemption = await prisma.promoCodeRedemption.findFirst({
    where: { userId: req.user.id, status: 'ACTIVE' },
    include: { promoCode: true },
  });
  if (!redemption || redemption.promoCode.type !== 'FIRST_DEPOSIT_BONUS') return res.json({ bonus: null });
  res.json({ bonus: { percent: Number(redemption.promoCode.bonusPercent) } });
});

module.exports = router;

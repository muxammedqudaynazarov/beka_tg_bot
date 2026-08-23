const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { buildCheckoutUrl } = require('../services/paymeService');
const { notifyText } = require('../services/notifier');

const router = express.Router();

/**
 * Tranzaksiyani "to'landi" deb belgilab, balansni oshiradi. Bu funksiya
 * TO'LOV TIZIMIDAN MUSTAQIL (avval Click, endi Payme uchun bir xil ishlatiladi)
 * — provayderga xos ID'larni ESHITMAYDI, faqat balans/bonus/xabar mantig'ini
 * bajaradi. Provayderga xos maydonlar (masalan paymeState) chaqiruvchi
 * tomonidan alohida yangilanadi.
 */
async function markTransactionPaid(tx) {
  if (tx.status === 'SUCCESS') return; // allaqachon hisoblangan — qayta hisoblamaymiz

  const userBefore = await prisma.user.findUnique({ where: { id: tx.userId } });
  const isFirstDeposit = !userBefore?.hasEverDeposited;

  let bonusAmount = 0;
  let activeRedemption = null;
  if (isFirstDeposit) {
    activeRedemption = await prisma.promoCodeRedemption.findFirst({
      where: { userId: tx.userId, status: 'ACTIVE' },
      include: { promoCode: true },
    });
    if (activeRedemption?.promoCode.type === 'FIRST_DEPOSIT_BONUS') {
      bonusAmount = (Number(tx.amount) * Number(activeRedemption.promoCode.bonusPercent)) / 100;
    }
  }

  const ops = [
    prisma.transaction.update({ where: { id: tx.id }, data: { status: 'SUCCESS' } }),
    prisma.user.update({
      where: { id: tx.userId },
      data: { balance: { increment: tx.amount }, hasEverDeposited: true },
    }),
  ];
  if (bonusAmount > 0) {
    ops.push(
      prisma.user.update({ where: { id: tx.userId }, data: { balance: { increment: bonusAmount } } }),
      prisma.transaction.create({
        data: {
          userId: tx.userId,
          type: 'PROMO_BONUS',
          status: 'SUCCESS',
          amount: bonusAmount,
          note: `Бонус +${activeRedemption.promoCode.bonusPercent}% за первое пополнение (промо-код ${activeRedemption.promoCode.code})`,
        },
      }),
      prisma.promoCodeRedemption.update({ where: { id: activeRedemption.id }, data: { status: 'CONSUMED', consumedAt: new Date() } })
    );
  }
  await prisma.$transaction(ops);

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });
  await notifyText(
    user?.telegramId,
    bonusAmount > 0
      ? `✅ Баланс пополнен на ${Number(tx.amount).toLocaleString('ru-RU')} сум + бонус ${bonusAmount.toLocaleString('ru-RU')} сум (промо-код) = ${(Number(tx.amount) + bonusAmount).toLocaleString('ru-RU')} сум!`
      : `✅ Баланс пополнен на ${Number(tx.amount).toLocaleString('ru-RU')} сум.`
  );
}

router.post('/topup', requireAuth, async (req, res) => {
  const { amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Неверная сумма пополнения.' });
  }

  const merchantTransId = crypto.randomUUID();
  await prisma.transaction.create({
    data: {
      userId: req.user.id,
      type: 'TOPUP',
      status: 'PENDING',
      amount: numericAmount,
      merchantTransId,
    },
  });

  const checkoutUrl = buildCheckoutUrl({ amount: numericAmount, merchantTransId });
  res.json({ checkoutUrl, merchantTransId });
});

router.get('/history', requireAuth, async (req, res) => {
  const items = await prisma.transaction.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ items });
});

router.get('/pending', requireAuth, async (req, res) => {
  const items = await prisma.transaction.findMany({
    where: { userId: req.user.id, type: 'TOPUP', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ items });
});

router.post('/:id/check-status', requireAuth, async (req, res) => {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.userId !== req.user.id) {
    return res.status(404).json({ error: 'Транзакция не найдена.' });
  }
  if (tx.status === 'SUCCESS') {
    return res.json({ status: 'SUCCESS', message: 'Этот платёж уже подтверждён.' });
  }
  res.json({
    status: 'PENDING',
    message: 'Платёж пока не подтверждён. Если вы уже оплатили, обновление обычно занимает не более минуты.',
  });
});

module.exports = router;
module.exports.markTransactionPaid = markTransactionPaid;

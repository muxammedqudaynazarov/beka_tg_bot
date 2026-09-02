const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { buildCheckoutUrl: buildPaymeCheckoutUrl } = require('../services/paymeService');
const { buildCheckoutUrl: buildClickCheckoutUrl, checkClickPaymentStatus } = require('../services/clickPaymentService');
const { notifyText } = require('../services/notifier');

const router = express.Router();

/**
 * Tranzaksiyani "to'landi" deb belgilab, balansni oshiradi. Bu funksiya
 * TO'LOV TIZIMIDAN MUSTAQIL — ikkala provayder (Click, Payme) uchun ham
 * BIR XIL ishlatiladi, provayderga xos ID'larni ESHITMAYDI, faqat
 * balans/bonus/xabar mantig'ini bajaradi. Provayderga xos maydonlar
 * (masalan paymeState yoki clickTransId) chaqiruvchi tomonidan alohida
 * yangilanadi.
 */
async function markTransactionPaid(tx) {
  if (tx.status === 'SUCCESS') return; // allaqachon hisoblangan — qayta hisoblamaymiz

  const userBefore = await prisma.user.findUnique({ where: { id: tx.userId } });
  const isFirstDeposit = !userBefore?.hasEverDeposited;

  let bonusAmount = 0;
  let activeRedemption = await prisma.promoCodeRedemption.findFirst({
    where: { userId: tx.userId, status: 'ACTIVE' },
    include: { promoCode: true },
    orderBy: { createdAt: 'desc' }, // 4-band: ENG OXIRGI aktivlashtirilgan ishlaydi
  });
  if (activeRedemption) {
    const type = activeRedemption.promoCode.type;
    const eligible = type === 'NEXT_DEPOSIT_BONUS' || (type === 'FIRST_DEPOSIT_BONUS' && isFirstDeposit);
    if (eligible) {
      bonusAmount = (Number(tx.amount) * Number(activeRedemption.promoCode.bonusPercent)) / 100;
    } else {
      activeRedemption = null;
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

  // MUHIM TUZATISH: to'lov tasdiqlangandan keyin, shu foydalanuvchining
  // qolgan barcha ACTIVE deposit-bonus redemption'larini EXPIRED qilamiz.
  // Bu — "eng oxirgisi ishlaydi" shartining TO'LIQ kafolati:
  // bitta to'lovda bitta kod ishlaydi, qolganlar keyingi to'lovda ham ishlamasin.
  const remainingActive = await prisma.promoCodeRedemption.findMany({
    where: {
      userId: tx.userId,
      status: 'ACTIVE',
      promoCode: { type: { in: ['FIRST_DEPOSIT_BONUS', 'NEXT_DEPOSIT_BONUS'] } },
      // Hozirgini (agar CONSUMED bo'lgan bo'lsa) ham qo'shib yuboramiz — u
      // allaqachon CONSUMED bo'lgani uchun updateMany xavfsiz ishlaydi.
    },
    select: { id: true },
  });
  if (remainingActive.length > 0) {
    await prisma.promoCodeRedemption.updateMany({
      where: { id: { in: remainingActive.map((r) => r.id) } },
      data: { status: 'EXPIRED' },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });
  await notifyText(
    user?.telegramId,
    bonusAmount > 0
      ? `✅ Баланс пополнен на ${Number(tx.amount).toLocaleString('ru-RU')} сум + бонус ${bonusAmount.toLocaleString('ru-RU')} сум (промо-код) = ${(Number(tx.amount) + bonusAmount).toLocaleString('ru-RU')} сум!`
      : `✅ Баланс пополнен на ${Number(tx.amount).toLocaleString('ru-RU')} сум.`
  );

  // Referral (affiliate) tizimi: agar bu FIRST_DEPOSIT_BONUS kodi bo'lsa va
  // unda biriktirilgan foydalanuvchi (referralTelegramId) ko'rsatilgan bo'lsa —
  // o'sha foydalanuvchiga to'ldirilgan summaning referralPercent % bonusi
  // AVTOMATIK qo'shiladi. Bu — marketing uchun: Aybek o'z promo-kodini
  // tarqatadi, uning orqali kim to'ldirsa, Aybek ham ulushini oladi.
  if (
    activeRedemption &&
    activeRedemption.promoCode.type === 'FIRST_DEPOSIT_BONUS' &&
    activeRedemption.promoCode.referralTelegramId &&
    activeRedemption.promoCode.referralPercent
  ) {
    try {
      const referrer = await prisma.user.findUnique({
        where: { telegramId: activeRedemption.promoCode.referralTelegramId },
      });
      if (referrer) {
        const referralBonus = Math.round(
          (Number(tx.amount) * Number(activeRedemption.promoCode.referralPercent)) / 100
        );
        if (referralBonus > 0) {
          await prisma.$transaction([
            prisma.user.update({ where: { id: referrer.id }, data: { balance: { increment: referralBonus } } }),
            prisma.transaction.create({
              data: {
                userId: referrer.id,
                type: 'PROMO_BONUS',
                status: 'SUCCESS',
                amount: referralBonus,
                note: `Реферальный бонус ${Number(activeRedemption.promoCode.referralPercent)}% по промо-коду ${activeRedemption.promoCode.code}`,
              },
            }),
          ]);
          await notifyText(
            referrer.telegramId,
            `💰 Реферальный бонус! По вашему промо-коду «${activeRedemption.promoCode.code}» было совершено пополнение — вам начислено ${referralBonus.toLocaleString('ru-RU')} сум (${Number(activeRedemption.promoCode.referralPercent)}% от суммы пополнения).`
          );
        }
      }
    } catch (err) {
      // Referral bonusi ishlamasa ham, asosiy to'lov muvaffaqiyatli o'tgan —
      // uni qaytarmaymiz, faqat logga yozamiz.
      console.error('[referral] Bonus berishda xato:', err.message);
    }
  }
}

// Ikkala to'lov tizimi bir vaqtda — foydalanuvchi tanlagan provayderga qarab
// mos checkout havolasi yaratiladi. Standart holatda PAYME (asosiy tizim).
router.post('/topup', requireAuth, async (req, res) => {
  const { amount, provider } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Неверная сумма пополнения.' });
  }
  const selectedProvider = provider === 'CLICK' ? 'CLICK' : 'PAYME';

  const merchantTransId = crypto.randomUUID();
  await prisma.transaction.create({
    data: {
      userId: req.user.id,
      type: 'TOPUP',
      status: 'PENDING',
      amount: numericAmount,
      merchantTransId,
      provider: selectedProvider,
    },
  });

  const checkoutUrl =
    selectedProvider === 'CLICK'
      ? buildClickCheckoutUrl({ amount: numericAmount, merchantTransId })
      : buildPaymeCheckoutUrl({ amount: numericAmount, merchantTransId });

  res.json({ checkoutUrl, merchantTransId, provider: selectedProvider });
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

// Click uchun — jonli tekshiruv (Click'ning o'z API'siga so'rov yuboriladi).
// Payme uchun — Payme PUSH asosida ishlaydi (o'zi qayta urinadi), shuning
// uchun bizga ma'lum bo'lgan oxirgi holatni qaytaramiz.
router.post('/:id/check-status', requireAuth, async (req, res) => {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.userId !== req.user.id) {
    return res.status(404).json({ error: 'Транзакция не найдена.' });
  }
  if (tx.status === 'SUCCESS') {
    return res.json({ status: 'SUCCESS', message: 'Этот платёж уже подтверждён.' });
  }

  if (tx.provider === 'CLICK') {
    const result = await checkClickPaymentStatus(tx);
    if (result.ok && result.paid) {
      await markTransactionPaid(tx);
      if (result.paymentId) {
        await prisma.transaction.update({ where: { id: tx.id }, data: { clickTransId: String(result.paymentId) } });
      }
      return res.json({ status: 'SUCCESS', message: 'Платёж подтверждён!' });
    }
  }

  res.json({
    status: 'PENDING',
    message: 'Платёж пока не подтверждён. Если вы уже оплатили, обновление обычно занимает не более минуты.',
  });
});

// Незавершённые платежи ro'yxatidan keraksiz (masalan tasodifan yaratilgan
// yoki umuman to'lamoqchi bo'lmagan) yozuvlarni o'chirish. Xavfsizlik uchun
// faqat FAQAT o'zining va FAQAT hali PENDING (hali to'lanmagan) tranzaksiyani
// o'chirishga ruxsat beriladi — SUCCESS (moliyaviy yozuv) hech qachon o'chirilmaydi.
router.delete('/:id', requireAuth, async (req, res) => {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.userId !== req.user.id) {
    return res.status(404).json({ error: 'Транзакция не найдена.' });
  }
  if (tx.status !== 'PENDING') {
    return res.status(400).json({ error: 'Можно удалить только неподтверждённый платёж.' });
  }
  await prisma.transaction.delete({ where: { id: tx.id } });
  res.json({ ok: true });
});

module.exports = router;
module.exports.markTransactionPaid = markTransactionPaid;

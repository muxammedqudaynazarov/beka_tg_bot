const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { buildCheckoutUrl } = require('../services/clickPaymentService');
const { isClickSignatureValid } = require('../utils/clickSignature');

const router = express.Router();

// Click.uz javob kodlari (Shop API hujjatida keltirilgan standart kodlar)
const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_FAILED: -1,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  TRANSACTION_CANCELLED: -9,
};

// 1.g-band: foydalanuvchi "To'ldirish" tugmasini bosganda chaqiriladi.
// Pending Transaction yaratamiz va Click checkout havolasini qaytaramiz.
router.post('/topup', requireAuth, async (req, res) => {
  const { amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'To\'ldirish summasi noto\'g\'ri.' });
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

// --- Quyidagi ikkita endpoint Click serveri tomonidan chaqiriladi (foydalanuvchi
// brauzeridan emas!). Shuning uchun requireAuth O'RNIGA imzo tekshiruvi ishlatiladi. ---

// POST /api/payments/click/prepare  (action = 0)
router.post('/click/prepare', async (req, res) => {
  const body = req.body || {};
  console.log('[click/prepare] Click\'dan kelgan so\'rov:', JSON.stringify(body));

  if (!isClickSignatureValid(body, 'prepare')) {
    console.warn(
      '[click/prepare] IMZO MOS KELMADI. Click yuborgan sign_string:', body.sign_string,
      '| Biz hisoblagan imzo:', require('../utils/clickSignature').buildPrepareSignString(body)
    );
    return res.json({ error: CLICK_ERROR.SIGN_FAILED, error_note: 'Imzo noto\'g\'ri' });
  }

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: body.merchant_trans_id } });
  if (!tx) {
    console.warn('[click/prepare] Tranzaksiya topilmadi, merchant_trans_id:', body.merchant_trans_id);
    return res.json({ error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: 'Tranzaksiya topilmadi' });
  }
  if (tx.status === 'SUCCESS') {
    return res.json({ error: CLICK_ERROR.ALREADY_PAID, error_note: 'Allaqachon to\'langan' });
  }
  if (Number(tx.amount) !== Number(body.amount)) {
    console.warn('[click/prepare] Summa mos kelmadi. Bizda:', tx.amount, '| Click yuborgan:', body.amount);
    return res.json({ error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: 'Summa mos kelmadi' });
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { clickTransId: String(body.click_trans_id) },
  });

  console.log('[click/prepare] OK, tranzaksiya:', tx.id);
  res.json({
    click_trans_id: body.click_trans_id,
    merchant_trans_id: body.merchant_trans_id,
    merchant_prepare_id: tx.id, // bizning tizimdagi tranzaksiya ID'sini "prepare id" sifatida qaytaramiz
    error: CLICK_ERROR.SUCCESS,
    error_note: 'Success',
  });
});

// POST /api/payments/click/complete  (action = 1)
router.post('/click/complete', async (req, res) => {
  const body = req.body || {};
  console.log('[click/complete] Click\'dan kelgan so\'rov:', JSON.stringify(body));

  if (!isClickSignatureValid(body, 'complete')) {
    console.warn(
      '[click/complete] IMZO MOS KELMADI. Click yuborgan sign_string:', body.sign_string,
      '| Biz hisoblagan imzo:', require('../utils/clickSignature').buildCompleteSignString(body)
    );
    return res.json({ error: CLICK_ERROR.SIGN_FAILED, error_note: 'Imzo noto\'g\'ri' });
  }

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: body.merchant_trans_id } });
  if (!tx) {
    console.warn('[click/complete] Tranzaksiya topilmadi, merchant_trans_id:', body.merchant_trans_id);
    return res.json({ error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: 'Tranzaksiya topilmadi' });
  }

  // action=1 bilan birga error<0 kelsa — Click to'lovni bekor qilgan
  if (Number(body.error) < 0) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'CANCELLED' } });
    console.log('[click/complete] Click to\'lovni bekor qildi, tranzaksiya:', tx.id);
    return res.json({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_confirm_id: tx.id,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    });
  }

  if (tx.status !== 'SUCCESS') {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'SUCCESS', clickPaydocId: String(body.click_paydoc_id || '') },
      }),
      prisma.user.update({
        where: { id: tx.userId },
        data: { balance: { increment: tx.amount } },
      }),
    ]);
    console.log(`[click/complete] BALANS OSHIRILDI: userId=${tx.userId}, summa=${tx.amount}`);
  }

  res.json({
    click_trans_id: body.click_trans_id,
    merchant_trans_id: body.merchant_trans_id,
    merchant_confirm_id: tx.id,
    error: CLICK_ERROR.SUCCESS,
    error_note: 'Success',
  });
});

router.get('/history', requireAuth, async (req, res) => {
  const items = await prisma.transaction.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ items });
});

module.exports = router;

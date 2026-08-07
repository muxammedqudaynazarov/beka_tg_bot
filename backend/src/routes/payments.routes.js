const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { buildCheckoutUrl, checkClickPaymentStatus, requestCardToken, verifyCardToken, payWithCardToken, deleteCardToken } = require('../services/clickPaymentService');
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

/**
 * Tranzaksiyani "to'landi" deb belgilab, balansni oshiradi. Ikkala joydan
 * (Click webhook VA qo'lda "Tekshirish" tugmasi VA karta oqimi) chaqiriladi —
 * shuning uchun HAR SAFAR ham xavfsiz bo'lishi uchun faqat hali SUCCESS
 * bo'lmagan tranzaksiyada ishlaydi (ikki marta balans oshib ketmasligi uchun).
 */
async function markTransactionPaid(tx, clickPaydocId) {
  if (tx.status === 'SUCCESS') return; // allaqachon hisoblangan — qayta hisoblamaymiz
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'SUCCESS', clickPaydocId: clickPaydocId ? String(clickPaydocId) : tx.clickPaydocId },
    }),
    prisma.user.update({
      where: { id: tx.userId },
      data: { balance: { increment: tx.amount } },
    }),
  ]);
}

// Foydalanuvchi "Пополнить" tugmasini bosganda chaqiriladi (Click checkout — redirect usuli).
// Pending Transaction yaratamiz va Click checkout havolasini qaytaramiz.
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

// --- Quyidagi ikkita endpoint Click serveri tomonidan chaqiriladi (foydalanuvchi
// brauzeridan emas!). Shuning uchun requireAuth O'RNIGA imzo tekshiruvi ishlatiladi.
// DIQQAT: bu javoblar Click'ning o'ziga ketadi (foydalanuvchiga emas), shuning
// uchun error_note qiymatlari ATAYIN tarjima qilinmagan — bu Click protokoli
// uchun texnik matn, interfeys matni emas. ---

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
    await markTransactionPaid(tx, body.click_paydoc_id);
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

// "Платежи" menyusida FAQAT yakunlanmagan (hali tasdiqlanmagan) to'ldirish
// so'rovlari ko'rsatiladi — muvaffaqiyatli/bekor qilinganlar bu ro'yxatda
// ko'rinmaydi (foydalanuvchini keraksiz tarix bilan chalg'itmaslik uchun).
router.get('/pending', requireAuth, async (req, res) => {
  const items = await prisma.transaction.findMany({
    where: { userId: req.user.id, type: 'TOPUP', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ items });
});

// Avtomatik webhook kelmagan hollar uchun — foydalanuvchi qo'lda "Проверить"
// tugmasini bosganda Click'ning o'ziga to'g'ridan-to'g'ri so'rov yuboramiz.
router.post('/:id/check-status', requireAuth, async (req, res) => {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.userId !== req.user.id) {
    return res.status(404).json({ error: 'Транзакция не найдена.' });
  }
  if (tx.type !== 'TOPUP') {
    return res.status(400).json({ error: 'Проверка недоступна для этого типа транзакции.' });
  }
  if (tx.status === 'SUCCESS') {
    return res.json({ status: 'SUCCESS', message: 'Этот платёж уже подтверждён.' });
  }

  console.log(`[check-status] Boshlanmoqda: tx=${tx.id}, clickTransId=${tx.clickTransId || '(yo\'q)'}, merchantTransId=${tx.merchantTransId}`);
  const result = await checkClickPaymentStatus(tx);
  if (!result.ok) {
    return res.status(502).json({ error: `Не удалось связаться с Click: ${result.error}` });
  }

  if (result.paid) {
    await markTransactionPaid(tx, result.paymentId);
    console.log(`[check-status] BALANS OSHIRILDI (qo'lda tekshiruv): userId=${tx.userId}, summa=${tx.amount}`);
    return res.json({ status: 'SUCCESS', message: 'Платёж подтверждён, баланс пополнен.' });
  }

  if (result.paymentStatus === undefined) {
    // Click bu identifikator bo'yicha hech qanday yozuv topolmadi (masalan
    // Prepare hali kelmagan yoki umuman kelmagan). Foydalanuvchiga Click'ning
    // xom (ko'pincha ruscha/texnik) xabarini emas, tushunarli holatni ko'rsatamiz.
    return res.json({
      status: 'PENDING',
      message:
        'Click пока не предоставил информацию об этом платеже. Если вы только что оплатили, ' +
        'подождите пару минут и попробуйте снова. Если проблема сохраняется — обратитесь в раздел «Помощь».',
    });
  }

  const statusLabels = { 0: 'Создан, ещё не оплачен', 1: 'В обработке' };
  const label = statusLabels[result.paymentStatus] || 'Пока не оплачен';
  res.json({ status: 'PENDING', message: `Статус по данным Click: ${label}` });
});

// ===========================================================================
// KARTA ORQALI TO'G'RIDAN-TO'G'RI TO'LOV (Card Token oqimi) — webhook'ga
// bog'liq bo'lmagan muqobil usul. 3 bosqich: token so'rash -> SMS kodni
// tasdiqlash -> to'lovni amalga oshirish.
// ===========================================================================

// 1-qadam: karta ma'lumotlarini yuboradi, Click SMS kod yuboradi
router.post('/card/request-token', requireAuth, async (req, res) => {
  const { cardNumber, expireDate } = req.body || {};
  const digitsOnly = String(cardNumber || '').replace(/\D/g, '');
  if (digitsOnly.length !== 16) {
    return res.status(400).json({ error: 'Номер карты должен содержать 16 цифр.' });
  }
  if (!/^\d{4}$/.test(String(expireDate || ''))) {
    return res.status(400).json({ error: 'Срок действия должен быть в формате ММ/ГГ (например 12/27).' });
  }
  const result = await requestCardToken({ cardNumber: digitsOnly, expireDate: String(expireDate) });
  if (!result.ok) return res.status(400).json({ error: result.error || 'Не удалось проверить данные карты.' });
  res.json({ cardToken: result.cardToken, maskedPhone: result.maskedPhone });
});

// 2-qadam: foydalanuvchi SMS kodini tasdiqlaydi
router.post('/card/verify-token', requireAuth, async (req, res) => {
  const { cardToken, smsCode } = req.body || {};
  if (!cardToken || !smsCode) return res.status(400).json({ error: 'Данные заполнены не полностью.' });
  const result = await verifyCardToken({ cardToken, smsCode: String(smsCode) });
  if (!result.ok) return res.status(400).json({ error: result.error || 'Неверный код из SMS.' });
  res.json({ ok: true });
});

// 3-qadam: tasdiqlangan token bilan darhol to'lash — MUVAFFAQIYATLI bo'lsa
// balans SHU YERDA, sinxron ravishda oshiriladi (webhook kutilmaydi).
router.post('/card/pay', requireAuth, async (req, res) => {
  const { cardToken, amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!cardToken || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Данные заполнены не полностью.' });
  }

  const merchantTransId = crypto.randomUUID();
  const tx = await prisma.transaction.create({
    data: { userId: req.user.id, type: 'TOPUP', status: 'PENDING', amount: numericAmount, merchantTransId },
  });

  const result = await payWithCardToken({ cardToken, amount: numericAmount, merchantTransId });
  deleteCardToken(cardToken); // vaqtinchalik token endi kerak emas — fon rejimida tozalaymiz

  if (!result.ok) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED' } });
    return res.status(400).json({ error: result.error || 'Не удалось выполнить платёж.' });
  }

  await prisma.transaction.update({ where: { id: tx.id }, data: { clickTransId: String(result.paymentId) } });

  if (result.paid) {
    await markTransactionPaid(tx, result.paymentId);
    console.log(`[card/pay] BALANS OSHIRILDI (sinxron): userId=${req.user.id}, summa=${numericAmount}`);
    return res.json({ status: 'SUCCESS', message: 'Платёж успешно выполнен.' });
  }

  // Click ba'zan darhol emas, "jarayonda" (1) holatini qaytarishi mumkin —
  // shu holatda mavjud status-tekshirish mexanizmimiz orqali darhol qayta tekshiramiz.
  const followUp = await checkClickPaymentStatus({ ...tx, clickTransId: String(result.paymentId) });
  if (followUp.paid) {
    await markTransactionPaid(tx, result.paymentId);
    console.log(`[card/pay] BALANS OSHIRILDI (qayta tekshiruv): userId=${req.user.id}, summa=${numericAmount}`);
    return res.json({ status: 'SUCCESS', message: 'Платёж успешно выполнен.' });
  }

  res.json({ status: 'PENDING', message: 'Платёж принят, ожидается подтверждение. Проверьте раздел «Платежи» через некоторое время.' });
});

module.exports = router;

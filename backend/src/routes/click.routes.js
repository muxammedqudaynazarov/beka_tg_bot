const express = require('express');
const prisma = require('../db/prisma');
const { isClickSignatureValid } = require('../utils/clickSignature');
const { markTransactionPaid } = require('./payments.routes');

const router = express.Router();

const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
};

router.post('/prepare', async (req, res) => {
  const body = req.body || {};
  console.log('[click/prepare] Click\'dan kelgan so\'rov:', JSON.stringify(body));

  if (!isClickSignatureValid(body, 'prepare')) {
    return res.json({ error: CLICK_ERROR.SIGN_CHECK_FAILED, error_note: 'Imzo noto\'g\'ri' });
  }

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: body.merchant_trans_id } });
  if (!tx) {
    return res.json({ error: CLICK_ERROR.USER_NOT_FOUND, error_note: 'Tranzaksiya topilmadi' });
  }
  if (tx.status === 'SUCCESS') {
    return res.json({ error: CLICK_ERROR.ALREADY_PAID, error_note: 'Allaqachon to\'langan' });
  }
  if (Math.abs(Number(body.amount) - Number(tx.amount)) > 0.01) {
    return res.json({ error: CLICK_ERROR.INCORRECT_AMOUNT, error_note: 'Summa mos kelmadi' });
  }

  await prisma.transaction.update({ where: { id: tx.id }, data: { clickTransId: String(body.click_trans_id) } });

  res.json({
    click_trans_id: body.click_trans_id,
    merchant_trans_id: body.merchant_trans_id,
    merchant_prepare_id: tx.id,
    error: CLICK_ERROR.SUCCESS,
    error_note: 'Success',
  });
});

router.post('/complete', async (req, res) => {
  const body = req.body || {};
  console.log('[click/complete] Click\'dan kelgan so\'rov:', JSON.stringify(body));

  if (!isClickSignatureValid(body, 'complete')) {
    return res.json({ error: CLICK_ERROR.SIGN_CHECK_FAILED, error_note: 'Imzo noto\'g\'ri' });
  }

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: body.merchant_trans_id } });
  if (!tx) {
    return res.json({ error: CLICK_ERROR.USER_NOT_FOUND, error_note: 'Tranzaksiya topilmadi' });
  }

  if (Number(body.error) < 0) {
    if (tx.status === 'PENDING') {
      await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'CANCELLED' } });
    }
    return res.json({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_confirm_id: tx.id,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    });
  }

  if (tx.status !== 'SUCCESS') {
    await markTransactionPaid(tx);
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { clickPaydocId: body.click_paydoc_id ? String(body.click_paydoc_id) : null },
    });
  }

  res.json({
    click_trans_id: body.click_trans_id,
    merchant_trans_id: body.merchant_trans_id,
    merchant_confirm_id: tx.id,
    error: CLICK_ERROR.SUCCESS,
    error_note: 'Success',
  });
});

module.exports = router;

const express = require('express');
const prisma = require('../db/prisma');
const { verifyAuth } = require('../services/paymeService');
const { env } = require('../config/env');

const router = express.Router();

// Payme'ning rasmiy xato kodlari (ularning hujjatlarida va ko'plab ochiq
// referens implementatsiyalarida tasdiqlangan standart qiymatlar).
const ERR = {
  invalidAuth: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -32504, message: { ru: 'Недостаточно привилегий', uz: "Ruxsat yetarli emas", en: 'Insufficient privilege' } },
  }),
  methodNotFound: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -32601, message: { ru: 'Метод не найден', uz: 'Metod topilmadi', en: 'Method not found' } },
  }),
  orderNotFound: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -31050, message: { ru: 'Заказ не найден', uz: "Buyurtma topilmadi", en: 'Order not found' }, data: 'order_id' },
  }),
  invalidAmount: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -31001, message: { ru: 'Неверная сумма', uz: "Noto'g'ri summa", en: 'Invalid amount' }, data: 'amount' },
  }),
  transactionNotFound: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -31003, message: { ru: 'Транзакция не найдена', uz: 'Tranzaksiya topilmadi', en: 'Transaction not found' } },
  }),
  cantPerform: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -31008, message: { ru: 'Невозможно выполнить операцию', uz: "Amalni bajarib bo'lmaydi", en: 'Unable to perform operation' } },
  }),
  systemError: (id) => ({
    jsonrpc: '2.0', id,
    error: { code: -32400, message: { ru: 'Системная ошибка', uz: 'Tizim xatosi', en: 'System error' } },
  }),
};

const PERFORM_TIMEOUT_MS = 60 * 60 * 1000; // 1 soat — shu vaqtdan keyin CreateTransaction "muddati tugagan" deb hisoblanadi

async function handleCheckPerformTransaction(id, params) {
  const orderId = params?.account?.order_id;
  if (!orderId) return ERR.orderNotFound(id);

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: orderId } });
  if (!tx || tx.status !== 'PENDING') return ERR.orderNotFound(id);

  const expectedTiyin = Math.round(Number(tx.amount) * 100);
  if (Number(params.amount) !== expectedTiyin) return ERR.invalidAmount(id);

  const result = { allow: true };

  // Payme qo'llab-quvvatlash xizmati talabi (fiskal chek soliq oborotida
  // ko'rinishi uchun): mxikCode to'ldirilgan bo'lsagina detail qo'shamiz —
  // to'ldirilmagan bo'lsa, hech narsa yubormaymiz (Payme buni ixtiyoriy deb
  // hisoblaydi, lekin to'ldirilgani ma'qul).
  if (env.payme.fiscal.mxikCode) {
    result.detail = {
      receipt_type: 0,
      items: [
        {
          title: env.payme.fiscal.itemTitle,
          price: expectedTiyin,
          count: 1,
          code: env.payme.fiscal.mxikCode,
          package_code: env.payme.fiscal.packageCode,
          vat_percent: env.payme.fiscal.vatPercent,
          discount: 0,
        },
      ],
    };
  }

  return { jsonrpc: '2.0', id, result };
}

async function handleCreateTransaction(id, params) {
  const paymeId = params?.id;
  const orderId = params?.account?.order_id;

  // Idempotentlik: agar bu Payme tranzaksiya ID'si bilan YOZUV ALLAQACHON
  // mavjud bo'lsa, Payme talabi bo'yicha XUDDI SHU javobni qaytaramiz
  // (qayta-qayta so'rov yuborilishi mumkin, masalan javob yo'qolganda).
  const existing = await prisma.transaction.findUnique({ where: { paymeTransId: paymeId } });
  if (existing) {
    if (existing.paymeState !== 1) return ERR.cantPerform(id);
    return {
      jsonrpc: '2.0', id,
      result: { create_time: Number(existing.paymeCreateTime), transaction: existing.id, state: 1 },
    };
  }

  const tx = await prisma.transaction.findUnique({ where: { merchantTransId: orderId } });
  if (!tx) return ERR.orderNotFound(id);

  // MUHIM TUZATISH: summa tekshiruvi BOSHQA (holat/egalik) tekshiruvlaridan
  // OLDIN bo'lishi kerak — Payme'ning o'z test to'plami (sandbox) buni aniq
  // talab qiladi (noto'g'ri summa bilan chaqirilganda -31001 kutiladi,
  // boshqa -31008 kabi xatolar emas, hatto boshqa sabablar ham mavjud bo'lsa).
  const expectedTiyin = Math.round(Number(tx.amount) * 100);
  if (Number(params.amount) !== expectedTiyin) return ERR.invalidAmount(id);

  if (tx.paymeTransId && tx.paymeTransId !== paymeId) return ERR.cantPerform(id);
  if (tx.status !== 'PENDING') return ERR.cantPerform(id);

  const createTime = Date.now();
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { paymeTransId: paymeId, paymeState: 1, paymeCreateTime: BigInt(createTime) },
  });

  return { jsonrpc: '2.0', id, result: { create_time: createTime, transaction: tx.id, state: 1 } };
}

async function handlePerformTransaction(id, params) {
  const tx = await prisma.transaction.findUnique({ where: { paymeTransId: params?.id } });
  if (!tx) return ERR.transactionNotFound(id);

  if (tx.paymeState === 2) {
    // Allaqachon amalga oshirilgan — bir xil javob (idempotentlik)
    return { jsonrpc: '2.0', id, result: { transaction: tx.id, perform_time: Number(tx.paymePerformTime), state: 2 } };
  }
  if (tx.paymeState !== 1) return ERR.cantPerform(id);

  if (Date.now() - Number(tx.paymeCreateTime) > PERFORM_TIMEOUT_MS) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'CANCELLED', paymeState: -1, paymeCancelTime: BigInt(Date.now()), paymeCancelReason: 4 },
    });
    return ERR.cantPerform(id);
  }

  const performTime = Date.now();
  const { markTransactionPaid } = require('./payments.routes');
  await markTransactionPaid(tx);
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { paymeState: 2, paymePerformTime: BigInt(performTime) },
  });

  return { jsonrpc: '2.0', id, result: { transaction: tx.id, perform_time: performTime, state: 2 } };
}

async function handleCancelTransaction(id, params) {
  const tx = await prisma.transaction.findUnique({ where: { paymeTransId: params?.id } });
  if (!tx) return ERR.transactionNotFound(id);

  if (tx.paymeState === -1 || tx.paymeState === -2) {
    return { jsonrpc: '2.0', id, result: { transaction: tx.id, cancel_time: Number(tx.paymeCancelTime), state: tx.paymeState } };
  }

  const wasPerformed = tx.paymeState === 2;
  const newState = wasPerformed ? -2 : -1;
  const cancelTime = Date.now();

  const ops = [
    prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: 'CANCELLED',
        paymeState: newState,
        paymeCancelTime: BigInt(cancelTime),
        paymeCancelReason: Number(params?.reason) || 0,
      },
    }),
  ];
  // Agar avval pul BERILGAN bo'lsa (foydalanuvchi balansiga qo'shilgan edi),
  // endi bekor qilinganda uni qaytarib olamiz.
  if (wasPerformed) {
    ops.push(prisma.user.update({ where: { id: tx.userId }, data: { balance: { decrement: tx.amount } } }));
  }
  await prisma.$transaction(ops);

  return { jsonrpc: '2.0', id, result: { transaction: tx.id, cancel_time: cancelTime, state: newState } };
}

async function handleCheckTransaction(id, params) {
  const tx = await prisma.transaction.findUnique({ where: { paymeTransId: params?.id } });
  if (!tx) return ERR.transactionNotFound(id);

  return {
    jsonrpc: '2.0', id,
    result: {
      create_time: Number(tx.paymeCreateTime) || 0,
      perform_time: Number(tx.paymePerformTime) || 0,
      cancel_time: Number(tx.paymeCancelTime) || 0,
      transaction: tx.id,
      state: tx.paymeState || 1,
      reason: tx.paymeCancelReason || null,
    },
  };
}

// GetStatement — Payme berilgan sana oralig'idagi barcha (Payme orqali
// yaratilgan) tranzaksiyalar ro'yxatini so'raydi, o'zining hisobotlarini
// solishtirish (rekonsilyatsiya) uchun.
async function handleGetStatement(id, params) {
  const from = new Date(Number(params?.from) || 0);
  const to = new Date(Number(params?.to) || Date.now());

  const txs = await prisma.transaction.findMany({
    where: {
      paymeTransId: { not: null },
      paymeCreateTime: { gte: BigInt(from.getTime()), lte: BigInt(to.getTime()) },
    },
    orderBy: { paymeCreateTime: 'asc' },
  });

  return {
    jsonrpc: '2.0', id,
    result: {
      transactions: txs.map((tx) => ({
        id: tx.paymeTransId,
        time: Number(tx.paymeCreateTime) || 0,
        amount: Math.round(Number(tx.amount) * 100),
        account: { order_id: tx.merchantTransId },
        create_time: Number(tx.paymeCreateTime) || 0,
        perform_time: Number(tx.paymePerformTime) || 0,
        cancel_time: Number(tx.paymeCancelTime) || 0,
        transaction: tx.id,
        state: tx.paymeState || 1,
        reason: tx.paymeCancelReason || null,
      })),
    },
  };
}

// Payme JSON-RPC 2.0 ning YAGONA kirish nuqtasi — barcha metodlar shu
// yerga POST so'rov sifatida keladi, "method" maydoni orqali ajratiladi.
router.post('/', async (req, res) => {
  const { method, params, id } = req.body || {};
  console.log(`[payme] So'rov: method=${method}, params=${JSON.stringify(params)}`);

  if (!verifyAuth(req)) {
    console.warn('[payme] Avtorizatsiya muvaffaqiyatsiz.');
    return res.json(ERR.invalidAuth(id));
  }

  try {
    let response;
    switch (method) {
      case 'CheckPerformTransaction':
        response = await handleCheckPerformTransaction(id, params);
        break;
      case 'CreateTransaction':
        response = await handleCreateTransaction(id, params);
        break;
      case 'PerformTransaction':
        response = await handlePerformTransaction(id, params);
        break;
      case 'CancelTransaction':
        response = await handleCancelTransaction(id, params);
        break;
      case 'CheckTransaction':
        response = await handleCheckTransaction(id, params);
        break;
      case 'GetStatement':
        response = await handleGetStatement(id, params);
        break;
      default:
        response = ERR.methodNotFound(id);
    }
    console.log(`[payme] Javob: ${JSON.stringify(response)}`);
    res.json(response);
  } catch (err) {
    console.error('[payme] Kutilmagan xato:', err.message);
    res.json(ERR.systemError(id));
  }
});

module.exports = router;

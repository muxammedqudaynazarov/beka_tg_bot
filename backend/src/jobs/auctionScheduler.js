const cron = require('node-cron');
const { closeExpiredAuctions, sweepAwaitingPayments } = require('../services/auctionService');
const prisma = require('../db/prisma');
const { env } = require('../config/env');

// Bot xabar yuborish funksiyasi tashqaridan "ulanadi" (index.js orqali) —
// shunday qilib bu modul botlarga to'g'ridan-to'g'ri bog'liq bo'lib qolmaydi
// (aylanma import muammosining oldini oladi) va bot ishga tushmagan bo'lsa ham
// auksion mantiqi ishlashda davom etadi.
let notifyUser = null;
function setNotifier(fn) {
  notifyUser = fn;
}
async function safeNotify(telegramId, text) {
  if (!notifyUser || !telegramId) return;
  try {
    await notifyUser(telegramId, text);
  } catch (err) {
    console.warn('[auctionScheduler] Foydalanuvchiga xabar yuborib bo\'lmadi:', err.message);
  }
}

/**
 * Har 15 soniyada ikki bosqichni ham tekshiradi:
 *  1) ACTIVE -> AWAITING_PAYMENT/UNSOLD (savdo vaqti tugagan auksionlar)
 *  2) AWAITING_PAYMENT -> PAID (to'landi) yoki PAYMENT_EXPIRED (5 soat o'tdi, jarima)
 * Yuqori yuklamali productionda buni alohida worker jarayoniga yoki BullMQ
 * kabi navbat tizimiga ko'chirish tavsiya etiladi.
 */
function startAuctionScheduler(io) {
  cron.schedule('*/15 * * * * *', async () => {
    try {
      const justClosed = await closeExpiredAuctions();
      for (const auction of justClosed) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
        if (auction.status === 'AWAITING_PAYMENT' && auction.currentLeaderId) {
          const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
          await safeNotify(
            winner?.telegramId,
            `🏆 Поздравляем! Вы выиграли аукцион "${auction.skinName}".\n\n` +
              `Оставшуюся сумму нужно оплатить в течение ${env.auction.winnerPaymentWindowHours} ч., ` +
              `иначе часть залога будет удержана в качестве штрафа. ` +
              `Завершите оплату в разделе Mini App → Профиль.`
          );
        }
      }

      const { paidNow, expiredNow } = await sweepAwaitingPayments();
      for (const auction of paidNow) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
      }
      for (const auction of expiredNow) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
        if (auction.currentLeaderId) {
          const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
          await safeNotify(
            winner?.telegramId,
            `⌛️ Срок оплаты по аукциону "${auction.skinName}" истёк. Часть залога возвращена на баланс, ` +
              `остальное удержано в качестве штрафа. Подробности — в Профиле, в истории транзакций.`
          );
        }
      }
    } catch (err) {
      console.error('[auctionScheduler] xatolik:', err);
    }
  });
  console.log('[auctionScheduler] ishga tushdi (har 15 soniyada tekshiradi).');
}

module.exports = { startAuctionScheduler, setNotifier };

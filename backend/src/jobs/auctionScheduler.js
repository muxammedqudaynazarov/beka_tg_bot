const cron = require('node-cron');
const { closeExpiredAuctions, sweepAwaitingPayments } = require('../services/auctionService');
const { notifyReadySales } = require('../services/userSaleService');
const prisma = require('../db/prisma');
const { env } = require('../config/env');
const { notifyText, notifyPhoto, notifyAllAdmins } = require('../services/notifier');

const RARITY_LABELS = {
  CONSUMER: 'Consumer', INDUSTRIAL: 'Industrial', MILSPEC: 'Mil-Spec',
  RESTRICTED: 'Restricted', CLASSIFIED: 'Classified', COVERT: 'Covert', GOLD: 'Редкий ★',
};

/**
 * Har 15 soniyada ikki bosqichni ham tekshiradi:
 *  1) ACTIVE -> AWAITING_PAYMENT/UNSOLD (savdo vaqti tugagan auksionlar)
 *  2) AWAITING_PAYMENT -> PAID (to'landi) yoki PAYMENT_EXPIRED (5 soat o'tdi, jarima)
 * Yuqori yuklamali productionda buni alohida worker jarayoniga yoki BullMQ
 * kabi navbat tizimiga ko'chirish tavsiya etiladi.
 */
function startAuctionScheduler(io) {
  // 1-band: har soatda ACTIVE (lekin 24 soatdan ortiq ishlatilmagan)
  // FIRST/NEXT_DEPOSIT_BONUS redemption'larini EXPIRED qiladi.
  // Moliyaviy promokodlar faqat 24 soat ichida ishlatilmasa bekor bo'ladi.
  cron.schedule('0 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expired = await prisma.promoCodeRedemption.findMany({
        where: { status: 'ACTIVE', createdAt: { lt: cutoff } },
        include: { promoCode: true },
      });
      for (const r of expired) {
        const t = r.promoCode.type;
        if (t === 'FIRST_DEPOSIT_BONUS' || t === 'NEXT_DEPOSIT_BONUS') {
          await prisma.promoCodeRedemption.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
          console.log(`[promoExpiry] ${r.promoCode.code} → EXPIRED (userId: ${r.userId})`);
        }
      }
    } catch (err) {
      console.error('[promoExpiry] xatolik:', err.message);
    }
  });

  cron.schedule('*/15 * * * * *', async () => {
    try {
      const justClosed = await closeExpiredAuctions();
      for (const auction of justClosed) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
        if (auction.status === 'AWAITING_PAYMENT' && auction.currentLeaderId) {
          const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
          // 6-band: g'alaba haqida rasm + skin parametrlari bilan birga
          await notifyPhoto(
            winner?.telegramId,
            auction.imageUrl,
            `🏆 Поздравляем! Вы выиграли аукцион!\n\n` +
              `<b>${auction.skinName}</b>\n` +
              `Редкость: ${RARITY_LABELS[auction.rarity] || auction.rarity}\n` +
              `Класс износа: ${auction.wearCondition} (${Number(auction.floatValue).toFixed(6)})\n` +
              `${auction.isStatTrak ? 'StatTrak™\n' : ''}` +
              `Итоговая цена: ${Number(auction.currentPrice).toLocaleString('ru-RU')} сум\n\n` +
              `Оставшуюся сумму нужно оплатить в течение ${env.auction.winnerPaymentWindowHours} ч., ` +
              `иначе часть залога будет удержана в качестве штрафа. ` +
              `Завершите оплату в разделе Mini App → Профиль.`,
            { parse_mode: 'HTML' }
          );
        }
      }

      const { paidNow, expiredNow } = await sweepAwaitingPayments();
      for (const auction of paidNow) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
        // 10-band: g'olibga xabar — skin to'liq to'landi, endi u istalgan vaqtda
        // Profil bo'limidan Steam'ga chiqarib olishi mumkin.
        if (auction.currentLeaderId) {
          const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
          await notifyText(
            winner?.telegramId,
            `✅ «${auction.skinName}» полностью оплачен (сумма автоматически списана с вашего баланса). ` +
              `Скин сохранён в разделе «Профиль» — когда будете готовы, нажмите кнопку «Отправить в Steam».`
          );
        }
        // 13-band: to'liq to'langan skin haqida barcha adminlarga xabar —
        // ular Admin Mini App > Auksionlar bo'limidan Steam orqali yuborib,
        // "yuborildi" deb belgilashlari kerak.
        await notifyAllAdmins(
          `💰 "${auction.skinName}" auksioni to'liq to'landi — Steam orqali yuborish kerak.\n` +
            `Admin panel > Auksionlar bo'limidan ko'ring.`
        );
      }
      for (const auction of expiredNow) {
        if (io) io.to(`auction:${auction.id}`).emit('auction:closed', { auctionId: auction.id, status: auction.status });
        if (auction.currentLeaderId) {
          const winner = await prisma.user.findUnique({ where: { id: auction.currentLeaderId } });
          await notifyText(
            winner?.telegramId,
            `⌛️ Срок оплаты по аукциону "${auction.skinName}" истёк. Часть залога возвращена на баланс, ` +
              `остальное удержано в качестве штрафа. Подробности — в Профиле, в истории транзакций.`
          );
        }
      }

      // 1-band: 8 kunlik himoya muddati tugagan savdolar haqida adminlarga xabar
      await notifyReadySales();
    } catch (err) {
      console.error('[auctionScheduler] xatolik:', err);
    }
  });
  console.log('[auctionScheduler] ishga tushdi (har 15 soniyada tekshiradi).');
}

module.exports = { startAuctionScheduler };

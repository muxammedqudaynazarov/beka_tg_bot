const prisma = require('../db/prisma');
const { notifyText, notifyAllAdmins } = require('./notifier');

const SALE_RATING_POINTS = 5;

/**
 * 2-band: savdo qayd etilganda sotuvchiga reyting ball beriladi.
 * Ikkala kirish nuqtasi (Admin App'dagi forma VA botga forward+yozuv orqali)
 * ham shu FUNKSIYaning o'zini chaqiradi — mantiq ikki joyda ikki marta
 * yozilib, keyinchalik bir-biridan farqlanib qolmasligi uchun.
 */
async function recordSale({ sellerId, recordedById, itemName, agreedAmount }) {
  const sale = await prisma.userSale.create({
    data: { sellerId, recordedById, itemName, agreedAmount, ratingAwarded: true },
  });
  await prisma.ratingEvent.create({
    data: { userId: sellerId, type: 'SALE_RECORDED', points: SALE_RATING_POINTS, note: itemName },
  });
  await prisma.user.update({ where: { id: sellerId }, data: { ratingScore: { increment: SALE_RATING_POINTS } } });
  return sale;
}

/**
 * 1-band: admin savdoni bekor qilsa (masalan sotuvchi fikridan qaytsa) —
 * yozuv o'chiriladi VA 2-band bo'yicha berilgan ball qaytarib olinadi.
 */
async function cancelSale(saleId, actorId) {
  const sale = await prisma.userSale.findUnique({ where: { id: saleId } });
  if (!sale) return null;

  if (sale.ratingAwarded) {
    await prisma.ratingEvent.create({
      data: { userId: sale.sellerId, type: 'SALE_CANCELLED', points: -SALE_RATING_POINTS, note: sale.itemName },
    });
    await prisma.user.update({ where: { id: sale.sellerId }, data: { ratingScore: { decrement: SALE_RATING_POINTS } } });
  }
  await prisma.userSale.delete({ where: { id: saleId } });
  await prisma.adminAuditLog.create({
    data: { actorId, action: 'USER_SALE_CANCELLED', targetType: 'UserSale', targetId: saleId, meta: { itemName: sale.itemName } },
  });

  const seller = await prisma.user.findUnique({ where: { id: sale.sellerId } });
  if (seller) {
    await notifyText(
      seller.telegramId,
      `⚠️ Запись о продаже «${sale.itemName}» была отменена администратором.`
    );
  }
  return sale;
}

/**
 * 1-band: 8 kunlik muddat tugagan, LEKIN hali xabar berilmagan savdolarni
 * topib, adminlarga bir martalik xabar yuboradi. auctionScheduler'ning
 * o'zidan chaqiriladi (har 15 soniyada).
 */
async function notifyReadySales() {
  const SALE_HOLD_MS = 8 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - SALE_HOLD_MS);
  const ready = await prisma.userSale.findMany({
    where: { paidAt: null, readyNotifiedAt: null, createdAt: { lte: cutoff } },
    include: { seller: { select: { username: true, firstName: true, telegramId: true } } },
  });

  for (const sale of ready) {
    const label = sale.seller.username ? `@${sale.seller.username}` : sale.seller.firstName || String(sale.seller.telegramId);
    await notifyAllAdmins(
      `⏰ "${sale.itemName}" (${label}, ${Number(sale.agreedAmount).toLocaleString('ru-RU')} сум) — ` +
        `8 kunlik himoya muddati tugadi, to'lovga tayyor. Admin panel > Пользователи bo'limidan ko'ring.`
    );
    await prisma.userSale.update({ where: { id: sale.id }, data: { readyNotifiedAt: new Date() } });
  }
}

module.exports = { recordSale, cancelSale, notifyReadySales };

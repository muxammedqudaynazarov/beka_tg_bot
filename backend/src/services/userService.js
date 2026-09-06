const prisma = require('../db/prisma');

/**
 * Prisma'ning upsert() funksiyasi MySQL/MariaDB'da to'liq atomik EMAS —
 * "avval SELECT, keyin INSERT yoki UPDATE" tarzida ishlaydi. Agar bir xil
 * telegramId uchun ikkita so'rov deyarli bir vaqtda kelsa (masalan Telegram
 * bitta update'ni ikki marta yetkazsa — bu Telegram Bot API'ning
 * hujjatlashtirilgan "at least once" xatti-harakati, ayniqsa server
 * qayta ishga tushayotgan paytda tez-tez uchraydi), ikkalasi ham "hali
 * mavjud emas" deb o'ylab INSERT qilishga urinishi va biri
 * "Unique constraint failed" (Prisma xato kodi P2002) bilan qulashi mumkin.
 *
 * Bu funksiya aynan shu holatni xavfsiz qayta urinish orqali hal qiladi.
 */
async function safeUpsertUser({ where, update, create }) {
  try {
    return await prisma.user.upsert({ where, update, create });
  } catch (err) {
    if (err.code === 'P2002') {
      // Boshqa parallel so'rov ayni shu foydalanuvchini bir zumda avvalroq
      // yaratib ulgurgan — demak endi shunchaki mavjudini yangilaymiz.
      return prisma.user.update({ where, data: update });
    }
    throw err;
  }
}

module.exports = { safeUpsertUser };

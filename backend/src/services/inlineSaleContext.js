// 3-band: admin sotuvchi bilan shaxsiy xabar orqali yozishayotganda
// "@cs2admin_auksion_bot ItemName % Summa" deb yozganida, bot bu so'rovni
// QAYSI sotuvchiga tegishli ekanini Telegram'dan BILA OLMAYDI — bu
// Telegram'ning o'zining maxfiylik siyosati (inline so'rovlar qaysi chatda
// yozilayotganini botlarga bermaydi). Shu sabab: admin AVVAL Admin Mini App
// > Foydalanuvchilar bo'limidan sotuvchini tanlab, "Faollashtirish" tugmasini
// bosadi — shu orqali "hozir shu foydalanuvchi bilan yozishayapman" holati
// vaqtincha (60 daqiqaga) saqlanadi, va inline yozuvda ENDI faqat "ItemName %
// Summa" yozish kifoya qiladi.

const ACTIVE_MS = 60 * 60 * 1000; // 60 daqiqa
const contexts = new Map(); // adminTelegramId (string) -> { sellerId, sellerUsername, sellerTelegramId, sellerFirstName, expiresAt }

function setActiveSeller(adminTelegramId, seller) {
  contexts.set(String(adminTelegramId), {
    sellerId: seller.id,
    sellerUsername: seller.username,
    sellerTelegramId: seller.telegramId,
    sellerFirstName: seller.firstName,
    expiresAt: Date.now() + ACTIVE_MS,
  });
}

function getActiveSeller(adminTelegramId) {
  const ctx = contexts.get(String(adminTelegramId));
  if (!ctx) return null;
  if (Date.now() > ctx.expiresAt) {
    contexts.delete(String(adminTelegramId));
    return null;
  }
  return ctx;
}

function clearActiveSeller(adminTelegramId) {
  contexts.delete(String(adminTelegramId));
}

module.exports = { setActiveSeller, getActiveSeller, clearActiveSeller };

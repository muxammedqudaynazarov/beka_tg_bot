// Botlar (userBot.js, adminBot.js) ishga tushganda o'zini shu yerga
// "ro'yxatdan o'tkazadi" (setUserBot/setAdminBot orqali) — shundan keyin
// butun backend bo'ylab (marshrutlar, auctionService, scheduler)
// foydalanuvchi VA adminlarga Telegram orqali xabar yuborish uchun shu
// moduldan foydalaniladi. Bu aylanma import (circular dependency)
// muammosining oldini oladi.

const prisma = require('../db/prisma');

let userBotInstance = null;
let adminBotInstance = null;

function setBot(bot) {
  userBotInstance = bot; // eski nom bilan moslik uchun saqlab qolindi
}
function setUserBot(bot) {
  userBotInstance = bot;
}
function setAdminBot(bot) {
  adminBotInstance = bot;
}

/** Oddiy matnli xabar (foydalanuvchi botiga). @returns {Promise<boolean>} muvaffaqiyatli bo'ldimi */
async function notifyText(telegramId, text, extra) {
  if (!userBotInstance || !telegramId) return false;
  try {
    await userBotInstance.telegram.sendMessage(String(telegramId), text, extra);
    return true;
  } catch (err) {
    console.warn(`[notifier] Xabar yuborib bo'lmadi (telegramId=${telegramId}):`, err.message);
    return false;
  }
}

/** Rasm + matn (masalan yutib olingan skin rasmi). @returns {Promise<boolean>} */
async function notifyPhoto(telegramId, photoUrl, caption, extra) {
  if (!userBotInstance || !telegramId) return false;
  try {
    await userBotInstance.telegram.sendPhoto(String(telegramId), photoUrl, { caption, ...extra });
    return true;
  } catch (err) {
    console.warn(`[notifier] Rasmli xabar yuborib bo'lmadi (telegramId=${telegramId}):`, err.message);
    // Rasm yuborilmasa (masalan havola noto'g'ri/Telegram ololmasa), hech
    // bo'lmasa oddiy matn sifatida yuborishga harakat qilamiz — foydalanuvchi
    // muhim xabarni butunlay qo'ldan boy bermasin.
    return notifyText(telegramId, caption, extra);
  }
}

/**
 * 13-band: barcha admin/superadminlarga admin BOTI orqali xabar (masalan
 * "yangi to'lov tasdiqlash kutmoqda"). Foydalanuvchi botidan farqli — bu
 * har doim admin botining o'z tokeni orqali yuboriladi.
 */
async function notifyAllAdmins(text, extra) {
  if (!adminBotInstance) return;
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { telegramId: true },
  });
  for (const admin of admins) {
    try {
      await adminBotInstance.telegram.sendMessage(String(admin.telegramId), text, extra);
    } catch (err) {
      console.warn(`[notifier] Adminga xabar yuborib bo'lmadi (telegramId=${admin.telegramId}):`, err.message);
    }
  }
}

/**
 * 7-band: yangi auksion e'lon qilinganda ochiq kanalga rasm bilan xabar.
 * @returns {Promise<boolean>}
 */
async function notifyChannel(channelId, photoUrl, caption, extra) {
  if (!userBotInstance || !channelId) return false;
  try {
    await userBotInstance.telegram.sendPhoto(channelId, photoUrl, { caption, ...extra });
    return true;
  } catch (err) {
    console.warn(`[notifier] Kanalga xabar yuborib bo'lmadi (${channelId}):`, err.message);
    return false;
  }
}

module.exports = { setBot, setUserBot, setAdminBot, notifyText, notifyPhoto, notifyAllAdmins, notifyChannel };

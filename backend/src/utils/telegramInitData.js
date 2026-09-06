const crypto = require('crypto');

/**
 * Telegram Mini App har bir so'rovda "initData" satrini yuboradi — bu Telegram
 * tomonidan bot tokeni bilan imzolangan bo'ladi. Backend bu imzoni tekshirib,
 * so'rov haqiqatan ham Telegramning o'zidan kelayotganini va foydalanuvchi
 * ma'lumotlari soxta emasligini tasdiqlaydi.
 *
 * Rasmiy algoritm (Telegram Bot API hujjatlari asosida):
 *   1. secret_key = HMAC_SHA256(bot_token, key="WebAppData")
 *   2. data_check_string = initData'dagi barcha juftliklar ("hash" dan tashqari),
 *      kalit nomi bo'yicha alifbo tartibida saralanib, "\n" bilan qo'shiladi
 *   3. hash = HMAC_SHA256(data_check_string, key=secret_key) — hex ko'rinishida
 *   4. Hisoblangan hash initData ichidagi "hash" bilan bir xil bo'lishi kerak
 *
 * @param {string} initData - Telegram.WebApp.initData satri (frontend'dan keladi)
 * @param {string} botToken - shu Mini App ochilayotgan botning tokeni
 * @param {number} [maxAgeSeconds=86400] - initData necha soniya "eskirgan" hisoblanadi
 * @returns {{ ok: boolean, user?: object, reason?: string }}
 */
function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, reason: 'initData yo\'q' };
  }
  if (!botToken) {
    return { ok: false, reason: 'bot tokeni sozlanmagan' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'hash topilmadi' };
  }
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of params.entries()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const validSignature =
    computedHash.length === hash.length &&
    crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));

  if (!validSignature) {
    return { ok: false, reason: 'imzo mos kelmadi (soxta so\'rov bo\'lishi mumkin)' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (authDate && ageSeconds > maxAgeSeconds) {
    return { ok: false, reason: 'initData muddati eskirgan, Mini App qayta ochilsin' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, reason: 'user maydonini o\'qib bo\'lmadi' };
  }

  return { ok: true, user };
}

module.exports = { verifyTelegramInitData };

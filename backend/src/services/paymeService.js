const { env } = require('../config/env');

// Payme'ning o'zi doim shu login bilan so'rov yuboradi — bu o'zgarmas konstanta
const CASHIER_LOGIN = 'Paycom';

/**
 * Payme'dan kelgan Merchant API so'rovi haqiqiy Payme'dan ekanini tekshiradi.
 * Ular HTTP Basic Auth ishlatadi: Authorization: Basic base64(Paycom:KEY)
 * Bu — Click'ning MD5 imzosidan BUTUNLAY boshqa mexanizm.
 */
function verifyAuth(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Basic (.+)$/);
  if (!match) return false;
  let decoded;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  } catch {
    return false;
  }
  const sepIndex = decoded.indexOf(':');
  if (sepIndex === -1) return false;
  const login = decoded.slice(0, sepIndex);
  const password = decoded.slice(sepIndex + 1);
  return login === CASHIER_LOGIN && password === env.payme.key;
}

/**
 * Checkout (to'lov) havolasini yaratadi. Payme summani TIYINDA kutadi
 * (1 so'm = 100 tiyin) — bu Click'dan farqli, u yerda to'g'ridan-to'g'ri
 * so'mda edi. Format: https://checkout.paycom.uz/base64(m=ID;ac.order_id=X;a=Y)
 */
function buildCheckoutUrl({ amount, merchantTransId, returnUrl }) {
  // 2-band (avvalgi tadqiqot javobi): agar admin komissiyani mijozga
  // "ko'chirish"ni xohlasa, shu foizga summani oshiramiz — Payme'ning o'zida
  // bunday tayyor funksiya yo'q, biz checkout yaratishdan OLDIN hisoblaymiz.
  const effectiveAmount = env.payme.surchargePercent > 0
    ? amount * (1 + env.payme.surchargePercent / 100)
    : amount;
  const amountTiyin = Math.round(effectiveAmount * 100);

  let params = `m=${env.payme.merchantId};ac.order_id=${merchantTransId};a=${amountTiyin}`;
  if (returnUrl) params += `;c=${returnUrl}`;
  const encoded = Buffer.from(params).toString('base64');
  return `${env.payme.checkoutBaseUrl}/${encoded}`;
}

module.exports = { verifyAuth, buildCheckoutUrl, CASHIER_LOGIN };

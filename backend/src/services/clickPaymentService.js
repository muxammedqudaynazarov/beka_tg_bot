const { env } = require('../config/env');

/**
 * 1.g-band: "To'lov" oynasida foydalanuvchi summani kiritadi -> "To'ldirish"
 * tugmasini bosadi -> Click.uz orqali to'lov havolasi yaratiladi.
 *
 * Bu yerda eng sodda va ishonchli yo'l — Click "Checkout" (redirect) havolasi
 * ishlatiladi: foydalanuvchi shu havolaga yo'naltiriladi (yoki Telegram
 * ichida openLink bilan ochiladi), to'lovni Click tomonida amalga oshiradi.
 * To'lov muvaffaqiyatli bo'lishi bilan Click bizning backendga "Prepare" va
 * "Complete" so'rovlarini yuboradi (pastdagi routes/payments.routes.js'ga
 * qarang) — aynan o'sha yerda foydalanuvchi balansi haqiqatda oshiriladi.
 * (Redirect sahifasiga ishonib balansni oshirib bo'lmaydi — faqat server-server
 * webhook orqali tasdiqlangan to'lovga ishoniladi.)
 */
function buildCheckoutUrl({ amount, merchantTransId, returnUrl }) {
  const params = new URLSearchParams({
    service_id: env.click.serviceId,
    merchant_id: env.click.merchantId,
    amount: String(amount),
    transaction_param: merchantTransId,
  });
  if (env.click.merchantUserId) params.set('merchant_user_id', env.click.merchantUserId);
  if (returnUrl) params.set('return_url', returnUrl);
  return `${env.click.checkoutBaseUrl}?${params.toString()}`;
}

module.exports = { buildCheckoutUrl };

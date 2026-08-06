const axios = require('axios');
const { env } = require('../config/env');
const { buildMerchantApiAuthHeader } = require('../utils/clickSignature');

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

/**
 * Ba'zan Click webhook (Prepare/Complete) hech qachon kelmasligi mumkin
 * (masalan foydalanuvchi to'lovni tugatgandan keyin ilovani yopib yuborsa,
 * yoki webhook manzili vaqtincha ochiq bo'lmasa). Shu holatlar uchun —
 * "To'lov" bo'limida yakunlanmagan tranzaksiyalar yonida "Tekshirish"
 * tugmasi, bu funksiya orqali Click'ning o'ziga to'g'ridan-to'g'ri so'rov
 * yuborib, hozirgi holatni so'raydi.
 *
 * Rasman: https://docs.click.uz/en/merchant-api-request/
 *   GET /v2/merchant/payment/status_by_mti/:service_id/:merchant_trans_id
 * Javobdagi payment_status: 2 = muvaffaqiyatli to'landi, 1 = jarayonda,
 * 0 = yaratilgan, <0 = xato/bekor qilingan.
 *
 * @returns {{ ok: boolean, paid: boolean, paymentStatus?: number, paymentId?: string, raw?: object, error?: string }}
 */
async function checkPaymentStatusByMerchantTransId(merchantTransId) {
  const url = `${env.click.merchantApiUrl}/payment/status_by_mti/${env.click.serviceId}/${encodeURIComponent(merchantTransId)}`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: buildMerchantApiAuthHeader(),
      },
      timeout: 10000,
    });
    if (Number(data.error_code) < 0) {
      return { ok: true, paid: false, error: data.error_note, raw: data };
    }
    return {
      ok: true,
      paid: Number(data.payment_status) === 2,
      paymentStatus: data.payment_status,
      paymentId: data.payment_id,
      raw: data,
    };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error_note || err.message };
  }
}

module.exports = { buildCheckoutUrl, checkPaymentStatusByMerchantTransId };

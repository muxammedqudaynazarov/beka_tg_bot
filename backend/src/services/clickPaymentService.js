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
 *   GET /v2/merchant/payment/status/:service_id/:payment_id
 * Javobdagi payment_status: 2 = muvaffaqiyatli to'landi, 1 = jarayonda,
 * 0 = yaratilgan, <0 = xato/bekor qilingan.
 *
 * MUHIM: agar Prepare bosqichi allaqachon o'tgan bo'lsa, bizda Click'ning
 * o'z transaksiya ID'si (click_trans_id, ular buni "payment_id" deb ham
 * ataydi) saqlangan bo'ladi — shu ID orqali tekshirish (`/payment/status`)
 * ancha ishonchli, chunki bu Click'ning o'zining asosiy yozuvi. Shu sabab
 * quyidagi funksiya avval shuni sinab ko'radi, faqat click_trans_id
 * saqlanmagan bo'lsagina merchant_trans_id bo'yicha (`status_by_mti`)
 * qidiradi.
 *
 * @returns {{ ok: boolean, paid: boolean, paymentStatus?: number, paymentId?: string, raw?: object, error?: string, httpStatus?: number }}
 */
async function callClickStatusEndpoint(url, label) {
  try {
    const { data, status } = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: buildMerchantApiAuthHeader(),
      },
      timeout: 10000,
      validateStatus: () => true, // o'zimiz tekshiramiz — 4xx/5xx bo'lsa ham javob tanasini ko'rishni xohlaymiz
    });
    // Har doim TO'LIQ xom javobni logga yozamiz — Click'dan aynan nima
    // kelayotganini bilmasdan bu turdagi xatoni tuzatib bo'lmaydi.
    console.log(`[click ${label}] GET ${url} -> HTTP ${status}:`, JSON.stringify(data));

    if (status < 200 || status >= 300) {
      return { ok: false, error: data?.error_note || `HTTP ${status}`, httpStatus: status, raw: data };
    }
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
    console.error(`[click ${label}] so'rov o'zi muvaffaqiyatsiz bo'ldi:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function checkPaymentStatusByMerchantTransId(merchantTransId) {
  const url = `${env.click.merchantApiUrl}/payment/status_by_mti/${env.click.serviceId}/${encodeURIComponent(merchantTransId)}`;
  return callClickStatusEndpoint(url, 'status_by_mti');
}

async function checkPaymentStatusByPaymentId(paymentId) {
  const url = `${env.click.merchantApiUrl}/payment/status/${env.click.serviceId}/${encodeURIComponent(paymentId)}`;
  return callClickStatusEndpoint(url, 'status_by_payment_id');
}

/**
 * "Tekshirish" tugmasi shu funksiyani chaqiradi — mavjud ma'lumotga qarab
 * eng ishonchli usulni avtomatik tanlaydi (yuqoridagi izohga qarang).
 */
async function checkClickPaymentStatus(tx) {
  if (tx.clickTransId) {
    const byPaymentId = await checkPaymentStatusByPaymentId(tx.clickTransId);
    // Agar bu usul aniq natija bersa (to'langan yoki hali jarayonda/yaratilgan
    // ekani ma'lum bo'lsa), shuni qaytaramiz. Faqat haqiqiy xato bo'lsagina
    // (masalan bu ID bo'yicha ham topilmasa) merchant_trans_id bo'yicha ham
    // sinab ko'ramiz — ehtimol ikkalasi turli sabablarga ko'ra farq qilar.
    if (byPaymentId.ok) return byPaymentId;
  }
  return checkPaymentStatusByMerchantTransId(tx.merchantTransId);
}

module.exports = {
  buildCheckoutUrl,
  checkPaymentStatusByMerchantTransId,
  checkPaymentStatusByPaymentId,
  checkClickPaymentStatus,
  requestCardToken,
  verifyCardToken,
  payWithCardToken,
  deleteCardToken,
};

// ===========================================================================
// KARTA TOKEN OQIMI (Card Token API) — Prepare/Complete webhook'iga MUTLAQO
// bog'liq bo'lmagan, sinxron muqobil to'lov usuli. Foydalanuvchi karta
// raqami + amal qilish muddati + telefon raqamini kiritadi -> Click SMS kod
// yuboradi -> foydalanuvchi kodni tasdiqlaydi -> to'lov darhol amalga
// oshiriladi va javob shu zahoti keladi (webhook kutish shart emas).
//
// XAVFSIZLIK: karta raqami HECH QACHON bizning ma'lumotlar bazamizga
// yozilmaydi va logga chiqarilmaydi — u faqat shu so'rov ichida to'g'ridan-
// to'g'ri Click'ning o'ziga yuboriladi, xolos.
// Rasman: https://docs.click.uz/en/merchant-api-request/
// ===========================================================================

async function callClickPost(path, body, { withAuth = true, logBody } = {}) {
  const url = `${env.click.merchantApiUrl}${path}`;
  try {
    const { data, status } = await axios.post(url, body, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(withAuth ? { Auth: buildMerchantApiAuthHeader() } : {}),
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    // DIQQAT: karta raqami/SMS kodni hech qachon to'liq logga yozmaymiz —
    // faqat chaqiruvchi bergan "xavfsiz" versiyasini (logBody) yozamiz.
    console.log(`[click POST ${path}] -> HTTP ${status}:`, JSON.stringify({ sent: logBody || '(yashirilgan)', received: data }));
    return { ok: status >= 200 && status < 300 && Number(data.error_code) >= 0, status, data };
  } catch (err) {
    console.error(`[click POST ${path}] so'rov xatosi:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 1-qadam: karta ma'lumotlari bilan vaqtinchalik token so'raladi. Click shu
 * kartaga bog'langan telefon raqamiga SMS kod yuboradi.
 */
async function requestCardToken({ cardNumber, expireDate, temporary = 1 }) {
  const result = await callClickPost(
    '/card_token/request',
    { service_id: Number(env.click.serviceId), card_number: cardNumber, expire_date: expireDate, temporary },
    { logBody: { card_number: `****${String(cardNumber).slice(-4)}`, expire_date: '**/**' } }
  );
  if (!result.ok) return { ok: false, error: result.data?.error_note || result.error };
  return { ok: true, cardToken: result.data.card_token, maskedPhone: result.data.phone_number };
}

/** 2-qadam: foydalanuvchi SMS orqali kelgan kodni tasdiqlaydi. */
async function verifyCardToken({ cardToken, smsCode }) {
  const result = await callClickPost(
    '/card_token/verify',
    { service_id: Number(env.click.serviceId), card_token: cardToken, sms_code: smsCode },
    { logBody: { card_token: cardToken, sms_code: '****' } }
  );
  if (!result.ok) return { ok: false, error: result.data?.error_note || result.error };
  return { ok: true };
}

/** 3-qadam: tasdiqlangan token bilan aniq summani darhol undirib olish. */
async function payWithCardToken({ cardToken, amount, merchantTransId }) {
  const result = await callClickPost(
    '/card_token/payment',
    { service_id: Number(env.click.serviceId), card_token: cardToken, amount: Number(amount), transaction_parameter: merchantTransId },
    { logBody: { card_token: cardToken, amount, merchantTransId } }
  );
  if (!result.ok) return { ok: false, error: result.data?.error_note || result.error };
  return {
    ok: true,
    paid: Number(result.data.payment_status) === 2,
    paymentStatus: result.data.payment_status,
    paymentId: result.data.payment_id,
  };
}

/** Vaqtinchalik tokenni tozalash (to'lovdan keyin yoki xato bo'lganda). */
async function deleteCardToken(cardToken) {
  try {
    await axios.delete(`${env.click.merchantApiUrl}/card_token/${env.click.serviceId}/${cardToken}`, {
      headers: { Accept: 'application/json', Auth: buildMerchantApiAuthHeader() },
      timeout: 10000,
    });
  } catch (err) {
    console.warn('[click card_token delete] xato (jiddiy emas):', err.message);
  }
}

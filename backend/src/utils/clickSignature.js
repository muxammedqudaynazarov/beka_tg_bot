const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * Click.uz "Shop API" (Prepare/Complete) imzo formulasi rasman
 * https://docs.click.uz/en/click-api-request/ hujjatidan tasdiqlangan:
 *   Prepare:  md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 *   Complete: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 */

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * "Prepare" bosqichi (action = 0) uchun kutilayotgan imzoni hisoblaydi.
 * MUHIM: Click POST so'rovida maydonlarni snake_case ko'rinishida yuboradi
 * (click_trans_id, service_id va h.k.) — shu nomlarning aynan o'zi bilan
 * o'qilishi shart, aks holda barcha qiymatlar "undefined" bo'lib qoladi.
 */
function buildPrepareSignString(body) {
  const { click_trans_id, service_id, merchant_trans_id, amount, action, sign_time } = body;
  return md5(
    `${click_trans_id}${service_id}${env.click.secretKey}${merchant_trans_id}${amount}${action}${sign_time}`
  );
}

/**
 * "Complete" bosqichi (action = 1) uchun kutilayotgan imzoni hisoblaydi
 * (merchant_prepare_id ham qo'shiladi).
 */
function buildCompleteSignString(body) {
  const { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time } = body;
  return md5(
    `${click_trans_id}${service_id}${env.click.secretKey}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`
  );
}

/**
 * Click'dan kelgan webhook so'rovidagi sign_string haqiqiy ekanini tekshiradi.
 * @param {object} body - Click'dan POST qilingan so'rov tanasi
 * @param {'prepare'|'complete'} stage
 * @returns {boolean}
 */
function isClickSignatureValid(body, stage) {
  const expected =
    stage === 'complete'
      ? buildCompleteSignString(body)
      : buildPrepareSignString(body);
  return typeof body.sign_string === 'string' && expected === body.sign_string.toLowerCase();
}

/**
 * Merchant API (invoice/create va h.k.) uchun "Auth" headerini yaratadi.
 * Format: "merchant_user_id:digest:timestamp", digest = sha1(timestamp + secret_key)
 */
function buildMerchantApiAuthHeader() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = crypto.createHash('sha1').update(timestamp + env.click.secretKey).digest('hex');
  return `${env.click.merchantUserId}:${digest}:${timestamp}`;
}

module.exports = {
  md5,
  buildPrepareSignString,
  buildCompleteSignString,
  isClickSignatureValid,
  buildMerchantApiAuthHeader,
};

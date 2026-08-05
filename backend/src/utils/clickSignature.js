const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * DIQQAT: Click.uz "Shop API" (Prepare/Complete) imzo formulasi quyida
 * ko'plab rasmiy Click SDK'larida (PHP, Python, Node) qo'llanilgan umumiy
 * ko'rinishda keltirilgan. Loyihani ishlab chiqarishga (production) chiqarishdan
 * oldin buni albatta https://docs.click.uz dagi eng so'nggi hujjat va
 * merchant kabinetingizdagi "test to'lov" vositasi bilan solishtirib tekshiring —
 * chunki bu README yozilgan paytda docs.click.uz saytiga avtomatik so'rov
 * yuborib bo'lmadi (robots.txt cheklaydi).
 */

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * "Prepare" bosqichi (action = 0) uchun kutilayotgan imzoni hisoblaydi.
 */
function buildPrepareSignString({ clickTransId, serviceId, merchantTransId, amount, action, signTime }) {
  return md5(
    `${clickTransId}${serviceId}${env.click.secretKey}${merchantTransId}${amount}${action}${signTime}`
  );
}

/**
 * "Complete" bosqichi (action = 1) uchun kutilayotgan imzoni hisoblaydi
 * (merchant_prepare_id ham qo'shiladi).
 */
function buildCompleteSignString({
  clickTransId,
  serviceId,
  merchantTransId,
  merchantPrepareId,
  amount,
  action,
  signTime,
}) {
  return md5(
    `${clickTransId}${serviceId}${env.click.secretKey}${merchantTransId}${merchantPrepareId}${amount}${action}${signTime}`
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

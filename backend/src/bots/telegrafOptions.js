const { ProxyAgent } = require('proxy-agent');
const { env } = require('../config/env');

/**
 * Ba'zi serverlarda (hosting/provayder tarmog'ida) api.telegram.org
 * to'g'ridan-to'g'ri ulanmaydi (ETIMEDOUT xatosi). Agar .env'da
 * TELEGRAM_PROXY_URL berilgan bo'lsa, Telegraf'ning barcha so'rovlarini
 * shu proksi orqali yuboramiz. Berilmagan bo'lsa — oddiy to'g'ridan-to'g'ri
 * ulanish ishlatiladi (hech narsa o'zgarmaydi).
 */
function buildTelegrafOptions() {
  if (!env.telegramProxyUrl) return {};
  const agent = new ProxyAgent({ getProxyForUrl: () => env.telegramProxyUrl });
  return { telegram: { agent } };
}

module.exports = { buildTelegrafOptions };

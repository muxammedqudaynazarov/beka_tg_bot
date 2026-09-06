// ============================================================================
// STEAM BOZOR NARXI XIZMATI (5/6-band — "foydalanuvchi o'z skinini sotadi"
// funksiyasi uchun ASOSIY QURILISH BLOKI, hali to'liq oqim emas)
// ============================================================================
// Rasmiy (hujjatlashtirilmagan, lekin barqaror va keng qo'llaniladigan)
// Steam Community Market endpointi orqali ishlaydi. Autentifikatsiya shart
// emas. Manba: bir nechta mustaqil kutubxonalarda (Python, Go, Node) bir xil
// formatda tasdiqlangan.
//   GET https://steamcommunity.com/market/priceoverview/
//       ?appid=730&currency=1&market_hash_name=AK-47%20%7C%20Redline%20(Field-Tested)
//   Javob: { success, lowest_price: "$13.07", median_price: "$12.74", volume }
// DIQQAT: narxlar valyuta belgisi bilan MATN sifatida qaytadi (masalan "$13.07"),
// sonni ajratib olish kerak. Bu endpoint so'rovlar sonini cheklaydi (rate limit) —
// tez-tez, katta hajmda so'ramaslik kerak (masalan har bir sahifa yuklanishida
// EMAS, faqat foydalanuvchi "sotmoqchiman" deb bosganda so'raladi).

const axios = require('axios');
const prisma = require('../db/prisma');

function parsePrice(text) {
  if (!text) return null;
  // "$13.07", "12,74€", "1 234,56 pуб." kabi turli formatlardan sonni ajratib olamiz
  const cleaned = String(text).replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {string} marketHashName - Steam'dagi ANIQ nom, masalan
 *   "AK-47 | Redline (Field-Tested)" (StatTrak bo'lsa "StatTrak™ " bilan boshlanadi)
 * @returns {Promise<{ ok: boolean, lowestPriceUsd?: number, medianPriceUsd?: number, error?: string }>}
 */
async function getMarketPriceUsd(marketHashName) {
  try {
    const { data } = await axios.get('https://steamcommunity.com/market/priceoverview/', {
      params: { appid: 730, currency: 1, market_hash_name: marketHashName },
      timeout: 10000,
    });
    if (!data.success) return { ok: false, error: 'Steam bu nom bo\'yicha narx qaytarmadi (nom noto\'g\'ri bo\'lishi mumkin).' };
    return {
      ok: true,
      lowestPriceUsd: parsePrice(data.lowest_price),
      medianPriceUsd: parsePrice(data.median_price),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 6-band: Steam bozor narxidan 15% arzon (standart) taklif — so'mda.
 * Byudjet yetarli-yetarli emasligini HAM shu yerda tekshiradi.
 */
async function calculateBuybackOffer(marketHashName, discountPercent = 15) {
  const price = await getMarketPriceUsd(marketHashName);
  if (!price.ok || !price.lowestPriceUsd) {
    return { ok: false, error: price.error || 'Narxni aniqlab bo\'lmadi.' };
  }

  const settings = await getOrCreateSettings();
  const offerUsd = price.lowestPriceUsd * (1 - discountPercent / 100);
  const offerSom = Math.round(offerUsd * Number(settings.usdToSomRate));

  const remainingBudget = Number(settings.maxBuybackBudget) - Number(settings.usedBuybackBudget);
  const withinBudget = offerSom <= remainingBudget;

  return {
    ok: true,
    marketPriceUsd: price.lowestPriceUsd,
    offerUsd: Math.round(offerUsd * 100) / 100,
    offerSom,
    withinBudget,
    remainingBudget,
  };
}

async function getOrCreateSettings() {
  const existing = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.systemSetting.create({ data: { id: 1 } });
}

module.exports = { getMarketPriceUsd, calculateBuybackOffer, getOrCreateSettings };

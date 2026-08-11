// ============================================================================
// STEAM BOT XIZMATI (5/13-band)
// ============================================================================
// Ikkita vazifani bajaradi:
//   1. Trade URL'ning HAQIQIY faolligini tekshirish (shakli emas, token'ning
//      o'zi Steam'da haqiqatan ham ishlaydimi) — buning uchun boshqa yo'l
//      yo'q: rasmiy Steam kutubxonalari muallifining o'zi tasdiqlagan yagona
//      usul — botning haqiqiy Steam sessiyasi orqali taklif (offer) obyekti
//      yaratib, uning getUserDetails() metodidan foydalanish (agar token
//      yaroqsiz bo'lsa, xato qaytaradi). Manba: node-steam-tradeoffer-manager
//      muallifi Dr. McKay'ning javobi (dev.doctormckay.com/topic/1257).
//   2. G'olib bo'lgan skinni Steam orqali AVTOMATIK yuborish — FAQAT agar
//      admin auksion yaratishda haqiqiy Steam asset ID'sini kiritgan bo'lsa
//      (chunki bizning tizim skin nomi/rasmini saqlaydi, lekin botning
//      haqiqiy inventaridagi qaysi element ekanini bilishi uchun asset ID
//      kerak). Aks holda yetkazish avvalgidek qo'lda amalga oshiriladi.
//
// SOZLASH: quyidagi 4 ta muhit o'zgaruvchisi TO'LDIRILMAGUNCHA bu xizmat
// o'zini "sozlanmagan" deb e'lon qiladi va hech qanday xatoga olib kelmaydi —
// tizimning qolgan qismi (qo'lda yetkazish) avvalgidek ishlayveradi.
//   STEAM_BOT_USERNAME, STEAM_BOT_PASSWORD — botning Steam login/parol
//   STEAM_BOT_SHARED_SECRET — Mobile Authenticator ulaganda olingan "shared_secret"
//   STEAM_BOT_IDENTITY_SECRET — xuddi shu jarayonda olinadigan "identity_secret"
//     (bularni olish uchun odatda SDA (Steam Desktop Authenticator) yoki
//     shunga o'xshash vositadan foydalaniladi — Mobile Authenticator ulash
//     jarayonida bir marta ko'rsatiladi, keyin qayta ko'rsatilmaydi, shuning
//     uchun ulash paytida albatta saqlab qo'ying)
//   STEAM_API_KEY — https://steamcommunity.com/dev/apikey dan olinadi
//
// MUHIM OGOHLANTIRISH: bu bot-akkaunt UZOQ MUDDAT (kamida 7-15 kun) Mobile
// Authenticator yoqilgan holda "eskirgan" bo'lishi kerak — aks holda Steam
// yuborilgan takliflarni avtomatik ravishda 15 kungacha "escrow" holatida
// ushlab turishi mumkin (bu holatda g'olib skinni darhol emas, kechikib oladi).

const { env } = require('../config/env');

let SteamUser, SteamCommunity, TradeOfferManager, SteamTotp;
let client = null;
let community = null;
let manager = null;
let ready = false;

function isConfigured() {
  return Boolean(env.steam.username && env.steam.password && env.steam.sharedSecret && env.steam.identitySecret);
}

function initSteamBot() {
  if (!isConfigured()) {
    console.warn('[steamBot] STEAM_BOT_* o\'zgaruvchilari to\'ldirilmagan — Steam avtomatlashtirish o\'chirilgan (qo\'lda yetkazish ishlayveradi).');
    return;
  }
  try {
    // Paketlar faqat sozlangan taqdirda yuklanadi — o'rnatilmagan bo'lsa ham
    // (masalan hali `npm install` qilinmagan bo'lsa) qolgan tizim ishlayveradi.
    SteamUser = require('steam-user');
    SteamCommunity = require('steamcommunity');
    TradeOfferManager = require('steam-tradeoffer-manager');
    SteamTotp = require('steam-totp');
  } catch (err) {
    console.error('[steamBot] Kerakli paketlar o\'rnatilmagan (npm install steam-user steamcommunity steam-tradeoffer-manager steam-totp):', err.message);
    return;
  }

  client = new SteamUser();
  community = new SteamCommunity();
  manager = new TradeOfferManager({
    steam: client,
    community,
    language: 'en',
    ...(env.steam.apiKey ? {} : {}), // API key setCookies orqali avtomatik aniqlanadi
  });

  client.logOn({
    accountName: env.steam.username,
    password: env.steam.password,
    twoFactorCode: SteamTotp.getAuthCode(env.steam.sharedSecret),
  });

  client.on('loggedOn', () => {
    console.log('[steamBot] Steam\'ga muvaffaqiyatli kirdi.');
  });

  client.on('webSession', async (sessionID, cookies) => {
    manager.setCookies(cookies, (err) => {
      if (err) {
        console.error('[steamBot] setCookies xatosi:', err.message);
        return;
      }
      ready = true;
      console.log('[steamBot] Tayyor — Trade URL tekshiruvi va avtomatik yuborish ishlaydi.');
    });
    community.setCookies(cookies);
    // Har 10 soniyada kutilayotgan tasdiqlarni (mobil ilovadagi kabi)
    // avtomatik tasdiqlaydi — identity_secret orqali, qo'l bilan bosish shart emas.
    community.startConfirmationChecker(10000, env.steam.identitySecret);
  });

  client.on('error', (err) => {
    ready = false;
    console.error('[steamBot] Ulanish xatosi:', err.message);
  });
}

/**
 * 5-band: Trade URL haqiqatan ham ishlaydimi (token yaroqlimi) — botning
 * o'z Steam sessiyasi orqali sinov taklifi obyekti yaratib tekshiradi
 * (hech qanday haqiqiy taklif YUBORILMAYDI — faqat getUserDetails chaqiriladi).
 */
async function validateTradeUrl(tradeUrl) {
  if (!ready) {
    return { ok: false, checked: false, reason: 'Steam bot hozircha sozlanmagan yoki tayyor emas — faqat shakl tekshirildi.' };
  }
  return new Promise((resolve) => {
    let offer;
    try {
      offer = manager.createOffer(tradeUrl);
    } catch (err) {
      return resolve({ ok: false, checked: true, reason: 'Trade URL formati noto\'g\'ri.' });
    }
    offer.getUserDetails((err) => {
      if (err) {
        return resolve({ ok: false, checked: true, reason: 'Bu Trade URL Steam\'da yaroqsiz yoki eskirgan.' });
      }
      resolve({ ok: true, checked: true });
    });
  });
}

/**
 * 13-band: botning inventaridagi ANIQ item (steamAssetId orqali) g'olibning
 * Trade URL'iga avtomatik yuboriladi. Faqat auction.steamAssetId to'ldirilgan
 * bo'lsagina chaqiriladi — aks holda chaqiruvchi (admin.routes.js) buni
 * chaqirmasdan, oddiy qo'lda yetkazish yo'liga o'tadi.
 */
async function sendItemAutomatically({ tradeUrl, steamAssetId }) {
  if (!ready) return { ok: false, reason: 'Steam bot tayyor emas.' };
  return new Promise((resolve) => {
    let offer;
    try {
      offer = manager.createOffer(tradeUrl);
    } catch {
      return resolve({ ok: false, reason: 'Trade URL formati noto\'g\'ri.' });
    }
    offer.addMyItem({ appid: 730, contextid: 2, assetid: String(steamAssetId) });
    offer.send((err, status) => {
      if (err) return resolve({ ok: false, reason: err.message });
      // status: "pending" (tasdiq kutilmoqda — bir necha soniyadan so'ng
      // yuqoridagi startConfirmationChecker avtomatik tasdiqlaydi) yoki "sent"
      resolve({ ok: true, status, offerId: offer.id });
    });
  });
}

/**
 * 5-band (yangi qulaylik): botning HAQIQIY Steam inventarini ro'yxat
 * qilib beradi — bu orqali admin Asset ID'ni qo'lda JSON'dan qidirmasdan,
 * to'g'ridan-to'g'ri ro'yxatdan tanlay oladi. Bot O'ZINING avtorizatsiyalangan
 * sessiyasi orqali so'rov yuboradi — bu Steam'ning tashqi (anonim)
 * so'rovlarga qo'yadigan qattiq rate limit'iga deyarli tushmaydi (Steam
 * "o'z" inventaringizni cookie orqali so'rasangiz erkin ruxsat beradi).
 */
let inventoryCache = { items: null, expiresAt: 0 };

// 1-band (yangi qulaylik): item nomi odatda "... (Field-Tested)" kabi
// qavs ichida износ bilan tugaydi — shundan avtomatik aniqlaymiz.
const WEAR_NAME_TO_CODE = {
  'Factory New': 'FN',
  'Minimal Wear': 'MW',
  'Field-Tested': 'FT',
  'Well-Worn': 'WW',
  'Battle-Scarred': 'BS',
};
function detectWearFromName(name) {
  const match = String(name || '').match(/\(([^)]+)\)\s*$/);
  return match ? WEAR_NAME_TO_CODE[match[1]] || null : null;
}

// 2-band (yangi qulaylik): Steam nakleyka/brelok ma'lumotini item
// tavsifidagi HTML blokidan (sticker_info/keychain_info) ajratib oladi.
// Bu — Steam'ning o'zi shu formatda beradigan, boshqa yo'li yo'q ma'lumot.
function extractAccessories(item) {
  const accessories = [];
  const descriptions = item.descriptions || [];
  for (const d of descriptions) {
    if (d.name !== 'sticker_info' && d.name !== 'keychain_info') continue;
    const imgTags = String(d.value || '').match(/<img[^>]*>/g) || [];
    for (const tag of imgTags) {
      const src = tag.match(/src="([^"]+)"/);
      const title = tag.match(/title="([^"]+)"/);
      if (src && title) {
        // "Наклейка: FL1T (с блёстками, чемпион) | Рио-2022" -> "FL1T (с блёстками, чемпион) | Рио-2022"
        const cleanName = title[1].replace(/^(Наклейка|Брелок|Sticker|Keychain):\s*/i, '');
        accessories.push({ imageUrl: src[1], name: cleanName });
      }
    }
  }
  return accessories;
}

async function listBotInventory() {
  if (!ready) return { ok: false, error: 'Steam bot tayyor emas yoki sozlanmagan.' };
  if (inventoryCache.items && Date.now() < inventoryCache.expiresAt) {
    return { ok: true, items: inventoryCache.items, cached: true };
  }
  return new Promise((resolve) => {
    community.getUserInventoryContents(client.steamID, 730, 2, false, 'russian', (err, inventory) => {
      if (err) return resolve({ ok: false, error: err.message });
      const items = inventory.map((item) => {
        const props = item.asset_properties || [];
        const paintSeedProp = props.find((p) => p.propertyid === 1);
        const floatProp = props.find((p) => p.propertyid === 2);
        const fullName = item.market_hash_name || item.name;
        return {
          assetId: item.assetid,
          name: fullName,
          imageUrl: item.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${item.icon_url}` : null,
          floatValue: floatProp ? Number(floatProp.float_value) : null,
          paintSeed: paintSeedProp ? Number(paintSeedProp.int_value) : null,
          isStatTrak: /^StatTrak™/.test(fullName || ''),
          tradable: Boolean(item.tradable),
          wearCondition: detectWearFromName(fullName), // 1-band
          accessories: extractAccessories(item), // 2-band
        };
      });
      inventoryCache = { items, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 daqiqa keshlanadi
      resolve({ ok: true, items });
    });
  });
}

module.exports = { initSteamBot, isConfigured, validateTradeUrl, sendItemAutomatically, listBotInventory };

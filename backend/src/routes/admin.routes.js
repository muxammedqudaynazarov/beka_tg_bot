const express = require('express');
const prisma = require('../db/prisma');
const {requireAuth, requireRole} = require('../middleware/auth');
const {notifyText, notifyPhoto, notifyChannel} = require('../services/notifier');
const {env} = require('../config/env');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPERADMIN'));

async function logAction(actorId, action, targetType, targetId, meta) {
    await prisma.adminAuditLog.create({data: {actorId, action, targetType, targetId, meta}});
}

// ESKI: Markdown normalizatsiyasi olib tashlandi — Рассылка endi HTML
// rejimida ishlaydi (pastga qarang), bu tasodifiy "_" belgilari (masalan
// @username_bilan yonma-yon kelganda) formatlash sifatida noto'g'ri
// talqin qilinishining OLDINI TO'LIQ oladi (Markdown'da bu tuzatib
// bo'lmaydigan tur muammo edi).

// 9-band: shu "Тип"lardagi narsalarda format factory (float/wear) YO'Q —
// admin forma bilan bir xil ro'yxat, seed.js'dagi Тип nomlariga mos bo'lishi shart.
const NO_FLOAT_TYPE_NAMES = ['Ключи', 'Стикеры', 'Брелки', 'Агенты', 'Граффити', 'Значки', 'Наборы музыки', 'Кейсы и Капсулы'];

// 7-band: kanal e'lonida ko'rsatish uchun — frontend'dagi RARITY_META/WEAR_LABELS
// bilan bir xil, lekin backend'da alohida (frontend kodini import qilib
// bo'lmaydi).
const RARITY_LABELS = {
    CONSUMER: 'Ширпотреб', INDUSTRIAL: 'Промышленное', MILSPEC: 'Армейское',
    RESTRICTED: 'Запрещённое', CLASSIFIED: 'Засекреченное', COVERT: 'Тайное', GOLD: 'Редкое ★',
};
const WEAR_LABELS = {FN: 'Factory New', MW: 'Minimal Wear', FT: 'Field-Tested', WW: 'Well-Worn', BS: 'Battle-Scarred'};
// Backend'ga QANDAY qiymat kelishidan qat'iy nazar (bo'sh qator, noto'g'ri
// so'z va h.k.), Prisma'ga faqat shu ro'yxatdagi haqiqiy qiymatlar boradi —
// aks holda aniq xabar bilan 400 qaytariladi ("Invalid value... Expected
// WearCondition" kabi tushunarsiz Prisma xatosi o'rniga).
const VALID_WEAR_VALUES = Object.keys(WEAR_LABELS);

async function subcategoryNeedsFloat(subcategoryId) {
    const sub = await prisma.weaponSubcategory.findUnique({where: {id: subcategoryId}, include: {category: true}});
    if (!sub) return true; // topilmasa, xavfsiz tomonga — talab qilingan deb hisoblaymiz
    return !NO_FLOAT_TYPE_NAMES.includes(sub.category.name);
}

// ===========================================================================
// 7-band: BARCHA foydalanuvchilarga bir vaqtda xabar yuborish (rasm bilan
// yoki rasmsiz). Yuborish fon jarayonida amalga oshadi (javob darhol
// qaytadi), Telegram'ning so'rov chegarasiga hurmat sifatida har bir xabar
// orasida qisqa tanaffus qilinadi.
// ===========================================================================

router.get('/broadcasts', async (req, res) => {
    const items = await prisma.broadcast.findMany({
        orderBy: {createdAt: 'desc'},
        take: 5, // 6-band: faqat oxirgi 5tasi ko'rsatiladi — bazada HAMMASI saqlanadi
        include: {admin: {select: {firstName: true, username: true}}},
    });
    res.json({items});
});

// 8-band: ro'yxat "quriqdan to'lib" ketmasligi uchun eski yozuvlarni o'chirish
router.delete('/broadcasts/:id', async (req, res) => {
    await prisma.broadcast.delete({where: {id: req.params.id}});
    await logAction(req.user.id, 'BROADCAST_DELETED', 'Broadcast', req.params.id, {});
    res.json({ok: true});
});

router.post('/broadcasts', async (req, res) => {
    const {message, imageUrl} = req.body || {};
    // Frontend (BroadcastPage.jsx) matnni ALLAQACHON Telegram'ning xavfsiz
    // HTML formatiga (faqat <b>,<i>,<u>,<s>,<code>,<a>,<tg-spoiler>) o'girib
    // yuboradi — bu yerda qo'shimcha o'zgartirish qilinmaydi (aks holda
    // qayta-ishlov xatoga olib kelishi mumkin).
    const trimmed = String(message || '').trim();
    if (!trimmed) return res.status(400).json({error: 'Текст сообщения обязателен.'});

    const broadcast = await prisma.broadcast.create({
        data: {adminId: req.user.id, message: trimmed, imageUrl: imageUrl || null},
    });
    await logAction(req.user.id, 'BROADCAST_STARTED', 'Broadcast', broadcast.id, {});

    // Javobni darhol qaytaramiz — yuborish fon jarayonida davom etadi,
    // holatni GET /broadcasts orqali keyinroq ko'rish mumkin.
    res.status(202).json({ok: true, broadcastId: broadcast.id});

    setImmediate(async () => {
        const users = await prisma.user.findMany({where: {isBanned: false}, select: {telegramId: true}});
        let sent = 0;
        let failed = 0;
        for (const u of users) {
            const ok = broadcast.imageUrl
                ? await notifyPhoto(u.telegramId, broadcast.imageUrl, trimmed, {parse_mode: 'HTML'})
                : await notifyText(u.telegramId, trimmed, {parse_mode: 'HTML'});
            if (ok) sent++; else failed++;
            // Telegram bot API'ning umumiy chegarasi ~30 xabar/soniya — xavfsiz
            // bo'lish uchun tanaffus qilamiz.
            await new Promise((r) => setTimeout(r, 40));
        }
        await prisma.broadcast.update({where: {id: broadcast.id}, data: {sentCount: sent, failedCount: failed}});
        console.log(`[broadcast] ${broadcast.id}: ${sent} muvaffaqiyatli, ${failed} muvaffaqiyatsiz.`);
    });
});

// 3.c-band: Yangi auksion (skin) qo'shish
router.post('/auctions', async (req, res) => {
    const {
        skinName,
        imageUrl,
        subcategoryId,
        rarity,
        floatValue,
        wearCondition,
        isStatTrak,
        paintSeed,
        steamAssetId,
        startPrice,
        buyNowPrice,
        durationMinutes,
        stickers, // [{ name, imageUrl }] — 9-band, soni oldindan noma'lum
    } = req.body || {};

    if (!skinName || !imageUrl || !subcategoryId || !rarity || !startPrice || !durationMinutes) {
        return res.status(400).json({error: 'Barcha majburiy maydonlarni to\'ldiring.'});
    }
    const needsFloat = await subcategoryNeedsFloat(subcategoryId);
    if (needsFloat && (!wearCondition || floatValue === undefined || floatValue === null || floatValue === '')) {
        return res.status(400).json({error: 'Для этого типа предмета укажите класс износа и float.'});
    }
    if (needsFloat && !VALID_WEAR_VALUES.includes(wearCondition)) {
        return res.status(400).json({error: `Неверный класс износа: "${wearCondition}". Допустимые: ${VALID_WEAR_VALUES.join(', ')}.`});
    }

    const endsAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);

    const auction = await prisma.auction.create({
        data: {
            skinName,
            imageUrl,
            subcategoryId,
            rarity,
            floatValue: needsFloat ? floatValue : null,
            wearCondition: needsFloat ? wearCondition : null,
            isStatTrak: Boolean(isStatTrak),
            paintSeed: paintSeed === '' || paintSeed === undefined || paintSeed === null ? null : Number(paintSeed),
            steamAssetId: steamAssetId || null,
            startPrice,
            currentPrice: startPrice,
            buyNowPrice: buyNowPrice || null,
            status: 'ACTIVE',
            endsAt,
            originalEndsAt: endsAt,
            createdById: req.user.id,
            stickers: Array.isArray(stickers) && stickers.length
                ? {
                    create: stickers.filter((s) => s?.name && s?.imageUrl).map((s, i) => ({
                        name: s.name,
                        imageUrl: s.imageUrl,
                        slot: i
                    }))
                }
                : undefined,
        },
    });

    await logAction(req.user.id, 'AUCTION_CREATED', 'Auction', auction.id, {skinName, startPrice});

    // 7-band: yangi auksion haqida kanalga rasmli e'lon — Float/Redkost/
    // Iznos/Paint Seed bilan, va (agar bot username + Mini App qisqa nomi
    // sozlangan bo'lsa) "Перейти к лоту" tugmasi bilan.
    if (env.announceChannelId) {
        const {notifyChannel} = require('../services/notifier');

        const lines = [`⚡️ <b>${skinName}</b>`, ''];
        lines.push(`<i>Редкость: ${RARITY_LABELS[rarity] || rarity}</i>`);
        if (wearCondition) lines.push(`<i>Класс износа: ${WEAR_LABELS[wearCondition] || wearCondition}</i>`);
        if (floatValue !== undefined && floatValue !== null && floatValue !== '') {
            lines.push(`<i>Float: ${Number(floatValue).toFixed(6)}</i>`);
        }
        if (paintSeed !== undefined && paintSeed !== null && paintSeed !== '') {
            lines.push(`<i>Шаблон раскраски: #${paintSeed}</i>`);
        }
        lines.push('');
        lines.push(`💎 <b>Стартовая цена: ${Number(startPrice).toLocaleString('ru-RU')} сум</b>`);
        lines.push(`⏰ <b>Завершение:</b> <code>${endsAt.toLocaleString('ru-RU')}</code>`);
        lines.push('');
        lines.push('<i>Ставки открыты — забирайте скин, пока не забрали другие!</i>');
        lines.push('');
        lines.push('📢 <i>@CS2_auksion</i>');

        // web_app tugmasi KANALLARDA ishlamaydi (Telegram cheklovi) — shuning
        // uchun t.me/BOT/APPNAME?startapp=... deep-link ishlatiladi, bu esa
        // istalgan joydan (kanal, guruh) bosilganda ham Mini App'ni to'g'ridan
        // -to'g'ri, aynan shu lot ochilgan holda ishga tushiradi.
        let replyMarkup;
        if (env.userBotUsername && env.miniAppShortName) {
            replyMarkup = {
                inline_keyboard: [[
                    {
                        text: 'Перейти к лоту 👉',
                        url: `https://t.me/${env.userBotUsername}/${env.miniAppShortName}?startapp=auction_${auction.id}`,
                    },
                ]],
            };
        }

        await notifyChannel(env.announceChannelId, imageUrl, lines.join('\n'), {
            parse_mode: 'HTML',
            ...(replyMarkup ? {reply_markup: replyMarkup} : {}),
        });
    }

    res.status(201).json(auction);
});

// 2-band foydalanuvchi so'rovi: auksion materialini (rasm, nom, kategoriya,
// kamyoblik, format factory, StatTrak, boshlang'ich narx) to'liq tahrirlash.
// XAVFSIZLIK QOIDASI: bu FAQAT hali birorta ham taklif kelmagan auksionlarda
// ruxsat etiladi — aks holda kimdir allaqachon "AK-47 Redline"ga narx
// taklif qilgan bo'lishi mumkin, admin uni butunlay boshqa skinga
// almashtirib qo'ysa, bu taklif beruvchilar uchun adolatsizlik bo'ladi.
// Taklif kelib bo'lgan auksionlar uchun faqat vaqtni o'zgartirish/bekor
// qilish mumkin (pastdagi /time va /cancel endpointlari).
router.patch('/auctions/:id', async (req, res) => {
    const existing = await prisma.auction.findUnique({
        where: {id: req.params.id},
        include: {_count: {select: {bids: true}}},
    });
    if (!existing) return res.status(404).json({error: 'Auksion topilmadi.'});
    if (existing._count.bids > 0) {
        return res.status(400).json({
            error:
                'Bu auksionga allaqachon taklif(lar) kelgan — endi asosiy ma\'lumotlarini o\'zgartirib bo\'lmaydi ' +
                '(adolatsizlikning oldini olish uchun). Faqat vaqtini o\'zgartirish yoki bekor qilish mumkin.',
        });
    }

    const {
        skinName,
        imageUrl,
        subcategoryId,
        rarity,
        floatValue,
        wearCondition,
        isStatTrak,
        paintSeed,
        steamAssetId,
        startPrice,
        buyNowPrice,
        stickers
    } =
    req.body || {};

    const effectiveSubcategoryId = subcategoryId !== undefined ? subcategoryId : existing.subcategoryId;
    const needsFloat = await subcategoryNeedsFloat(effectiveSubcategoryId);

    const data = {};
    if (skinName !== undefined) data.skinName = skinName;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (subcategoryId !== undefined) data.subcategoryId = subcategoryId;
    if (rarity !== undefined) data.rarity = rarity;
    data.floatValue = needsFloat ? (floatValue !== undefined ? Number(floatValue) : existing.floatValue) : null;
    const effectiveWear = wearCondition !== undefined ? wearCondition : existing.wearCondition;
    if (needsFloat && !VALID_WEAR_VALUES.includes(effectiveWear)) {
        return res.status(400).json({error: `Неверный класс износа: "${effectiveWear}". Допустимые: ${VALID_WEAR_VALUES.join(', ')}.`});
    }
    data.wearCondition = needsFloat ? effectiveWear : null;
    if (isStatTrak !== undefined) data.isStatTrak = Boolean(isStatTrak);
    if (paintSeed !== undefined) data.paintSeed = paintSeed === '' || paintSeed === null ? null : Number(paintSeed);
    if (steamAssetId !== undefined) data.steamAssetId = steamAssetId || null;
    if (buyNowPrice !== undefined) data.buyNowPrice = buyNowPrice === '' || buyNowPrice === null ? null : Number(buyNowPrice);
    if (startPrice !== undefined) {
        // Hali taklif yo'q bo'lgani uchun currentPrice ham startPrice bilan birga yangilanadi
        data.startPrice = Number(startPrice);
        data.currentPrice = Number(startPrice);
    }

    if (Array.isArray(stickers)) {
        // Sodda va xavfsiz yondashuv: eskilarini o'chirib, yangilarini qayta yaratamiz
        // (hali taklif kelmagan auksion bo'lgani uchun bu xavfsiz).
        await prisma.auctionSticker.deleteMany({where: {auctionId: req.params.id}});
        data.stickers = stickers.length
            ? {
                create: stickers.filter((s) => s?.name && s?.imageUrl).map((s, i) => ({
                    name: s.name,
                    imageUrl: s.imageUrl,
                    slot: i
                }))
            }
            : undefined;
    }

    const auction = await prisma.auction.update({where: {id: req.params.id}, data});
    await logAction(req.user.id, 'AUCTION_EDITED', 'Auction', auction.id, {skinName, startPrice});
    res.json(auction);
});

// 3.b-band: Auksion vaqtini o'zgartirish (cho'zish / qisqartirish / bekor qilish)
router.patch('/auctions/:id/time', async (req, res) => {
    const {newEndsAt} = req.body || {};
    if (!newEndsAt) return res.status(400).json({error: 'newEndsAt majburiy.'});

    const auction = await prisma.auction.update({
        where: {id: req.params.id},
        data: {endsAt: new Date(newEndsAt)},
    });
    await logAction(req.user.id, 'AUCTION_TIME_CHANGED', 'Auction', auction.id, {newEndsAt});
    res.json(auction);
});

router.post('/auctions/:id/cancel', async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.update({
            where: {id: req.params.id},
            data: {status: 'CANCELLED'},
        });

        // MUHIM TUZATISH: avval bu yerda faqat auksion holati o'zgartirilar,
        // lekin taklif bergan foydalanuvchining ZAKLADI (holdBalance) hech
        // qachon qaytarilmasdi — pul "muzlab" qolib ketardi. Endi: agar shu
        // auksionda hozircha g'olib turgan (isWinning) taklif bo'lsa, uning
        // zakladi to'liq balansga qaytariladi.
        let refunded = null;
        if (auction.currentLeaderId) {
            const winningBid = await tx.bid.findFirst({
                where: {auctionId: auction.id, userId: auction.currentLeaderId, isWinning: true},
                orderBy: {createdAt: 'desc'},
            });
            if (winningBid && Number(winningBid.holdAmount) > 0) {
                await tx.user.update({
                    where: {id: auction.currentLeaderId},
                    data: {
                        balance: {increment: winningBid.holdAmount},
                        holdBalance: {decrement: winningBid.holdAmount},
                    },
                });
                await tx.transaction.create({
                    data: {
                        userId: auction.currentLeaderId,
                        auctionId: auction.id,
                        type: 'BID_HOLD_RELEASE',
                        status: 'SUCCESS',
                        amount: winningBid.holdAmount,
                        note: `Аукцион "${auction.skinName}" отменён администратором — залог возвращён.`,
                    },
                });
                refunded = {userId: auction.currentLeaderId, amount: winningBid.holdAmount};
            }
        }

        return {auction, refunded};
    });

    if (result.refunded) {
        const user = await prisma.user.findUnique({where: {id: result.refunded.userId}});
        await notifyText(
            user?.telegramId,
            `↩️ Аукцион "${result.auction.skinName}" был отменён администратором. ` +
            `Ваш залог ${Number(result.refunded.amount).toLocaleString('ru-RU')} сум возвращён на баланс.`
        );
    }

    await logAction(req.user.id, 'AUCTION_CANCELLED', 'Auction', result.auction.id, {refundedUserId: result.refunded?.userId || null});
    res.json(result.auction);
});

// 8-band: to'liq to'lov qilingan (status=PAID) auksionni admin Steam Trade
// orqali g'olibga qo'lda yuborgach, shu yerda "yuborildi" deb belgilaydi.
// (Steam bilan avtomatik integratsiya hozircha yo'q — pastdagi izohga qarang.)
router.get('/auctions/awaiting-delivery', async (req, res) => {
    const items = await prisma.auction.findMany({
        where: {status: 'PAID'},
        orderBy: {paidAt: 'asc'},
        include: {
            subcategory: {include: {category: true}},
            currentLeader: {select: {id: true, username: true, firstName: true, tradeUrl: true}}
        },
    });
    res.json({items});
});

router.post('/auctions/:id/deliver', async (req, res) => {
    const auction = await prisma.auction.findUnique({
        where: {id: req.params.id},
        include: {currentLeader: {select: {telegramId: true, tradeUrl: true}}},
    });
    if (!auction) return res.status(404).json({error: 'Auksion topilmadi.'});
    if (auction.status !== 'PAID') {
        return res.status(400).json({error: 'Faqat to\'liq to\'langan (PAID) auksionlarni "yuborildi" deb belgilash mumkin.'});
    }

    // 13-band: agar admin steamAssetId kiritgan bo'lsa VA g'olibning Trade
    // URL'i bor bo'lsa — avtomatik yuborishga urinib ko'ramiz. Muvaffaqiyatsiz
    // bo'lsa ham (yoki umuman sozlanmagan bo'lsa ham), admin baribir pastdagi
    // qo'lda "yuborildi" belgisini bosishda davom eta oladi — bu urinish hech
    // qachon jarayonni to'xtatib qo'ymaydi.
    let autoSendResult = null;
    if (auction.steamAssetId && auction.currentLeader?.tradeUrl) {
        const {sendItemAutomatically} = require('../services/steamBotService');
        autoSendResult = await sendItemAutomatically({
            tradeUrl: auction.currentLeader.tradeUrl,
            steamAssetId: auction.steamAssetId,
        });
    }

    const updated = await prisma.auction.update({
        where: {id: req.params.id},
        data: {status: 'DELIVERED', deliveredAt: new Date(), deliveredById: req.user.id},
    });
    await logAction(req.user.id, 'AUCTION_DELIVERED', 'Auction', auction.id, {autoSendResult});

    // 6/13-band: skin Steam'ga yuborilgani haqida g'olibga xabar
    if (auction.currentLeaderId) {
        const winner = await prisma.user.findUnique({where: {id: auction.currentLeaderId}});
        await notifyText(
            winner?.telegramId,
            `📦 Скин "${auction.skinName}" отправлен на ваш Steam-аккаунт. Проверьте предложения обмена в Steam.`
        );
    }

    res.json({...updated, autoSendResult});
});

// 3.d-band: Foydalanuvchilarni boshqarish (ban/unban/rol/skidka) — quyidagi
// qidiruv+ro'yxat GET /users endpointi endi FAQAT pastda, 1-band bilan birga
// (to'liq, code/telegramId/_count bilan) — bu yerda ikkinchi marta
// TAKRORLANMASIN, aks holda Express birinchisini ishlatib, ikkinchisi hech
// qachon ishga tushmaydi (aynan shu xato tufayli "code" ko'rinmay qolgan edi).

router.post('/users/:id/ban', async (req, res) => {
    const {reason} = req.body || {};
    const user = await prisma.user.update({
        where: {id: req.params.id},
        data: {isBanned: true, bannedReason: reason || null, bannedAt: new Date()},
    });
    await logAction(req.user.id, 'USER_BANNED', 'User', user.id, {reason});
    await notifyText(
        user.telegramId,
        `⛔ Ваш аккаунт заблокирован администратором.${reason ? `\nПричина: ${reason}` : ''}`
    );
    res.json({ok: true});
});

router.post('/users/:id/unban', async (req, res) => {
    await prisma.user.update({
        where: {id: req.params.id},
        data: {isBanned: false, bannedReason: null, bannedAt: null},
    });
    await logAction(req.user.id, 'USER_UNBANNED', 'User', req.params.id, {});
    res.json({ok: true});
});

// Faqat SUPERADMIN boshqa foydalanuvchini admin qila oladi / admindan tushira oladi
router.post('/users/:id/set-role', requireRole('SUPERADMIN'), async (req, res) => {
    const {role} = req.body || {};
    if (!['USER', 'ADMIN', 'SUPERADMIN'].includes(role)) {
        return res.status(400).json({error: 'Noto\'g\'ri rol.'});
    }
    await prisma.user.update({where: {id: req.params.id}, data: {role}});
    await logAction(req.user.id, 'USER_ROLE_CHANGED', 'User', req.params.id, {role});
    res.json({ok: true});
});

// 1.e-band: reyting asosida skidka — LEKIN admin tasdig'isiz avtomatik berilmaydi,
// shu sabab bu alohida, faqat admin chaqira oladigan endpoint.
router.post('/users/:id/discount', async (req, res) => {
    const {discountPct} = req.body || {};
    const pct = Number(discountPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({error: 'Skidka foizi 0-100 oralig\'ida bo\'lishi kerak.'});
    }
    await prisma.user.update({where: {id: req.params.id}, data: {discountPct: pct}});
    await logAction(req.user.id, 'DISCOUNT_GRANTED', 'User', req.params.id, {discountPct: pct});
    res.json({ok: true});
});

// ===========================================================================
// 12-band: OYLIK TO'LOV STATISTIKASI. Tizim 2026-yil avgust oyida ishga
// tushirilgan — shu sababli bundan oldinga o'tish taqiqlanadi (canGoBack).
// Hozirgi (real) oydan keyingi oylarga o'tish ham taqiqlanadi (canGoForward).
// ===========================================================================
const ANALYTICS_START_YEAR = 2026;
const ANALYTICS_START_MONTH = 8; // avgust

router.get('/analytics', async (req, res) => {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1; // 1-12

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1)); // keyingi oy boshi (chegara sifatida)

    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const prevStart = prevMonthDate;
    const prevEnd = start;

    const [deposited, spent, pendingAgg, failedAgg, prevDeposited, balanceAgg] = await Promise.all([
        prisma.transaction.aggregate({
            where: {type: 'TOPUP', status: 'SUCCESS', createdAt: {gte: start, lt: end}},
            _sum: {amount: true}
        }),
        prisma.transaction.aggregate({
            where: {type: 'PURCHASE', status: 'SUCCESS', createdAt: {gte: start, lt: end}},
            _sum: {amount: true}
        }),
        prisma.transaction.aggregate({
            where: {type: 'TOPUP', status: 'PENDING', createdAt: {gte: start, lt: end}},
            _sum: {amount: true},
            _count: true
        }),
        prisma.transaction.aggregate({
            where: {
                type: 'TOPUP',
                status: {in: ['FAILED', 'CANCELLED']},
                createdAt: {gte: start, lt: end}
            }, _sum: {amount: true}, _count: true
        }),
        prisma.transaction.aggregate({
            where: {
                type: 'TOPUP',
                status: 'SUCCESS',
                createdAt: {gte: prevStart, lt: prevEnd}
            }, _sum: {amount: true}
        }),
        prisma.user.aggregate({_sum: {balance: true}}),
    ]);

    const totalDeposited = Number(deposited._sum.amount || 0);
    const prevTotalDeposited = Number(prevDeposited._sum.amount || 0);
    const percentChange =
        prevTotalDeposited > 0
            ? Math.round(((totalDeposited - prevTotalDeposited) / prevTotalDeposited) * 1000) / 10
            : totalDeposited > 0 ? 100 : 0;

    const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const startMonthStart = new Date(Date.UTC(ANALYTICS_START_YEAR, ANALYTICS_START_MONTH - 1, 1));

    res.json({
        year,
        month,
        totalDeposited,
        totalSpent: Number(spent._sum.amount || 0),
        // 9-band: soni bilan birga summasi ham — front "2 (5 000 сум)" shaklida ko'rsatadi
        unsuccessfulPaymentsCount: pendingAgg._count + failedAgg._count,
        unsuccessfulPaymentsAmount: Number(pendingAgg._sum.amount || 0) + Number(failedAgg._sum.amount || 0),
        // "hozirda" — tizimdagi barcha foydalanuvchilar balansining JORIY yig'indisi
        // (tanlangan oyga bog'liq emas, doim real vaqtdagi qiymat)
        currentTotalUserBalance: Number(balanceAgg._sum.balance || 0),
        percentChangeVsPrevMonth: percentChange,
        canGoBack: start > startMonthStart,
        canGoForward: start < currentMonthStart,
    });
});

// ===========================================================================
// 1-band: FOYDALANUVCHILAR bo'limi — qidiruv, shaxsiy Steam savdosini qayd
// etish, va 8 kunlik "Trade Protection" muddati tugagan (to'lovga tayyor)
// foydalanuvchilar ro'yxati.
// ===========================================================================

const SALE_HOLD_MS = 8 * 24 * 60 * 60 * 1000; // 8 kun (Steam'ning 7 kunlik Trade Protection'idan 1 kun zaxira bilan)

router.get('/users', async (req, res) => {
    const {search} = req.query;
    const searchStr = String(search || '').trim();
    const where = searchStr
        ? {
            OR: [
                {username: {contains: searchStr}},
                {firstName: {contains: searchStr}},
                {lastName: {contains: searchStr}},
                ...(/^\d+$/.test(searchStr) ? [{telegramId: BigInt(searchStr)}] : []),
            ],
        }
        : {};
    const users = await prisma.user.findMany({
        where,
        // 2-band: "real" (haqiqatan faol) foydalanuvchilarni aniqlash uchun —
        // eng oxirgi ochganlar birinchi, hech qachon ochmaganlar (lastActiveAt
        // = NULL) esa MySQL'ning standart xatti-harakati bo'yicha ro'yxat
        // oxirida qoladi.
        orderBy: {lastActiveAt: 'desc'},
        take: 30,
        select: {
            id: true, telegramId: true, username: true, firstName: true, lastName: true, role: true,
            balance: true, isBanned: true, createdAt: true, lastActiveAt: true,
            _count: {select: {soldItems: true}},
        },
    });
    res.json({items: users});
});

router.get('/users/:id', async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {id: req.params.id},
        include: {
            soldItems: {orderBy: {createdAt: 'desc'}},
            discounts: {where: {remainingUses: {gt: 0}}, orderBy: {createdAt: 'desc'}},
        },
    });
    if (!user) return res.status(404).json({error: 'Foydalanuvchi topilmadi.'});
    res.json(user);
});

// ===========================================================================
// 3-band: SKIDKALAR — admin xohlagan foydalanuvchiga xohlagan miqdorda
// (bir nechta, turli foizli) skidka bera oladi, har birining alohida
// "necha marta ishlatish mumkin"ligi bor.
// ===========================================================================
router.post('/users/:id/discounts', async (req, res) => {
    const {percent, uses} = req.body || {};
    const p = Number(percent);
    const u = Number(uses);
    if (!Number.isFinite(p) || p <= 0 || p > 100) return res.status(400).json({error: 'Процент скидки должен быть от 1 до 100.'});
    if (!Number.isInteger(u) || u <= 0) return res.status(400).json({error: 'Количество использований должно быть положительным числом.'});

    const seller = await prisma.user.findUnique({where: {id: req.params.id}});
    if (!seller) return res.status(404).json({error: 'Foydalanuvchi topilmadi.'});

    const discount = await prisma.userDiscount.create({
        data: {userId: seller.id, percent: p, remainingUses: u, totalUses: u, createdById: req.user.id},
    });
    await logAction(req.user.id, 'DISCOUNT_GRANTED', 'UserDiscount', discount.id, {percent: p, uses: u});
    await notifyText(
        seller.telegramId,
        `🎁 Вам начислена скидка ${p}% (можно использовать ${u} раз) при выигрыше на аукционе!`
    );
    res.status(201).json(discount);
});

router.delete('/discounts/:id', async (req, res) => {
    const discount = await prisma.userDiscount.findUnique({where: {id: req.params.id}});
    if (!discount) return res.status(404).json({error: 'Yozuv topilmadi.'});
    await prisma.userDiscount.delete({where: {id: req.params.id}});
    await logAction(req.user.id, 'DISCOUNT_REMOVED', 'UserDiscount', req.params.id, {});
    res.json({ok: true});
});

// ===========================================================================
// 4-band: PROMO-KODLAR — admin boshqaruvi. Uchta tur: DISCOUNT (skidka),
// BALANCE_TOPUP (belgilangan summa), FIRST_DEPOSIT_BONUS (birinchi
// to'lovga +% bonus). Ishlatilish (redemption) mantiqi promo.routes.js'da.
// ===========================================================================
router.get('/promo-codes', async (req, res) => {
    const now = Date.now();
    const all = await prisma.promoCode.findMany({
        orderBy: {createdAt: 'desc'},
        take: 200,
        include: {
            redemptions: {
                where: {status: 'CONSUMED'},
                select: {userId: true, consumedAt: true, createdAt: true},
            },
        },
    });

    const visible = all.filter((p) => {
        const usedUp = p.maxRedemptions !== null && p.redemptionCount >= p.maxRedemptions;
        const expired = p.expiresAt && p.expiresAt.getTime() < now;
        return !usedUp && !expired;
    });

    // Барабан yutilgan kodlar egasini aniqlash uchun
    const userIds = [...new Set(visible.filter((p) => p.restrictedToUserId).map((p) => p.restrictedToUserId))];
    const users = userIds.length
        ? await prisma.user.findMany({
            where: {id: {in: userIds}},
            select: {id: true, username: true, telegramId: true, firstName: true},
        })
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // 1-band: FIRST_DEPOSIT_BONUS / NEXT_DEPOSIT_BONUS uchun — shu promo-kod
    // orqali amalga oshgan haqiqiy depozitlar summasi. Mantiq: promo-kod
    // aktivlashtirilgandan keyin (createdAt) va bonus berilganda (consumedAt)
    // o'rtasida yuzaga kelgan eng birinchi muvaffaqiyatli TOPUP topiladi.
    // Ko'rsatiladigan summa — foydalanuvchi kiritgan asosiy summa (bonus
    // qo'shilmasidan oldin), ya'ni to'lov to'liq o'tganidan keyin hisoblangan.
    const depositTypeIds = visible
        .filter((p) => p.type === 'FIRST_DEPOSIT_BONUS' || p.type === 'NEXT_DEPOSIT_BONUS')
        .map((p) => p.id);

    const depositStats = {};
    if (depositTypeIds.length) {
        // Har bir promo-kod uchun yutilgan redemption'larni ko'rib chiqamiz
        const relevantCodes = visible.filter((p) => depositTypeIds.includes(p.id));
        for (const promo of relevantCodes) {
            let totalAmount = 0;
            let activations = 0;
            for (const r of promo.redemptions) {
                // Shu foydalanuvchining redemption yaratilgan va bekor qilingan
                // vaqt oralig'idagi birinchi muvaffaqiyatli TOPUP tranzaksiyasini topamiz
                const tx = await prisma.transaction.findFirst({
                    where: {
                        userId: r.userId,
                        type: 'TOPUP',
                        status: 'SUCCESS',
                        createdAt: {
                            gte: r.createdAt,
                            ...(r.consumedAt ? {lte: r.consumedAt} : {}),
                        },
                    },
                    orderBy: {createdAt: 'asc'},
                });
                if (tx) {
                    totalAmount += Number(tx.amount);
                    activations += 1;
                }
            }
            depositStats[promo.id] = {activations, totalAmount};
        }
    }

    const items = visible.map((p) => ({
        ...p,
        redemptions: undefined, // xom ma'lumotni frontendga yubormaslik uchun
        wonByUser: p.restrictedToUserId ? userMap[p.restrictedToUserId] || null : null,
        depositStats: depositStats[p.id] || null,
    }));

    res.json({items});
});

router.post('/promo-codes', async (req, res) => {
    const {code, type, discountPercent, discountUses, topupAmount, bonusPercent, maxRedemptions} = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return res.status(400).json({error: 'Введите код.'});
    if (!['DISCOUNT', 'BALANCE_TOPUP', 'FIRST_DEPOSIT_BONUS'].includes(type)) {
        return res.status(400).json({error: 'Неверный тип промо-кода.'});
    }

    const data = {
        code: cleanCode,
        type,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        createdById: req.user.id,
    };

    if (type === 'DISCOUNT') {
        const p = Number(discountPercent);
        const u = Number(discountUses);
        if (!Number.isFinite(p) || p <= 0 || p > 100) return res.status(400).json({error: 'Укажите корректный процент скидки.'});
        if (!Number.isInteger(u) || u <= 0) return res.status(400).json({error: 'Укажите корректное число использований.'});
        data.discountPercent = p;
        data.discountUses = u;
    } else if (type === 'BALANCE_TOPUP') {
        const a = Number(topupAmount);
        if (!Number.isFinite(a) || a <= 0) return res.status(400).json({error: 'Укажите корректную сумму пополнения.'});
        data.topupAmount = a;
    } else if (type === 'FIRST_DEPOSIT_BONUS') {
        const b = Number(bonusPercent);
        if (!Number.isFinite(b) || b <= 0 || b > 100) return res.status(400).json({error: 'Укажите корректный процент бонуса.'});
        data.bonusPercent = b;
    }

    try {
        const promo = await prisma.promoCode.create({data});
        await logAction(req.user.id, 'PROMO_CREATED', 'PromoCode', promo.id, {code: cleanCode, type});
        res.status(201).json(promo);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({error: 'Такой код уже существует.'});
        throw err;
    }
});

router.patch('/promo-codes/:id', async (req, res) => {
    const {isActive} = req.body || {};
    const promo = await prisma.promoCode.update({where: {id: req.params.id}, data: {isActive: Boolean(isActive)}});
    await logAction(req.user.id, 'PROMO_TOGGLED', 'PromoCode', promo.id, {isActive});
    res.json(promo);
});

router.delete('/promo-codes/:id', async (req, res) => {
    await prisma.promoCode.delete({where: {id: req.params.id}}).catch(() => {
    });
    await logAction(req.user.id, 'PROMO_DELETED', 'PromoCode', req.params.id, {});
    res.json({ok: true});
});

// Admin shaxsiy Steam savdosi orqali foydalanuvchidan inventar sotib
// olganda shuni qayd etadi (summa, item nomi, izoh).
router.post('/users/:id/sales', async (req, res) => {
    const {itemName, agreedAmount, note} = req.body || {};
    if (!itemName || !Number.isFinite(Number(agreedAmount)) || Number(agreedAmount) <= 0) {
        return res.status(400).json({error: 'Название предмета и сумма обязательны.'});
    }
    const seller = await prisma.user.findUnique({where: {id: req.params.id}});
    if (!seller) return res.status(404).json({error: 'Foydalanuvchi topilmadi.'});

    const {recordSale} = require('../services/userSaleService');
    const sale = await recordSale({
        sellerId: seller.id,
        recordedById: req.user.id,
        itemName,
        agreedAmount: Number(agreedAmount)
    });
    if (note) await prisma.userSale.update({where: {id: sale.id}, data: {note}});
    await logAction(req.user.id, 'USER_SALE_RECORDED', 'UserSale', sale.id, {itemName, agreedAmount});

    await notifyText(
        seller.telegramId,
        `📥 Администратор зафиксировал получение вашего предмета "${itemName}" на сумму ${Number(agreedAmount).toLocaleString('ru-RU')} сум. ` +
        `Выплата будет произведена через 8 дней (после периода защиты сделки в Steam).`
    );

    res.status(201).json(sale);
});

// 8 kunlik muddat tugagan, LEKIN hali to'lanmagan barcha savdolar —
// "admin foydalanuvchiga pul o'tkazib berishi mumkin" ro'yxati.
// 1-band: savdoni bekor qilish (masalan sotuvchi fikridan qaytsa) — yozuv
// o'chiriladi va 2-band bo'yicha berilgan reyting ball qaytarib olinadi.
router.delete('/sales/:id', async (req, res) => {
    const {cancelSale} = require('../services/userSaleService');
    const sale = await cancelSale(req.params.id, req.user.id);
    if (!sale) return res.status(404).json({error: 'Yozuv topilmadi.'});
    res.json({ok: true});
});

router.get('/sales/ready-to-pay', async (req, res) => {
    const cutoff = new Date(Date.now() - SALE_HOLD_MS);
    const items = await prisma.userSale.findMany({
        where: {paidAt: null, createdAt: {lte: cutoff}},
        orderBy: {createdAt: 'asc'},
        take: 5, // 1-band: eng eskisidan boshlab, ko'pi bilan 5ta
        include: {seller: {select: {id: true, username: true, firstName: true, telegramId: true}}},
    });
    res.json({items});
});

// Hali 8 kun to'lmagan, kutilayotgan savdolar (ma'lumot uchun — pastda
// alohida ko'rsatiladi, hali "tayyor" emas).
router.get('/sales/pending', async (req, res) => {
    const cutoff = new Date(Date.now() - SALE_HOLD_MS);
    const items = await prisma.userSale.findMany({
        where: {paidAt: null, createdAt: {gt: cutoff}},
        orderBy: {createdAt: 'asc'},
        take: 5,
        include: {seller: {select: {id: true, username: true, firstName: true, telegramId: true}}},
    });
    res.json({items});
});

router.post('/sales/:id/mark-paid', async (req, res) => {
    const sale = await prisma.userSale.findUnique({where: {id: req.params.id}, include: {seller: true}});
    if (!sale) return res.status(404).json({error: 'Yozuv topilmadi.'});
    if (sale.paidAt) return res.status(400).json({error: 'Bu allaqachon to\'langan deb belgilangan.'});

    // 3/4-band: SERVERDA majburiy tekshiruv — 8 kunlik muddat o'tmaguncha
    // to'lovni tasdiqlab bo'lmaydi (frontend tugmani yashirgan bo'lsa ham, bu
    // haqiqiy himoya chizig'i — to'g'ridan-to'g'ri API so'rovidan ham himoyalaydi).
    const readyAt = new Date(sale.createdAt.getTime() + SALE_HOLD_MS);
    if (Date.now() < readyAt.getTime()) {
        const daysLeft = Math.ceil((readyAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return res.status(400).json({error: `Ещё рано — до конца периода защиты сделки осталось ${daysLeft} дн.`});
    }

    const updated = await prisma.userSale.update({where: {id: sale.id}, data: {paidAt: new Date()}});
    await logAction(req.user.id, 'USER_SALE_PAID', 'UserSale', sale.id, {});
    await notifyText(
        sale.seller.telegramId,
        `💸 Оплата за "${sale.itemName}" (${Number(sale.agreedAmount).toLocaleString('ru-RU')} сум) произведена на указанную карту. Спасибо за сделку!`
    );
    res.json(updated);
});

router.get('/steam-inventory', async (req, res) => {
    const {listBotInventory} = require('../services/steamBotService');
    const result = await listBotInventory();
    if (!result.ok) return res.status(400).json({error: result.error});
    res.json({items: result.items});
});

// ===========================================================================
// 10/11-band: REKLAMA — ikkita slot (BANNER, POPUP) boshqaruvi + statistika.
// ===========================================================================
router.get('/ads', async (req, res) => {
    const ads = await prisma.advertisement.findMany();
    const bySlot = {BANNER: null, POPUP: null};
    for (const ad of ads) bySlot[ad.slot] = ad;
    res.json(bySlot);
});

router.put('/ads/:slot', async (req, res) => {
    const slot = String(req.params.slot || '').toUpperCase();
    if (!['BANNER', 'POPUP'].includes(slot)) return res.status(400).json({error: 'Noto\'g\'ri slot.'});
    const {imageUrl, linkUrl, isActive, durationDays, popupFrequency} = req.body || {};
    if (!imageUrl) return res.status(400).json({error: 'URL изображения обязателен.'});

    // 1-band: kunlar soni kiritilsa, shu kundan keyingi vaqt hisoblab
    // saqlanadi. Bo'sh/0 kiritilsa — muddatsiz (hech qachon avtomatik o'chmaydi).
    const days = durationDays !== undefined && durationDays !== '' ? Number(durationDays) : null;
    const expiresAt = days && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    // 2-band: FAQAT POPUP uchun ma'noli — 1/1..1/5 oralig'ida cheklab qo'yamiz
    const freq = popupFrequency ? Math.min(Math.max(Number(popupFrequency), 1), 5) : 1;

    const ad = await prisma.advertisement.upsert({
        where: {slot},
        update: {
            imageUrl,
            linkUrl: linkUrl || null,
            isActive: isActive !== undefined ? Boolean(isActive) : true,
            durationDays: days,
            expiresAt,
            ...(slot === 'POPUP' ? {popupFrequency: freq} : {}),
        },
        create: {
            slot,
            imageUrl,
            linkUrl: linkUrl || null,
            durationDays: days,
            expiresAt,
            ...(slot === 'POPUP' ? {popupFrequency: freq} : {}),
        },
    });
    await logAction(req.user.id, 'AD_UPDATED', 'Advertisement', ad.id, {slot});
    res.json(ad);
});

router.delete('/ads/:slot', async (req, res) => {
    const slot = String(req.params.slot || '').toUpperCase();
    await prisma.advertisement.deleteMany({where: {slot}});
    await logAction(req.user.id, 'AD_DELETED', 'Advertisement', slot, {});
    res.json({ok: true});
});

// ===========================================================================
// 3/4-band: БАРАБАН — admin elementlarni boshqaradi (qo'shish, o'chirish,
// yoqish/o'chirish). Bir xil turdan xohlagancha qo'shish mumkin.
// ===========================================================================
router.get('/wheel-items', async (req, res) => {
    const items = await prisma.wheelItem.findMany({orderBy: {createdAt: 'asc'}});
    const totalWeight = items.filter((i) => i.isActive).reduce((s, i) => s + i.weight, 0);
    // Admin "qo'lda o'chirilgan" va "yutilgani sabab avtomatik o'chirilgan"
    // elementlarni farqlay olishi uchun — har biri necha marta yutilganini
    // ham qo'shib beramiz (SKIN uchun bu >0 bo'lsa, qayta yoqmaslik kerak).
    const spinCounts = await prisma.wheelSpin.groupBy({by: ['wheelItemId'], _count: true});
    const countMap = Object.fromEntries(spinCounts.map((s) => [s.wheelItemId, s._count]));
    const itemsWithCounts = items.map((i) => ({...i, timesWon: countMap[i.id] || 0}));

    // 3-band: so'nggi 24 soatda barabanni aylantirganlar statistikasi —
    // "real" foydalanuvchi faolligini ko'rsatish uchun.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, spins24h] = await Promise.all([
        prisma.user.count(),
        prisma.wheelSpin.findMany({where: {createdAt: {gte: since24h}}, select: {userId: true}}),
    ]);
    const uniqueSpinners24h = new Set(spins24h.map((s) => s.userId)).size;
    const spinPercent = totalUsers > 0 ? Math.round((uniqueSpinners24h / totalUsers) * 100) : 0;

    res.json({
        items: itemsWithCounts,
        totalWeight,
        stats24h: {totalUsers, uniqueSpinners: uniqueSpinners24h, spinPercent, totalSpins: spins24h.length},
    });
});

router.post('/wheel-items', async (req, res) => {
    const {
        type,
        label,
        weight,
        percent,
        amount,
        discountUses,
        skinName,
        skinImageUrl,
        skinRarity,
        skinWearCondition,
        skinFloatValue,
        skinPaintSeed,
        skinSteamAssetId
    } = req.body || {};

    if (!['TOPUP_BONUS_PROMO', 'PAID_PROMO', 'BOMB', 'SKIN', 'DISCOUNT_PROMO'].includes(type)) {
        return res.status(400).json({error: 'Неверный тип элемента.'});
    }
    const w = Number(weight);
    if (!Number.isInteger(w) || w <= 0) return res.status(400).json({error: 'Вес (вероятность) должен быть положительным целым числом.'});
    if (!label || !String(label).trim()) return res.status(400).json({error: 'Укажите название элемента.'});

    const data = {type, label: String(label).trim(), weight: w};

    if (type === 'TOPUP_BONUS_PROMO' || type === 'DISCOUNT_PROMO') {
        const p = Number(percent);
        if (!Number.isFinite(p) || p <= 0 || p > 100) return res.status(400).json({error: 'Укажите корректный процент.'});
        data.percent = p;
        if (type === 'DISCOUNT_PROMO') {
            const u = Number(discountUses);
            if (!Number.isInteger(u) || u <= 0) return res.status(400).json({error: 'Укажите количество использований скидки.'});
            data.discountUses = u;
        }
    } else if (type === 'PAID_PROMO') {
        const a = Number(amount);
        if (!Number.isFinite(a) || a <= 0) return res.status(400).json({error: 'Укажите корректную сумму.'});
        data.amount = a;
    } else if (type === 'SKIN') {
        if (!skinName || !skinImageUrl) return res.status(400).json({error: 'Для приза-скина укажите название и изображение.'});
        data.skinName = skinName;
        data.skinImageUrl = skinImageUrl;
        data.skinRarity = skinRarity || 'CONSUMER';
        data.skinWearCondition = skinWearCondition || null;
        data.skinFloatValue = skinFloatValue !== undefined && skinFloatValue !== '' ? Number(skinFloatValue) : null;
        data.skinPaintSeed = skinPaintSeed !== undefined && skinPaintSeed !== '' ? Number(skinPaintSeed) : null;
        data.skinSteamAssetId = skinSteamAssetId || null;
    }
    // BOMB uchun qo'shimcha maydon kerak emas

    const item = await prisma.wheelItem.create({data});
    await logAction(req.user.id, 'WHEEL_ITEM_CREATED', 'WheelItem', item.id, {type, label});
    res.status(201).json(item);
});

router.patch('/wheel-items/:id', async (req, res) => {
    const {isActive, weight} = req.body || {};
    const data = {};
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (weight !== undefined) {
        const w = Number(weight);
        if (!Number.isInteger(w) || w <= 0) return res.status(400).json({error: 'Неверный вес.'});
        data.weight = w;
    }
    const item = await prisma.wheelItem.update({where: {id: req.params.id}, data});
    res.json(item);
});

router.delete('/wheel-items/:id', async (req, res) => {
    await prisma.wheelItem.delete({where: {id: req.params.id}}).catch(() => {
    });
    await logAction(req.user.id, 'WHEEL_ITEM_DELETED', 'WheelItem', req.params.id, {});
    res.json({ok: true});
});

module.exports = router;

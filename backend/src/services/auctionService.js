const prisma = require('../db/prisma');
const { env } = require('../config/env');

// Texnik topshiriqdagi qoidalar (1.i — 1.l bandlari) shu yerda amalga oshirilgan:
//   i.  Narx oshirilganda, narxning 25% i zaklad sifatida hisobdan "ushlab qolinadi".
//       Agar balans yetarli bo'lmasa — taklif rad etiladi.
//   j.  Joriy yetakchi (oxirgi taklif bergan) foydalanuvchi ketma-ket 10 martagacha
//       narx oshira oladi. Xohlagan narxni ham yoza oladi — lekin joriy narxdan past bo'lmasin.
//   k.  Kimdir boshqa birovning narxidan oshirsa — avvalgi yetakchining zakladi to'liq
//       qaytariladi, yangi yetakchidan yangi narxning 25% i ushlab qolinadi.
//   l.  Agar auksion tugashiga 5 daqiqadan kam vaqt qolganda yangi taklif kelsa —
//       tugash vaqti joriy paytdan yana 5 daqiqaga suriladi.

class AuctionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function calcHold(amount) {
  return round2((Number(amount) * env.auction.depositPercent) / 100);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Auksionga taklif qo'yish — tizimning eng nozik va bir vaqtning o'zida bir nechta
 * foydalanuvchi tomonidan chaqirilishi mumkin bo'lgan joyi. Shu sabab optimistik
 * lokировка (Auction.version maydoni) bilan himoyalangan: agar shu auksionga
 * parallel ravishda boshqa taklif "yutib ketgan" bo'lsa, tranzaksiya qayta uriniladi.
 *
 * @param {object} params
 * @param {string} params.auctionId
 * @param {string} params.userId - taklif beruvchi foydalanuvchi (ADMIN bo'lmasligi kerak — buni chaqiruvchi controller tekshiradi)
 * @param {'raise'|'custom'} params.mode - "raise": tizim taklif qiladigan standart qadam bilan oshirish; "custom": foydalanuvchi o'zi kiritgan narx
 * @param {number} [params.customAmount] - mode === 'custom' bo'lganda majburiy
 * @param {number} [params.raiseStep] - mode === 'raise' bo'lganda ishlatiladigan qadam (frontend taklif qiladi, masalan joriy narxning 5-10%)
 */
async function placeBid({ auctionId, userId, mode, customAmount, raiseStep }) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await attemptPlaceBid({ auctionId, userId, mode, customAmount, raiseStep });
    } catch (err) {
      if (err.code === 'VERSION_CONFLICT' && attempt < MAX_RETRIES - 1) {
        continue; // boshqa foydalanuvchi bir zumda oldinroq taklif berdi — qayta urinamiz
      }
      throw err;
    }
  }
  throw new AuctionError('RETRY_EXHAUSTED', 'Auksion juda band, iltimos qayta urinib ko\'ring.');
}

async function attemptPlaceBid({ auctionId, userId, mode, customAmount, raiseStep }) {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new AuctionError('NOT_FOUND', 'Auksion topilmadi.');
    if (auction.status !== 'ACTIVE') {
      throw new AuctionError('NOT_ACTIVE', 'Bu auksion hozir faol emas.');
    }
    if (new Date(auction.endsAt).getTime() <= Date.now()) {
      throw new AuctionError('ENDED', 'Auksion muddati allaqachon tugagan.');
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuctionError('NO_USER', 'Foydalanuvchi topilmadi.');
    if (user.isBanned) throw new AuctionError('BANNED', 'Hisobingiz bloklangan.');
    if (user.role !== 'USER') {
      // 2-band: adminlar auksionda narx belgilay olmaydi (sun'iy narx oshirishni oldini olish uchun)
      throw new AuctionError('ADMIN_FORBIDDEN', 'Administratorlar auksionda taklif bera olmaydi.');
    }

    const currentPrice = Number(auction.currentPrice);
    const isSameLeader = auction.currentLeaderId === userId;

    // --- Yangi narxni aniqlash ---
    let newAmount;
    if (mode === 'custom') {
      newAmount = Number(customAmount);
      if (!Number.isFinite(newAmount)) {
        throw new AuctionError('BAD_AMOUNT', 'Narx noto\'g\'ri kiritildi.');
      }
      if (newAmount < currentPrice) {
        throw new AuctionError('TOO_LOW', `Narx joriy narxdan (${currentPrice}) past bo'lmasligi kerak.`);
      }
    } else {
      const step = Number(raiseStep) > 0 ? Number(raiseStep) : round2(currentPrice * 0.05);
      newAmount = round2(currentPrice + step);
    }

    // --- j-band: ketma-ket oshirish limiti (faqat "hozirgi yetakchi yana oshirsa" holatida) ---
    let nextConsecutive = 1;
    if (isSameLeader) {
      if (auction.consecutiveRaises >= env.auction.maxConsecutiveRaises) {
        throw new AuctionError(
          'MAX_RAISES',
          `Siz bitta auksionda ketma-ket ${env.auction.maxConsecutiveRaises} martadan ortiq narx oshira olmaysiz. Boshqa foydalanuvchi taklif berishini kuting.`
        );
      }
      nextConsecutive = auction.consecutiveRaises + 1;
    }

    // --- i-band: 25% zaklad hisoblash va balansni tekshirish ---
    const requiredHold = calcHold(newAmount);
    const previousHoldOfThisUser = isSameLeader ? Number(auction.currentPrice) * 0 : 0; // pastda to'g'ri hisoblanadi

    // Agar shu foydalanuvchi allaqachon yetakchi bo'lsa, uning oldingi zakladi allaqachon
    // holdBalance'da turibdi — faqat farqni (delta) qo'shimcha ushlab qolamiz.
    let additionalHoldNeeded = requiredHold;
    if (isSameLeader) {
      const lastBid = await tx.bid.findFirst({
        where: { auctionId, userId, isWinning: true },
        orderBy: { createdAt: 'desc' },
      });
      const alreadyHeld = lastBid ? Number(lastBid.holdAmount) : 0;
      additionalHoldNeeded = round2(requiredHold - alreadyHeld);
      if (additionalHoldNeeded < 0) additionalHoldNeeded = 0;
    }

    const availableBalance = Number(user.balance);
    if (availableBalance < additionalHoldNeeded) {
      throw new AuctionError(
        'INSUFFICIENT_BALANCE',
        `Balansingiz yetarli emas. Narx oshirish uchun yana ${additionalHoldNeeded.toLocaleString('uz-UZ')} so'm zaklad kerak. Iltimos, "To'lov" bo'limidan hisobingizni to'ldiring.`
      );
    }

    // --- k-band: agar yetakchi almashsa — avvalgi yetakchining zakladi qaytariladi ---
    if (auction.currentLeaderId && !isSameLeader) {
      const prevWinningBid = await tx.bid.findFirst({
        where: { auctionId, userId: auction.currentLeaderId, isWinning: true },
        orderBy: { createdAt: 'desc' },
      });
      if (prevWinningBid) {
        await tx.user.update({
          where: { id: auction.currentLeaderId },
          data: {
            balance: { increment: prevWinningBid.holdAmount },
            holdBalance: { decrement: prevWinningBid.holdAmount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: auction.currentLeaderId,
            auctionId,
            type: 'BID_HOLD_RELEASE',
            status: 'SUCCESS',
            amount: prevWinningBid.holdAmount,
            note: 'Sizdan boshqa foydalanuvchi yuqori narx taklif qildi — zaklad qaytarildi.',
          },
        });
      }
      await tx.bid.updateMany({ where: { auctionId, isWinning: true }, data: { isWinning: false } });
    }

    // --- Yangi taklif beruvchidan mablag' ushlab qolish ---
    if (additionalHoldNeeded > 0) {
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: additionalHoldNeeded },
          holdBalance: { increment: additionalHoldNeeded },
        },
      });
      await tx.transaction.create({
        data: {
          userId,
          auctionId,
          type: 'BID_HOLD',
          status: 'SUCCESS',
          amount: additionalHoldNeeded,
          note: `Auksionda ${newAmount} so'mlik taklif uchun zaklad ushlab qolindi.`,
        },
      });
    }
    if (isSameLeader) {
      // o'zining oldingi "isWinning" bid yozuvini yangilamasdan, yangi bid qatorini qo'shamiz —
      // shunda to'liq tarix saqlanadi.
      await tx.bid.updateMany({ where: { auctionId, isWinning: true }, data: { isWinning: false } });
    }

    const newBid = await tx.bid.create({
      data: {
        auctionId,
        userId,
        amount: newAmount,
        holdAmount: requiredHold,
        isWinning: true,
      },
    });

    // --- l-band: tugash vaqtini uzaytirish ---
    const now = Date.now();
    const msLeft = new Date(auction.endsAt).getTime() - now;
    const thresholdMs = env.auction.extendThresholdMinutes * 60 * 1000;
    let newEndsAt = auction.endsAt;
    if (msLeft < thresholdMs) {
      newEndsAt = new Date(now + env.auction.extendByMinutes * 60 * 1000);
    }

    // --- Optimistik lokировка: version mos kelmasa, tranzaksiya muvaffaqiyatsiz bo'ladi ---
    const updateResult = await tx.auction.updateMany({
      where: { id: auctionId, version: auction.version },
      data: {
        currentPrice: newAmount,
        currentLeaderId: userId,
        consecutiveRaises: nextConsecutive,
        endsAt: newEndsAt,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) {
      const conflict = new Error('version conflict');
      conflict.code = 'VERSION_CONFLICT';
      throw conflict;
    }

    // --- Reyting: taklif berganlik uchun ozgina ball (5.e-band: reyting avtomatik oshadi) ---
    await tx.ratingEvent.create({
      data: { userId, type: 'BID_PLACED', points: 1, note: `Auksion #${auctionId} uchun taklif` },
    });
    await tx.user.update({ where: { id: userId }, data: { ratingScore: { increment: 1 } } });

    const updatedAuction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { subcategory: { include: { category: true } }, currentLeader: { select: { id: true, username: true, firstName: true } } },
    });

    return { auction: updatedAuction, bid: newBid, extended: newEndsAt !== auction.endsAt };
  }, { isolationLevel: 'Serializable' });
}

/**
 * BOSQICH 1: Muddati tugagan (ACTIVE) auksionlarni yopadi. G'olib bo'lsa —
 * darhol pul yechilmaydi! Buning o'rniga auksion "AWAITING_PAYMENT" holatiga
 * o'tadi va g'olibga qolgan 75%ni to'lashi uchun `winnerPaymentWindowHours`
 * (standart: 5 soat) muddat beriladi (3-band). G'olib bo'lmasa — UNSOLD.
 * Bu funksiya cron job (auctionScheduler) tomonidan muntazam chaqiriladi.
 */
async function closeExpiredAuctions() {
  const expired = await prisma.auction.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: new Date() } },
  });

  const results = [];
  for (const auction of expired) {
    if (!auction.currentLeaderId) {
      results.push(await prisma.auction.update({ where: { id: auction.id }, data: { status: 'UNSOLD' } }));
      continue;
    }
    const paymentDueAt = new Date(Date.now() + env.auction.winnerPaymentWindowHours * 60 * 60 * 1000);
    results.push(
      await prisma.auction.update({
        where: { id: auction.id },
        data: { status: 'AWAITING_PAYMENT', paymentDueAt },
      })
    );
  }
  return results;
}

/**
 * G'olib "To'lovni yakunlash" tugmasini bosganda (yoki cron opportunistik
 * urinishida) chaqiriladi: qolgan 75% (currentPrice - allaqachon ushlab
 * qolingan zaklad)ni g'olibning ERKIN balansidan yechishga harakat qiladi.
 * Muvaffaqiyatli bo'lsa auksion "PAID" holatiga o'tadi (Steam orqali
 * yuborish admin tomonidan qo'lda tasdiqlanadi — bo'lim 8/9ga qarang).
 *
 * @returns {{ ok: boolean, reason?: string, missingAmount?: number }}
 */
async function attemptCompletePayment(auctionId) {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return { ok: false, reason: 'NOT_FOUND' };
    if (auction.status !== 'AWAITING_PAYMENT') return { ok: false, reason: 'WRONG_STATUS' };
    if (!auction.currentLeaderId) return { ok: false, reason: 'NO_WINNER' };

    const winningBid = await tx.bid.findFirst({
      where: { auctionId: auction.id, userId: auction.currentLeaderId, isWinning: true },
      orderBy: { createdAt: 'desc' },
    });
    const holdAmount = winningBid ? Number(winningBid.holdAmount) : 0;
    const finalPrice = Number(auction.currentPrice);
    const remainder = round2(finalPrice - holdAmount);

    const winner = await tx.user.findUnique({ where: { id: auction.currentLeaderId } });
    if (Number(winner.balance) < remainder) {
      return { ok: false, reason: 'INSUFFICIENT_BALANCE', missingAmount: round2(remainder - Number(winner.balance)) };
    }

    await tx.user.update({
      where: { id: auction.currentLeaderId },
      data: { balance: { decrement: remainder }, holdBalance: { decrement: holdAmount } },
    });
    await tx.transaction.create({
      data: {
        userId: auction.currentLeaderId,
        auctionId: auction.id,
        type: 'PURCHASE',
        status: 'SUCCESS',
        amount: finalPrice,
        note: `"${auction.skinName}" uchun qolgan to'lov (${remainder} so'm) qabul qilindi.`,
      },
    });
    await tx.ratingEvent.create({
      data: { userId: auction.currentLeaderId, type: 'AUCTION_WON', points: 10, note: auction.skinName },
    });
    await tx.user.update({ where: { id: auction.currentLeaderId }, data: { ratingScore: { increment: 10 } } });

    const updated = await tx.auction.update({
      where: { id: auction.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    return { ok: true, auction: updated };
  });
}

/**
 * BOSQICH 2: "AWAITING_PAYMENT" holatidagi barcha auksionlarni tekshiradi —
 * (a) avval har biri uchun to'lovni yakunlashga (opportunistik) harakat
 *     qiladi, balki foydalanuvchi orada hisobini to'ldirgandir;
 * (b) hali to'lanmagan va `paymentDueAt` muddati o'tib ketganlarni jarimalaydi:
 *     zakladning `depositRefundOnExpiryPercent`i (standart 50%) g'olibga
 *     qaytariladi, qolgani ("boshqalarning sotib olishiga to'sqinlik
 *     qilgani uchun") ushlab qolinadi — 3-band.
 */
async function sweepAwaitingPayments() {
  const waiting = await prisma.auction.findMany({ where: { status: 'AWAITING_PAYMENT' } });
  const paidNow = [];
  const expiredNow = [];

  for (const auction of waiting) {
    const attempt = await attemptCompletePayment(auction.id);
    if (attempt.ok) {
      paidNow.push(attempt.auction);
      continue;
    }
    if (auction.paymentDueAt && new Date(auction.paymentDueAt).getTime() > Date.now()) {
      continue; // muddat hali tugamagan, keyingi safar qayta tekshiramiz
    }

    // --- Muddat tugadi, foydalanuvchi to'lamadi -> 50/50 jarima ---
    const expired = await prisma.$transaction(async (tx) => {
      const fresh = await tx.auction.findUnique({ where: { id: auction.id } });
      if (fresh.status !== 'AWAITING_PAYMENT') return fresh; // orada boshqa jarayon allaqachon hal qilgan

      const winningBid = await tx.bid.findFirst({
        where: { auctionId: auction.id, userId: fresh.currentLeaderId, isWinning: true },
        orderBy: { createdAt: 'desc' },
      });
      const holdAmount = winningBid ? Number(winningBid.holdAmount) : 0;
      const refundAmount = round2((holdAmount * env.auction.depositRefundOnExpiryPercent) / 100);
      const forfeitAmount = round2(holdAmount - refundAmount);

      await tx.user.update({
        where: { id: fresh.currentLeaderId },
        data: { balance: { increment: refundAmount }, holdBalance: { decrement: holdAmount } },
      });
      await tx.transaction.create({
        data: {
          userId: fresh.currentLeaderId,
          auctionId: fresh.id,
          type: 'BID_HOLD_RELEASE',
          status: 'SUCCESS',
          amount: refundAmount,
          note: `"${fresh.skinName}" uchun ${env.auction.winnerPaymentWindowHours} soat ichida to'lov qilinmadi. Zakladning ${env.auction.depositRefundOnExpiryPercent}% i qaytarildi.`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: fresh.currentLeaderId,
          auctionId: fresh.id,
          type: 'DEPOSIT_FORFEITED',
          status: 'SUCCESS',
          amount: forfeitAmount,
          note: `To'lov muddati (${env.auction.winnerPaymentWindowHours} soat) o'tkazib yuborilgani uchun zakladning ${100 - env.auction.depositRefundOnExpiryPercent}% i jarima sifatida ushlab qolindi.`,
        },
      });

      return tx.auction.update({
        where: { id: fresh.id },
        data: { status: 'PAYMENT_EXPIRED' },
      });
    });
    expiredNow.push(expired);
  }

  return { paidNow, expiredNow };
}

module.exports = {
  AuctionError,
  placeBid,
  closeExpiredAuctions,
  attemptCompletePayment,
  sweepAwaitingPayments,
  calcHold,
};

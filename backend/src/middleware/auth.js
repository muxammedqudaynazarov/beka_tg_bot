const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const prisma = require('../db/prisma');

function signSession(user) {
  return jwt.sign({ uid: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/**
 * Mini App /api/auth/telegram orqali JWT oladi va har bir keyingi so'rovda
 * "Authorization: Bearer <token>" headerini yuboradi. Bu middleware shu
 * tokenni tekshirib, req.user'ga to'liq foydalanuvchi obyektini yuklaydi.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Требуется авторизация.' });

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден.' });
    if (user.isBanned) return res.status(403).json({ error: 'Ваш аккаунт заблокирован.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Токен недействителен или истёк.' });
  }
}

/**
 * requireAuth kabi, lekin token yo'q yoki yaroqsiz bo'lsa ham so'rovni RAD
 * ETMAYDI — shunchaki req.user'ni bo'sh qoldiradi. Ochiq (login shart
 * bo'lmagan) endpointlarda, agar foydalanuvchi tizimga kirgan bo'lsa,
 * natijani shaxsiylashtirish uchun ishlatiladi (masalan "sevimlimi" belgisi).
 */
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next();

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (user && !user.isBanned) req.user = user;
  } catch {
    /* token yaroqsiz — shunchaki mehmon sifatida davom etamiz */
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия.' });
    }
    next();
  };
}

module.exports = { signSession, requireAuth, optionalAuth, requireRole };

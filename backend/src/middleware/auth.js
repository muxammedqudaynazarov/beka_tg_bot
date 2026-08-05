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
    if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' });

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi.' });
    if (user.isBanned) return res.status(403).json({ error: 'Hisobingiz bloklangan.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu amal uchun ruxsatingiz yetarli emas.' });
    }
    next();
  };
}

module.exports = { signSession, requireAuth, requireRole };

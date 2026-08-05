const { PrismaClient } = require('@prisma/client');
const { env } = require('../config/env');

// Ilova davomida bitta PrismaClient nusxasi ishlatiladi (har bir so'rovda
// yangi ulanish ochish resurslarni behuda sarflaydi va DB ulanish limitiga
// tez yetkazadi).
const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;

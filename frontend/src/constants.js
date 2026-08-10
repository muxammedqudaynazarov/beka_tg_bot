export const RARITY_META = {
  CONSUMER: { label: 'Ширпотреб', color: '#B0C3D9' },
  INDUSTRIAL: { label: 'Промышленное', color: '#5E98D9' },
  MILSPEC: { label: 'Армейское', color: '#4B69FF' },
  RESTRICTED: { label: 'Запрещённое', color: '#8847FF' },
  CLASSIFIED: { label: 'Засекреченное', color: '#D32CE6' },
  COVERT: { label: 'Тайное', color: '#EB4B4B' },
  GOLD: { label: 'Редкое', color: '#FFD700' },
};

// DIQQAT: WEAR_LABELS (Factory New, Minimal Wear va h.k.) ATAYIN
// tarjima qilinmagan — bu CS2 hamjamiyatida (rus tilida ham) hamma
// tomonidan xuddi shu inglizcha nomlar bilan tanilgan rasmiy atamalar.
export const WEAR_LABELS = {
  FN: 'Прямо с завода', // Factory New
  MW: 'Немного поношенное', // Minimal Wear
  FT: 'После полевых испытаний', // Field-Tested
  WW: 'Поношенное', // Well-Worn
  BS: 'Закаленное в боях', // Battle-Scarred
};

export function formatSom(amount) {
  const n = Number(amount || 0);
  return `${n.toLocaleString('ru-RU')} сум`;
}

// 1-band: d.m.Y H:i:s formatida, masalan "10.08.2026 14:23:05"
export function formatDateTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 1 kundan kam qolsa kun ko'rsatilmaydi (soat:daqiqa:soniya),
// 1 soatdan kam qolsa soat ham ko'rsatilmaydi (daqiqa:soniya).
export function formatCountdownDHMS(endsAtIso) {
  const diffMs = new Date(endsAtIso).getTime() - Date.now();
  if (diffMs <= 0) return '00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (d > 0) return `${pad2(d)}:${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

export const AUCTION_STATUS_META = {
  ACTIVE: { label: 'Активен', color: '#3ECF8E' },
  AWAITING_PAYMENT: { label: 'Ожидает оплаты', color: '#F5A623' },
  PAID: { label: 'Оплачен', color: '#4B69FF' },
  DELIVERED: { label: 'Отправлен', color: '#3ECF8E' },
  PAYMENT_EXPIRED: { label: 'Срок истёк', color: '#FF5B5B' },
  CANCELLED: { label: 'Отменён', color: '#5B6274' },
  UNSOLD: { label: 'Не продан', color: '#5B6274' },
};

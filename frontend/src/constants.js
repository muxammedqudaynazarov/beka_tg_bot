export const RARITY_META = {
  CONSUMER: { label: 'Consumer', color: '#B0C3D9' },
  INDUSTRIAL: { label: 'Industrial', color: '#5E98D9' },
  MILSPEC: { label: 'Mil-Spec', color: '#4B69FF' },
  RESTRICTED: { label: 'Restricted', color: '#8847FF' },
  CLASSIFIED: { label: 'Classified', color: '#D32CE6' },
  COVERT: { label: 'Covert', color: '#EB4B4B' },
  GOLD: { label: 'Noyob (★)', color: '#FFD700' },
};

export const WEAR_LABELS = {
  FN: 'Factory New',
  MW: 'Minimal Wear',
  FT: 'Field-Tested',
  WW: 'Well-Worn',
  BS: 'Battle-Scarred',
};

export function formatSom(amount) {
  const n = Number(amount || 0);
  return `${n.toLocaleString('uz-UZ')} swm`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 5-band: 1 kundan kam qolsa kun ko'rsatilmaydi (soat:daqiqa:soniya),
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
  ACTIVE: { label: 'Faol', color: '#3ECF8E' },
  AWAITING_PAYMENT: { label: 'To\'lov kutilmoqda', color: '#F5A623' },
  PAID: { label: 'To\'landi', color: '#4B69FF' },
  DELIVERED: { label: 'Yuborildi', color: '#3ECF8E' },
  PAYMENT_EXPIRED: { label: 'Muddati o\'tdi', color: '#FF5B5B' },
  CANCELLED: { label: 'Bekor qilindi', color: '#5B6274' },
  UNSOLD: { label: 'Sotilmadi', color: '#5B6274' },
};

export function formatCountdown(endsAtIso) {
  const diffMs = new Date(endsAtIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Tugadi';
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}soat ${m}daq`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `0:${String(s).padStart(2, '0')}`;
}

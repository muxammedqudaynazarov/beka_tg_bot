export const RARITY_META = {
    CONSUMER: {label: 'Ширпотреб', color: '#B0C3D9'},
    INDUSTRIAL: {label: 'Промышленное качество', color: '#5E98D9'},
    MILSPEC: {label: 'Армейское качество', color: '#4B69FF'},
    RESTRICTED: {label: 'Запрещенное', color: '#8847FF'},
    CLASSIFIED: {label: 'Засекреченное', color: '#D32CE6'},
    COVERT: {label: 'Тайное', color: '#EB4B4B'},
    GOLD: {label: 'Особо редкое (★)', color: '#FFD700'}, // Для ножей и перчаток
};

export const WEAR_LABELS = {
    FN: 'Прямо с завода',
    MW: 'Немного поношенное',
    FT: 'После полевых испытаний',
    WW: 'Поношенное',
    BS: 'Закаленное в боях',
};

export function formatSom(amount) {
    const n = Number(amount || 0);
    return `${n.toLocaleString('uz-UZ')} сум`;
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
    ACTIVE: {label: 'Автивно', color: '#3ECF8E'},
    AWAITING_PAYMENT: {label: 'Ожидание оплаты', color: '#F5A623'},
    PAID: {label: 'Оплачено', color: '#4B69FF'},
    DELIVERED: {label: 'Отправлено', color: '#3ECF8E'},
    PAYMENT_EXPIRED: {label: 'Срок закончено', color: '#FF5B5B'},
    CANCELLED: {label: 'Отменено', color: '#5B6274'},
    UNSOLD: {label: 'Не продано', color: '#5B6274'},
};

export function formatCountdown(endsAtIso) {
    const diffMs = new Date(endsAtIso).getTime() - Date.now();
    if (diffMs <= 0) return 'Закрытно';
    const totalSec = Math.floor(diffMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}soat ${m}daq`;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return `0:${String(s).padStart(2, '0')}`;
}

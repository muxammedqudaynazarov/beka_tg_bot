// Telegram Mini App SDK (index.html'dagi <script> orqali window.Telegram.WebApp
// sifatida yuklanadi). Bu yordamchi shu global obyektni xavfsiz o'rab beradi —
// brauzerda (Telegram tashqarisida) ochilganda ham ilova qulamasligi uchun.

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Ilovaning "night" dizayniga mos holda Telegram interfeys ranglarini ham moslashtiramiz
  tg.setHeaderColor('#0A0C10');
  tg.setBackgroundColor('#0A0C10');
}

export function getInitData() {
  return tg?.initData || '';
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

export function hapticImpact(style = 'light') {
  tg?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type = 'success') {
  tg?.HapticFeedback?.notificationOccurred(type);
}

export function showAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

export function openLink(url) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank');
}

export function isInsideTelegram() {
  return Boolean(tg && tg.initData);
}

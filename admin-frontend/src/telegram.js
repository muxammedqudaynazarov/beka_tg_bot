const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0F1115');
  tg.setBackgroundColor('#0F1115');
}
export function getInitData() {
  return tg?.initData || '';
}
export function showAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}
export function showConfirm(message) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) tg.showConfirm(message, (ok) => resolve(Boolean(ok)));
    else resolve(window.confirm(message));
  });
}

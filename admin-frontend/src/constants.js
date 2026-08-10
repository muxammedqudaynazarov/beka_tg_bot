export const RARITIES = [
  { v: 'CONSUMER', l: 'Белый (Ширпотреб)' },
  { v: 'INDUSTRIAL', l: 'Голубой (Промышленное качество)' },
  { v: 'MILSPEC', l: 'Синий (Армейское качество)' },
  { v: 'RESTRICTED', l: 'Фиолетовый (Запрещённое)' },
  { v: 'CLASSIFIED', l: 'Розовый (Засекреченное)' },
  { v: 'COVERT', l: 'Красный (Тайное)' },
  { v: 'GOLD', l: 'Золотой (★ Нож / Перчатки)' },
];
export const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];

// 9-band: shu "Тип"lardagi narsalarda format factory (float/wear) YO'Q —
// backend'dagi admin.routes.js'da bir xil ro'yxat bilan mos bo'lishi shart.
export const NO_FLOAT_TYPE_NAMES = ['Ключи', 'Стикеры', 'Брелки', 'Агенты', 'Граффити', 'Значки', 'Наборы музыки', 'Кейсы и Капсулы'];

export function formatSom(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

export const RARITIES = [
  { v: 'CONSUMER', l: 'Oq (Consumer)' },
  { v: 'INDUSTRIAL', l: "Ochiq ko'k (Industrial)" },
  { v: 'MILSPEC', l: "Ko'k (Mil-Spec)" },
  { v: 'RESTRICTED', l: 'Fiolet (Restricted)' },
  { v: 'CLASSIFIED', l: 'Pushti (Classified)' },
  { v: 'COVERT', l: 'Qizil (Covert)' },
  { v: 'GOLD', l: "Oltin (Pichoq/Qo'lqop)" },
];
export const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];

// 9-band: shu "Тип"lardagi narsalarda format factory (float/wear) YO'Q —
// backend'dagi admin.routes.js'da bir xil ro'yxat bilan mos bo'lishi shart.
export const NO_FLOAT_TYPE_NAMES = ['Ключи', 'Стикеры', 'Брелки', 'Агенты', 'Граффити', 'Значки', 'Наборы музыки', 'Кейсы и Капсулы'];

export function formatSom(n) {
  return `${Number(n || 0).toLocaleString('uz-UZ')} so'm`;
}

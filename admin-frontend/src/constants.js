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

export function formatSom(n) {
  return `${Number(n || 0).toLocaleString('uz-UZ')} so'm`;
}

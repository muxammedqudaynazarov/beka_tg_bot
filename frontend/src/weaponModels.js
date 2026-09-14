// Mavjud 3D model fayllar.
// Yangi .glb qo'shilganda shu yerga ham qo'shing.
export const WEAPON_MODELS = {
  'tec-9':         '/models/tec-9.glb',
  'tec9':          '/models/tec-9.glb',
  'ak-47':         '/models/ak-47.glb',
  'ak47':          '/models/ak-47.glb',
  'awp':           '/models/awp.glb',
  'desert eagle':  '/models/desert-eagle.glb',
  'deagle':        '/models/desert-eagle.glb',
  'm4a1-s':        '/models/m4a1-s.glb',
  'm4a1s':         '/models/m4a1-s.glb',
  'usp-s':         '/models/usp-s.glb',
  'usps':          '/models/usp-s.glb',
};

/** Skin nomidan model URL'ini qaytaradi, bo'lmasa null */
export function getWeaponModelUrl(skinName) {
  const lower = (skinName || '').toLowerCase();
  for (const [key, path] of Object.entries(WEAPON_MODELS)) {
    if (lower.includes(key)) return path;
  }
  return null;
}

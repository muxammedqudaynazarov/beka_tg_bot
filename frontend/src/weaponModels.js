// CS2 weapon modellari — Valve rasmiy OBJ+UV → GLB
// Yangi qurol qo'shish: frontend/public/models/ ga .glb joylashtiring
export const WEAPON_MODELS = {
  // Rifles
  'ak-47':         '/models/ak-47.glb',
  'ak47':          '/models/ak-47.glb',
  'aug':           '/models/aug.glb',
  'awp':           '/models/awp.glb',
  'famas':         '/models/famas.glb',
  'g3sg1':         '/models/g3sg1.glb',
  'galil ar':      '/models/galil_ar.glb',
  'galil':         '/models/galil_ar.glb',
  'm4a1-s':        '/models/m4a1-s.glb',
  'm4a1s':         '/models/m4a1-s.glb',
  'm4a4':          '/models/m4a4.glb',
  'scar-20':       '/models/scar-20.glb',
  'scar20':        '/models/scar-20.glb',
  'sg 553':        '/models/sg_553.glb',
  'sg553':         '/models/sg_553.glb',
  'ssg 08':        '/models/ssg_08.glb',
  'ssg08':         '/models/ssg_08.glb',
  // Pistols
  'cz75-auto':     '/models/cz_75.glb',
  'cz75':          '/models/cz_75.glb',
  'cz-75':         '/models/cz_75.glb',
  'desert eagle':  '/models/desert-eagle.glb',
  'deagle':        '/models/desert-eagle.glb',
  'dual berettas': '/models/dual_berettas.glb',
  'five-seven':    '/models/five-seven.glb',
  'glock-18':      '/models/glock-18.glb',
  'glock18':       '/models/glock-18.glb',
  'p2000':         '/models/p2000.glb',
  'p250':          '/models/p250.glb',
  'r8 revolver':   '/models/revolver.glb',
  'revolver':      '/models/revolver.glb',
  'tec-9':         '/models/tec-9.glb',
  'tec9':          '/models/tec-9.glb',
  'usp-s':         '/models/usp-s.glb',
  'usps':          '/models/usp-s.glb',
  // SMGs
  'bizon':         '/models/bizon.glb',
  'mac-10':        '/models/mac-10.glb',
  'mac10':         '/models/mac-10.glb',
  'mp5-sd':        '/models/mp5sd.glb',
  'mp5sd':         '/models/mp5sd.glb',
  'mp7':           '/models/mp7.glb',
  'mp9':           '/models/mp9.glb',
  'p90':           '/models/p90.glb',
  'ump-45':        '/models/ump-45.glb',
  'ump45':         '/models/ump-45.glb',
  // Heavy
  'm249':          '/models/m249.glb',
  'negev':         '/models/negev.glb',
  // Shotguns
  'mag-7':         '/models/mag-7.glb',
  'mag7':          '/models/mag-7.glb',
  'nova':          '/models/nova.glb',
  'sawed-off':     '/models/sawed-off.glb',
  'xm1014':        '/models/xm1014.glb',
};

/** Skin nomidan model URL'ini qaytaradi, bo'lmasa null */
export function getWeaponModelUrl(skinName) {
  const lower = (skinName || '').toLowerCase();
  for (const [key, path] of Object.entries(WEAPON_MODELS)) {
    if (lower.includes(key)) return path;
  }
  return null;
}

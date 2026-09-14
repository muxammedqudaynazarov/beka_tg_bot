// Mavjud 3D model fayllar ro'yxati.
// Yangi qurol .glb qo'shilganda bu yerga ham qo'shing.
export const WEAPON_MODELS = {
    'ak-47': '/models/ak-47.glb',
    'awp': '/models/awp.glb',
    'desert eagle': '/models/desert-eagle.glb',
    'm4a1-s': '/models/m4a1-s.glb',
    'tec-9': '/models/tec-9.glb',
    'tec9': '/models/tec-9.glb',
    'ups-s': '/models/usp-s.glb',
};

/** Skin nomidan model URL'ini qaytaradi, bo'lmasa null */
export function getWeaponModelUrl(skinName) {
    const lower = (skinName || '').toLowerCase();
    for (const [key, path] of Object.entries(WEAPON_MODELS)) {
        if (lower.includes(key)) return path;
    }
    return null;
}

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getWeaponModelUrl } from '../weaponModels';
import { api } from '../api';

// ─── CSFloat panel ────────────────────────────────────────────────────────
function SkinInfoPanel({ inspectLink, fallbackImageUrl }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!inspectLink) return;
    setLoading(true);
    api.get(`/cs2inspect?url=${encodeURIComponent(inspectLink)}`)
      .then(({ data: d }) => { setData(d?.iteminfo || null); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [inspectLink]);

  const info = data;
  const imgSrc = info?.imageurl || fallbackImageUrl;

  return (
    <div className="flex flex-col border-t border-white/10 bg-black/40"
      style={{ minHeight: 140 }}>

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          <span className="text-[11px] text-white/40">Загрузка данных...</span>
        </div>
      )}

      {!loading && (
        <div className="flex gap-3 px-3 py-3">
          {/* Exact skin render */}
          <div className="shrink-0 overflow-hidden rounded-xl bg-white/5"
            style={{ width: 110, height: 110 }}>
            {imgSrc && (
              <img src={imgSrc} alt="skin" className="h-full w-full object-contain p-1" />
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center gap-1.5 min-w-0">
            {info ? (<>
              <p className="text-xs font-bold text-white/90 truncate">{info.full_item_name || info.market_hash_name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {info.floatvalue != null && (
                  <div>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Float</p>
                    <p className="font-mono text-[12px] font-bold text-emerald-400">
                      {Number(info.floatvalue).toFixed(6)}
                    </p>
                  </div>
                )}
                {info.paintseed != null && (
                  <div>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Pattern</p>
                    <p className="font-mono text-[12px] font-bold text-sky-400">{info.paintseed}</p>
                  </div>
                )}
                {info.rarity_name && (
                  <div>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Редкость</p>
                    <p className="text-[11px] text-white/70">{info.rarity_name}</p>
                  </div>
                )}
              </div>
              {/* Sticker'lar */}
              {info.stickers?.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {info.stickers.map((s, i) => s?.imageurl ? (
                    <img key={i} src={s.imageurl} alt={s.name || ''} title={s.name || ''}
                      className="h-7 w-7 object-contain rounded bg-white/5" />
                  ) : null)}
                </div>
              )}
            </>) : err ? (
              <div>
                <p className="text-[11px] text-orange-400/80">Не удалось загрузить данные</p>
                <p className="text-[10px] text-white/30">Проверьте inspect-ссылку</p>
              </div>
            ) : !inspectLink ? (
              <div>
                <p className="text-[11px] text-white/50">Inspect-ссылка не указана</p>
                <p className="text-[10px] text-white/30">Добавьте её в аукционе</p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-white/40">Загрузка данных...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CSS 3D fallback ──────────────────────────────────────────────────────
function CssViewer({ imageUrl }) {
  const rotRef  = useRef(0);
  const prevRef = useRef(0);
  const autoRef = useRef(true);
  const rafRef  = useRef(null);
  const [rotY, setRotY]   = useState(0);
  const [drag, setDrag]   = useState(false);

  useEffect(() => {
    const tick = () => {
      if (autoRef.current) { rotRef.current += 0.35; setRotY(rotRef.current); }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const start = (x) => { setDrag(true); autoRef.current = false; prevRef.current = x; };
  const move  = (x) => {
    if (!drag) return;
    rotRef.current += (x - prevRef.current) * 0.5;
    setRotY(rotRef.current);
    prevRef.current = x;
  };
  const end   = () => { setDrag(false); setTimeout(() => { autoRef.current = true; }, 1500); };

  return (
    <div className="flex flex-1 items-center justify-center touch-none select-none"
      style={{ perspective: '900px', cursor: drag ? 'grabbing' : 'grab' }}
      onTouchStart={e => start(e.touches[0].clientX)}
      onTouchMove={e  => move(e.touches[0].clientX)}
      onTouchEnd={end}
      onMouseDown={e  => start(e.clientX)}
      onMouseMove={e  => e.buttons && move(e.clientX)}
      onMouseUp={end}
    >
      <img src={imageUrl} alt="" style={{
        width: 220, height: 220, objectFit: 'contain',
        transform: `rotateY(${rotY}deg)`,
        filter: 'drop-shadow(0 0 24px rgba(80,140,255,0.3))',
      }} />
    </div>
  );
}

// ─── Three.js GLTF viewer ─────────────────────────────────────────────────
function GltfViewer({ modelUrl, onFail, onLoad }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let cancelled = false, animId, renderer, controls;

    (async () => {
      try {
        const check = await fetch(modelUrl, { method: 'HEAD' }).catch(() => null);
        if (!check?.ok) throw new Error(`404: ${modelUrl}`);

        const THREE               = await import('three');
        const { GLTFLoader }      = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls }   = await import('three/examples/jsm/controls/OrbitControls.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (cancelled) return;

        const W = el.clientWidth || window.innerWidth;
        const H = el.clientHeight || 280;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping         = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.3;
        el.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, W / H, 0.001, 1000);
        camera.position.set(0, 0, 0.55);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping   = true;
        controls.dampingFactor   = 0.07;
        controls.autoRotate      = true;
        controls.autoRotateSpeed = 2;
        controls.enableZoom      = true;
        controls.minDistance     = 0.1;
        controls.maxDistance     = 2;

        scene.add(new THREE.AmbientLight(0xffffff, 1.8));
        const d1 = new THREE.DirectionalLight(0xffffff, 3);
        d1.position.set(2, 3, 3); scene.add(d1);
        scene.add(Object.assign(new THREE.DirectionalLight(0x8899ff, 1), { position: { set: () => {} } }));
        const d2 = new THREE.DirectionalLight(0x8899ff, 1);
        d2.position.set(-3, 0, 1); scene.add(d2);

        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        const gltf  = await new Promise((res, rej) => new GLTFLoader().load(modelUrl, res, undefined, rej));
        if (cancelled) return;

        const model = gltf.scene;
        const box   = new THREE.Box3().setFromObject(model);
        const size  = box.getSize(new THREE.Vector3());
        const scale = 0.38 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));
        model.traverse(c => {
          if (c.isMesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { m.envMapIntensity = 1.3; m.needsUpdate = true; });
          }
        });
        scene.add(model);
        onLoad?.();

        const animate = () => {
          if (cancelled) return;
          animId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
      } catch (err) {
        console.error('[GltfViewer]', err);
        if (!cancelled) onFail?.();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      controls?.dispose();
      if (renderer && el?.contains?.(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer?.dispose();
    };
  }, [modelUrl]);

  return <div ref={mountRef} className="h-full w-full touch-none" />;
}

// ─── Ana komponent ────────────────────────────────────────────────────────
export default function SkinViewer3D({ imageUrl, skinName, inspectLink, onClose }) {
  const modelUrl = getWeaponModelUrl(skinName);
  const [mode,    setMode]    = useState(modelUrl ? 'gltf' : 'css');
  const [loading, setLoading] = useState(!!modelUrl);

  useEffect(() => {
    if (mode !== 'gltf') return;
    const t = setTimeout(() => { setMode('css'); setLoading(false); }, 10000);
    return () => clearTimeout(t);
  }, [mode]);

  const useGltf = mode === 'gltf' && !!modelUrl;

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="mr-3 min-w-0">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          <p className={`text-[10px] ${useGltf ? 'text-emerald-400' : 'text-white/40'}`}>
            {useGltf ? (loading ? '● Загрузка модели...' : '● 3D модель') : '● Просмотр'}
          </p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* 3D viewer */}
      <div className="relative flex-1">
        {useGltf ? (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
              </div>
            )}
            <GltfViewer
              modelUrl={modelUrl}
              onFail={() => { setMode('css'); setLoading(false); }}
              onLoad={() => setLoading(false)}
            />
          </>
        ) : (
          <CssViewer imageUrl={imageUrl} />
        )}
      </div>

      {/* Hint */}
      <p className="py-1.5 text-center text-[10px] text-white/30">
        {useGltf ? 'Вращайте · Зумируйте' : 'Перетащите для вращения'}
      </p>

      {/* DEBUG — inspectLink qiymatini ko'rish uchun, ishlagach o'chiriladi */}
      <p className="px-3 pb-1 text-[9px] text-yellow-400/60 break-all">
        🔍 link: {inspectLink ? inspectLink.slice(0, 60) + '...' : 'NULL'}
      </p>

      {/* CSFloat skin info panel */}
      <SkinInfoPanel inspectLink={inspectLink} fallbackImageUrl={imageUrl} />
    </div>
  );
}

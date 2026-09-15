import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getWeaponModelUrl } from '../weaponModels';

// ─── CSS 3D (3D model yo'q bo'lganda) ────────────────────────────────────
function CssViewer({ imageUrl }) {
  const rotRef  = useRef(0);
  const prevRef = useRef(0);
  const autoRef = useRef(true);
  const rafRef  = useRef(null);
  const [rotY, setRotY] = useState(0);
  const [drag, setDrag] = useState(false);

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
  const end = () => { setDrag(false); setTimeout(() => { autoRef.current = true; }, 1500); };

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
        width: 240, height: 240, objectFit: 'contain',
        transform: `rotateY(${rotY}deg)`,
        filter: 'drop-shadow(0 0 28px rgba(80,140,255,0.3))',
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
        const THREE               = await import('three');
        const { GLTFLoader }      = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls }   = await import('three/examples/jsm/controls/OrbitControls.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (cancelled) return;

        const W = el.clientWidth  || window.innerWidth;
        const H = el.clientHeight || 400;

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
        controls.maxPolarAngle   = Math.PI * 0.8;

        // Yorug'lik
        scene.add(new THREE.AmbientLight(0xffffff, 1.8));
        const d1 = new THREE.DirectionalLight(0xffffff, 3);
        d1.position.set(2, 3, 3); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0x8899ff, 1);
        d2.position.set(-3, 0, 1); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xff8844, 0.5);
        d3.position.set(0, -2, -2); scene.add(d3);

        // Environment map
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        // Model yuklash
        const gltf = await new Promise((res, rej) =>
          new GLTFLoader().load(modelUrl, res, undefined, rej)
        );
        if (cancelled) return;

        const model = gltf.scene;
        const box   = new THREE.Box3().setFromObject(model);
        const size  = box.getSize(new THREE.Vector3());
        const scale = 0.38 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));

        // Modelning asl materiallarini saqlaymiz, faqat env map qo'shamiz
        model.traverse(c => {
          if (!c.isMesh) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => { if (m) { m.envMapIntensity = 1.3; m.needsUpdate = true; } });
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
        console.error('[GltfViewer] yuklanmadi:', err?.message || err);
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

// ─── Ana komponent ─────────────────────────────────────────────────────────
export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const modelUrl    = getWeaponModelUrl(skinName);
  const [mode,    setMode]    = useState(modelUrl ? 'gltf' : 'css');
  const [loading, setLoading] = useState(!!modelUrl);
  const timeoutRef  = useRef(null);

  useEffect(() => {
    if (mode !== 'gltf') return;
    // Model yuklanmasa 12 soniyadan keyin CSS ga o'tish
    timeoutRef.current = setTimeout(() => {
      setMode('css');
      setLoading(false);
    }, 12000);
    return () => clearTimeout(timeoutRef.current);
  }, [mode]);

  const handleLoad = () => {
    // Model muvaffaqiyatli yuklandi — timeoutni bekor qilamiz
    clearTimeout(timeoutRef.current);
    setLoading(false);
  };

  const useGltf = mode === 'gltf' && !!modelUrl;

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="mr-3 min-w-0">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          <p className={`text-[10px] ${useGltf ? 'text-emerald-400' : 'text-white/40'}`}>
            {useGltf
              ? (loading ? '● Загрузка...' : '● 3D модель')
              : '● Просмотр'}
          </p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Viewer */}
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
              onFail={() => { clearTimeout(timeoutRef.current); setMode('css'); setLoading(false); }}
              onLoad={handleLoad}
            />
          </>
        ) : (
          <CssViewer imageUrl={imageUrl} />
        )}
      </div>

      {/* Hint */}
      <p className="py-3 text-center text-[11px] text-white/30">
        {useGltf ? 'Вращайте · Зумируйте двумя пальцами' : 'Перетащите для вращения'}
      </p>
    </div>
  );
}

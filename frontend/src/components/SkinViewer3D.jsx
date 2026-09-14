import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getWeaponModelUrl } from '../weaponModels';

export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const modelUrl   = getWeaponModelUrl(skinName);
  const mountRef   = useRef(null);
  const [msg, setMsg] = useState('Загрузка 3D-модели...');
  const [failed, setFailed] = useState(false);
  // CSS 3D uchun
  const rotRef     = useRef(0);
  const prevXRef   = useRef(0);
  const autoRef    = useRef(true);
  const rafCssRef  = useRef(null);
  const [rotY, setRotY]     = useState(0);
  const [dragging, setDrag] = useState(false);

  // CSS auto-rotate (fallback uchun)
  useEffect(() => {
    if (!failed && modelUrl) return; // Three.js rejimida shart emas
    const tick = () => {
      if (autoRef.current) { rotRef.current += 0.4; setRotY(rotRef.current); }
      rafCssRef.current = requestAnimationFrame(tick);
    };
    rafCssRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafCssRef.current);
  }, [failed, modelUrl]);

  // Three.js GLTF rejimi
  useEffect(() => {
    if (!modelUrl || failed) return;
    const el = mountRef.current;
    if (!el) return;

    let animId, renderer, controls;
    let cancelled = false;

    (async () => {
      try {
        // 1. Avval fayl mavjudmi tekshiramiz
        setMsg('Проверка модели...');
        const check = await fetch(modelUrl, { method: 'HEAD' }).catch(() => null);
        if (!check || !check.ok) {
          throw new Error(`Model fayli topilmadi: ${modelUrl} (${check?.status ?? 'network error'})`);
        }

        setMsg('Загрузка Three.js...');
        const THREE             = await import('three');
        const { GLTFLoader }    = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
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

        // Yorug'lik
        scene.add(new THREE.AmbientLight(0xffffff, 1.8));
        const d1 = new THREE.DirectionalLight(0xffffff, 3);
        d1.position.set(2, 3, 3); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0x8899ff, 1);
        d2.position.set(-3, 0, 1); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xff8844, 0.5);
        d3.position.set(0, -2, -2); scene.add(d3);

        // Environment
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        // Skin teksturasini yuklash shart emas — Steam CDN rasmi 2D preview,
        // UV-mapped texture emas, shuning uchun modelga qo'llash noto'g'ri ko'rinadi.
        // Modelning asl materiallari to'g'ri va chiroyli ko'rinadi.

        // GLTF yuklash
        setMsg('Загрузка модели...');
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

        // Asl materiallarni saqlab, faqat muhit xaritasini qo'shamiz
        model.traverse(child => {
          if (!child.isMesh) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            if (!m) return;
            m.envMapIntensity = 1.3;
            m.needsUpdate     = true;
          });
        });

        scene.add(model);
        setMsg('');   // yuk tugadi — xabar yo'q

        const animate = () => {
          if (cancelled) return;
          animId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

      } catch (err) {
        console.error('[SkinViewer3D]', err);
        if (!cancelled) {
          setMsg('');
          setFailed(true); // CSS viewer ga o'tamiz
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      controls?.dispose();
      if (renderer && el?.contains?.(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer?.dispose();
    };
  }, [modelUrl, imageUrl, failed]);

  // CSS drag handlers
  const startDrag = (x) => { setDrag(true); autoRef.current = false; prevXRef.current = x; };
  const moveDrag  = (x) => {
    if (!dragging) return;
    rotRef.current += (x - prevXRef.current) * 0.5;
    setRotY(rotRef.current);
    prevXRef.current = x;
  };
  const endDrag   = () => {
    setDrag(false);
    setTimeout(() => { autoRef.current = true; }, 1500);
  };

  const useGltf = modelUrl && !failed;

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="mr-3 min-w-0">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          <p className={`text-[10px] ${useGltf ? 'text-emerald-400' : 'text-white/40'}`}>
            {useGltf ? (msg || '● 3D модель') : '● Просмотр'}
          </p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Viewer */}
      {useGltf ? (
        /* Three.js canvas */
        <div className="relative flex-1">
          {msg && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              <p className="text-[11px] text-white/50">{msg}</p>
            </div>
          )}
          <div ref={mountRef} className="h-full w-full touch-none" />
          {/* Skin ko'rinishi — pastki chap burchakda */}
          {!msg && (
            <div className="absolute bottom-3 left-3 overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur"
              style={{ width: 68, height: 68 }}>
              <img src={imageUrl} alt="skin" className="h-full w-full object-contain p-1 opacity-90" />
            </div>
          )}
        </div>
      ) : (
        /* CSS 3D fallback */
        <div
          className="flex flex-1 items-center justify-center overflow-hidden touch-none select-none"
          style={{ perspective: '900px', cursor: dragging ? 'grabbing' : 'grab' }}
          onTouchStart={e => startDrag(e.touches[0].clientX)}
          onTouchMove={e  => moveDrag(e.touches[0].clientX)}
          onTouchEnd={endDrag}
          onMouseDown={e  => startDrag(e.clientX)}
          onMouseMove={e  => e.buttons && moveDrag(e.clientX)}
          onMouseUp={endDrag}
        >
          <img
            src={imageUrl} alt={skinName}
            style={{
              width: 240, height: 240, objectFit: 'contain',
              transform: `rotateY(${rotY}deg)`,
              filter: 'drop-shadow(0 0 24px rgba(80,140,255,0.3))',
            }}
          />
        </div>
      )}

      {/* Hint */}
      <div className="pb-5 text-center">
        <p className="text-[11px] text-white/35">
          {useGltf
            ? 'Вращайте · Зумируйте двумя пальцами'
            : 'Перетащите для вращения'}
        </p>
      </div>
    </div>
  );
}

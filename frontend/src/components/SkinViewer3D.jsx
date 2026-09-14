import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

// Qurol nomi → model fayli xaritasi
const WEAPON_MODELS = {
  'tec-9': 'tec-9.glb',
  'tec9':  'tec-9.glb',
};

function getModelUrl(skinName) {
  const lower = (skinName || '').toLowerCase();
  for (const [key, file] of Object.entries(WEAPON_MODELS)) {
    if (lower.includes(key)) return `/models/${file}`; // frontend static, CORS yo'q
  }
  return null;
}

// ─── CSS 3D viewer (fallback) ─────────────────────────────────────────────
function CssViewer({ imageUrl }) {
  const [rotY, setRotY] = useState(-15);
  const r    = useRef({ y: -15, auto: true, px: 0 });
  const raf  = useRef(null);
  const vel  = useRef(0);

  useEffect(() => {
    const tick = () => {
      if (r.current.auto) {
        r.current.y += 0.4;
        setRotY(r.current.y);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const onStart = (x) => { r.current.auto = false; r.current.px = x; vel.current = 0; };
  const onMove  = (x) => {
    const dx = x - r.current.px;
    vel.current = dx;
    r.current.y += dx * 0.5;
    setRotY(r.current.y);
    r.current.px = x;
  };
  const onEnd   = () => {
    const glide = () => {
      vel.current *= 0.93;
      if (Math.abs(vel.current) > 0.3) {
        r.current.y += vel.current * 0.5;
        setRotY(r.current.y);
        requestAnimationFrame(glide);
      } else {
        setTimeout(() => { r.current.auto = true; }, 1200);
      }
    };
    requestAnimationFrame(glide);
  };

  return (
    <div
      className="flex flex-1 items-center justify-center overflow-hidden touch-none select-none"
      style={{ perspective: '900px', cursor: 'grab' }}
      onTouchStart={e => onStart(e.touches[0].clientX)}
      onTouchMove={e  => onMove(e.touches[0].clientX)}
      onTouchEnd={onEnd}
      onMouseDown={e  => onStart(e.clientX)}
      onMouseMove={e  => e.buttons && onMove(e.clientX)}
      onMouseUp={onEnd}
    >
      <div style={{ transform: `rotateY(${rotY}deg)`, transition: 'none' }}>
        <img
          src={imageUrl}
          alt=""
          style={{
            width: 240, height: 240, objectFit: 'contain',
            filter: 'drop-shadow(0 0 28px rgba(80,140,255,0.35)) drop-shadow(0 0 8px rgba(255,255,255,0.12))',
          }}
        />
      </div>
    </div>
  );
}

// ─── Three.js GLTF viewer ─────────────────────────────────────────────────
function GltfViewer({ imageUrl, modelUrl, onFail, onLoad }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let animId, renderer, controls;

    (async () => {
      try {
        const THREE           = await import('three');
        const { GLTFLoader }  = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');

        const W = el.clientWidth  || window.innerWidth;
        const H = el.clientHeight || window.innerHeight - 110;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        el.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 1000);
        camera.position.set(0, 0.05, 0.5);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping   = true;
        controls.dampingFactor   = 0.08;
        controls.autoRotate      = true;
        controls.autoRotateSpeed = 2.5;
        controls.enableZoom      = true;
        controls.minDistance     = 0.1;
        controls.maxDistance     = 2;

        // Yorug'lik
        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const key  = new THREE.DirectionalLight(0xffffff, 3);
        key.position.set(2, 3, 3); scene.add(key);
        const fill = new THREE.DirectionalLight(0x6699ff, 1);
        fill.position.set(-2, 0, 1); scene.add(fill);
        const rim  = new THREE.DirectionalLight(0xff8844, 0.6);
        rim.position.set(0, -2, -2); scene.add(rim);

        // RoomEnvironment
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        // Skin teksturasi (canvas orqali — CORS muammosini hal qiladi)
        const skinTex = await new Promise((res) => {
          const img    = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 512;
            canvas.height= img.naturalHeight || 512;
            canvas.getContext('2d').drawImage(img, 0, 0);
            const t = new THREE.CanvasTexture(canvas);
            t.flipY = false;
            t.colorSpace = THREE.SRGBColorSpace;
            res(t);
          };
          img.onerror = () => res(null);
          img.src = imageUrl;
        });

        // Model yuklash
        const gltf = await new Promise((res, rej) => {
          new GLTFLoader().load(modelUrl, res, undefined, rej);
        });

        const model = gltf.scene;
        const box   = new THREE.Box3().setFromObject(model);
        const size  = box.getSize(new THREE.Vector3());
        const scale = 0.35 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));

        model.traverse((child) => {
          if (!child.isMesh) return;
          const orig = child.material;
          child.material = new THREE.MeshStandardMaterial({
            map:             skinTex || orig?.map || null,
            normalMap:       orig?.normalMap || null,
            roughness:       0.3,
            metalness:       0.6,
            envMapIntensity: 1.5,
          });
        });
        scene.add(model);
        onLoad?.();

        const animate = () => {
          animId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

      } catch (err) {
        console.error('[SkinViewer3D] GLTF error:', err);
        onFail();
      }
    })();

    return () => {
      cancelAnimationFrame(animId);
      controls?.dispose();
      if (renderer && el?.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer?.dispose();
    };
  }, [modelUrl, imageUrl, onFail]);

  return <div ref={mountRef} className="h-full w-full touch-none" />;
}

// ─── Ana komponent ────────────────────────────────────────────────────────
export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const modelUrl = getModelUrl(skinName);
  const [mode, setMode] = useState(modelUrl ? 'gltf' : 'css');
  const [loading, setLoading] = useState(!!modelUrl);

  const handleFail = useCallback(() => {
    setMode('css');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'gltf') {
      // 8 soniyadan keyin yuklanmasa fallback
      const t = setTimeout(() => { setMode('css'); setLoading(false); }, 8000);
      return () => clearTimeout(t);
    }
  }, [mode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="mr-3 min-w-0">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          <p className={`text-[10px] ${mode === 'gltf' ? 'text-emerald-400' : 'text-white/40'}`}>
            {mode === 'gltf' ? '● 3D модель' : '● Просмотр'}
          </p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Viewer */}
      {mode === 'gltf' && modelUrl ? (
        <div className="relative flex-1">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            </div>
          )}
          <GltfViewer
            imageUrl={imageUrl}
            modelUrl={modelUrl}
            onFail={handleFail}
            onLoad={() => setLoading(false)}
          />
        </div>
      ) : (
        <CssViewer imageUrl={imageUrl} />
      )}

      {/* Hint */}
      <div className="pb-5 text-center">
        <p className="text-[11px] text-white/35">
          {mode === 'gltf'
            ? 'Вращайте · Зумируйте двумя пальцами'
            : 'Перетащите для вращения'}
        </p>
      </div>
    </div>
  );
}

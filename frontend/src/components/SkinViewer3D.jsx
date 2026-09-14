import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Qurol nomi → model fayli
const WEAPON_MODELS = {
  'tec-9': 'tec-9.glb',
  'tec9':  'tec-9.glb',
};

function getModelUrl(skinName, base) {
  const lower = (skinName || '').toLowerCase();
  for (const [key, file] of Object.entries(WEAPON_MODELS)) {
    if (lower.includes(key)) return `${base}/models/${file}`;
  }
  return null;
}

export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const mountRef  = useRef(null);
  const [status, setStatus] = useState('loading');

  const base     = (import.meta.env.VITE_API_URL || '').replace('/api', '');
  const modelUrl = getModelUrl(skinName, base);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let animId, renderer, controls;

    // Three.js ni lazy import qilamiz — asosiy bundle kichik qoladi
    import('three').then(async (THREE) => {
      const { GLTFLoader }    = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');

      const W = el.clientWidth  || window.innerWidth;
      const H = el.clientHeight || window.innerHeight - 110;

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      el.appendChild(renderer.domElement);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
      camera.position.set(0, 0.05, 0.5);

      // OrbitControls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping   = true;
      controls.dampingFactor   = 0.08;
      controls.autoRotate      = true;
      controls.autoRotateSpeed = 2.5;
      controls.enableZoom      = true;
      controls.minDistance     = 0.15;
      controls.maxDistance     = 1.5;
      controls.maxPolarAngle   = Math.PI * 0.75;

      // Yorug'liklar
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(1, 2, 2); key.castShadow = true;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x4488ff, 0.8);
      fill.position.set(-2, 0, 1); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xff8844, 0.5);
      rim.position.set(0, -1, -2); scene.add(rim);

      // Environment (RoomEnvironment to'g'ri import)
      const pmremGen = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGen.fromScene(new RoomEnvironment(), 0.04).texture;

      const animate = () => {
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };

      if (modelUrl) {
        // GLTF model
        const texLoader = new THREE.TextureLoader();
        texLoader.crossOrigin = 'anonymous';
        const skinTex = texLoader.load(imageUrl);
        skinTex.flipY = false;
        skinTex.colorSpace = THREE.SRGBColorSpace;

        const loader = new GLTFLoader();
        loader.load(modelUrl, (gltf) => {
          const model = gltf.scene;
          const box    = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size   = box.getSize(new THREE.Vector3());
          const scale  = 0.35 / Math.max(size.x, size.y, size.z);
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));

          model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            const orig = child.material;
            child.material = new THREE.MeshStandardMaterial({
              map:             skinTex,
              normalMap:       orig?.normalMap || null,
              roughness:       orig?.roughness  ?? 0.35,
              metalness:       orig?.metalness  ?? 0.7,
              envMapIntensity: 1.2,
            });
          });
          scene.add(model);
          setStatus('model');
          animate();
        }, undefined, () => {
          setStatus('fallback');
          loadFallback(THREE, scene, camera);
          animate();
        });
      } else {
        setStatus('fallback');
        loadFallback(THREE, scene, camera);
        animate();
      }
    });

    function loadFallback(THREE, scene, camera) {
      const texLoader = new THREE.TextureLoader();
      texLoader.crossOrigin = 'anonymous';
      texLoader.load(imageUrl, (tex) => {
        const geo  = new THREE.PlaneGeometry(0.6, 0.6);
        const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        scene.add(new THREE.Mesh(geo, mat));
        camera.position.set(0, 0, 1);
      });
    }

    return () => {
      cancelAnimationFrame(animId);
      controls?.dispose();
      if (renderer && el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer?.dispose();
    };
  }, [imageUrl, modelUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="mr-3 min-w-0">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          <p className={`text-[10px] ${
            status === 'model'    ? 'text-emerald-400' :
            status === 'fallback' ? 'text-yellow-400/70' : 'text-white/40'
          }`}>
            {status === 'model'    ? '● 3D модель' :
             status === 'fallback' ? '● Нет 3D-модели' : '● Загрузка...'}
          </p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Canvas */}
      <div ref={mountRef} className="flex-1 touch-none" />

      {/* Hint */}
      <div className="pb-5 text-center">
        {status === 'loading' && (
          <div className="mb-2 flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          </div>
        )}
        <p className="text-[11px] text-white/35">
          {status === 'model'
            ? 'Вращайте · Зумируйте двумя пальцами'
            : status === 'fallback'
            ? '3D-модель этого оружия пока не добавлена'
            : 'Загрузка 3D-модели...'}
        </p>
      </div>
    </div>
  );
}

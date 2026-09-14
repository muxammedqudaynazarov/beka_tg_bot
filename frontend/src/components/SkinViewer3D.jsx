import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Qurol nomi → model fayli
const WEAPON_MODELS = {
  'tec-9': 'tec-9.glb',
  'tec9': 'tec-9.glb',
};

function getModelUrl(skinName, backendUrl) {
  if (!skinName) return null;
  const lower = skinName.toLowerCase();
  for (const [key, file] of Object.entries(WEAPON_MODELS)) {
    if (lower.includes(key)) {
      return `${backendUrl}/models/${file}`;
    }
  }
  return null;
}

export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | model | fallback | error

  const backendUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
  const modelUrl = getModelUrl(skinName, backendUrl);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || (window.innerHeight - 110);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = null;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    camera.position.set(0, 0.05, 0.5);

    // Orbit Controls — touch va mouse drag
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.5;
    controls.enableZoom = true;
    controls.minDistance = 0.2;
    controls.maxDistance = 1.5;
    controls.maxPolarAngle = Math.PI * 0.75;

    // Yorug'lik
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(1, 2, 2);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x4488ff, 0.8);
    fill.position.set(-2, 0, 1);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff8844, 0.5);
    rim.position.set(0, -1, -2);
    scene.add(rim);

    // Yer sathi (glow effect)
    const groundGeo = new THREE.PlaneGeometry(2, 2);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    scene.add(ground);

    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    if (modelUrl) {
      // ── GLTF model rejimi ──
      setStatus('loading');
      const loader = new GLTFLoader();

      // Skin teksturasini yuklash (Steam CDN)
      const texLoader = new THREE.TextureLoader();
      texLoader.crossOrigin = 'anonymous';
      const skinTex = texLoader.load(imageUrl);
      skinTex.flipY = false;
      skinTex.colorSpace = THREE.SRGBColorSpace;

      loader.load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;

          // Modelni markazlashtirish va o'lchamini sozlash
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 0.35 / maxDim;
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));

          // Har bir meshga skin teksturasini qo'llamiz
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Asl material xususiyatlarini saqlab, teksturani almashtiramiz
              const origMat = child.material;
              const mat = new THREE.MeshStandardMaterial({
                map: skinTex,
                normalMap: origMat?.normalMap || null,
                roughness: origMat?.roughness ?? 0.35,
                metalness: origMat?.metalness ?? 0.7,
                envMapIntensity: 1.2,
              });
              child.material = mat;
            }
          });

          // Environment map (ortoq aks ettirish uchun)
          const pmremGen = new THREE.PMREMGenerator(renderer);
          const envTex = pmremGen.fromScene(
            new THREE.RoomEnvironment(), 0.04
          ).texture;
          scene.environment = envTex;

          scene.add(model);
          setStatus('model');
          animate();
        },
        undefined,
        (err) => {
          console.error('GLTF load error:', err);
          setStatus('error');
          loadFallback();
        }
      );
    } else {
      // ── Fallback: CSS 3D rotating image ──
      setStatus('fallback');
      loadFallback();
    }

    function loadFallback() {
      // Tekis plane bilan rasm ko'rsatamiz
      const texLoader = new THREE.TextureLoader();
      texLoader.crossOrigin = 'anonymous';
      const tex = texLoader.load(imageUrl, () => {
        setStatus('fallback');
        const geo = new THREE.PlaneGeometry(0.6, 0.6);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        camera.position.set(0, 0, 1);
        controls.autoRotate = true;
        animate();
      });
    }

    return () => {
      cancelAnimationFrame(animId);
      controls.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [imageUrl, modelUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #0a1628 0%, #000 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 mr-3">
          <p className="truncate font-display text-sm font-bold text-white/90">{skinName}</p>
          {status === 'model' && (
            <p className="text-[10px] text-emerald-400">● 3D модель загружена</p>
          )}
          {status === 'fallback' && (
            <p className="text-[10px] text-yellow-400/70">● 3D модель недоступна</p>
          )}
          {status === 'loading' && (
            <p className="text-[10px] text-white/40">● Загрузка...</p>
          )}
        </div>
        <button onClick={onClose}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Canvas */}
      <div ref={mountRef} className="flex-1 touch-none" />

      {/* Hint */}
      <div className="pb-5 text-center">
        {status === 'loading' && (
          <div className="flex justify-center mb-2">
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

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const mountRef = useRef(null);
  const stateRef = useRef({
    rotY: 0, rotX: 0, targetY: 0, targetX: 0,
    isDragging: false, prevX: 0, prevY: 0, autoRotate: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || (window.innerHeight - 120);

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.z = 2.4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Texture
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    const tex = loader.load(imageUrl, () => setLoaded(true));
    tex.minFilter = THREE.LinearFilter;

    // Main skin plane
    const geo = new THREE.PlaneGeometry(2.8, 2.8, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.3,
      metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Faqat yuz ko'rinadiganda orqa tomonni biroz qoraytirish uchun back plane
    const backMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, metalness: 0 });
    const backMesh = new THREE.Mesh(geo.clone(), backMat);
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -0.002;
    scene.add(backMesh);

    // Yorug'lik
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 2, 3);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    rimLight.position.set(-3, -1, -2);
    scene.add(rimLight);

    // Pastdagi reflection plane
    const refGeo = new THREE.PlaneGeometry(2.8, 0.6);
    const refTex = tex.clone();
    refTex.needsUpdate = true;
    const refMat = new THREE.MeshBasicMaterial({
      map: refTex, transparent: true, opacity: 0.18,
    });
    const refMesh = new THREE.Mesh(refGeo, refMat);
    refMesh.rotation.x = Math.PI;
    refMesh.position.y = -1.45;
    refMesh.position.z = -0.01;
    scene.add(refMesh);

    // Touch + mouse drag
    const s = stateRef.current;

    const onStart = (x, y) => {
      s.isDragging = true; s.autoRotate = false;
      s.prevX = x; s.prevY = y;
    };
    const onMove = (x, y) => {
      if (!s.isDragging) return;
      s.targetY += (x - s.prevX) * 0.012;
      s.targetX += (y - s.prevY) * 0.008;
      s.targetX = Math.max(-0.7, Math.min(0.7, s.targetX));
      s.prevX = x; s.prevY = y;
    };
    const onEnd = () => {
      s.isDragging = false;
      setTimeout(() => { s.autoRotate = true; }, 2000);
    };

    el.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
    el.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    el.addEventListener('mouseup', onEnd);

    // Animatsiya
    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (s.autoRotate) s.targetY += 0.006;
      // Silliq interpolatsiya
      s.rotY += (s.targetY - s.rotY) * 0.08;
      s.rotX += (s.targetX - s.rotX) * 0.08;
      mesh.rotation.y = s.rotY;
      mesh.rotation.x = s.rotX;
      backMesh.rotation.y = Math.PI + s.rotY;
      backMesh.rotation.x = s.rotX;
      refMesh.rotation.y = s.rotY;
      // Dirlight yorug'lik burchagi o'zgaradi
      dirLight.position.x = Math.sin(s.rotY) * 3;
      dirLight.position.z = Math.cos(s.rotY) * 3;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('mousedown', onStart);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseup', onEnd);
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer.dispose();
      mat.dispose(); tex.dispose();
    };
  }, [imageUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at center, #0d1a2e 0%, #000 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-display text-sm font-bold text-white">{skinName}</p>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
        >
          ✕
        </button>
      </div>

      {/* Three.js canvas */}
      <div ref={mountRef} className="flex-1 touch-none select-none" />

      {/* Hint */}
      <div className="pb-6 text-center">
        {!loaded && (
          <div className="mb-3 flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
        <p className="text-[11px] text-white/40">Перетащите пальцем для вращения</p>
      </div>
    </div>
  );
}

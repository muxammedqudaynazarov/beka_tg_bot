import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * CSS 3D transform asosidagi skin viewer.
 * Three.js WebGL emas — shuning uchun CORS muammosi yo'q,
 * Steam CDN rasmlari to'g'ridan-to'g'ri yuklanadi.
 */
export default function SkinViewer3D({ imageUrl, skinName, onClose }) {
  const [rotY, setRotY] = useState(-15);
  const [rotX, setRotX] = useState(8);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prev = useRef({ x: 0, y: 0 });
  const vel  = useRef({ y: 0 });     // inertia
  const raf  = useRef(null);
  const rotRef = useRef({ y: -15, x: 8 });
  const autoRef = useRef(true);

  // Auto-rotate animatsiya
  useEffect(() => {
    const tick = () => {
      if (autoRef.current) {
        rotRef.current.y += 0.4;
        setRotY(rotRef.current.y);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const startDrag = (x, y) => {
    autoRef.current = false;
    setDragging(true);
    prev.current = { x, y };
    vel.current.y = 0;
  };
  const moveDrag = (x, y) => {
    if (!dragging) return;
    const dx = x - prev.current.x;
    const dy = y - prev.current.y;
    vel.current.y = dx;
    rotRef.current.y += dx * 0.5;
    rotRef.current.x = Math.max(-35, Math.min(35, rotRef.current.x + dy * 0.3));
    setRotY(rotRef.current.y);
    setRotX(rotRef.current.x);
    prev.current = { x, y };
  };
  const endDrag = () => {
    setDragging(false);
    // Inertia
    const coast = () => {
      vel.current.y *= 0.92;
      if (Math.abs(vel.current.y) > 0.2) {
        rotRef.current.y += vel.current.y * 0.5;
        setRotY(rotRef.current.y);
        requestAnimationFrame(coast);
      } else {
        // Auto-rotate'ni 1.5 soniyada qayta yoqamiz
        setTimeout(() => { autoRef.current = true; }, 1500);
      }
    };
    requestAnimationFrame(coast);
  };

  const shimmer = `linear-gradient(
    ${rotY % 360 > 180 ? '135deg' : '315deg'},
    rgba(255,255,255,0.0) 0%,
    rgba(255,255,255,${0.06 + Math.abs(Math.sin(rotRef.current.y * 0.017)) * 0.09}) 50%,
    rgba(255,255,255,0.0) 100%
  )`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0b1829 0%, #000 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-display text-sm font-bold text-white/90 truncate mr-3">{skinName}</p>
        <button
          onClick={onClose}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* 3D область */}
      <div
        className="flex-1 flex items-center justify-center select-none overflow-hidden"
        style={{ perspective: '900px', perspectiveOrigin: '50% 50%', cursor: dragging ? 'grabbing' : 'grab' }}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endDrag}
        onMouseDown={e => startDrag(e.clientX, e.clientY)}
        onMouseMove={e => dragging && moveDrag(e.clientX, e.clientY)}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {/* Yer sathi glow */}
        <div
          className="absolute"
          style={{
            bottom: '15%', left: '50%', transform: 'translateX(-50%)',
            width: 220, height: 40,
            background: 'radial-gradient(ellipse, rgba(80,140,255,0.15) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />

        {/* 3D kont */}
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotY}deg) rotateX(${-rotX}deg)`,
            transition: dragging ? 'none' : 'transform 0.05s linear',
            width: 240, height: 240,
            position: 'relative',
          }}
        >
          {/* Rasm */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            </div>
          )}
          <img
            src={imageUrl}
            alt={skinName}
            onLoad={() => setLoaded(true)}
            style={{
              width: '100%', height: '100%',
              objectFit: 'contain',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.4s ease',
              filter: `drop-shadow(0 0 32px rgba(80,140,255,0.4)) drop-shadow(0 0 8px rgba(255,255,255,0.15))`,
            }}
          />
          {/* Shimmer overlay */}
          {loaded && (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: shimmer,
                pointerEvents: 'none',
                mixBlendMode: 'screen',
              }}
            />
          )}
        </div>

        {/* Reflection */}
        {loaded && (
          <div
            style={{
              position: 'absolute',
              bottom: '13%', left: '50%',
              transform: `translateX(-50%) rotateX(180deg) rotateY(${rotY}deg)`,
              width: 200, height: 60,
              overflow: 'hidden',
              opacity: 0.2,
              maskImage: 'linear-gradient(to bottom, black, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
            }}
          >
            <img src={imageUrl} alt="" style={{ width: '100%', height: '200px', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="pb-6 text-center">
        <p className="text-[11px] text-white/35">
          {loaded ? 'Перетащите для вращения' : 'Загрузка...'}
        </p>
      </div>
    </div>
  );
}

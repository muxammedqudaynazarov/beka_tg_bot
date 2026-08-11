import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import splashVideo from '../assets/splash.mp4';
import logo from '../assets/logo.jpg';

/**
 * Ilova ochilganda ko'rsatiladigan videoli splash-ekran. Video kamida bir
 * marta to'liq ijro etiladi (o'zining tabiiy davomiyligi — taxminan 5
 * soniya). Agar shu vaqt ichida kontent (auth) hali tayyor bo'lmasa, video
 * qaytadan aylanadi (loop), kontent tayyor bo'lgandagina yakunlanadi.
 *
 * OVOZ HAQIDA: mobil brauzerlar/WebView'lar ovozli videoni AVTOMATIK ijro
 * etishni ko'pincha bloklaydi (bu — platformaning o'zining xavfsizlik
 * siyosati, bizning kodimizga bog'liq emas). Shuning uchun: avval ovoz
 * BILAN ijro qilishga harakat qilamiz; agar brauzer buni rad etsa,
 * avtomatik ravishda OVOZSIZ rejimga o'tamiz va foydalanuvchiga bitta
 * bosish bilan ovozni yoqish imkonini beruvchi kichik tugma ko'rsatamiz.
 */
export default function SplashScreen({ ready, onDone }) {
  const videoRef = useRef(null);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        // Ovoz bilan avtomatik ijro bloklandi — ovozsiz davom ettiramiz
        video.muted = true;
        setNeedsSoundTap(true);
        video.play().catch(() => setVideoFailed(true));
      });
    }
  }, []);

  function finishAndExit() {
    setExiting(true);
    setTimeout(onDone, 500);
  }

  function handleEnded() {
    if (readyRef.current) {
      finishAndExit();
    } else {
      // Kontent hali tayyor emas — videoni yana boshidan aylantiramiz
      const video = videoRef.current;
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }

  function enableSound() {
    const video = videoRef.current;
    video.muted = false;
    video.play().catch(() => {});
    setNeedsSoundTap(false);
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0c10] ${exiting ? 'animate-splash-exit' : ''}`}
    >
      {!videoFailed ? (
        <>
          <video
            ref={videoRef}
            src={splashVideo}
            onEnded={handleEnded}
            onError={() => setVideoFailed(true)}
            playsInline
            className="max-h-[70vh] w-full max-w-sm object-contain"
          />
          {needsSoundTap && (
            <button
              onClick={enableSound}
              className="mt-6 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur"
            >
              <Volume2 size={14} /> Нажмите, чтобы включить звук
            </button>
          )}
        </>
      ) : (
        // Video biror sababdan yuklanmasa/ijro bo'lmasa — statik logotip +
        // CSS animatsiyasiga qaytamiz, foydalanuvchi bo'sh ekran ko'rmasin.
        <div className="relative flex items-center justify-center">
          <span className="absolute h-40 w-40 rounded-full border-2 border-rarity-covert animate-splash-shockwave" />
          <span className="absolute h-56 w-56 rounded-full bg-rarity-covert/20 blur-3xl animate-splash-glow" />
          <img src={logo} alt="CS2 Skins Auction" className="relative h-40 w-40 rounded-2xl object-cover animate-splash-logo" />
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import logo from '../assets/logo.jpg';

const MIN_DURATION_MS = 3000;

/**
 * Ilova ochilganda ko'rsatiladigan animatsion splash-ekran. Kamida
 * MIN_DURATION_MS (3 soniya) turadi, lekin agar kontent (auth/profil)
 * shundan uzoqroq yuklansa — kontent tayyor bo'lguncha davom etadi (hech
 * qachon bo'sh/tugallanmagan ilovani ko'rsatib qo'ymaslik uchun).
 *
 * `ready` — tashqi kontent (masalan autentifikatsiya) tugaganda true bo'ladi.
 * `onDone` — splash butunlay yashiringandan keyin (chiqish animatsiyasi
 * ham tugagach) chaqiriladi.
 */
export default function SplashScreen({ ready, onDone }) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && minElapsed && !exiting) {
      setExiting(true);
      const t = setTimeout(onDone, 550); // chiqish animatsiyasi (0.5s) tugashini kutamiz
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minElapsed]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0c10] ${exiting ? 'animate-splash-exit' : ''}`}
    >
      <div className="relative flex items-center justify-center">
        {/* Bolg'a zarbasi to'lqinlari — bir-biridan kechikib boshlanadigan uchta halqa */}
        <span className="absolute h-40 w-40 rounded-full border-2 border-rarity-covert animate-splash-shockwave" style={{ animationDelay: '0s' }} />
        <span className="absolute h-40 w-40 rounded-full border-2 border-rarity-covert animate-splash-shockwave" style={{ animationDelay: '0.65s' }} />
        <span className="absolute h-40 w-40 rounded-full border-2 border-rarity-covert animate-splash-shockwave" style={{ animationDelay: '1.3s' }} />

        {/* Orqa fondagi sekin nafas oluvchi nurlanish */}
        <span className="absolute h-56 w-56 rounded-full bg-rarity-covert/20 blur-3xl animate-splash-glow" />

        {/* 5-band: rasm endi AYLANA (rounded-full) shaklda — effektlarga mos tushishi uchun */}
        <img
          src={logo}
          alt="CS2 Skins Auction"
          className="relative h-40 w-40 rounded-full object-cover shadow-[0_0_40px_rgba(235,75,75,0.35)] animate-splash-logo"
        />
      </div>

      <div className="mt-10 flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rarity-covert animate-splash-dot" style={{ animationDelay: '0s' }} />
        <span className="h-2 w-2 rounded-full bg-rarity-covert animate-splash-dot" style={{ animationDelay: '0.15s' }} />
        <span className="h-2 w-2 rounded-full bg-rarity-covert animate-splash-dot" style={{ animationDelay: '0.3s' }} />
      </div>
    </div>
  );
}

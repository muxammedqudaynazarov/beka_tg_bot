import { NavLink } from 'react-router-dom';
import { Home, SlidersHorizontal, Wallet, User, Dices } from 'lucide-react';

const SIDE_ITEMS_LEFT = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/filter', label: 'Фильтр', icon: SlidersHorizontal },
];
const SIDE_ITEMS_RIGHT = [
  { to: '/payment', label: 'Платежи', icon: Wallet },
  { to: '/profile', label: 'Профиль', icon: User },
];

function SideLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
          isActive ? 'text-rarity-covert' : 'text-ink-muted'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
          {label}
        </>
      )}
    </NavLink>
  );
}

// 3-band: "Барабан" — pastki menyuning MARKAZIDA, alohida ajralib
// turadigan (ko'tarilgan, aylana) tugma sifatida.
export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-base-border bg-base-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {SIDE_ITEMS_LEFT.map((item) => <SideLink key={item.to} {...item} />)}

        <NavLink to="/wheel" className="relative flex flex-1 flex-col items-center">
          {({ isActive }) => (
            <>
              <span
                className={`-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-base-surface shadow-lg transition-transform ${
                  isActive
                    ? 'scale-105 bg-gradient-to-br from-rarity-covert to-rarity-classified'
                    : 'bg-gradient-to-br from-rarity-covert/90 to-rarity-classified/90'
                }`}
              >
                <Dices size={22} className="text-white" strokeWidth={2.2} />
              </span>
              <span className={`mt-0.5 text-[10px] font-medium ${isActive ? 'text-rarity-covert' : 'text-ink-muted'}`}>
                Барабан
              </span>
            </>
          )}
        </NavLink>

        {SIDE_ITEMS_RIGHT.map((item) => <SideLink key={item.to} {...item} />)}
      </div>
    </nav>
  );
}

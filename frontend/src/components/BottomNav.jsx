import {NavLink} from 'react-router-dom';
import {Home, SlidersHorizontal, Wallet, User} from 'lucide-react';

const ITEMS = [
    {to: '/', label: 'Главная', icon: Home, end: true},
    {to: '/filter', label: 'Фильтр', icon: SlidersHorizontal},
    {to: '/payment', label: 'Платежи', icon: Wallet},
    {to: '/profile', label: 'Профил', icon: User},
];

export default function BottomNav() {
    return (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-base-border bg-base-surface/95 backdrop-blur">
            <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
                {ITEMS.map(({to, label, icon: Icon, end}) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({isActive}) =>
                            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                                isActive ? 'text-rarity-covert' : 'text-ink-muted'
                            }`
                        }
                    >
                        {({isActive}) => (
                            <>
                                <Icon size={18} strokeWidth={isActive ? 2.5 : 2}/>
                                {label}
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}

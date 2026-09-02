import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type NavItem = { to: string; label: string; icon: IconName; badge?: boolean };

// Reproduced exactly per-screen from the reference PNGs — they are NOT
// consistent with each other. Home/Nutrition/Progress/Profile all show
// [Home, Plan, Nutrition, Progress, Profile]. The AI Coach screen alone
// shows a different set: Progress is absent and AI Coach takes its slot,
// rendered with a distinct filled-red-circle badge instead of the plain
// filled-icon treatment every other active tab uses (see 05-ai-coach.png).
const DEFAULT_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/nutrition', label: 'Nutrition', icon: 'nutrition' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

const AI_COACH_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/ai-coach', label: 'AI Coach', icon: 'aiMascot', badge: true },
  { to: '/nutrition', label: 'Nutrition', icon: 'nutrition' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

export function BottomNav({ variant = 'default' }: { variant?: 'default' | 'ai-coach' }) {
  const items = variant === 'ai-coach' ? AI_COACH_ITEMS : DEFAULT_ITEMS;
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-[390px] bg-[#0A0A0C]/95 backdrop-blur border-t border-border-soft px-2 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] flex">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex-1 flex flex-col items-center gap-1 py-1"
        >
          {({ isActive }) =>
            item.badge ? (
              <>
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isActive ? 'bg-red' : ''
                  }`}
                >
                  <Icon name={item.icon} size={18} className={isActive ? 'text-white' : 'text-text-muted'} />
                </span>
                <span className={`text-[10.5px] font-semibold ${isActive ? 'text-red' : 'text-text-muted'}`}>
                  {item.label}
                </span>
              </>
            ) : (
              <>
                <Icon
                  name={item.icon}
                  size={22}
                  filled={isActive}
                  className={isActive ? 'text-red' : 'text-text-muted'}
                />
                <span className={`text-[10.5px] font-semibold ${isActive ? 'text-red' : 'text-text-muted'}`}>
                  {item.label}
                </span>
              </>
            )
          }
        </NavLink>
      ))}
    </nav>
  );
}

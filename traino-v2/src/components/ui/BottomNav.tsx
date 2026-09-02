import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/nutrition', label: 'Nutrition', icon: 'nutrition' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-[390px] bg-[#0A0A0C]/95 backdrop-blur border-t border-border-soft px-2 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] flex">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex-1 flex flex-col items-center gap-1 py-1"
        >
          {({ isActive }) => (
            <>
              <Icon
                name={item.icon}
                size={22}
                filled={isActive}
                className={isActive ? 'text-red' : 'text-text-muted'}
              />
              <span
                className={`text-[10.5px] font-semibold ${isActive ? 'text-red' : 'text-text-muted'}`}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

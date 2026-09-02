import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export function OnboardingHeader({
  title,
  progress,
}: {
  title: string;
  /** 0..1 */
  progress: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-3">
      <div className="relative flex items-center justify-center h-10">
        <button onClick={() => navigate(-1)} className="absolute left-0 text-white">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-white text-[15px] font-extrabold tracking-wide uppercase">{title}</h1>
      </div>
      <div className="h-1 rounded-full bg-border-soft mt-3 overflow-hidden">
        <div
          className="h-full bg-red rounded-full transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

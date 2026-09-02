import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';

export default function HumanCoach() {
  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          HUMAN COACH
        </h1>
        <div className="w-8 shrink-0" />
      </div>

      <div className="px-4 mt-4">
        <h2 className="text-white text-[24px] font-extrabold">Need expert help?</h2>
        <p className="text-text-secondary text-[13.5px] mt-1.5 leading-relaxed">
          Our certified coaches are here for you when you need it.
        </p>
      </div>

      <div className="px-4 mt-4">
        <div className="relative overflow-hidden bg-card border border-border-soft rounded-card h-[150px] flex items-center">
          <div className="pl-4 pr-[104px] flex flex-col gap-2.5">
            <p className="text-white text-[17px] font-extrabold">AI Coach</p>
            <p className="text-text-secondary text-[13px]">Available 24/7</p>
            <p className="text-text-secondary text-[13px] leading-snug">
              Instant answers and plan adjustments
            </p>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
            <Icon
              name="aiMascot"
              size={74}
              className="text-red"
              strokeWidth={1.5}
              style={{ filter: 'drop-shadow(0 0 16px rgba(224,39,46,0.75))' }}
            />
          </div>
        </div>
      </div>

      <div className="px-4 mt-3">
        <div className="relative overflow-hidden bg-card border border-border-soft rounded-card h-[150px] flex items-center">
          <div className="pl-4 pr-[130px] flex flex-col gap-2.5 z-10">
            <p className="text-white text-[17px] font-extrabold">Human Coach</p>
            <p className="text-text-secondary text-[13px]">Get advice from a certified coach</p>
            <p className="text-text-secondary text-[13px] leading-snug">
              Personalized guidance from real experts
            </p>
          </div>
          <AssetSlot
            className="absolute right-0 top-0 bottom-0 w-[42%] rounded-r-card"
            fit="cover"
            position="top"
            label="Coach photo"
          />
        </div>
      </div>

      <div className="px-4 mt-5">
        <button className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button">
          ASK A COACH
        </button>
      </div>
    </Screen>
  );
}

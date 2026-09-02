import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';

const SUGGESTIONS = [
  "Adjust today's workout",
  'I have pain',
  "I'm traveling",
  'Replace an exercise',
  'Missed a workout',
  'Ask about nutrition',
];

const ADJUSTMENTS = ['Reduced training volume', 'Focused on quality', 'Optimized for recovery'];

export default function AiCoach() {
  return (
    <Screen className="pb-3">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          AI COACH
        </h1>
        <div className="flex items-center gap-3 shrink-0">
          <Icon name="sliders" size={19} className="text-white" />
          <Icon name="dotsVertical" size={19} className="text-white" />
        </div>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div className="self-end max-w-[80%] bg-red rounded-2xl rounded-br-md px-3.5 py-2.5">
          <p className="text-white text-[13.5px] leading-snug">I'm feeling tired today</p>
          <p className="text-white/70 text-[10px] text-right mt-1">9:41 AM</p>
        </div>

        <div className="flex items-start gap-2 max-w-[86%]">
          <span className="w-8 h-8 rounded-[10px] bg-red flex items-center justify-center shrink-0 mt-0.5">
            <Icon name="aiMascot" size={17} className="text-bg" strokeWidth={1.8} />
          </span>
          <div className="bg-card rounded-2xl rounded-bl-md px-3.5 py-2.5">
            <p className="text-white text-[13.5px] leading-snug">
              I understand. Let me adjust your plan based on your recovery and how you feel.
            </p>
            <p className="text-text-muted text-[10px] text-right mt-1">9:41 AM</p>
          </div>
        </div>

        <div className="bg-card border border-border-soft rounded-2xl p-4 mt-1">
          <p className="text-white text-[11.5px] font-extrabold tracking-wide">TRAINO AI ADJUSTMENT</p>
          <div className="flex flex-col gap-2.5 mt-3">
            {ADJUSTMENTS.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <span className="w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-success flex items-center justify-center">
                  <Icon name="checkPlain" size={11} className="text-bg" strokeWidth={2.8} />
                </span>
                <span className="text-white text-[13px] font-medium">{item}</span>
              </div>
            ))}
          </div>
          <button className="w-full bg-red rounded-button py-3 text-white font-extrabold text-[13px] tracking-wide mt-4 shadow-button">
            VIEW UPDATED WORKOUT
          </button>
        </div>
      </div>

      <div className="px-4 mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="border border-border-soft rounded-chip px-3.5 py-2 text-text-secondary text-[12px] font-medium bg-card-nested"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 flex items-center gap-2.5">
        <div className="flex-1 bg-card border border-border-soft rounded-chip px-4 py-3">
          <span className="text-text-muted text-[13px]">Ask anything...</span>
        </div>
        <button className="w-11 h-11 min-w-[44px] rounded-full bg-red flex items-center justify-center shadow-button">
          <Icon name="send" size={16} className="text-white" />
        </button>
      </div>

      <BottomNav variant="ai-coach" />
    </Screen>
  );
}

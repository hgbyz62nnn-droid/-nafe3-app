import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';
import { getAiCoachReply, getFallbackReply } from '../domain/engine/aiCoachEngine';
import type { AiCoachIntent, AiCoachReply } from '../domain/engine/types';
import { useProfile } from '../domain/state/ProfileContext';

const SUGGESTIONS: { label: string; intent: AiCoachIntent }[] = [
  { label: "Adjust today's workout", intent: 'adjust_todays_workout' },
  { label: 'I have pain', intent: 'have_pain' },
  { label: "I'm traveling", intent: 'traveling' },
  { label: 'Replace an exercise', intent: 'replace_exercise' },
  { label: 'Missed a workout', intent: 'missed_workout' },
  { label: 'Ask about nutrition', intent: 'ask_about_nutrition' },
];

type Message = { role: 'user'; text: string } | ({ role: 'ai' } & AiCoachReply);

const INITIAL_MESSAGES: Message[] = [
  { role: 'user', text: "I'm feeling tired today" },
  { role: 'ai', ...getAiCoachReply('feeling_tired') },
];

export default function AiCoach() {
  const navigate = useNavigate();
  const { setActiveAdjustment } = useProfile();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');

  function handleSuggestion(label: string, intent: AiCoachIntent) {
    const reply = getAiCoachReply(intent);
    setMessages((prev) => [...prev, { role: 'user', text: label }, { role: 'ai', ...reply }]);
  }

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'ai', ...getFallbackReply() }]);
    setDraft('');
  }

  function handleCta(msg: Message & { role: 'ai' }) {
    if (msg.adjustment) {
      setActiveAdjustment(msg.adjustment);
      navigate('/todays-workout');
    } else if (msg.ctaLabel === 'OPEN NUTRITION' || msg.ctaLabel === 'CHOOSE EXERCISE') {
      navigate(msg.ctaLabel === 'OPEN NUTRITION' ? '/nutrition' : '/todays-workout');
    }
  }

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
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="self-end max-w-[80%] bg-red rounded-2xl rounded-br-md px-3.5 py-2.5">
              <p className="text-white text-[13.5px] leading-snug">{msg.text}</p>
              <p className="text-white/70 text-[10px] text-right mt-1">9:41 AM</p>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-start gap-2 max-w-[86%]">
                <span className="w-8 h-8 rounded-[10px] bg-red flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="aiMascot" size={17} className="text-bg" strokeWidth={1.8} />
                </span>
                <div className="bg-card rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <p className="text-white text-[13.5px] leading-snug">{msg.message}</p>
                  <p className="text-text-muted text-[10px] text-right mt-1">9:41 AM</p>
                </div>
              </div>

              {msg.adjustmentSummary && (
                <div className="bg-card border border-border-soft rounded-2xl p-4">
                  <p className="text-white text-[11.5px] font-extrabold tracking-wide">
                    TRAINO AI ADJUSTMENT
                  </p>
                  <div className="flex flex-col gap-2.5 mt-3">
                    {msg.adjustmentSummary.map((item) => (
                      <div key={item} className="flex items-center gap-2.5">
                        <span className="w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-success flex items-center justify-center">
                          <Icon name="checkPlain" size={11} className="text-bg" strokeWidth={2.8} />
                        </span>
                        <span className="text-white text-[13px] font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                  {msg.ctaLabel && (
                    <button
                      onClick={() => handleCta(msg)}
                      className="w-full bg-red rounded-button py-3 text-white font-extrabold text-[13px] tracking-wide mt-4 shadow-button"
                    >
                      {msg.ctaLabel}
                    </button>
                  )}
                </div>
              )}

              {!msg.adjustmentSummary && msg.ctaLabel && (
                <button
                  onClick={() => handleCta(msg)}
                  className="self-start ml-10 border border-red/50 rounded-chip px-4 py-2 text-red text-[12.5px] font-bold"
                >
                  {msg.ctaLabel}
                </button>
              )}
            </div>
          )
        )}
      </div>

      <div className="px-4 mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.intent}
            onClick={() => handleSuggestion(s.label, s.intent)}
            className="border border-border-soft rounded-chip px-3.5 py-2 text-text-secondary text-[12px] font-medium bg-card-nested"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 flex items-center gap-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask anything..."
          className="flex-1 bg-card border border-border-soft rounded-chip px-4 py-3 text-white text-[13px] placeholder:text-text-muted outline-none focus:border-red"
        />
        <button
          onClick={handleSend}
          className="w-11 h-11 min-w-[44px] rounded-full bg-red flex items-center justify-center shadow-button"
        >
          <Icon name="send" size={16} className="text-white" />
        </button>
      </div>

      <BottomNav variant="ai-coach" />
    </Screen>
  );
}

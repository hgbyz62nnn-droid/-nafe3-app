import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { READINESS_QUESTIONS, READINESS_STATUS_COLOR, READINESS_STATUS_LABEL, defaultReadinessInputs } from '../domain/readiness/scales';
import type { DailyReadinessInputs, DailyReadinessRecord } from '../domain/readiness/types';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';

function ResultView({ record, onRetake }: { record: DailyReadinessRecord; onRetake: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="px-5 mt-5">
      <div className="bg-card rounded-card border border-border-soft p-5 text-center">
        <p className="text-text-secondary text-[12px] font-semibold uppercase tracking-wide">Today's Readiness</p>
        <p className="text-white text-[42px] font-extrabold mt-1 leading-none">{record.score}%</p>
        <p className={`text-[14.5px] font-bold mt-1 ${READINESS_STATUS_COLOR[record.status]}`}>{READINESS_STATUS_LABEL[record.status]}</p>
      </div>

      <div className="mt-4 flex items-start gap-3 bg-card rounded-card-sm border border-border-soft px-4 py-3.5">
        <Icon name="aiMascot" size={18} className="text-red shrink-0 mt-0.5" />
        <p className="text-text-secondary text-[13px] leading-relaxed">{record.recommendation.message}</p>
      </div>

      {record.recommendation.adjustmentApplied && record.recommendation.summary && (
        <div className="mt-2.5 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="sliders" size={14} className="text-red shrink-0" />
          <p className="text-red text-[12px] font-semibold">{record.recommendation.summary}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        <button
          onClick={() => navigate('/todays-workout')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          VIEW TODAY'S WORKOUT
        </button>
        <button onClick={onRetake} className="w-full text-text-secondary text-[13px] font-semibold py-2">
          Retake today's check-in
        </button>
      </div>
    </div>
  );
}

export default function DailyCheckIn() {
  const navigate = useNavigate();
  const { getTodayRecord, submitCheckIn } = useDailyReadiness();
  const existing = getTodayRecord();
  const [retaking, setRetaking] = useState(false);
  const [inputs, setInputs] = useState<DailyReadinessInputs>(defaultReadinessInputs());
  const [painNote, setPainNote] = useState('');
  const [submitted, setSubmitted] = useState<DailyReadinessRecord | null>(null);

  function setFactor(key: keyof DailyReadinessInputs, value: 1 | 2 | 3 | 4 | 5) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const record = submitCheckIn({
      ...inputs,
      painNote: inputs.painFlag ? painNote.trim() || undefined : undefined,
    });
    setSubmitted(record);
  }

  const result = submitted ?? (!retaking ? existing : undefined);

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          DAILY CHECK-IN
        </h1>
        <div className="w-8" />
      </div>

      {result ? (
        <ResultView record={result} onRetake={() => { setRetaking(true); setSubmitted(null); }} />
      ) : (
        <>
          <div className="px-5 mt-4">
            <h2 className="text-white text-[22px] font-extrabold leading-snug">How are you feeling today?</h2>
            <p className="text-text-secondary text-[13px] mt-1.5 leading-relaxed">
              A quick check so TRAINO can shape today's session to how you actually feel.
            </p>
          </div>

          <div className="px-5 mt-4 flex flex-col gap-3">
            {READINESS_QUESTIONS.map((q) => {
              const value = inputs[q.key];
              const selectedOption = q.options.find((o) => o.value === value);
              return (
                <div key={q.key} className="bg-card rounded-card-sm border border-border-soft px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 min-w-[32px] rounded-[9px] bg-card-nested flex items-center justify-center shrink-0">
                      <Icon name={q.icon} size={15} className="text-white" />
                    </span>
                    <p className="flex-1 text-white text-[13.5px] font-bold">{q.title}</p>
                    {selectedOption && (
                      <span className="text-text-secondary text-[11.5px] font-semibold shrink-0">{selectedOption.label}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 mt-3">
                    {q.options.map((option) => {
                      const active = option.value === value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setFactor(q.key, option.value)}
                          aria-label={option.label}
                          className={`h-9 rounded-[8px] border-2 text-[13px] font-bold transition-colors ${
                            active ? 'border-red bg-red/15 text-red' : 'border-border-soft text-text-secondary'
                          }`}
                        >
                          {option.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => setInputs((prev) => ({ ...prev, painFlag: !prev.painFlag }))}
              className={`flex items-center gap-3 rounded-card-sm border-2 px-3.5 py-3 text-left transition-colors ${
                inputs.painFlag ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
              }`}
            >
              <span className="w-9 h-9 min-w-[36px] rounded-[10px] bg-card-nested flex items-center justify-center shrink-0">
                <Icon name="heart" size={16} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-[13.5px] font-bold">New pain or discomfort today?</span>
                <span className="block text-text-secondary text-[12px] mt-0.5">TRAINO will play it safe with today's session</span>
              </span>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                  inputs.painFlag ? 'bg-red border-red' : 'border-border-soft bg-transparent'
                }`}
              >
                {inputs.painFlag && <Icon name="check" size={13} className="text-white" strokeWidth={2.4} />}
              </span>
            </button>

            {inputs.painFlag && (
              <textarea
                value={painNote}
                onChange={(e) => setPainNote(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="Optional — describe where/what, just for your own record."
                className="w-full bg-card border border-border-soft rounded-card-sm px-4 py-3 text-white text-[13px] placeholder:text-text-muted outline-none focus:border-red resize-none"
              />
            )}
          </div>

          <div className="px-5 mt-5">
            <button
              onClick={handleSubmit}
              className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
            >
              CHECK IN
            </button>
            <button onClick={() => navigate('/')} className="w-full text-text-secondary text-[13px] font-semibold py-3">
              Skip for today
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}

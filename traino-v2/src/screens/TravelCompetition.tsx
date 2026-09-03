import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { useLogs } from '../domain/state/LogContext';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import type { CompetitionEventType } from '../domain/context/types';

/** Travel Mode equipment/location presets (spec §3 A-E) — convenience bundles
 * over the SAME equipment/location ids the app already uses everywhere else
 * (domain/assessment/equipment.ts, trainingLocations.ts), not a new vocabulary. */
const TRAVEL_PRESETS: { id: string; label: string; equipmentIds: string[]; locationIds: string[] }[] = [
  { id: 'hotel_limited', label: 'Hotel / limited space', equipmentIds: [], locationIds: ['home'] },
  { id: 'bodyweight', label: 'Bodyweight only', equipmentIds: [], locationIds: ['home'] },
  { id: 'dumbbells_bands', label: 'Dumbbells / bands', equipmentIds: ['dumbbells', 'resistance_bands'], locationIds: ['home'] },
  { id: 'hotel_gym', label: 'Hotel gym', equipmentIds: ['dumbbells', 'barbell', 'bench', 'cable_machine'], locationIds: ['gym'] },
  { id: 'no_equipment', label: 'No training equipment', equipmentIds: [], locationIds: ['home'] },
];

const TIME_OPTIONS = [15, 20, 30, 45, 60];

const EVENT_TYPES: { id: CompetitionEventType; label: string }[] = [
  { id: 'match', label: 'Match' },
  { id: 'race', label: 'Race' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'event', label: 'Event' },
];

export default function TravelCompetition() {
  const { today } = useLogs();
  const { travelContexts, competitionEvents, addTravelContext, addCompetitionEvent, cancelTravelContext, removeCompetitionEvent } =
    useTrainingContext();

  const [error, setError] = useState<string | null>(null);

  const [presetId, setPresetId] = useState(TRAVEL_PRESETS[0].id);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [minutesAvailable, setMinutesAvailable] = useState(30);
  const [affectsNutrition, setAffectsNutrition] = useState(false);

  const [eventDate, setEventDate] = useState(today);
  const [eventType, setEventType] = useState<CompetitionEventType>('match');
  const [eventLabel, setEventLabel] = useState('');

  const activeTravel = travelContexts.find((t) => today >= t.startDate && today <= t.endDate) ?? null;
  const upcomingEvents = [...competitionEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  function handleStartTravel() {
    setError(null);
    const preset = TRAVEL_PRESETS.find((p) => p.id === presetId) ?? TRAVEL_PRESETS[0];
    try {
      addTravelContext({
        startDate,
        endDate,
        constraints: {
          equipmentIds: preset.equipmentIds,
          locationIds: preset.locationIds,
          time: { minutesAvailable },
          affectsNutrition,
        },
        source: 'athlete',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Travel Mode.');
    }
  }

  function handleAddEvent() {
    setError(null);
    try {
      addCompetitionEvent({
        eventDate,
        eventType,
        label: eventLabel.trim() || undefined,
        source: 'athlete',
      });
      setEventLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this competition.');
    }
  }

  return (
    <Screen withNav={false} className="pb-10">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          TRAVEL & COMPETITION
        </h1>
        <div className="w-8" />
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <p className="text-red text-[12px] font-semibold">{error}</p>
        </div>
      )}

      {/* Travel Mode */}
      <div className="px-5 mt-4">
        <h2 className="text-white text-[15px] font-bold flex items-center gap-2">
          <Icon name="suitcase" size={16} className="text-white" />
          Travel Mode
        </h2>

        {activeTravel ? (
          <div className="mt-2.5 bg-card border border-border-soft rounded-card p-4">
            <p className="text-white text-[13.5px] font-bold">Active through {activeTravel.endDate}</p>
            <p className="text-text-secondary text-[12px] mt-1">
              {activeTravel.constraints.equipmentIds.length > 0
                ? activeTravel.constraints.equipmentIds.join(', ')
                : 'Bodyweight only'}{' '}
              · {activeTravel.constraints.time.minutesAvailable} min
              {activeTravel.constraints.affectsNutrition ? ' · Nutrition adjusted' : ''}
            </p>
            <button
              onClick={() => cancelTravelContext(activeTravel.id, today)}
              className="mt-3 text-red text-[12.5px] font-semibold underline"
            >
              End Travel Mode
            </button>
          </div>
        ) : (
          <div className="mt-2.5 bg-card border border-border-soft rounded-card p-4">
            <p className="text-text-secondary text-[12px] font-semibold mb-1.5">What's available</p>
            <div className="flex flex-col gap-2">
              {TRAVEL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className={`flex items-center justify-between rounded-card-sm border-2 px-3.5 py-2.5 text-left ${
                    presetId === p.id ? 'border-red bg-card-nested shadow-card-red' : 'border-border-soft bg-card-nested'
                  }`}
                >
                  <span className="text-white text-[12.5px] font-semibold">{p.label}</span>
                  {presetId === p.id && <Icon name="checkPlain" size={13} className="text-red shrink-0" strokeWidth={2.6} />}
                </button>
              ))}
            </div>

            <p className="text-text-secondary text-[12px] font-semibold mt-4 mb-1.5">Available time</p>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutesAvailable(m)}
                  className={`rounded-card-sm border-2 px-3.5 py-2 text-[12.5px] font-semibold ${
                    minutesAvailable === m ? 'border-red bg-card-nested text-white shadow-card-red' : 'border-border-soft bg-card-nested text-text-secondary'
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <div className="flex-1">
                <p className="text-text-secondary text-[12px] font-semibold mb-1.5">Start date</p>
                <div className="bg-card-nested border border-border-soft rounded-card-sm px-3 py-2.5">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-transparent text-white text-[13px] outline-none"
                  />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-text-secondary text-[12px] font-semibold mb-1.5">End date</p>
                <div className="bg-card-nested border border-border-soft rounded-card-sm px-3 py-2.5">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-transparent text-white text-[13px] outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setAffectsNutrition((v) => !v)}
              className="flex items-center gap-2.5 mt-4"
            >
              <span
                className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center ${
                  affectsNutrition ? 'border-red bg-red' : 'border-border-soft'
                }`}
              >
                {affectsNutrition && <Icon name="checkPlain" size={11} className="text-white" strokeWidth={3} />}
              </span>
              <span className="text-text-secondary text-[12.5px]">Also adjust my nutrition while traveling</span>
            </button>

            <button
              onClick={handleStartTravel}
              className="w-full mt-4 rounded-button py-3 font-extrabold text-[13.5px] tracking-wide bg-red text-white"
            >
              START TRAVEL MODE
            </button>
          </div>
        )}
      </div>

      {/* Competition Mode */}
      <div className="px-5 mt-6">
        <h2 className="text-white text-[15px] font-bold flex items-center gap-2">
          <Icon name="calendar" size={16} className="text-white" />
          Competition Mode
        </h2>

        {upcomingEvents.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-2">
            {upcomingEvents.map((ev) => (
              <div key={ev.id} className="bg-card border border-border-soft rounded-card-sm px-3.5 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-white text-[13px] font-bold">{ev.label || ev.eventType} — {ev.eventDate}</p>
                  <p className="text-text-secondary text-[11.5px] mt-0.5">{ev.eventType}{ev.eventTime ? ` · ${ev.eventTime}` : ''}</p>
                </div>
                <button onClick={() => removeCompetitionEvent(ev.id)} className="text-text-secondary text-[11.5px] font-semibold underline shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 bg-card border border-border-soft rounded-card p-4">
          <p className="text-text-secondary text-[12px] font-semibold mb-1.5">Event date</p>
          <div className="bg-card-nested border border-border-soft rounded-card-sm px-3 py-2.5">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-transparent text-white text-[13px] outline-none"
            />
          </div>

          <p className="text-text-secondary text-[12px] font-semibold mt-4 mb-1.5">Type</p>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setEventType(t.id)}
                className={`rounded-card-sm border-2 px-3.5 py-2 text-[12.5px] font-semibold ${
                  eventType === t.id ? 'border-red bg-card-nested text-white shadow-card-red' : 'border-border-soft bg-card-nested text-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="text-text-secondary text-[12px] font-semibold mt-4 mb-1.5">Label (optional)</p>
          <input
            value={eventLabel}
            onChange={(e) => setEventLabel(e.target.value)}
            maxLength={60}
            placeholder="e.g. League Final"
            className="w-full bg-card-nested border border-border-soft rounded-card-sm px-3.5 py-2.5 text-white text-[13px] placeholder:text-text-muted outline-none focus:border-red"
          />

          <button
            onClick={handleAddEvent}
            className="w-full mt-4 rounded-button py-3 font-extrabold text-[13.5px] tracking-wide bg-red text-white"
          >
            ADD COMPETITION
          </button>
        </div>
      </div>
    </Screen>
  );
}

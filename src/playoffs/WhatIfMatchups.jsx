import { useRef } from 'react';
import { DEFAULT_MARGIN, formatOdds, lastPickedWeek, normalizeMargin, whatIfScores } from '../../lib/playoffs.mjs';

const SLIDER_MIN = 1;
const SLIDER_MAX = 70;

function MarginInput({ margin, onChange, label }) {
  const sliderValue = normalizeMargin(margin);
  const filled = ((sliderValue - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-ink-2">
        Margin
        <input
          type="number"
          value={margin}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeMargin(e.target.value))}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step="0.1"
          className="h-9 w-20 rounded border border-line bg-raised text-center font-mono text-ink focus:border-blue-500 focus:outline-none"
          style={{ fontSize: '16px' }} // Prevents zoom on iOS
          aria-label={`Margin of victory for ${label}`}
        />
      </label>
      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step="0.1"
        value={sliderValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3 w-full max-w-xs cursor-pointer appearance-none rounded-lg touch-manipulation sm:h-4"
        style={{ background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${filled}%, #34342f ${filled}%, #34342f 100%)` }}
        aria-label={`Margin slider for ${label}`}
      />
    </div>
  );
}

function TeamButton({ name, odds, picked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={picked}
      className={`min-h-11 min-w-0 flex-1 basis-0 rounded-md border px-1 py-2 text-center text-[13px] leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:text-base ${
        picked ? 'border-blue-500 bg-raised text-ink' : 'border-line text-ink-2 hover:bg-raised'
      }`}
    >
      <span className="block font-medium [overflow-wrap:anywhere]">{name}</span>
      <span className="mt-0.5 block text-xs tabular-nums text-ink-3">{odds} to make it</span>
    </button>
  );
}

const scoreLine = (first, second, scores, names) => {
  const [leader, other] = scores[second] > scores[first] ? [second, first] : [first, second];
  return `${names[leader]} ${scores[leader].toFixed(1)}, ${names[other]} ${scores[other].toFixed(1)}`;
};

const pickCount = (picks) => Object.keys(picks ?? {}).length;

function WeekPicker({ week, weeks, picksByWeek, lastPicked, onWeekChange }) {
  return (
    <nav aria-label="Choose a week" className="mb-3 flex flex-wrap gap-1 px-1">
      {weeks.map((option) => {
        const count = pickCount(picksByWeek[option]);
        const status = count > 0 ? `, ${count} ${count === 1 ? 'pick' : 'picks'}` : (lastPicked !== null && option < lastPicked ? ', projected' : '');
        return (
          <button
            key={option}
            type="button"
            onClick={() => onWeekChange(option)}
            aria-current={option === week ? 'true' : undefined}
            aria-label={`Week ${option}${status}`}
            className={`relative min-h-11 min-w-11 flex-1 rounded-md border text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
              option === week ? 'border-blue-500 bg-raised font-semibold text-ink' : 'border-line text-ink-2 hover:bg-raised'
            }`}
          >
            {option}
            {count > 0 && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />}
          </button>
        );
      })}
    </nav>
  );
}

export default function WhatIfMatchups({ week, weeks, onWeekChange, pairs, names, odds, final, projected, picksByWeek, onPicksChange }) {
  const sectionRef = useRef(null);
  const picks = picksByWeek[week] ?? {};
  const setWeekPicks = (next) => onPicksChange({ ...picksByWeek, [week]: next });
  const togglePick = (key, winner) => {
    const next = { ...picks };
    if (picks[key]?.winner === winner) delete next[key];
    else next[key] = { winner, margin: picks[key]?.margin ?? DEFAULT_MARGIN };
    setWeekPicks(next);
  };
  const hasPicks = pickCount(picks) > 0;
  const lastPicked = lastPickedWeek(picksByWeek);
  const picksElsewhere = weeks.some((option) => option !== week && pickCount(picksByWeek[option]) > 0);
  const lockedAsProjected = !hasPicks && lastPicked !== null && week < lastPicked;

  const position = weeks.indexOf(week);
  const previousWeek = weeks[position - 1];
  const nextWeek = weeks[position + 1];
  // These buttons sit below the games, so bring the new week's first game back into view.
  const stepTo = (target) => {
    onWeekChange(target);
    sectionRef.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <section ref={sectionRef} aria-labelledby="what-if-heading" className="scroll-mt-4">
      <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1">
        <h2 id="what-if-heading" className="text-base font-bold text-ink sm:text-xl">Week {week} matchups</h2>
        <div className="flex gap-2">
          {hasPicks && (
            <button
              type="button"
              onClick={() => setWeekPicks({})}
              className="min-h-11 rounded-md bg-surface px-3 text-sm font-medium text-ink-2 hover:bg-raised"
            >
              {picksElsewhere ? `Clear Week ${week}` : 'Clear picks'}
            </button>
          )}
          {picksElsewhere && (
            <button
              type="button"
              onClick={() => onPicksChange({})}
              className="min-h-11 rounded-md bg-surface px-3 text-sm font-medium text-ink-2 hover:bg-raised"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
      <WeekPicker week={week} weeks={weeks} picksByWeek={picksByWeek} lastPicked={lastPicked} onWeekChange={onWeekChange} />
      <p className="mb-3 px-1 text-xs text-ink-3">
        Pick a winner to see how that result changes everyone&apos;s odds, then keep going week by week through Week {weeks.at(-1)}. The loser scores 110, and the margin sets the winner&apos;s score. Every game you haven&apos;t picked, up to your last picked week, counts as its projected result. Tap a picked team again to undo it.
      </p>
      {lockedAsProjected && (
        <p className="mb-3 px-1 text-xs font-medium text-ink-2">You picked a later week, so these games count as their projected results.</p>
      )}
      <div className="grid gap-3">
        {pairs.map((pair) => {
          const key = pair.join('-');
          const pick = picks[key];
          return (
            <div key={key} className="rounded-lg border border-line bg-surface p-2 shadow-sm sm:p-4">
              <div className="flex items-center gap-1 sm:gap-2">
                {pair.flatMap((id, i) => [
                  i === 1 && <span key="vs" className="shrink-0 text-xs font-bold text-ink-3 sm:text-sm">VS</span>,
                  <TeamButton
                    key={id}
                    name={names[id]}
                    odds={odds[id] === undefined ? '' : formatOdds(odds[id], final)}
                    picked={pick?.winner === id}
                    onClick={() => togglePick(key, id)}
                  />,
                ])}
              </div>
              {pick && (
                <MarginInput
                  margin={pick.margin}
                  label={names[pick.winner]}
                  onChange={(margin) => setWeekPicks({ ...picks, [key]: { ...pick, margin } })}
                />
              )}
              <p className="mt-3 text-center text-xs font-medium text-ink-2 [overflow-wrap:anywhere] sm:text-sm" aria-live="polite">
                {pick
                  ? `Result: ${scoreLine(pair[0], pair[1], whatIfScores(pair, pick), names)}`
                  : `Projected: ${scoreLine(pair[0], pair[1], projected, names)}`}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between gap-3">
        {previousWeek !== undefined ? (
          <button
            type="button"
            onClick={() => stepTo(previousWeek)}
            className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink-2 hover:bg-raised"
          >
            <span aria-hidden="true">← </span>Week {previousWeek}
          </button>
        ) : <span />}
        {nextWeek !== undefined && (
          <button
            type="button"
            onClick={() => stepTo(nextWeek)}
            className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Next: Week {nextWeek}<span aria-hidden="true"> →</span>
          </button>
        )}
      </div>
    </section>
  );
}

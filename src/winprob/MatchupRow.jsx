import { memo, useId } from 'react';
import MatchupChart from './MatchupChart';
import MatchupLineups from './MatchupLineups';
import { formatPercent, formatTime, indexAtTime, matchupColors, scoreShare } from './data';
import { keyMoments } from './scoring';

const MatchupTable = memo(function MatchupTable({ series, nameA, nameB }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer py-3 text-ink-2">Show data table</summary>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface text-ink-3">
            <tr>
              <th className="py-1 pr-3 font-medium">Time</th>
              <th className="py-1 pr-3 font-medium">{nameA}</th>
              <th className="py-1 pr-3 font-medium">{nameB}</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((s) => (
              <tr key={s.t} className="border-t border-line">
                <td className="py-1 pr-3 whitespace-nowrap">{formatTime(s.t)}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{formatPercent(s.probability)} ({s.a.points.toFixed(1)})</td>
                <td className="py-1 pr-3 whitespace-nowrap">{formatPercent(1 - s.probability)} ({s.b.points.toFixed(1)})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

function KeyMoments({ events, scores, series, nameA, nameB, colorA, colorB, activeTime, onSelect }) {
  const moments = keyMoments(events, scores);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-1 text-sm font-medium text-ink-2">Key moments</h3>
      {moments.length === 0 && <p className="pb-2 text-xs text-ink-3">No big swings or scores yet.</p>}
      <ul>
        {moments.map((event) => {
          const gainerName = event.gainer === 'a' ? nameA : nameB;
          const color = event.gainer === 'a' ? colorA : colorB;
          return (
            <li key={event.key}>
              <button
                type="button"
                onClick={() => onSelect(event)}
                aria-pressed={activeTime === series[event.index].t}
                className={`flex min-h-11 w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  activeTime === series[event.index].t ? 'bg-raised' : ''
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink [overflow-wrap:anywhere]">{event.title}</span>
                  <span className="block text-xs text-ink-3">
                    {formatTime(event.playT ?? event.t)}{event.gameClock && ` · ${event.gameClock}`} · {event.flipped ? `${gainerName} now favored` : gainerName}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-2">
                  {formatPercent(event.from)} → <strong className="text-ink">{formatPercent(event.to)}</strong>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Fits the whole week into the row. The text beside it carries the exact values.
function Sparkline({ mode, scoreMax, series, xs, width, colorA, colorB, shownIndex, showCursor, onScrub, onScrubEnd }) {
  const clipId = useId();
  const xPercent = (i) => (width > 0 ? (xs[i] / width) * 100 : 100);
  const yPercent = (p) => (1 - p) * 100;
  const points = series.map((s, i) => `${xPercent(i)},${yPercent(s.probability)}`).join(' ');
  const area = series.length > 1 ? `${xPercent(0)},50 ${points} ${xPercent(series.length - 1)},50` : '';
  const shown = series[shownIndex];
  const scoreMode = mode === 'score';
  const scorePercent = (points) => (1 - scoreShare(points, scoreMax)) * 100;
  const scorePoints = (side) => series.map((s, i) => `${xPercent(i)},${scorePercent(s[side].points)}`).join(' ');

  // Mouse only: on a touch screen, a tap on the row opens it.
  const handleMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    series.forEach((_, i) => {
      if (Math.abs(xs[i] - target) < Math.abs(xs[best] - target)) best = i;
    });
    onScrub(series[best].t);
  };
  const handleLeave = (event) => {
    if (event.pointerType === 'mouse') onScrubEnd();
  };

  return (
    <div
      className="relative my-2 mr-1 h-11 w-14 shrink-0 min-[360px]:w-20 sm:w-auto sm:flex-1"
      aria-hidden="true"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <clipPath id={`${clipId}-a`}><rect x="-5" y="-5" width="110" height="55" /></clipPath>
          <clipPath id={`${clipId}-b`}><rect x="-5" y="50" width="110" height="55" /></clipPath>
        </defs>
        {!scoreMode && <line x1="0" x2="100" y1="50" y2="50" stroke="#6f6e68" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {[['a', colorA], ['b', colorB]].map(([side, color]) => (scoreMode ? (
          <polyline
            key={side}
            points={scorePoints(side)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <g key={side} clipPath={`url(#${clipId}-${side})`}>
            <polygon points={area} fill={color} fillOpacity="0.2" />
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )))}
        {showCursor && (
          <line x1={xPercent(shownIndex)} x2={xPercent(shownIndex)} y1="0" y2="100" stroke="#9a9990" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {(scoreMode
        ? [[scorePercent(shown.a.points), colorA], [scorePercent(shown.b.points), colorB]]
        : [[yPercent(shown.probability), shown.probability >= 0.5 ? colorA : colorB]]
      ).map(([top, background]) => (
        <span
          key={background}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface"
          style={{ left: `${xPercent(shownIndex)}%`, top: `${top}%`, background }}
        />
      ))}
    </div>
  );
}

function TeamSummary({ mode, name, team, probability, leading, color }) {
  const scoreMode = mode === 'score';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-1 self-stretch rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{name}</div>
        <div className="text-xs tabular-nums text-ink-2">
          {scoreMode ? `${formatPercent(probability)} to win` : `${team.points.toFixed(1)} pts`}
          <span className="hidden min-[360px]:inline"> · proj {team.expected.toFixed(1)}</span>
        </div>
      </div>
      <div className={`shrink-0 text-base tabular-nums text-ink ${leading ? 'font-bold' : 'font-normal'}`}>
        {leading && <span className="mr-0.5 text-[10px] align-middle" aria-hidden="true">▲</span>}
        {scoreMode ? team.points.toFixed(1) : formatPercent(probability)}
      </div>
    </div>
  );
}

export default function MatchupRow({ mode, scoreMax, doc, pair, series, events, scores, timeline, expanded, cursor, matchKey, onCursor, onCursorEnd, onSelectEvent, onToggle, onScroll, scrollRef }) {
  const [a, b] = pair;
  const nameA = doc.teams[a];
  const nameB = doc.teams[b];
  const cursorTime = cursor?.t ?? null;
  const shownIndex = indexAtTime(series, cursorTime);
  const shown = series[shownIndex];
  const dimmed = cursor !== null && cursor.source !== matchKey;
  const focused = cursor !== null && cursor.source === matchKey;
  const panelId = `matchup-${a}-${b}`;
  const [colorA, colorB] = matchupColors(doc, pair);
  const leader = mode === 'score' ? shown.a.points - shown.b.points : shown.probability - 0.5;

  return (
    <section
      className={`rounded-lg bg-surface shadow transition-opacity duration-150 ${dimmed ? 'opacity-50' : ''} ${focused ? 'ring-1 ring-ink-3' : ''}`}
      aria-label={`${nameA} vs ${nameB}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:px-4"
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md">
          <TeamSummary mode={mode} name={nameA} team={shown.a} probability={shown.probability} leading={leader > 0} color={colorA} />
          <TeamSummary mode={mode} name={nameB} team={shown.b} probability={1 - shown.probability} leading={leader < 0} color={colorB} />
        </div>
        <Sparkline
          mode={mode}
          scoreMax={scoreMax}
          series={series}
          xs={timeline.xs}
          width={timeline.width}
          colorA={colorA}
          colorB={colorB}
          shownIndex={shownIndex}
          showCursor={cursor !== null}
          onScrub={onCursor}
          onScrubEnd={onCursorEnd}
        />
        <span className={`shrink-0 text-xs text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
      </button>
      <div id={panelId} hidden={!expanded} className="border-t border-line px-3 pt-3 sm:px-4">
        {expanded && (
          <>
            <MatchupChart
              mode={mode}
              scoreMax={scoreMax}
              series={series}
              xs={timeline.xs}
              ticks={timeline.ticks}
              contentWidth={timeline.width}
              nameA={nameA}
              nameB={nameB}
              colorA={colorA}
              colorB={colorB}
              onScroll={onScroll}
              scrollRef={scrollRef}
              events={events}
              scores={scores}
              shownIndex={cursor === null ? null : shownIndex}
              showTooltip={focused && !cursor.pinned}
              onCursor={onCursor}
              onCursorEnd={onCursorEnd}
            />
            <KeyMoments
              events={events}
              scores={scores}
              series={series}
              nameA={nameA}
              nameB={nameB}
              colorA={colorA}
              colorB={colorB}
              activeTime={cursorTime}
              onSelect={onSelectEvent}
            />
            <MatchupLineups doc={doc} pair={pair} atTime={cursorTime} />
            <MatchupTable series={series} nameA={nameA} nameB={nameB} />
          </>
        )}
      </div>
    </section>
  );
}

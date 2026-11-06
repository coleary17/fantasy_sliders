import { useId } from 'react';
import MatchupChart from './MatchupChart';
import MatchupLineups from './MatchupLineups';
import { formatPercent, formatTime, matchupColors } from './data';

function MatchupTable({ series, nameA, nameB }) {
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
}

// Fits the whole week into the row. The text beside it carries the exact values.
function Sparkline({ series, xs, width, colorA, colorB }) {
  const clipId = useId();
  const xPercent = (i) => (width > 0 ? (xs[i] / width) * 100 : 100);
  const yPercent = (p) => (1 - p) * 100;
  const points = series.map((s, i) => `${xPercent(i)},${yPercent(s.probability)}`).join(' ');
  const area = series.length > 1 ? `${xPercent(0)},50 ${points} ${xPercent(series.length - 1)},50` : '';
  const last = series.at(-1);

  return (
    <div className="relative my-2 mr-1 h-11 w-14 shrink-0 min-[360px]:w-20 sm:w-auto sm:flex-1" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <clipPath id={`${clipId}-a`}><rect x="-5" y="-5" width="110" height="55" /></clipPath>
          <clipPath id={`${clipId}-b`}><rect x="-5" y="50" width="110" height="55" /></clipPath>
        </defs>
        <line x1="0" x2="100" y1="50" y2="50" stroke="#6f6e68" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {[['a', colorA], ['b', colorB]].map(([side, color]) => (
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
        ))}
      </svg>
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface"
        style={{
          left: `${xPercent(series.length - 1)}%`,
          top: `${yPercent(last.probability)}%`,
          background: last.probability >= 0.5 ? colorA : colorB,
        }}
      />
    </div>
  );
}

function TeamSummary({ name, team, probability, leading, color }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-1 self-stretch rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{name}</div>
        <div className="text-xs tabular-nums text-ink-2">
          {team.points.toFixed(1)} pts
          <span className="hidden min-[360px]:inline"> · proj {team.expected.toFixed(1)}</span>
        </div>
      </div>
      <div className={`shrink-0 text-base tabular-nums text-ink ${leading ? 'font-bold' : 'font-normal'}`}>
        {leading && <span className="mr-0.5 text-[10px] align-middle" aria-hidden="true">▲</span>}
        {formatPercent(probability)}
      </div>
    </div>
  );
}

export default function MatchupRow({ doc, pair, series, timeline, expanded, onToggle, onScroll, scrollRef }) {
  const [a, b] = pair;
  const nameA = doc.teams[a];
  const nameB = doc.teams[b];
  const latest = series.at(-1);
  const panelId = `matchup-${a}-${b}`;
  const [colorA, colorB] = matchupColors(doc, pair);

  return (
    <section className="rounded-lg bg-surface shadow" aria-label={`${nameA} vs ${nameB}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:px-4"
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md">
          <TeamSummary name={nameA} team={latest.a} probability={latest.probability} leading={latest.probability > 0.5} color={colorA} />
          <TeamSummary name={nameB} team={latest.b} probability={1 - latest.probability} leading={latest.probability < 0.5} color={colorB} />
        </div>
        <Sparkline series={series} xs={timeline.xs} width={timeline.width} colorA={colorA} colorB={colorB} />
        <span className={`shrink-0 text-xs text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
      </button>
      <div id={panelId} hidden={!expanded} className="border-t border-line px-3 pt-3 sm:px-4">
        {expanded && (
          <>
            <MatchupChart
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
            />
            <MatchupLineups doc={doc} pair={pair} />
            <MatchupTable series={series} nameA={nameA} nameB={nameB} />
          </>
        )}
      </div>
    </section>
  );
}

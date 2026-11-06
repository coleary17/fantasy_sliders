import { formatTime, shortPlayerName } from './data';
import { formatStatLine, statsAt } from './scoring';

const EMPTY_SLOT = '0';

function gameLabel(progress) {
  if (progress === undefined || progress === 0) return null;
  return progress >= 1 ? 'Final' : 'Live';
}

function starterDetails(team, index, doc, snapshot, statsTime) {
  const id = team.starters[index];
  if (id === undefined || id === EMPTY_SLOT) return { name: 'Empty', empty: true };
  const player = doc.players[id];
  if (!player) return { name: 'Unknown player', detail: 'No projection', points: team.starterPoints[index] };
  const game = gameLabel(snapshot.games[player.team]);
  return {
    name: player.name ?? id,
    shortName: shortPlayerName(player),
    detail: [player.team, `proj ${player.proj.toFixed(1)}`].filter(Boolean).join(' · '),
    game,
    points: team.starterPoints[index],
    started: snapshot.games[player.team] > 0,
    statLine: formatStatLine(statsAt(doc, id, statsTime)),
  };
}

function PlayerCell({ starter, align }) {
  const right = align === 'right';
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${starter.empty ? 'italic text-ink-3' : 'font-medium text-ink'}`}>
          {starter.shortName ? (
            <>
              <span className="sm:hidden">{starter.shortName}</span>
              <span className="hidden sm:inline">{starter.name}</span>
            </>
          ) : starter.name}
        </div>
        {starter.detail && <div className="truncate text-xs text-ink-3">{starter.detail}</div>}
        {starter.statLine && <div className="text-xs text-ink-2 [overflow-wrap:anywhere]">{starter.statLine}</div>}
      </div>
      {starter.started && (
        <div className="shrink-0 text-center">
          <div className="text-sm font-semibold tabular-nums text-ink">{(starter.points ?? 0).toFixed(1)}</div>
          <div className="text-[11px] text-ink-3">{starter.game}</div>
        </div>
      )}
    </div>
  );
}

export default function MatchupLineups({ doc, pair, atTime }) {
  const snapshot = doc.snapshots.find((s) => s.t === atTime) ?? doc.snapshots.at(-1);
  const [a, b] = pair;
  const teamA = snapshot.teams[a];
  const teamB = snapshot.teams[b];
  if (!teamA || !teamB) return null;

  // The latest stats can be newer than the latest snapshot, which is only saved when scores change.
  const statsTime = snapshot === doc.snapshots.at(-1) ? null : snapshot.t;
  const rowCount = Math.max(teamA.starters.length, teamB.starters.length);
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <details open className="mt-2 border-t border-line">
      <summary className="cursor-pointer py-3 text-sm text-ink-2">
        Lineups and stats{atTime !== null && <span className="text-ink-3"> · {formatTime(snapshot.t)}</span>}
      </summary>
      <div className="divide-y divide-line" role="table" aria-label={`Lineups: ${doc.teams[a]} vs ${doc.teams[b]}`}>
        {rows.map((index) => (
          <div key={index} role="row" className="flex items-center gap-2 py-1.5">
            <PlayerCell starter={starterDetails(teamA, index, doc, snapshot, statsTime)} align="left" />
            <div className="w-9 shrink-0 text-center text-xs font-medium text-ink-3">{doc.slots?.[index] ?? ''}</div>
            <PlayerCell starter={starterDetails(teamB, index, doc, snapshot, statsTime)} align="right" />
          </div>
        ))}
        <div role="row" className="flex items-center justify-between gap-2 py-2 text-sm font-semibold tabular-nums text-ink">
          <span>{teamA.expected.toFixed(1)}</span>
          <span className="text-xs font-medium text-ink-3">Projected total</span>
          <span>{teamB.expected.toFixed(1)}</span>
        </div>
      </div>
    </details>
  );
}

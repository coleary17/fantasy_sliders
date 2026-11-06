import { useEffect, useState } from 'react';

const COUNT_MS = 900;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useCountUp(target, active) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (!active || reducedMotion()) return undefined;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min((now - start) / COUNT_MS, 1);
      setValue(target * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);
  return value;
}

const decimalsOf = (n) => (Number.isInteger(n) ? 0 : String(n).split('.')[1].length);

export function Count({ value, active, prefix = '', suffix = '' }) {
  const shown = useCountUp(value, active);
  return <span className="tabular-nums">{prefix}{shown.toFixed(decimalsOf(value))}{suffix}</span>;
}

const Rise = ({ step = 0, className = '', children }) => (
  <div className={`story-rise ${className}`} style={{ '--step': step }}>{children}</div>
);

function Big({ value, active, prefix, suffix, color = 'var(--ink)', label, note }) {
  return (
    <Rise>
      <div className="font-display text-7xl leading-none" style={{ color }}>
        <Count value={value} active={active} prefix={prefix} suffix={suffix} />
      </div>
      {label && <div className="mt-3 text-2xl font-semibold text-ink">{label}</div>}
      {note && <div className="mt-1 text-base text-ink-2">{note}</div>}
    </Rise>
  );
}

// Bars share one scale, so their lengths compare directly.
function Bars({ rows, active, prefix = '' }) {
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <Rise key={row.label} step={i}>
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className={`truncate ${row.strong ? 'font-semibold text-ink' : 'text-ink-2'}`}>{row.label}</span>
            <span className={`shrink-0 font-semibold ${row.strong ? 'text-ink' : 'text-ink-2'}`}>
              <Count value={row.value} active={active} prefix={prefix} />
            </span>
          </div>
          <div className="mt-1 h-3 rounded-md bg-raised">
            <div
              className="story-bar h-full rounded-md"
              style={{ width: `${Math.max((row.value / top) * 100, 1)}%`, background: row.color ?? 'var(--midline)', '--step': i }}
            />
          </div>
        </Rise>
      ))}
    </div>
  );
}

function Stats({ items, step = 1 }) {
  return (
    <Rise step={step} className="mt-4 flex justify-between gap-3 border-t border-line pt-3">
      {items.map(({ label, value }) => (
        <div key={label}>
          <div className="text-xs text-ink-3">{label}</div>
          <div className="text-lg font-semibold tabular-nums text-ink">{value}</div>
        </div>
      ))}
    </Rise>
  );
}

const CHART = { width: 300, height: 170, left: 34, right: 8, top: 6, bottom: 22 };
const opponentColor = (game) => (game?.opponentId ? `var(--team-${game.opponentId})` : 'var(--ink-3)');

function Legend({ items }) {
  return (
    <Rise className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-base">
      {items.map(({ label, color }) => (
        <span key={label} className="flex min-w-0 items-center gap-2 text-ink">
          <span className="h-1 w-4 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
      ))}
    </Rise>
  );
}

// Both sides of the game: the two lines mirror each other, and whoever is above 50% is favored.
function WinProbLine({ fact, game, color }) {
  const { series } = fact;
  const theirColor = opponentColor(game);
  const opponent = game?.opponent ?? 'Opponent';
  const plotRight = CHART.width - CHART.right;
  const plotBottom = CHART.height - CHART.bottom;
  const x = (i) => CHART.left + (i / Math.max(series.length - 1, 1)) * (plotRight - CHART.left);
  const y = (pct) => CHART.top + (1 - pct / 100) * (plotBottom - CHART.top);
  const path = (pctOf) => series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(pctOf(p)).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const axisText = { fill: 'var(--ink-3)', fontSize: 11 };
  return (
    <>
      <Rise className="mb-2 text-sm text-ink-2">Chance of winning, kickoff to final</Rise>
      <Legend items={[{ label: 'You', color }, { label: opponent, color: theirColor }]} />
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="w-full" role="img" aria-label={`Your chance of beating ${opponent}: ${fact.pregamePct}% at kickoff, between ${fact.lowPct}% and ${fact.highPct}%, ending at ${last.pct}%`}>
        {[100, 50, 0].map((pct) => (
          <g key={pct}>
            <line x1={CHART.left} x2={plotRight} y1={y(pct)} y2={y(pct)} stroke={pct === 50 ? 'var(--midline)' : 'var(--line)'} strokeDasharray={pct === 50 ? '3 4' : undefined} />
            <text x={CHART.left - 6} y={y(pct) + 4} textAnchor="end" {...axisText}>{pct}%</text>
          </g>
        ))}
        <text x={CHART.left} y={CHART.height - 5} {...axisText}>Kickoff</text>
        <text x={plotRight} y={CHART.height - 5} textAnchor="end" {...axisText}>Final</text>
        <path d={path((p) => 100 - p.pct)} pathLength="1" fill="none" stroke={theirColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="story-line" />
        <path d={path((p) => p.pct)} pathLength="1" fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="story-line" />
        <circle cx={x(series.length - 1)} cy={y(100 - last.pct)} r="4" fill={theirColor} className="story-dot" />
        <circle cx={x(series.length - 1)} cy={y(last.pct)} r="4.5" fill={color} className="story-dot" />
      </svg>
      <Stats items={[
        { label: 'You at kickoff', value: `${fact.pregamePct}%` },
        { label: 'Your low', value: `${fact.lowPct}%` },
        { label: 'Your high', value: `${fact.highPct}%` },
        ...(game ? [{ label: 'Final', value: `${game.ourScore}–${game.theirScore}` }] : []),
      ]} />
    </>
  );
}

function TurningPoint({ fact, game, active, color }) {
  const opponent = game?.opponent ?? 'Opponent';
  // Saved before plays were split by team, a story only has the combined list.
  const sides = fact.ours || fact.theirs
    ? [{ label: 'You', plays: fact.ours ?? [] }, { label: opponent, plays: fact.theirs ?? [] }].filter((s) => s.plays.length > 0)
    : [{ label: 'Big plays', plays: [{ player: fact.plays }] }];
  return (
    <div>
      <Rise className="text-sm text-ink-2">Your chance of beating {opponent}</Rise>
      <Rise step={1} className="mt-2 flex items-baseline gap-3 font-display text-5xl text-ink-3">
        <Count value={fact.fromPct} active={active} suffix="%" />
        <span aria-label="to" className="text-3xl">→</span>
        <span style={{ color: fact.wentOurWay ? color : 'var(--ink)' }}><Count value={fact.toPct} active={active} suffix="%" /></span>
      </Rise>
      <div className="mt-5 space-y-3 border-t border-line pt-3">
        {sides.map(({ label, plays }, i) => (
          <Rise key={label} step={i + 2}>
            <div className="text-xs text-ink-3">{label}</div>
            {plays.map((play) => (
              <div key={play.player} className="flex justify-between gap-3 text-lg font-semibold text-ink">
                <span className="truncate">{play.player}</span>
                {play.points !== undefined && <span className="shrink-0 tabular-nums">{play.points > 0 ? '+' : ''}{play.points}</span>}
              </div>
            ))}
          </Rise>
        ))}
      </div>
    </div>
  );
}

export function Score({ fact, active, color }) {
  const won = fact.result === 'W';
  return (
    <div>
      <Rise className="mb-5 text-sm font-semibold uppercase tracking-widest" >
        <span style={{ color: won ? 'var(--gold)' : 'var(--ink-3)' }}>{{ W: 'Win', L: 'Loss', T: 'Tie' }[fact.result]}</span>
      </Rise>
      <Rise step={1} className="flex items-baseline justify-between gap-4">
        <span className="text-lg font-semibold text-ink">You</span>
        <span className="font-display text-5xl leading-none" style={{ color }}><Count value={fact.ourScore} active={active} /></span>
      </Rise>
      <Rise step={2} className="mt-4 flex items-baseline justify-between gap-4">
        <span className="min-w-0 text-lg text-ink-2">{fact.opponent}</span>
        <span className="font-display text-5xl leading-none" style={{ color: opponentColor(fact) }}><Count value={fact.theirScore} active={active} /></span>
      </Rise>
      <Stats step={3} items={[
        { label: 'Week rank', value: `${fact.weekRank} of ${fact.teamsThisWeek}` },
        { label: 'League high', value: fact.leagueHigh },
        { label: 'Record', value: fact.recordAfter },
      ]} />
    </div>
  );
}

export function Standings({ fact, active, color }) {
  const moved = fact.previousPlayoffOddsPct;
  return (
    <div>
      <Rise className="flex items-baseline justify-between gap-4">
        <span className="text-lg text-ink-2">Playoff odds</span>
        <span className="font-display text-5xl leading-none" style={{ color }}><Count value={fact.playoffOddsPct} active={active} suffix="%" /></span>
      </Rise>
      <Rise step={1} className="mt-4 flex items-baseline justify-between gap-4">
        <span className="text-lg text-ink-2">Points total</span>
        <span className="font-display text-5xl leading-none" style={{ color }}><Count value={fact.pointsFor} active={active} /></span>
      </Rise>
      <Stats step={2} items={[
        { label: 'Table', value: `${fact.rank} of ${fact.teams}` },
        { label: 'Odds last week', value: `${moved}%` },
        { label: 'Playoff spots', value: fact.playoffSpots },
      ]} />
    </div>
  );
}

function BiddingWar({ fact, active, color }) {
  const us = { label: 'You', value: fact.bid, strong: true, color: fact.won ? color : 'var(--ink-3)' };
  const others = fact.won
    ? (fact.rivals ?? []).map((r) => ({ label: r.team, value: r.bid }))
    : fact.winner ? [{ label: fact.winner.team, value: fact.winner.bid, strong: true, color: 'var(--gold)' }] : [];
  const rows = [us, ...others].sort((a, b) => b.value - a.value);
  return (
    <div>
      <Rise className="mb-4 text-3xl font-semibold text-ink">{fact.player}</Rise>
      <Bars rows={rows} active={active} prefix="$" />
      {!fact.won && fact.otherBidders > 0 && <Rise step={rows.length} className="mt-3 text-sm text-ink-3">{fact.otherBidders} more bid and lost</Rise>}
      {fact.cutToMakeRoom && <Rise step={rows.length} className="mt-3 text-sm text-ink-3">Cut to make room: {fact.cutToMakeRoom.join(', ')}</Rise>}
    </div>
  );
}

function Trade({ fact }) {
  const side = (label, names, step) => (
    <Rise step={step}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{names.join(', ') || 'Nobody'}</div>
    </Rise>
  );
  return (
    <div className="space-y-5">
      {side('You got', fact.got, 0)}
      {side(`${fact.partner} got`, fact.gave, 1)}
    </div>
  );
}

function Pickup({ fact, active, color }) {
  return (
    <div>
      <Rise className="text-3xl font-semibold text-ink">{fact.player}</Rise>
      <div className="mt-4">
        {fact.startedThisWeek
          ? <Big value={fact.pointsThisWeek} active={active} color={color} note="points in your lineup" />
          : <Rise className="text-lg text-ink-2">Didn't start this week</Rise>}
      </div>
      <Stats items={[
        { label: 'Cost', value: fact.how === 'waiver' ? `$${fact.bid}` : 'Free' },
        ...(fact.cutToMakeRoom ? [{ label: 'Cut for him', value: fact.cutToMakeRoom.join(', ') }] : []),
      ]} />
    </div>
  );
}

function Regret({ fact, game, active, color }) {
  const beside = game ? [{ label: game.opponent, value: game.theirScore }] : [];
  if (!fact.benchedPlayer) {
    return (
      <div>
        <Big value={fact.pointsLeftOnBench} active={active} color={color} label="points left on the bench" note={fact.couldHaveWon ? 'Your best lineup would have won' : undefined} />
        <Stats items={[{ label: 'You scored', value: game?.ourScore }, { label: 'Best lineup', value: fact.optimalPoints }, ...beside]} />
      </div>
    );
  }
  return (
    <div>
      <Bars active={active} rows={[
        { label: `${fact.benchedPlayer} (bench)`, value: fact.benchedPoints, strong: true, color: 'var(--gold)' },
        { label: `${fact.startedPlayer} (started)`, value: fact.startedPoints, color },
      ]} />
      <Stats step={2} items={[
        { label: 'You scored', value: game?.ourScore },
        { label: 'Best lineup', value: fact.optimalPoints },
        ...beside,
      ]} />
    </div>
  );
}

function Market({ fact, active, color }) {
  return (
    <div>
      <Big value={fact.budgetLeft} active={active} color={color} prefix="$" label="left to spend" />
      <Rise step={1} className="mt-5 h-3 rounded-md bg-raised">
        <div className="story-bar h-full rounded-md" style={{ width: `${Math.max((fact.budgetLeft / fact.budget) * 100, 1)}%`, background: color }} />
      </Rise>
      <Stats step={2} items={[
        { label: 'Spent this week', value: `$${fact.spentThisWeek}` },
        { label: 'Moves this week', value: fact.movesThisWeek },
      ]} />
    </div>
  );
}

// The chart for one fact. Numbers come from the facts, never from the writing.
export function Graphic({ fact, game, foe, active, color }) {
  switch (fact?.type) {
    case 'game': return <Score fact={fact} active={active} color={color} />;
    case 'winProb': return fact.series?.length ? <WinProbLine fact={fact} game={game} color={color} /> : null;
    case 'turningPoint': return <TurningPoint fact={fact} game={game} active={active} color={color} />;
    case 'standings': return <Standings fact={fact} active={active} color={color} />;
    case 'performer':
      return (
        <div>
          <Big value={fact.points} active={active} color={color} label={fact.player} note={fact.acquired?.bid ? `Your best starter, bought for $${fact.acquired.bid} in week ${fact.acquired.week}` : 'Your best starter'} />
          {foe && game && <Stats items={[{ label: `Best for ${game.opponent}`, value: `${foe.player}, ${foe.points}` }]} />}
        </div>
      );
    case 'opponentStar': return <Big value={fact.points} active={active} color={opponentColor(game)} label={fact.player} note={game ? `Best starter for ${game.opponent}` : 'Their best starter'} />;
    case 'bust':
      return (
        <div>
          <Rise className="mb-4 text-3xl font-semibold text-ink">{fact.player}</Rise>
          <Bars active={active} rows={[{ label: 'Projected', value: fact.projected }, { label: 'Scored', value: fact.points, strong: true, color }]} />
        </div>
      );
    case 'biddingWar': return <BiddingWar fact={fact} active={active} color={color} />;
    case 'pickup': return <Pickup fact={fact} active={active} color={color} />;
    case 'trade': return <Trade fact={fact} />;
    case 'benchRegret': return <Regret fact={fact} game={game} active={active} color={color} />;
    case 'market': return <Market fact={fact} active={active} color={color} />;
    case 'droppedPlayerBoom': return <Big value={fact.points} active={active} color="var(--gold)" label={fact.player} note={`Cut in week ${fact.droppedInWeek}, now with ${fact.nowWith}`} />;
    case 'gotAway': return <Big value={fact.points} active={active} color="var(--gold)" label={fact.player} note={`You bid $${fact.ourBid} in week ${fact.lostInWeek}. ${fact.nowWith} paid $${fact.winningBid}.`} />;
    default: return null;
  }
}

export { Rise };

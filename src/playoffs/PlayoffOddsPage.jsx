import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { applyPicks, applyReadings, formatOdds, playoffOdds, projectedScores, tableAfterWeeks } from '../../lib/playoffs.mjs';
import { formatTime } from '../winprob/data';
import { loadSeason, loadWeekReadings } from './data';
import WhatIfMatchups from './WhatIfMatchups';

const REFRESH_MS = 60_000;
const BAR_COLOR = '#3987e5';

const recordText = ({ wins, losses, ties }) => (ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`);

function OddsChange({ baseline, odds }) {
  const change = Math.round(odds * 100) - Math.round(baseline * 100);
  if (change === 0) return <span className="block text-xs font-normal text-ink-3">No change</span>;
  return (
    <span className="block text-xs font-normal text-ink-2">
      <span aria-hidden="true">{change > 0 ? '▲' : '▼'} {Math.abs(change)}</span>
      <span className="sr-only">{change > 0 ? 'up' : 'down'} {Math.abs(change)} {Math.abs(change) === 1 ? 'point' : 'points'}</span>
    </span>
  );
}

export default function PlayoffOddsPage() {
  const [season, setSeason] = useState(null);
  const [readings, setReadings] = useState([]);
  const [picks, setPicks] = useState({});
  const [error, setError] = useState(null);
  const deferredPicks = useDeferredValue(picks); // keeps the slider smooth while odds catch up

  useEffect(() => {
    let cancelled = false;
    let timer;
    (async () => {
      try {
        const loaded = await loadSeason();
        const loadedReadings = await loadWeekReadings(loaded);
        if (cancelled) return;
        setReadings(loadedReadings);
        setSeason(loaded);
        timer = setInterval(async () => {
          const next = await loadWeekReadings(loaded);
          if (!cancelled && next.length > 0) setReadings(next);
        }, REFRESH_MS);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const latest = readings.at(-1);
  const whatIfWeek = season?.schedule.find((w) => w.week === latest?.week) ?? season?.schedule[0];
  const schedule = useMemo(() => (season ? applyReadings(season.schedule, readings) : []), [season, readings]);

  const baseline = useMemo(() => (season ? playoffOdds({
    teams: season.teams,
    schedule,
    playoffSpots: season.playoffSpots,
  }) : {}), [season, schedule]);

  const hasPicks = Object.keys(deferredPicks).length > 0;
  const whatIfWeekNumber = whatIfWeek?.week;
  const odds = useMemo(() => (season && hasPicks ? playoffOdds({
    teams: season.teams,
    schedule: applyPicks(schedule, whatIfWeekNumber, deferredPicks, season.teams),
    playoffSpots: season.playoffSpots,
  }) : baseline), [season, schedule, whatIfWeekNumber, deferredPicks, hasPicks, baseline]);

  // With picks, the table shows where everyone stands after the picked week.
  const table = useMemo(() => {
    if (!season) return [];
    if (!hasPicks) return season.teams;
    const played = applyPicks(schedule, whatIfWeekNumber, deferredPicks, season.teams).filter((w) => w.week <= whatIfWeekNumber);
    return tableAfterWeeks(season.teams, played);
  }, [season, schedule, whatIfWeekNumber, deferredPicks, hasPicks]);

  const rows = useMemo(() => (season ? table
    .map((team) => ({ ...team, odds: odds[team.id], baseline: baseline[team.id] }))
    .sort((a, b) => b.odds - a.odds || b.wins - a.wins || b.pointsFor - a.pointsFor) : []), [season, table, odds, baseline]);

  const names = useMemo(() => Object.fromEntries((season?.teams ?? []).map((team) => [team.id, team.name])), [season]);

  const projected = useMemo(() => {
    const week = schedule.find((w) => w.week === whatIfWeekNumber);
    return week ? projectedScores(week, season.teams) : {};
  }, [schedule, whatIfWeekNumber, season]);

  const final = season?.schedule.length === 0;
  const recordedWeeks = readings.map((r) => r.week).join(' and ');
  const showMatchups = whatIfWeek && whatIfWeek.pairs.length > 0;

  return (
    <div className="min-h-screen bg-page pb-12">
      <div className="bg-gradient-to-r from-blue-800 to-purple-800 px-4 py-3 text-white shadow-lg sm:p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-xl font-bold sm:mb-2 sm:text-3xl md:text-4xl">The New World Order</h1>
          <div className="text-sm sm:text-lg md:text-xl">Playoff odds</div>
        </div>
      </div>

      <main className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 ${showMatchups ? 'max-w-7xl' : 'max-w-3xl'}`}>
        {error && (
          <p role="alert" className="rounded-lg bg-surface p-4 text-ink-2 shadow">
            Couldn&apos;t load playoff odds ({error}).
          </p>
        )}
        {!error && !season && <p className="p-4 text-ink-2">Loading…</p>}

        {season && (
          <>
            <div className={showMatchups ? 'grid items-start gap-6 lg:grid-cols-2' : ''}>
              <div className="lg:sticky lg:top-4 lg:order-2">
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1 text-xs text-ink-2 sm:text-sm">
                  <span>Top {season.playoffSpots} make the playoffs</span>
                  {latest && !hasPicks && (
                    <span className="text-right">
                      {latest.live ? 'Games in progress · ' : ''}Updated {formatTime(latest.t)}
                    </span>
                  )}
                  {hasPicks && <span className="text-right font-medium text-ink">Showing your picks</span>}
                </div>
                <div className="overflow-hidden rounded-lg bg-surface shadow">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-ink-3">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Team</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Record</th>
                        <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Points for</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Odds</th>
                        <th scope="col" className="w-14 py-2 pr-3 sm:w-1/4"><span className="sr-only">Odds chart</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((team) => (
                        <tr key={team.id} className="border-t border-line">
                          <td className="px-3 py-3 font-medium text-ink [overflow-wrap:anywhere]">{team.name}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-ink-2">{recordText(team)}</td>
                          <td className="hidden px-2 py-3 text-right tabular-nums text-ink-2 sm:table-cell">{team.pointsFor.toFixed(1)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-ink">
                            {formatOdds(team.odds, final)}
                            {hasPicks && <OddsChange baseline={team.baseline} odds={team.odds} />}
                          </td>
                          <td className="py-3 pr-3" aria-hidden="true">
                            <div className="relative h-2 rounded bg-raised">
                              <div className="h-full rounded" style={{ width: `${team.odds * 100}%`, background: BAR_COLOR }} />
                              {hasPicks && (
                                <div
                                  className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-ink"
                                  style={{ left: `${team.baseline * 100}%` }}
                                  title="Odds before your picks"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {showMatchups && (
                <div className="lg:order-1">
                  <WhatIfMatchups
                    week={whatIfWeek.week}
                    pairs={whatIfWeek.pairs}
                    names={names}
                    odds={odds}
                    projected={projected}
                    picks={picks}
                    onPicksChange={setPicks}
                  />
                </div>
              )}
            </div>
              {hasPicks && <p className="mt-4 px-1 text-xs text-ink-3">With picks, all of Week {whatIfWeekNumber}&apos;s games count as decided, and records and points for include them. The white tick and arrows compare with the odds before your picks.</p>}
              <p className="mt-4 max-w-3xl px-1 text-xs text-ink-3">
                {final
                  ? 'The regular season is over, so these are the final places.'
                  : <>Each team&apos;s share of 20,000 simulated finishes to the regular season, ranked by record and then points for.
                    Future weeks use season scoring pulled toward the league average, allowing for teams getting better or worse. They don&apos;t look at
                    rosters or injuries.{readings.length > 0 ? ` ${readings.length > 1 ? `Weeks ${recordedWeeks} use` : `Week ${recordedWeeks} uses`} the same live estimates as the win probability page.` : ''}</>}
              </p>
          </>
        )}
      </main>
    </div>
  );
}

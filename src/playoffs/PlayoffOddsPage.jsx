import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { applyPicks, applyReadings, biggestMovers, formatOdds, lastPickedWeek, projectedScores, prunePicks, sortStandings, tableAfterWeeks } from '../../lib/playoffs.mjs';
import { startPolling } from '../polling';
import { formatTime, teamColor } from '../winprob/data';
import { loadSeason, loadWeekReadings } from './data';
import { loadPicks, savePicks } from './picks';
import useSimulatedOdds from './useSimulatedOdds';
import WhatIfMatchups from './WhatIfMatchups';

const REFRESH_MS = 60_000;

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

const sameReadings = (a, b) => a.length === b.length && a.every((reading, i) => reading.week === b[i].week && reading.t === b[i].t);

// On a phone the table sits far above the games, so this shows what a pick just changed.
function OddsBar({ rows, tableVisible, returning, onViewTable, onReturn }) {
  const movers = biggestMovers(rows, 2);
  if (tableVisible && !returning) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-3 py-1.5 shadow-lg max-sm:bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex min-h-11 max-w-3xl items-center gap-3">
        {tableVisible ? (
          <button type="button" onClick={onReturn} className="min-h-11 flex-1 rounded-md bg-gold px-3 text-sm font-semibold text-page">
            <span aria-hidden="true">↓ </span>Back to your picks
          </button>
        ) : (
          <>
            <div className="min-w-0 flex-1 text-xs text-ink-2">
              {movers.length === 0 && 'No change to anyone\'s odds yet'}
              {movers.map((team) => (
                <div key={team.id} className="flex justify-between gap-2">
                  <span className="truncate">{team.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">
                    <span aria-hidden="true">{team.change > 0 ? '▲' : '▼'} </span>
                    <span className="sr-only">{team.change > 0 ? 'up' : 'down'} </span>
                    {Math.abs(team.change)}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" onClick={onViewTable} className="min-h-11 shrink-0 rounded-md bg-raised px-3 text-sm font-medium text-ink">
              View table
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayoffOddsPage() {
  const [season, setSeason] = useState(null);
  const [readings, setReadings] = useState([]);
  const [picks, setPicks] = useState({}); // week number -> that week's picks
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [error, setError] = useState(null);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [tableVisible, setTableVisible] = useState(true);
  const [returnY, setReturnY] = useState(null); // where "View table" was tapped
  const tableRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let stopPolling = null;
    (async () => {
      try {
        const loaded = await loadSeason();
        const first = await loadWeekReadings(loaded);
        if (cancelled) return;
        setReadings(first.readings);
        setUpdateFailed(first.failed);
        setPicks(prunePicks(loadPicks(loaded.season), loaded.schedule));
        setSeason(loaded);
        stopPolling = startPolling(async () => {
          const next = await loadWeekReadings(loaded);
          if (cancelled) return;
          setUpdateFailed(next.failed);
          // Unchanged readings keep their identity, so the odds aren't simulated again for nothing.
          if (!next.failed) setReadings((prev) => (sameReadings(prev, next.readings) ? prev : next.readings));
        }, REFRESH_MS);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, []);

  const updatePicks = (next) => {
    setPicks(next);
    savePicks(season.season, next);
  };

  const latest = readings.at(-1);
  const matchupWeeks = useMemo(() => (season?.schedule ?? []).filter((w) => w.pairs.length > 0), [season]);
  const whatIfWeek = matchupWeeks.find((w) => w.week === selectedWeek)
    ?? matchupWeeks.find((w) => w.week === latest?.week)
    ?? matchupWeeks[0];
  const schedule = useMemo(() => (season ? applyReadings(season.schedule, readings) : []), [season, readings]);

  const lastPicked = lastPickedWeek(picks);
  const hasPicks = lastPicked !== null;
  const lockedSchedule = useMemo(
    () => (season ? applyPicks(schedule, picks, season.teams) : []),
    [season, schedule, picks],
  );

  const baseline = useSimulatedOdds(useMemo(() => (season ? {
    teams: season.teams,
    schedule,
    playoffSpots: season.playoffSpots,
  } : null), [season, schedule]));
  const pickedOdds = useSimulatedOdds(useMemo(() => (season && hasPicks ? {
    teams: season.teams,
    schedule: lockedSchedule,
    playoffSpots: season.playoffSpots,
  } : null), [season, lockedSchedule, hasPicks]), { quick: true });
  const odds = (hasPicks && pickedOdds) || baseline;
  const ready = season && baseline;

  // With picks, the table shows where everyone stands after the last picked week.
  const table = useMemo(() => {
    if (!season) return [];
    if (!hasPicks) return season.teams;
    return tableAfterWeeks(season.teams, lockedSchedule.filter((w) => w.week <= lastPicked));
  }, [season, lockedSchedule, lastPicked, hasPicks]);

  const rows = useMemo(() => (ready ? sortStandings(table)
    .map((team) => ({ ...team, odds: odds[team.id], baseline: baseline[team.id] })) : []), [ready, table, odds, baseline]);

  const names = useMemo(() => Object.fromEntries((season?.teams ?? []).map((team) => [team.id, team.name])), [season]);

  const whatIfWeekNumber = whatIfWeek?.week;
  const projected = useMemo(() => {
    const week = schedule.find((w) => w.week === whatIfWeekNumber);
    return week ? projectedScores(week, season.teams) : {};
  }, [schedule, whatIfWeekNumber, season]);

  const seasonOver = season?.schedule.length === 0;
  // Picks through the last week leave no games to simulate, so these odds are certain.
  const final = seasonOver || (hasPicks && lastPicked >= season.schedule.at(-1).week);
  const recordedWeeks = readings.map((r) => r.week).join(' and ');
  const showMatchups = matchupWeeks.length > 0;

  useEffect(() => {
    const table = tableRef.current;
    if (!ready || !table) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setTableVisible(entry.isIntersecting);
      if (!entry.isIntersecting) setReturnY(null);
    }, { threshold: 0.3 });
    observer.observe(table);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only needs to start once the table exists
  }, [Boolean(ready)]);

  const viewTable = () => {
    setReturnY(window.scrollY);
    tableRef.current?.scrollIntoView({ block: 'start' });
  };
  const returnToPicks = () => {
    window.scrollTo(0, returnY);
    setReturnY(null);
  };

  return (
    <div className={`min-h-screen bg-page pb-12 ${hasPicks ? 'max-lg:pb-24' : ''}`}>
      <main className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 ${showMatchups ? 'max-w-7xl' : 'max-w-3xl'}`}>
        {error && (
          <p role="alert" className="rounded-lg bg-surface p-4 text-ink-2 shadow">
            Couldn&apos;t load playoff odds ({error}).
          </p>
        )}
        {!error && !ready && <p className="p-4 text-ink-2">Loading…</p>}

        {ready && (
          <>
            <div className={showMatchups ? 'grid items-start gap-6 lg:grid-cols-2' : ''}>
              <div className="lg:sticky lg:top-4 lg:order-2">
                <div ref={tableRef} className="mb-2 flex scroll-mt-2 items-baseline justify-between gap-3 px-1 text-xs text-ink-2 sm:text-sm">
                  <span>Top {season.playoffSpots} make the playoffs</span>
                  {latest && !hasPicks && (
                    <span className="text-right">
                      {updateFailed ? 'Couldn\'t update · last ' : ''}{!updateFailed && latest.live ? 'Games in progress · ' : ''}{updateFailed ? 'updated' : 'Updated'} {formatTime(latest.t)}
                    </span>
                  )}
                  {hasPicks && <span className="text-right font-medium text-ink">Your picks through Week {lastPicked}</span>}
                </div>
                <div className="overflow-hidden rounded-lg bg-surface shadow">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-ink-3">
                      <tr>
                        <th scope="col" className="w-7 py-2 pl-3 text-right font-medium"><span className="sr-only">Seed</span></th>
                        <th scope="col" className="px-3 py-2 font-medium">Team</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Record</th>
                        <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Points for</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Odds</th>
                        <th scope="col" className="w-14 py-2 pr-3 sm:w-1/4"><span className="sr-only">Odds chart</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((team, index) => {
                        const inPlayoffs = index < season.playoffSpots;
                        const firstOut = index === season.playoffSpots;
                        return (
                        <Fragment key={team.id}>
                        {firstOut && (
                          <tr>
                            <td colSpan={6} className="px-3 py-0.5">
                              <div className="flex items-center gap-2 text-xs text-gold">
                                <span className="flex-1 border-t border-dashed border-gold" aria-hidden="true" />
                                Playoff line
                                <span className="flex-1 border-t border-dashed border-gold" aria-hidden="true" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className={firstOut ? '' : 'border-t border-line'}>
                          <td className="py-3 pl-3 text-right tabular-nums text-ink-3">{index + 1}</td>
                          <td className={`px-3 py-3 font-medium [overflow-wrap:anywhere] ${inPlayoffs ? 'text-ink' : 'text-ink-2'}`}>
                            <span className="flex items-center gap-2">
                              <span className="w-1 self-stretch rounded-full" style={{ background: teamColor(team.id) }} aria-hidden="true" />
                              <span className="min-w-0">{team.name}</span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-ink-2">{recordText(team)}</td>
                          <td className="hidden px-2 py-3 text-right tabular-nums text-ink-2 sm:table-cell">{team.pointsFor.toFixed(1)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-ink">
                            {formatOdds(team.odds, final)}
                            {hasPicks && <OddsChange baseline={team.baseline} odds={team.odds} />}
                          </td>
                          <td className="py-3 pr-3" aria-hidden="true">
                            <div className="relative h-2 rounded bg-raised">
                              <div className="h-full rounded" style={{ width: `${team.odds * 100}%`, background: inPlayoffs ? 'var(--ink-2)' : 'var(--ink-3)' }} />
                              {hasPicks && (
                                <div
                                  className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-gold"
                                  style={{ left: `${team.baseline * 100}%` }}
                                  title="Odds before your picks"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {showMatchups && (
                <div className="lg:order-1">
                  <WhatIfMatchups
                    week={whatIfWeek.week}
                    weeks={matchupWeeks.map((w) => w.week)}
                    onWeekChange={setSelectedWeek}
                    pairs={whatIfWeek.pairs}
                    names={names}
                    odds={odds}
                    final={final}
                    projected={projected}
                    picksByWeek={picks}
                    onPicksChange={updatePicks}
                  />
                </div>
              )}
            </div>
              {hasPicks && <p className="mt-4 px-1 text-xs text-ink-3">With picks, every game through Week {lastPicked} counts as decided, and records and points for include them. Later weeks stay simulated from real scoring, so picks don&apos;t change how good a team looks. The tick and arrows compare with the odds before your picks.</p>}
              <p className="mt-4 max-w-3xl px-1 text-xs text-ink-3">
                {seasonOver
                  ? 'The regular season is over, so these are the final places.'
                  : <>Each team&apos;s share of 20,000 simulated finishes to the regular season, ranked by record and then points for.
                    Future weeks use season scoring pulled toward the league average, allowing for teams getting better or worse. They don&apos;t look at
                    rosters or injuries.{readings.length > 0 ? ` ${readings.length > 1 ? `Weeks ${recordedWeeks} use` : `Week ${recordedWeeks} uses`} the same live estimates as the win probability page.` : ''}</>}
              </p>
            {hasPicks && (
              <OddsBar
                rows={rows}
                tableVisible={tableVisible}
                returning={returnY !== null}
                onViewTable={viewTable}
                onReturn={returnToPicks}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

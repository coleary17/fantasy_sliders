import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MatchupRow from './MatchupRow';
import { findEvents } from './events';
import { findScores } from './scoring';
import { closestFirst, formatTime, layoutTimeline, loadWeek, loadWeekKeys, matchupKey, matchupSeries, scoreAxisMax } from './data';

const REFRESH_MS = 60_000;

const MODE_KEY = 'wp-chart-mode';
const MODES = [['win', 'Win %'], ['score', 'Score']];

const weekNumber = (key) => Number(key.split('-w')[1]);

// Remembering the choice is a convenience, so a browser that blocks storage just starts on Win %.
function savedMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'score' ? 'score' : 'win';
  } catch {
    return 'win';
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Nothing to do: the choice still holds for this visit.
  }
}

export default function WinProbabilityPage() {
  const [keys, setKeys] = useState(null);
  const [selected, setSelected] = useState(null);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState({ week: null, keys: [] });
  const [expanded, setExpanded] = useState(() => new Set());
  const [cursor, setCursor] = useState(null); // { t, source: matchup key, pinned }
  const [mode, setMode] = useState(savedMode);
  const scrollers = useRef(new Map());
  const stickToEnd = useRef(true);
  const ownScrolls = useRef(new WeakMap()); // where the page itself last moved each chart
  const sharedScrollLeft = useRef(0);

  const activeKey = selected ?? keys?.at(-1) ?? null;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const weekKeys = await loadWeekKeys();
        if (cancelled) return;
        setKeys(weekKeys);
        const key = selected ?? weekKeys.at(-1);
        if (key) {
          const week = await loadWeek(key);
          if (!cancelled) {
            setDoc(week);
            // Order is fixed per visit, so a refresh can't move a row just as it's tapped.
            setOrder((prev) => (prev.week === key ? prev : { week: key, keys: closestFirst(week) }));
          }
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected]);

  const timeline = useMemo(() => (doc ? layoutTimeline(doc.snapshots) : null), [doc]);
  const matchups = useMemo(() => new Map((doc?.matchups ?? []).map((pair) => {
    const series = matchupSeries(doc, pair);
    return [matchupKey(pair), { series, scoreMax: scoreAxisMax(series), events: findEvents(doc, series), scores: findScores(doc, series) }];
  })), [doc]);

  // Moves a chart and remembers where to, so its scroll event isn't mistaken for the reader's.
  const scrollChart = useCallback((el, left) => {
    if (Math.abs(el.scrollLeft - left) < 1) return;
    el.scrollLeft = left;
    ownScrolls.current.set(el, el.scrollLeft);
  }, []);

  const moveCursor = useCallback((source, t) => {
    setCursor((prev) => (prev?.t === t && prev.source === source && !prev.pinned ? prev : { t, source, pinned: false }));
  }, []);
  const endCursor = useCallback((source) => {
    setCursor((prev) => (prev?.source === source ? null : prev));
  }, []);

  // All charts in a week share a time axis, so they scroll together.
  const handleScroll = useCallback((event) => {
    const source = event.currentTarget;
    const own = ownScrolls.current.get(source);
    ownScrolls.current.delete(source);
    if (own !== undefined && Math.abs(source.scrollLeft - own) < 1) return;
    setCursor(null); // a cursor left behind would point at the wrong moment
    stickToEnd.current = source.scrollLeft + source.clientWidth >= source.scrollWidth - 4;
    sharedScrollLeft.current = source.scrollLeft;
    scrollers.current.forEach((el) => {
      if (el !== source) scrollChart(el, source.scrollLeft);
    });
  }, [scrollChart]);

  // Open on the latest update, and keep following it unless the reader has scrolled back.
  // A newly expanded chart joins the others at the same point in time.
  useLayoutEffect(() => {
    scrollers.current.forEach((el) => {
      scrollChart(el, stickToEnd.current ? el.scrollWidth - el.clientWidth : sharedScrollLeft.current);
    });
  }, [doc, expanded, scrollChart]);

  // A tap anywhere else lets go of the selected moment. A finger that scrolls never gets here,
  // because the browser cancels the touch instead of ending it.
  useEffect(() => {
    if (cursor === null) return undefined;
    const handleTap = (event) => {
      if (event.pointerType === 'mouse') return;
      if (event.target.closest?.('svg[role="img"], button, a, summary, select, input')) return;
      setCursor(null);
    };
    document.addEventListener('pointerup', handleTap);
    return () => document.removeEventListener('pointerup', handleTap);
  }, [cursor]);

  // Brings a key moment to the middle of every open chart.
  const jumpToEvent = (source, event) => {
    setCursor({ t: event.t, source, pinned: true });
    stickToEnd.current = false;
    scrollers.current.forEach((el) => {
      scrollChart(el, Math.max(0, timeline.xs[event.index] - el.clientWidth / 2));
      sharedScrollLeft.current = el.scrollLeft;
    });
  };

  const selectWeek = (key) => {
    stickToEnd.current = true;
    setDoc(null);
    setCursor(null);
    setExpanded(new Set());
    setSelected(key);
  };

  const selectMode = (next) => {
    setMode(next);
    saveMode(next);
  };

  const toggleMatchup = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const lastUpdate = doc?.snapshots.at(-1);
  const docMatches = doc && activeKey && weekNumber(activeKey) === doc.week;
  const rank = (pair) => {
    const index = order.keys.indexOf(matchupKey(pair));
    return index === -1 ? order.keys.length : index;
  };
  const orderedPairs = doc ? [...doc.matchups].sort((x, y) => rank(x) - rank(y)) : [];

  return (
    <div className="min-h-screen bg-page pb-12">
      <div className="bg-gradient-to-r from-blue-800 to-purple-800 px-4 py-3 text-white shadow-lg sm:p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-xl font-bold sm:mb-2 sm:text-3xl md:text-4xl">The New World Order</h1>
          <div className="text-sm sm:text-lg md:text-xl">Matchup win probability</div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-2 pb-4 sm:px-4 sm:pb-6">
        {error && !doc && (
          <p role="alert" className="rounded-lg bg-surface p-4 text-ink-2 shadow">
            Couldn&apos;t load win probability data ({error}).
          </p>
        )}

        {keys && keys.length === 0 && (
          <p className="rounded-lg bg-surface p-4 text-ink-2 shadow">
            Nothing recorded yet. The first update appears after the collector next runs.
          </p>
        )}

        {keys && keys.length > 0 && (
          <div className="sticky top-0 z-30 -mx-2 mb-2 flex items-center justify-between gap-3 bg-page px-2 py-2 sm:-mx-4 sm:mb-4 sm:px-4">
            <div className="flex min-w-0 gap-1 overflow-x-auto" role="group" aria-label="Week">
              {keys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectWeek(key)}
                  aria-pressed={key === activeKey}
                  className={`min-h-11 shrink-0 rounded-md px-3 text-sm font-medium ${
                    key === activeKey ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:bg-raised'
                  }`}
                >
                  Week {weekNumber(key)}
                </button>
              ))}
            </div>
            {cursor && docMatches && (
              <div className="flex shrink-0 items-center gap-2 text-right text-xs text-ink sm:text-sm">
                <span>Viewing {formatTime(cursor.t)}</span>
                <button
                  type="button"
                  onClick={() => setCursor(null)}
                  className="min-h-11 rounded-md bg-surface px-3 font-medium text-ink-2 hover:bg-raised"
                >
                  Latest
                </button>
              </div>
            )}
            {!cursor && lastUpdate && docMatches && (
              <div className="shrink-0 text-right text-xs text-ink-2 sm:text-sm">
                {lastUpdate.live ? <>Games in progress<br className="sm:hidden" /><span className="hidden sm:inline"> · </span></> : ''}Updated {formatTime(lastUpdate.t)}
              </div>
            )}
          </div>
        )}

        {docMatches && timeline && (
          <>
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-ink-3">Closest matchups first. Tap one for its full chart and lineups, and move along a chart to step through the week.</p>
              <div className="flex shrink-0 gap-1" role="group" aria-label="Chart shows">
                {MODES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectMode(value)}
                    aria-pressed={mode === value}
                    className={`min-h-11 rounded-md px-3 text-sm font-medium ${
                      mode === value ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:bg-raised'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {doc.reconstructed && (
              <p className="mb-2 px-1 text-xs text-ink-3">Rebuilt from play-by-play after the games, so the lines are close estimates rather than a live recording. Final scores and lineups are exact.</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              {orderedPairs.map((pair) => {
                const key = matchupKey(pair);
                const { series, scoreMax, events, scores } = matchups.get(key);
                if (series.length === 0) return null;
                return (
                  <MatchupRow
                    key={key}
                    mode={mode}
                    scoreMax={scoreMax}
                    doc={doc}
                    pair={pair}
                    series={series}
                    events={events}
                    scores={scores}
                    matchKey={key}
                    cursor={cursor}
                    onCursor={(t) => moveCursor(key, t)}
                    onCursorEnd={() => endCursor(key)}
                    onSelectEvent={(event) => jumpToEvent(key, event)}
                    timeline={timeline}
                    expanded={expanded.has(key)}
                    onToggle={() => toggleMatchup(key)}
                    onScroll={handleScroll}
                    scrollRef={(el) => {
                      if (el) scrollers.current.set(key, el);
                      else scrollers.current.delete(key);
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {docMatches && (
          <p className="mt-4 text-xs text-ink-3">
            {mode === 'score' ? 'Each line is a team\'s score so far.' : 'A line above the midpoint favors the top team, and below it the bottom team.'} Scores and projections come
            from Sleeper, and game clocks from ESPN. Charts only cover the time games are on, and dotted sections skip the gaps between them. White dots mark key moments. INT, FR, SAF and BLK mark defensive plays, PA marks a score that drops a defense to a lower points-allowed tier, and small ticks mark sacks.
            Each estimate compares current points plus the unplayed share of each starter&apos;s projection.
          </p>
        )}
      </main>
    </div>
  );
}

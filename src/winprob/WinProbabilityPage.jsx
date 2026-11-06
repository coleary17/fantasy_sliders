import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MatchupRow from './MatchupRow';
import { closestFirst, formatTime, layoutTimeline, loadWeek, loadWeekKeys, matchupKey, matchupSeries } from './data';

const REFRESH_MS = 60_000;

const weekNumber = (key) => Number(key.split('-w')[1]);

export default function WinProbabilityPage() {
  const [keys, setKeys] = useState(null);
  const [selected, setSelected] = useState(null);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState({ week: null, keys: [] });
  const [expanded, setExpanded] = useState(() => new Set());
  const scrollers = useRef(new Map());
  const stickToEnd = useRef(true);
  const syncing = useRef(false);
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

  // All charts in a week share a time axis, so they scroll together.
  const handleScroll = useCallback((event) => {
    if (syncing.current) return;
    const source = event.currentTarget;
    stickToEnd.current = source.scrollLeft + source.clientWidth >= source.scrollWidth - 4;
    sharedScrollLeft.current = source.scrollLeft;
    syncing.current = true;
    scrollers.current.forEach((el) => {
      if (el !== source) el.scrollLeft = source.scrollLeft;
    });
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  // Open on the latest update, and keep following it unless the reader has scrolled back.
  // A newly expanded chart joins the others at the same point in time.
  useLayoutEffect(() => {
    scrollers.current.forEach((el) => {
      el.scrollLeft = stickToEnd.current ? el.scrollWidth : sharedScrollLeft.current;
    });
  }, [doc, expanded]);

  const selectWeek = (key) => {
    stickToEnd.current = true;
    setDoc(null);
    setExpanded(new Set());
    setSelected(key);
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
            {lastUpdate && docMatches && (
              <div className="shrink-0 text-right text-xs text-ink-2 sm:text-sm">
                {lastUpdate.live ? <>Games in progress<br className="sm:hidden" /><span className="hidden sm:inline"> · </span></> : ''}Updated {formatTime(lastUpdate.t)}
              </div>
            )}
          </div>
        )}

        {docMatches && timeline && (
          <>
            <p className="mb-2 px-1 text-xs text-ink-3">Closest matchups first. Tap one for its full chart and lineups.</p>
            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              {orderedPairs.map((pair) => {
                const series = matchupSeries(doc, pair);
                if (series.length === 0) return null;
                const key = matchupKey(pair);
                return (
                  <MatchupRow
                    key={key}
                    doc={doc}
                    pair={pair}
                    series={series}
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
            A line above the midpoint favors the top team, and below it the bottom team. Scores and projections come
            from Sleeper, and game clocks from ESPN. Dotted sections skip time with no games on.
            Each estimate compares current points plus the unplayed share of each starter&apos;s projection.
          </p>
        )}
      </main>
    </div>
  );
}

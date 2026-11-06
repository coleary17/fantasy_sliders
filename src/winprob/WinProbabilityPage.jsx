import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import HelpText from '../HelpText';
import PageHeader from '../PageHeader';
import { startPolling } from '../polling';
import useIsPhone from '../useIsPhone';
import MatchupRow from './MatchupRow';
import { findEvents } from './events';
import { findScores } from './scoring';
import { closestFirst, formatTime, indexAtTime, layoutTimeline, loadWeek, loadWeekKeys, matchupKey, matchupSeries, scoreAxisMax } from './data';

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
  const [zoomed, setZoomed] = useState(false);
  const isPhone = useIsPhone();
  const fit = isPhone && !zoomed; // a phone starts on the whole week, and zooming in scrolls it
  const scrollers = useRef(new Map());
  const stickToEnd = useRef(true);
  const ownScrolls = useRef(new WeakMap()); // where the page itself last moved each chart
  const sharedScrollLeft = useRef(0);

  const activeKey = selected ?? keys?.at(-1) ?? null;
  const pastWeek = selected !== null && keys !== null && selected !== keys.at(-1); // won't change, so no polling

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
    const stopPolling = pastWeek ? null : startPolling(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, [selected, pastWeek]);

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
  }, [doc, expanded, fit, scrollChart]);

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
    // The moment may be far down its list, so make sure its chart is on screen to show it.
    scrollers.current.get(source)?.scrollIntoView({ block: 'nearest' });
  };

  // Zooming in on a selected moment should land on that moment.
  const toggleZoom = () => {
    if (cursor && !zoomed) {
      const index = indexAtTime(matchups.get(cursor.source).series, cursor.t);
      const [el] = scrollers.current.values();
      stickToEnd.current = false;
      sharedScrollLeft.current = Math.max(0, timeline.xs[index] - (el?.clientWidth ?? 0) / 2);
    }
    setZoomed(!zoomed);
  };

  const selectWeek = (key) => {
    stickToEnd.current = true;
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
      <PageHeader view="Matchup win probability" />

      <main className="mx-auto max-w-7xl px-2 pb-4 sm:px-4 sm:pb-6">
        {error && !docMatches && (
          <p role="alert" className="mt-2 rounded-lg bg-surface p-4 text-ink-2 shadow">
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
            <select
              value={activeKey}
              onChange={(event) => selectWeek(event.target.value)}
              aria-label="Week"
              className="min-h-11 shrink-0 rounded-md bg-surface px-3 text-sm font-medium text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {[...keys].reverse().map((key) => (
                <option key={key} value={key}>Week {weekNumber(key)}</option>
              ))}
            </select>
            {!docMatches && !error && <div className="text-xs text-ink-2 sm:text-sm">Loading…</div>}
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
                {error
                  ? <>Couldn&apos;t update<br className="sm:hidden" /><span className="hidden sm:inline"> · </span>Last updated {formatTime(lastUpdate.t)}</>
                  : <>{lastUpdate.live ? <>Games in progress<br className="sm:hidden" /><span className="hidden sm:inline"> · </span></> : ''}Updated {formatTime(lastUpdate.t)}</>}
              </div>
            )}
          </div>
        )}

        {!keys && !error && <p className="p-4 text-ink-2">Loading…</p>}

        {doc && timeline && (
          <div aria-busy={!docMatches} className={docMatches ? '' : 'pointer-events-none opacity-50'}>
            <div className="mb-2 flex items-start justify-between gap-3 px-1 sm:items-center">
              <HelpText className="min-w-0 flex-1">Closest matchups first. Tap one for its full chart and lineups, then tap the chart to see any moment in the week.</HelpText>
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
                    fit={fit}
                    onToggleZoom={toggleZoom}
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
          </div>
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

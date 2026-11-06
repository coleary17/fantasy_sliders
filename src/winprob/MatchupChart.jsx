import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatPercent, formatTime, inSameWindow, scoreShare } from './data';
import { LABEL_HEIGHT, LABEL_WIDTH, layoutScoreLabels, scoreLineAnchor, thinMarks } from './scoring';

const HEIGHT = 180;
const TOP = 12;
const BOTTOM = 26;
const RIGHT_PAD = 56;
const LEFT_PAD = 12;
const TOOLTIP_WIDTH = 216;
const TOOLTIP_GAP = 10;
const GRID = 'var(--line)';
const MIDLINE = 'var(--midline)';
const SURFACE = 'var(--surface)';
const AREA_OPACITY = 0.2;
const EVENT_SNAP_PX = 10;
const INK = 'var(--ink)';
const SACK_TICK = 5;
const END_LABEL_GAP = 14; // keeps the two final scores readable when they're close
const MIN_TICK_GAP = 72;
const FIT_TICK_GAP = 110; // the first label starts at the axis, so the next has further to clear
const FIT_LABEL_GAP = LABEL_WIDTH + 6; // a squeezed week keeps only the labels that fit side by side
const FIT_EVENT_GAP = 14;

const yFor = (p) => TOP + (1 - p) * (HEIGHT - TOP - BOTTOM);

function buildSegments(points, yKey = 'y') {
  const solid = [];
  const breaks = [];
  points.forEach((point, i) => {
    if (i === 0) return;
    const prev = points[i - 1];
    const line = `M${prev.x},${prev[yKey]}L${point.x},${point[yKey]}`;
    (inSameWindow(prev, point) ? solid : breaks).push(line);
  });
  return { solid: solid.join(''), breaks: breaks.join('') };
}

function buildArea(points) {
  if (points.length < 2) return '';
  const mid = yFor(0.5);
  const line = points.map((p) => `L${p.x},${p.y}`).join('');
  return `M${points[0].x},${mid}${line}L${points.at(-1).x},${mid}Z`;
}

// Pushes the two final scores apart around their midpoint when they'd otherwise overlap.
function spreadEndLabels(yA, yB) {
  const shortfall = END_LABEL_GAP - Math.abs(yA - yB);
  if (shortfall <= 0) return [yA, yB];
  return yA <= yB ? [yA - shortfall / 2, yB + shortfall / 2] : [yA + shortfall / 2, yB - shortfall / 2];
}

function ColorKey({ color }) {
  return <span className="mr-1.5 inline-block h-0.5 w-3 rounded-full align-middle" style={{ background: color }} aria-hidden="true" />;
}

// A phone reads values here instead of in a tooltip, which would cover most of the chart.
// It always has a reading to show, so the chart below never shifts.
function Readout({ point, title, latest, nameA, nameB, colorA, colorB, canZoom, fit, onToggleZoom, onClose }) {
  return (
    <div className="mb-1 text-xs">
      <div className="flex min-h-11 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-ink-3">{latest ? `Latest · ${formatTime(point.t)}` : formatTime(point.t)}</div>
          {title && <div className="truncate font-medium text-ink">{title}</div>}
        </div>
        {canZoom && (
          <button type="button" onClick={onToggleZoom} className="min-h-11 shrink-0 rounded-md bg-raised px-2.5 font-medium text-ink-2">
            {fit ? 'Zoom in' : 'Fit week'}
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-md bg-raised px-2.5 font-medium text-ink-2">
          Close<span aria-hidden="true"> ▲</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-3" aria-live="polite">
        {[[nameA, point.a, point.probability, colorA], [nameB, point.b, 1 - point.probability, colorB]].map(([name, team, probability, color]) => (
          <div key={name} className="min-w-0">
            <div className="truncate text-ink-2"><ColorKey color={color} />{name}</div>
            <div className="truncate tabular-nums text-ink-2">
              <strong className="text-sm text-ink">{formatPercent(probability)}</strong> · {team.points.toFixed(1)} pts
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchupChart({ mode, scoreMax, series, xs, ticks, contentWidth, fit, isPhone, onToggleZoom, onClose, nameA, nameB, colorA, colorB, scrollRef, onScroll, events, scores, shownIndex, showTooltip, onCursor, onCursorEnd }) {
  const [tooltipX, setTooltipX] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [edges, setEdges] = useState({ before: false, after: false });
  const scroller = useRef(null);
  const clipId = useId();

  const attachScroller = useCallback((el) => {
    scroller.current = el;
    scrollRef(el);
  }, [scrollRef]);

  // Phones hide scrollbars, so a fade at the edge is what says there's more chart that way.
  const updateEdges = useCallback((el) => {
    const before = el.scrollLeft > 1;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.before === before && prev.after === after ? prev : { before, after }));
  }, []);

  const scrollByPage = (direction) => {
    const el = scroller.current;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: calm ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => {
      setVisibleWidth(el.clientWidth);
      updateEdges(el);
    });
    observer.observe(el);
    observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [updateEdges]);

  // A short stretch of games fills the chart instead of leaving blank space on the right.
  const plotWidth = visibleWidth - LEFT_PAD - RIGHT_PAD;
  const canZoom = plotWidth > 0 && contentWidth > plotWidth;
  const stretch = contentWidth > 0 && plotWidth > 0 && (fit || plotWidth > contentWidth) ? plotWidth / contentWidth : 1;

  const points = useMemo(
    () => series.map((s, i) => ({
      ...s,
      x: xs[i] * stretch + LEFT_PAD,
      y: yFor(s.probability),
      aY: yFor(scoreShare(s.a.points, scoreMax)),
      bY: yFor(scoreShare(s.b.points, scoreMax)),
    })),
    [series, xs, stretch, scoreMax],
  );
  const scoreMode = mode === 'score';
  const { solid, breaks } = useMemo(() => buildSegments(points), [points]);
  const scoreLines = useMemo(() => ({ a: buildSegments(points, 'aY'), b: buildSegments(points, 'bY') }), [points]);
  const yOn = (point, side) => (scoreMode ? point[`${side}Y`] : point.y);
  const area = useMemo(() => buildArea(points), [points]);
  const colorFor = (p) => (p >= 0.5 ? colorA : colorB);
  const svgWidth = contentWidth * stretch + LEFT_PAD + RIGHT_PAD;
  const last = points.at(-1);
  const hovered = shownIndex === null ? null : points[shownIndex];
  const hoveredEvent = hovered && events.find((e) => e.index === shownIndex);
  const hoveredScores = hovered ? scores.filter((s) => s.index === shownIndex) : [];
  // Fit to the screen, a week has far more marks than room. Every one stays in the Moments list.
  const squeezed = fit && stretch < 1;
  const shownScores = useMemo(() => {
    const major = scores.filter((s) => !s.minor);
    return squeezed ? thinMarks(major, (index) => points[index].x, FIT_LABEL_GAP) : major;
  }, [scores, points, squeezed]);
  const shownEvents = useMemo(
    () => (squeezed ? thinMarks(events, (index) => points[index].x, FIT_EVENT_GAP) : events),
    [events, points, squeezed],
  );
  const labels = useMemo(
    () => layoutScoreLabels(shownScores, points, yFor(1), yFor(0), scoreMode ? scoreLineAnchor : undefined),
    [shownScores, points, scoreMode],
  );
  const ticksOnLine = squeezed ? [] : scores.filter((s) => s.minor);
  const shownTicks = ticks.reduce((kept, tick) => {
    const x = tick.x * stretch + LEFT_PAD;
    if (kept.length === 0 || x - kept.at(-1).x >= (squeezed ? FIT_TICK_GAP : MIN_TICK_GAP)) kept.push({ t: tick.t, x });
    return kept;
  }, []);

  const nearestIndex = (x) => {
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
    });
    // A key moment is a small target, so the cursor snaps to one close by.
    const nearbyEvent = [...shownScores, ...ticksOnLine, ...shownEvents].find((e) => Math.abs(points[e.index].x - x) <= EVENT_SNAP_PX);
    return nearbyEvent ? nearbyEvent.index : best;
  };

  // Keep the tooltip inside the visible part of the chart, whatever the scroll position.
  const tooltipLeft = (x) => {
    const el = scroller.current;
    const scrollLeft = el?.scrollLeft ?? 0;
    const visibleWidth = el?.clientWidth ?? svgWidth;
    const onScreen = x - scrollLeft;
    const preferred = onScreen + TOOLTIP_GAP + TOOLTIP_WIDTH <= visibleWidth
      ? onScreen + TOOLTIP_GAP
      : onScreen - TOOLTIP_GAP - TOOLTIP_WIDTH;
    return Math.max(0, Math.min(preferred, visibleWidth - TOOLTIP_WIDTH));
  };

  const activate = (index) => {
    setTooltipX(tooltipLeft(points[index].x));
    onCursor(points[index].t);
  };

  const pointerIndex = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return nearestIndex(event.clientX - rect.left);
  };

  // A mouse follows the pointer. A finger might be starting to scroll, so it only counts once it
  // lifts: the browser cancels a touch that turns into a scroll, so this never fires for one.
  const handleMouse = (event) => {
    if (event.pointerType === 'mouse') activate(pointerIndex(event));
  };

  const handleTap = (event) => {
    if (event.pointerType === 'mouse') return;
    const index = pointerIndex(event);
    if (showTooltip && index === shownIndex) onCursorEnd();
    else activate(index);
  };

  const handleKey = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      activate(Math.min(points.length - 1, Math.max(0, (shownIndex ?? points.length - 1) + step)));
    } else if (event.key === 'Escape') {
      onCursorEnd();
    }
  };

  // Fingers lift after a tap, so only a mouse leaving the chart dismisses the tooltip.
  const handlePointerLeave = (event) => {
    if (event.pointerType === 'mouse') onCursorEnd();
  };

  const summary = scoreMode
    ? `Score over time for ${nameA} against ${nameB}. At the latest update it is ${nameA} ${last.a.points.toFixed(1)}, ${nameB} ${last.b.points.toFixed(1)}. Use the left and right arrow keys to step through updates.`
    : `Win probability over time for ${nameA} against ${nameB}. ${nameA} is at ${formatPercent(last.probability)} at the latest update. Use the left and right arrow keys to step through updates.`;
  const [endYA, endYB] = spreadEndLabels(last.aY, last.bY);
  const leftAxis = scoreMode ? [scoreMax, scoreMax / 2, 0] : ['100%', '50%', '100%'];

  return (
    /* On a phone the chart stays in view under the week bar while the list below it scrolls. */
    <div className="z-20 -mx-3 bg-surface px-3 max-sm:top-[60px] max-sm:border-b max-sm:border-line max-sm:pb-1 sm:mx-0 sm:px-0 max-sm:[@media(min-height:600px)]:sticky">
    {isPhone && (
      <Readout
        point={hovered ?? last}
        title={hovered ? (hoveredScores.length > 0 ? hoveredScores.map((s) => s.title).join(' · ') : hoveredEvent?.title) : null}
        latest={!hovered}
        nameA={nameA}
        nameB={nameB}
        colorA={colorA}
        colorB={colorB}
        canZoom={canZoom}
        fit={fit}
        onToggleZoom={onToggleZoom}
        onClose={onClose}
      />
    )}
    {/* The key sits above the plot, where event labels can't run into it. */}
    {!isPhone && (
      <div className="mb-1 flex min-h-11 items-center justify-between gap-4 pl-11">
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-0.5 text-xs font-medium text-ink-2">
          <span className="min-w-0 [overflow-wrap:anywhere]"><ColorKey color={colorA} />{!scoreMode && '↑ '}{nameA}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]"><ColorKey color={colorB} />{!scoreMode && '↓ '}{nameB}</span>
        </div>
        {canZoom && (
          <button
            type="button"
            onClick={onToggleZoom}
            className="min-h-11 shrink-0 rounded-md bg-raised px-3 text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            {fit ? 'Zoom in' : 'Fit week'}
          </button>
        )}
      </div>
    )}
    <div className="flex">
      <div className="relative w-9 shrink-0 text-[11px] sm:w-11 sm:text-xs text-ink-3" style={{ height: HEIGHT }} aria-hidden="true">
        {[1, 0.5, 0].map((p, i) => (
          <span key={p} className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(p) }}>{leftAxis[i]}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        {!scoreMode && isPhone && (
          <>
            <div className="pointer-events-none absolute left-2 z-10 rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(1) + 2 }}>
              <ColorKey color={colorA} />↑
            </div>
            <div className="pointer-events-none absolute left-2 z-10 rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(0) - 20 }}>
              <ColorKey color={colorB} />↓
            </div>
          </>
        )}
        {hovered && showTooltip && !isPhone && (
          <div
            className="pointer-events-none absolute top-2 z-20 rounded-md border border-line bg-surface p-2 text-xs shadow-md"
            style={{ width: TOOLTIP_WIDTH, left: tooltipX }}
          >
            <div className="mb-1 text-ink-3">{formatTime(hovered.t)}</div>
            {hoveredScores.map((score) => (
              <div key={score.key} className="mb-1 font-medium text-ink [overflow-wrap:anywhere]">{score.title}</div>
            ))}
            {hoveredScores.length === 0 && hoveredEvent && <div className="mb-1 font-medium text-ink [overflow-wrap:anywhere]">{hoveredEvent.title}</div>}
            {[
              [nameA, hovered.a, hovered.probability, colorA],
              [nameB, hovered.b, 1 - hovered.probability, colorB],
            ].map(([name, team, probability, color]) => (
              <div key={name} className="mt-1">
                <div className="truncate text-ink-2"><ColorKey color={color} />{name}</div>
                <div className="text-ink-2">
                  <strong className="text-sm text-ink">{formatPercent(probability)}</strong>
                  {' · '}{team.points.toFixed(1)} pts · proj {team.expected.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
        {edges.before && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface" aria-hidden="true" />}
        {edges.after && <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface" aria-hidden="true" />}
        {/* A mouse has no sideways swipe, so it gets buttons. */}
        {!isPhone && [['before', -1, 'left-1', 'Show earlier in the week', '‹'], ['after', 1, 'right-1', 'Show later in the week', '›']].map(([edge, direction, side, label, glyph]) => edges[edge] && (
          <button
            key={edge}
            type="button"
            onClick={() => scrollByPage(direction)}
            aria-label={label}
            className={`absolute top-1/2 z-10 h-11 w-8 -translate-y-1/2 rounded-md border border-line bg-raised text-lg leading-none text-ink hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${side}`}
          >
            <span aria-hidden="true">{glyph}</span>
          </button>
        ))}
        <div
          ref={attachScroller}
          onScroll={(event) => {
            updateEdges(event.currentTarget);
            onScroll(event);
          }}
          className="scroll-mt-[72px] overflow-x-auto overscroll-x-contain"
        >
          <div className="relative" style={{ width: svgWidth, minWidth: '100%' }}>
            <svg
              width="100%"
              height={HEIGHT}
              role="img"
              aria-label={summary}
              tabIndex={0}
              onKeyDown={handleKey}
              onBlur={onCursorEnd}
              onPointerMove={handleMouse}
              onPointerDown={handleMouse}
              onPointerUp={handleTap}
              onPointerLeave={handlePointerLeave}
              className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              {[0, 1].map((p) => (
                <line key={p} x1={0} x2="100%" y1={yFor(p)} y2={yFor(p)} stroke={GRID} />
              ))}
              <line x1={0} x2="100%" y1={yFor(0.5)} y2={yFor(0.5)} stroke={scoreMode ? GRID : MIDLINE} />
              {shownTicks.map((tick) => {
                const { x } = tick;
                return (
                  <g key={tick.t}>
                    <line x1={x} x2={x} y1={yFor(0)} y2={yFor(0) + 4} stroke={MIDLINE} />
                    <text x={x} y={HEIGHT - 6} fontSize="11" fill="var(--ink-3)" textAnchor={x < 42 ? 'start' : 'middle'}>
                      {formatTime(tick.t)}
                    </text>
                  </g>
                );
              })}
              <defs>
                <clipPath id={`${clipId}-a`}><rect x="0" y="0" width={svgWidth} height={yFor(0.5)} /></clipPath>
                <clipPath id={`${clipId}-b`}><rect x="0" y={yFor(0.5)} width={svgWidth} height={HEIGHT} /></clipPath>
              </defs>
              {[['a', colorA], ['b', colorB]].map(([side, color]) => (scoreMode ? (
                <g key={side}>
                  <path d={scoreLines[side].breaks} fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
                  <path d={scoreLines[side].solid} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              ) : (
                <g key={side} clipPath={`url(#${clipId}-${side})`}>
                  <path d={area} fill={color} fillOpacity={AREA_OPACITY} />
                  <path d={breaks} fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
                  <path d={solid} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              )))}
              {shownEvents.map((event) => (
                <circle
                  key={event.t}
                  cx={points[event.index].x}
                  cy={yOn(points[event.index], event.gainer)}
                  r={event.flipped ? 5 : 4}
                  fill={INK}
                  stroke={SURFACE}
                  strokeWidth="2"
                />
              ))}
              {ticksOnLine.map((tick) => {
                const side = scoreMode ? tick.scoreSide : tick.gainer;
                const y = yOn(points[tick.index], side);
                return (
                  <line
                    key={tick.key}
                    x1={points[tick.index].x}
                    x2={points[tick.index].x}
                    y1={y - SACK_TICK}
                    y2={y + SACK_TICK}
                    stroke={side === 'a' ? colorA : colorB}
                    strokeWidth="1.5"
                  />
                );
              })}
              {labels.map((label) => {
                const color = label.side === 'a' ? colorA : colorB;
                const td = label.kind === 'TD';
                const stemEnd = label.y < label.lineY ? label.y + LABEL_HEIGHT : label.y;
                return (
                  <g key={label.key}>
                    <line x1={label.x} x2={label.x} y1={label.lineY} y2={stemEnd} stroke={color} strokeOpacity="0.8" />
                    <rect x={label.x - LABEL_WIDTH / 2} y={label.y} width={LABEL_WIDTH} height={LABEL_HEIGHT} rx="3" fill={SURFACE} stroke={color} strokeWidth={td ? 1.5 : 1} strokeDasharray={label.negative ? '2 2' : undefined} />
                    <text x={label.x} y={label.y + LABEL_HEIGHT - 3.5} fontSize="10" fontWeight={td ? 700 : 500} fill={td ? INK : 'var(--ink-2)'} textAnchor="middle">{label.kind}</text>
                  </g>
                );
              })}
              {scoreMode ? (
                <>
                  {[[last.aY, endYA, last.a.points, colorA], [last.bY, endYB, last.b.points, colorB]].map(([y, labelY, score, color], i) => (
                    <g key={color + i}>
                      <circle cx={last.x} cy={y} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
                      <text x={last.x + 9} y={labelY + 4} fontSize="12" fontWeight="600" fill={INK}>{score.toFixed(1)}</text>
                    </g>
                  ))}
                </>
              ) : (
                <>
                  <circle cx={last.x} cy={last.y} r="4" fill={colorFor(last.probability)} stroke={SURFACE} strokeWidth="2" />
                  <text x={last.x + 9} y={last.y + 4} fontSize="12" fontWeight="600" fill={INK}>
                    {formatPercent(last.probability)}
                  </text>
                </>
              )}
              {hovered && (
                <>
                  <line x1={hovered.x} x2={hovered.x} y1={yFor(1)} y2={yFor(0)} stroke="var(--ink-3)" />
                  {scoreMode ? (
                    <>
                      <circle cx={hovered.x} cy={hovered.aY} r="4" fill={colorA} stroke={SURFACE} strokeWidth="2" />
                      <circle cx={hovered.x} cy={hovered.bY} r="4" fill={colorB} stroke={SURFACE} strokeWidth="2" />
                    </>
                  ) : (
                    <circle cx={hovered.x} cy={hovered.y} r="4" fill={colorFor(hovered.probability)} stroke={SURFACE} strokeWidth="2" />
                  )}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

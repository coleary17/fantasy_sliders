import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatPercent, formatTime, inSameWindow } from './data';
import { LABEL_HEIGHT, LABEL_WIDTH, layoutScoreLabels } from './scoring';

const HEIGHT = 180;
const TOP = 12;
const BOTTOM = 26;
const RIGHT_PAD = 56;
const LEFT_PAD = 12;
const TOOLTIP_WIDTH = 216;
const TOOLTIP_GAP = 10;
const GRID = '#34342f';
const MIDLINE = '#6f6e68';
const SURFACE = '#1a1a19';
const AREA_OPACITY = 0.2;
const EVENT_SNAP_PX = 10;
const INK = '#f0efec';

const yFor = (p) => TOP + (1 - p) * (HEIGHT - TOP - BOTTOM);

function buildSegments(points) {
  const solid = [];
  const breaks = [];
  points.forEach((point, i) => {
    if (i === 0) return;
    const prev = points[i - 1];
    const line = `M${prev.x},${prev.y}L${point.x},${point.y}`;
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

function ColorKey({ color }) {
  return <span className="mr-1.5 inline-block h-0.5 w-3 rounded-full align-middle" style={{ background: color }} aria-hidden="true" />;
}

export default function MatchupChart({ series, xs, ticks, contentWidth, nameA, nameB, colorA, colorB, scrollRef, onScroll, events, scores, shownIndex, showTooltip, onCursor, onCursorEnd }) {
  const [tooltipX, setTooltipX] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const scroller = useRef(null);
  const clipId = useId();

  const attachScroller = useCallback((el) => {
    scroller.current = el;
    scrollRef(el);
  }, [scrollRef]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setVisibleWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A short stretch of games fills the chart instead of leaving blank space on the right.
  const plotWidth = visibleWidth - LEFT_PAD - RIGHT_PAD;
  const stretch = contentWidth > 0 && plotWidth > contentWidth ? plotWidth / contentWidth : 1;

  const points = useMemo(
    () => series.map((s, i) => ({ ...s, x: xs[i] * stretch + LEFT_PAD, y: yFor(s.probability) })),
    [series, xs, stretch],
  );
  const { solid, breaks } = useMemo(() => buildSegments(points), [points]);
  const area = useMemo(() => buildArea(points), [points]);
  const colorFor = (p) => (p >= 0.5 ? colorA : colorB);
  const svgWidth = contentWidth * stretch + LEFT_PAD + RIGHT_PAD;
  const last = points.at(-1);
  const hovered = shownIndex === null ? null : points[shownIndex];
  const hoveredEvent = hovered && events.find((e) => e.index === shownIndex);
  const hoveredScores = hovered ? scores.filter((s) => s.index === shownIndex) : [];
  const labels = useMemo(() => layoutScoreLabels(scores, points, yFor(1), yFor(0)), [scores, points]);

  const nearestIndex = (x) => {
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
    });
    // A key moment is a small target, so the cursor snaps to one close by.
    const nearbyEvent = [...scores, ...events].find((e) => Math.abs(points[e.index].x - x) <= EVENT_SNAP_PX);
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

  const summary = `Win probability over time for ${nameA} against ${nameB}. ${nameA} is at ${formatPercent(last.probability)} at the latest update. Use the left and right arrow keys to step through updates.`;

  return (
    <div className="flex">
      <div className="relative w-9 shrink-0 text-[11px] sm:w-11 sm:text-xs text-ink-3" style={{ height: HEIGHT }} aria-hidden="true">
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(1) }}>100%</span>
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(0.5) }}>50%</span>
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(0) }}>100%</span>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute left-2 z-10 max-w-[80%] truncate rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(1) + 2 }}>
          <ColorKey color={colorA} />↑ {nameA}
        </div>
        <div className="pointer-events-none absolute left-2 z-10 max-w-[80%] truncate rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(0) - 20 }}>
          <ColorKey color={colorB} />↓ {nameB}
        </div>
        {hovered && showTooltip && (
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
        <div ref={attachScroller} onScroll={onScroll} className="overflow-x-auto">
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
              className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {[0, 1].map((p) => (
                <line key={p} x1={0} x2="100%" y1={yFor(p)} y2={yFor(p)} stroke={GRID} />
              ))}
              <line x1={0} x2="100%" y1={yFor(0.5)} y2={yFor(0.5)} stroke={MIDLINE} />
              {ticks.map((tick) => {
                const x = tick.x * stretch + LEFT_PAD;
                return (
                  <g key={tick.t}>
                    <line x1={x} x2={x} y1={yFor(0)} y2={yFor(0) + 4} stroke={MIDLINE} />
                    <text x={x} y={HEIGHT - 6} fontSize="11" fill="#9a9990" textAnchor={x < 42 ? 'start' : 'middle'}>
                      {formatTime(tick.t)}
                    </text>
                  </g>
                );
              })}
              <defs>
                <clipPath id={`${clipId}-a`}><rect x="0" y="0" width={svgWidth} height={yFor(0.5)} /></clipPath>
                <clipPath id={`${clipId}-b`}><rect x="0" y={yFor(0.5)} width={svgWidth} height={HEIGHT} /></clipPath>
              </defs>
              {[['a', colorA], ['b', colorB]].map(([side, color]) => (
                <g key={side} clipPath={`url(#${clipId}-${side})`}>
                  <path d={area} fill={color} fillOpacity={AREA_OPACITY} />
                  <path d={breaks} fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
                  <path d={solid} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              ))}
              {events.map((event) => (
                <circle
                  key={event.t}
                  cx={points[event.index].x}
                  cy={points[event.index].y}
                  r={event.flipped ? 5 : 4}
                  fill={INK}
                  stroke={SURFACE}
                  strokeWidth="2"
                />
              ))}
              {labels.map((label) => {
                const color = label.gainer === 'a' ? colorA : colorB;
                const td = label.kind === 'TD';
                const stemEnd = label.y < label.lineY ? label.y + LABEL_HEIGHT : label.y;
                return (
                  <g key={label.key}>
                    <line x1={label.x} x2={label.x} y1={label.lineY} y2={stemEnd} stroke={color} strokeOpacity="0.8" />
                    <rect x={label.x - LABEL_WIDTH / 2} y={label.y} width={LABEL_WIDTH} height={LABEL_HEIGHT} rx="3" fill={SURFACE} stroke={color} strokeWidth={td ? 1.5 : 1} />
                    <text x={label.x} y={label.y + LABEL_HEIGHT - 3.5} fontSize="10" fontWeight={td ? 700 : 500} fill={td ? INK : '#c4c3bc'} textAnchor="middle">{label.kind}</text>
                  </g>
                );
              })}
              <circle cx={last.x} cy={last.y} r="4" fill={colorFor(last.probability)} stroke={SURFACE} strokeWidth="2" />
              <text x={last.x + 9} y={last.y + 4} fontSize="12" fontWeight="600" fill={INK}>
                {formatPercent(last.probability)}
              </text>
              {hovered && (
                <>
                  <line x1={hovered.x} x2={hovered.x} y1={yFor(1)} y2={yFor(0)} stroke="#9a9990" />
                  <circle cx={hovered.x} cy={hovered.y} r="4" fill={colorFor(hovered.probability)} stroke={SURFACE} strokeWidth="2" />
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
